import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const store: Record<string, unknown> = {}
;(globalThis as any).chrome = {
  runtime: { id: 'ext-id', getURL: (path: string) => `chrome-extension://ext-id/${path}` },
  storage: {
    local: {
      get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
      set: vi.fn(async (entries: Record<string, unknown>) => void Object.assign(store, entries)),
    },
  },
}

import { ClipService } from '../clip'
import type { ClipRecord } from '../../../types/clip'

const clip = (id: string): ClipRecord => ({
  id,
  source_url: 'https://example.com/a',
  source_title: 'A',
  capture_time: '2026-10-04T00:00:00.000Z',
  mode_used: 'Mode A',
  content: `text ${id}`,
  context_before: '',
  context_after: '',
})

const library = { id: 'ext-id', url: 'chrome-extension://ext-id/library.html' } as chrome.runtime.MessageSender
const contentScript = { id: 'ext-id', url: 'https://evil.example/', tab: { id: 3 } } as chrome.runtime.MessageSender

describe('ClipService message handlers', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
  })

  it('GET_CLIPS returns what SAVE_CLIP stored, in save order', async () => {
    const handlers = ClipService.getInstance().getMessageHandlers()
    await handlers.SAVE_CLIP!({ data: clip('a') }, contentScript)
    await handlers.SAVE_CLIP!({ data: clip('b') }, contentScript)

    const response = await handlers.GET_CLIPS!({}, library)
    expect(response.success).toBe(true)
    expect((response.data as ClipRecord[]).map(c => c.id)).toEqual(['a', 'b'])
  })

  it('GET_CLIPS is empty, not an error, before the first clip', async () => {
    const response = await ClipService.getInstance().getMessageHandlers().GET_CLIPS!({}, library)
    expect(response).toMatchObject({ success: true, data: [] })
  })

  it('GET_CLIPS refuses content scripts: page text must not be readable by the page', async () => {
    const handlers = ClipService.getInstance().getMessageHandlers()
    await handlers.SAVE_CLIP!({ data: clip('a') }, contentScript)

    const response = await handlers.GET_CLIPS!({}, contentScript)
    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
  })

  it('DELETE_CLIP removes only the requested clip', async () => {
    const handlers = ClipService.getInstance().getMessageHandlers()
    await handlers.SAVE_CLIP!({ data: clip('a') }, contentScript)
    await handlers.SAVE_CLIP!({ data: clip('b') }, contentScript)
    await handlers.DELETE_CLIP!({ id: 'a' }, contentScript)

    const response = await handlers.GET_CLIPS!({}, library)
    expect((response.data as ClipRecord[]).map(c => c.id)).toEqual(['b'])
  })
})
