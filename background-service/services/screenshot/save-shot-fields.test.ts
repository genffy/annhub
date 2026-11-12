import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SAVE_SCREENSHOT keeps "the field is absent" and "the field is undefined" apart (RV-TEST-17):
 * an id names the entry, a frame names the capture for the metric, and a message without them
 * leaves both out instead of storing undefined.
 */

let stored: Record<string, unknown>

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qMwAAAAASUVORK5CYII='
const topSender = { id: 'annhub-test', url: 'https://page.example/a', tab: { id: 941 }, frameId: 0 } as chrome.runtime.MessageSender

beforeEach(() => {
  stored = {}
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), writable: true, configurable: true })
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'annhub-test',
      getURL: (path: string) => `chrome-extension://annhub-test/${path}`,
      // the capture metric rides a fire-and-forget message; catch it here
      sendMessage: vi.fn(async () => ({ type: 'RESPONSE', success: true })),
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: structuredClone(stored[key]) }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(stored, structuredClone(items))
        },
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function handlers() {
  vi.resetModules()
  const { ScreenshotService } = await import('./index')
  return ScreenshotService.getInstance().getMessageHandlers()
}

describe('SAVE_SCREENSHOT carries exactly the fields the message names (RV-TEST-17)', () => {
  it('saves the id a message names and reports the frame in the metric', async () => {
    const screenshot = await handlers()
    const response = await screenshot.SAVE_SCREENSHOT!(
      {
        type: 'SAVE_SCREENSHOT',
        data: { id: 'ent_shot_named', dataUrl: PNG_1PX, width: 1, height: 1, sourceUrl: 'https://page.example/a', title: 'Shot', via: 'block', frame: 'element' },
      },
      topSender,
    )
    expect(response.success, JSON.stringify(response.error)).toBe(true)
    expect(response.data!.entry.id).toBe('ent_shot_named')
    const metrics = JSON.stringify(stored['annhub.metrics'] ?? {})
    expect(metrics).toContain('frame=element')
  })

  it('saves without an id the message did not bring, and no frame lands in the metric', async () => {
    const screenshot = await handlers()
    const response = await screenshot.SAVE_SCREENSHOT!(
      { type: 'SAVE_SCREENSHOT', data: { dataUrl: PNG_1PX, width: 1, height: 1, sourceUrl: 'https://page.example/b', title: 'Shot 2', via: 'menu' } },
      topSender,
    )
    expect(response.success, JSON.stringify(response.error)).toBe(true)
    const entry = response.data!.entry as unknown as Record<string, unknown>
    expect(entry.id, 'the worker names the entry itself').toMatch(/^ent_/)
    const metrics = JSON.stringify(stored['annhub.metrics'] ?? {})
    expect(metrics).not.toContain('frame=')
  })
})
