import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A content script may undo or edit only the entry its own frame just saved. The memory of that lives
 * in `chrome.storage.session`, so a service worker recycled while the quick-edit bubble is open (MV3
 * idles out after ~30 s) still honours the edit.
 */

function fakeSessionArea() {
  const data = new Map<string, unknown>()
  return {
    data,
    get: vi.fn(async (key?: string | null) => (key == null ? Object.fromEntries(data) : data.has(key) ? { [key]: structuredClone(data.get(key)) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value))
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of ([] as string[]).concat(keys)) data.delete(key)
    }),
  }
}

const frame = (tabId: number, frameId = 0) =>
  ({
    id: 'annhub-test',
    tab: { id: tabId, url: 'https://page.example/top' },
    frameId,
    url: frameId === 0 ? 'https://page.example/top' : 'https://page.example/child',
  }) as chrome.runtime.MessageSender

let session: ReturnType<typeof fakeSessionArea>

async function freshSender() {
  vi.resetModules()
  return import('./sender')
}

beforeEach(() => {
  session = fakeSessionArea()
  vi.stubGlobal('chrome', { runtime: { id: 'annhub-test', getURL: (path: string) => `chrome-extension://annhub-test/${path}` }, storage: { session } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('recent captures (RV-BG-02, quick edit after a worker restart)', () => {
  it("knows the capture a frame just saved, and only that frame's", async () => {
    const sender = await freshSender()
    await sender.rememberCapture(frame(1), 'ent_a')
    expect(await sender.isRecentCapture(frame(1), 'ent_a')).toBe(true)
    expect(await sender.isRecentCapture(frame(1), 'ent_other')).toBe(false)
    expect(await sender.isRecentCapture(frame(2), 'ent_a')).toBe(false)
    expect(await sender.isRecentCapture(frame(1, 3), 'ent_a')).toBe(false)
  })

  it('still knows it after the service worker was recycled', async () => {
    const before = await freshSender()
    await before.rememberCapture(frame(4), 'ent_survives')
    const after = await freshSender() // a new worker: its own memory is empty
    expect(await after.isRecentCapture(frame(4), 'ent_survives')).toBe(true)
    expect(await after.isRecentCapture(frame(4), 'ent_never_saved')).toBe(false)
  })

  it('keeps the last few captures of a frame, so an earlier bubble still saves after a newer clip', async () => {
    const sender = await freshSender()
    for (let i = 0; i < 25; i++) await sender.rememberCapture(frame(5), `ent_${i}`)
    expect(await sender.isRecentCapture(frame(5), 'ent_24')).toBe(true)
    expect(await sender.isRecentCapture(frame(5), 'ent_5')).toBe(true)
    expect(await sender.isRecentCapture(frame(5), 'ent_4')).toBe(false)
  })

  it('forgets a capture after ten minutes, and drops the entries of frames that went quiet', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
    const sender = await freshSender()
    await sender.rememberCapture(frame(6), 'ent_old')
    expect(await sender.isRecentCapture(frame(6), 'ent_old')).toBe(true)
    vi.setSystemTime(new Date('2026-10-09T10:10:01Z'))
    expect(await sender.isRecentCapture(frame(6), 'ent_old')).toBe(false)
    await sender.rememberCapture(frame(7), 'ent_new')
    expect([...session.data.keys()]).toEqual(['annhub.capture:7:0'])
  })

  it("answers from the worker's own memory when the session area cannot be written", async () => {
    session.set.mockRejectedValue(new Error('QUOTA_BYTES exceeded'))
    const sender = await freshSender()
    await expect(sender.rememberCapture(frame(8), 'ent_memory')).resolves.toBeUndefined()
    expect(await sender.isRecentCapture(frame(8), 'ent_memory')).toBe(true)
  })

  it('trusts nothing from a cross-origin child frame or from a tab-less sender', async () => {
    const sender = await freshSender()
    const crossOrigin = { ...frame(9, 2), url: 'https://outside.example/child' } as chrome.runtime.MessageSender
    await sender.rememberCapture(crossOrigin, 'ent_cross')
    expect(await sender.isRecentCapture(crossOrigin, 'ent_cross')).toBe(false)
    expect(await sender.isRecentCapture({ id: 'annhub-test' } as chrome.runtime.MessageSender, 'ent_cross')).toBe(false)
    expect(session.data.size).toBe(0)
  })

  it('serializes concurrent saves from one frame without losing either', async () => {
    const sender = await freshSender()
    await Promise.all([sender.rememberCapture(frame(10), 'ent_x'), sender.rememberCapture(frame(10), 'ent_y')])
    expect(await sender.isRecentCapture(frame(10), 'ent_x')).toBe(true)
    expect(await sender.isRecentCapture(frame(10), 'ent_y')).toBe(true)
  })
})
