import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordingService } from '../index'
import type { ResponseMessage } from '../../../../types/messages'

/**
 * RECORDING_STATUS's tiers and its per-tab truth (annotate.md §3.2, RV-REC-06): the tab that is
 * being recorded — its top frame and same-origin subframes alike — hears "recording", other tabs
 * do not, extension pages always get the global truth; a sender outside the tiers is forbidden.
 * The recording flag is an optimization on top of the route: a storage failure while writing it
 * must not break the live flow.
 */

const runtime = {
  // the document answers only what it can judge: STOP and CLEANUP are fire-and-forget and come
  // back as undefined (Chrome resolves a received-but-unanswered message), like the real one
  sendMessage: vi.fn(async (message: { type: string }) => {
    if (message.type === 'RECORDING_STOP' || message.type === 'RECORDING_CLEANUP') return undefined
    return { type: 'RESPONSE', success: true }
  }),
  getContexts: vi.fn(async () => [] as unknown[]),
}
const tabs = {
  get: vi.fn(async (tabId: number) => ({ id: tabId, url: 'https://example.com/post', title: 'A post' })),
  query: vi.fn(async () => [] as unknown[]),
  sendMessage: vi.fn(async () => undefined),
  onRemoved: { addListener: vi.fn() },
  create: vi.fn(async () => ({})),
}
const downloads = {
  download: vi.fn((_options: unknown, callback: (id: number) => void) => callback(1)),
  search: vi.fn(async () => []),
  onChanged: { addListener: vi.fn() },
}
const tabCapture = { getMediaStreamId: vi.fn(async () => 'stream-cmd') }
const action = { setBadgeText: vi.fn(async () => undefined), setBadgeBackgroundColor: vi.fn(async () => undefined) }
const localStorageMap = new Map<string, unknown>()
const sessionStorageMap = new Map<string, unknown>()
const storage = {
  local: {
    get: vi.fn(async (key: string) => (localStorageMap.has(key) ? { [key]: localStorageMap.get(key) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) localStorageMap.set(key, value)
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) localStorageMap.delete(key)
    }),
  },
  session: {
    get: vi.fn(async (key: string) => (sessionStorageMap.has(key) ? { [key]: sessionStorageMap.get(key) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) sessionStorageMap.set(key, value)
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) sessionStorageMap.delete(key)
    }),
  },
}

vi.stubGlobal('chrome', {
  runtime: { ...runtime, getURL: (path = '') => `chrome-extension://abc/${String(path).replace(/^\//, '')}`, id: 'abc', ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' } },
  downloads,
  tabs,
  tabCapture,
  action,
  offscreen: { createDocument: vi.fn(async () => undefined), Reason: { USER_MEDIA: 'USER_MEDIA' } },
  storage,
})
vi.stubGlobal('navigator', { ...globalThis.navigator, permissions: { query: vi.fn(async () => ({ state: 'granted' })) } })

const extensionSender = { id: 'abc', url: 'chrome-extension://abc/popup.html', tab: undefined } as unknown as chrome.runtime.MessageSender
const recordedTop = { id: 'abc', url: 'https://example.com/post', tab: { id: 7, url: 'https://example.com/post' }, frameId: 0 } as unknown as chrome.runtime.MessageSender
const recordedSubframe = {
  id: 'abc',
  url: 'https://example.com/post/replies',
  tab: { id: 7, url: 'https://example.com/post' },
  frameId: 2,
} as unknown as chrome.runtime.MessageSender
const otherTabTop = { id: 'abc', url: 'https://example.com/other', tab: { id: 99, url: 'https://example.com/other' }, frameId: 0 } as unknown as chrome.runtime.MessageSender
const crossOriginSubframe = {
  id: 'abc',
  url: 'https://other.example/embed',
  tab: { id: 7, url: 'https://example.com/post' },
  frameId: 3,
} as unknown as chrome.runtime.MessageSender
const foreignExtension = { id: 'other-ext', url: 'chrome-extension://other-ext/popup.html', tab: undefined } as unknown as chrome.runtime.MessageSender

type LooseHandler = (message: Record<string, unknown>, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>

async function dispatch(service: RecordingService, message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> {
  await service.initialize()
  const handlers = service.getMessageHandlers() as unknown as Record<string, LooseHandler>
  return handlers[message.type as string]!(message, sender)
}

/** A fresh service for every test: a recording one test starts is not the next test's starting state. */
let service: RecordingService

beforeEach(() => {
  service = new RecordingService()
  localStorageMap.clear()
  sessionStorageMap.clear()
  localStorageMap.set('annhub.settings', { recording: { withMic: false } })
  runtime.getContexts.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('RECORDING_STATUS answers the tiers it always did (RV-CAP-19 rework)', () => {
  it('answers the top frame of a tab, a same-origin subframe of it, and an extension page', async () => {
    for (const sender of [recordedTop, recordedSubframe, extensionSender]) {
      const answer = await dispatch(service, { type: 'RECORDING_STATUS' }, sender)
      expect(answer.success).toBe(true)
      expect((answer.data as { recording: boolean }).recording).toBe(false)
    }
  })

  it('refuses a cross-origin subframe and a sender from another extension', async () => {
    for (const sender of [crossOriginSubframe, foreignExtension]) {
      const answer = await dispatch(service, { type: 'RECORDING_STATUS' }, sender)
      expect(answer.success).toBe(false)
    }
  })
})

describe('RECORDING_STATUS tells the recorded tab from the others (RV-REC-06, annotate.md §3.2)', () => {
  it('while tab 7 records, tab 7 hears recording and tab 99 does not', async () => {
    const start = await dispatch(service, { type: 'START_RECORDING', tabId: 7, streamId: 'per-tab', withMic: false }, extensionSender)
    expect(start.success).toBe(true)

    const ownTop = await dispatch(service, { type: 'RECORDING_STATUS' }, recordedTop)
    expect((ownTop.data as { recording: boolean }).recording, 'the recorded tab itself').toBe(true)
    const ownSubframe = await dispatch(service, { type: 'RECORDING_STATUS' }, recordedSubframe)
    expect((ownSubframe.data as { recording: boolean }).recording, 'a same-origin subframe belongs to the tab').toBe(true)
    const other = await dispatch(service, { type: 'RECORDING_STATUS' }, otherTabTop)
    expect((other.data as { recording: boolean }).recording, 'another tab is not recording').toBe(false)
    const popup = await dispatch(service, { type: 'RECORDING_STATUS' }, extensionSender)
    expect((popup.data as { recording: boolean }).recording, 'an extension page gets the global truth').toBe(true)
  })

  it('the recorded tab keeps hearing recording after it navigates, and nobody does once stopped', async () => {
    await dispatch(service, { type: 'START_RECORDING', tabId: 7, streamId: 'per-tab-nav', withMic: false }, extensionSender)
    const navigated = { ...recordedTop, url: 'https://example.com/post/next-page' } as chrome.runtime.MessageSender
    const answer = await dispatch(service, { type: 'RECORDING_STATUS' }, navigated)
    expect((answer.data as { recording: boolean }).recording, 'same tab id, new page').toBe(true)

    runtime.sendMessage.mockImplementationOnce(async (message: { type: string }) => (message.type === 'RECORDING_STOP' ? undefined : { type: 'RESPONSE', success: true }))
    await dispatch(service, { type: 'STOP_RECORDING' }, extensionSender)
    // the document's recorder reports the stop; only then does the state settle
    await dispatch(
      service,
      { type: 'RECORDING_EVENT', event: 'stopped', blobUrl: 'blob:video', filename: 'AnnHub/recording-status.webm', durationMs: 1_000, stoppedBy: 'user', withMic: false },
      { id: 'abc', url: 'chrome-extension://abc/offscreen.html', tab: undefined } as unknown as chrome.runtime.MessageSender,
    )
    await service.onDownloadDelta({ id: 1, state: { previous: 'in_progress', current: 'complete' } })
    for (const sender of [recordedTop, recordedSubframe, otherTabTop, extensionSender]) {
      const after = await dispatch(service, { type: 'RECORDING_STATUS' }, sender)
      expect((after.data as { recording: boolean }).recording).toBe(false)
    }
  })
})

describe('the recording flag is best-effort around the route (RV-CAP-19 rework)', () => {
  it('a failing flag write leaves START_RECORDING successful and the route written', async () => {
    // the recovery writes the flag too; it runs first, so the failure below lands on the start's own write
    await service.initialize()
    storage.local.set.mockImplementationOnce(async () => {
      throw new Error('disk full')
    })
    const start = await dispatch(service, { type: 'START_RECORDING', tabId: 7, streamId: 'flag-tolerant', withMic: false }, extensionSender)
    expect(start.success, 'the flow survives the flag').toBe(true)
    expect(sessionStorageMap.has('annhub.recording'), 'the route, the source of truth, is written').toBe(true)
  })

  it('a routeless recovery survives a failing flag write', async () => {
    storage.local.set.mockImplementation(async () => {
      throw new Error('disk full')
    })
    try {
      await expect(service.initialize()).resolves.toBeUndefined()
    } finally {
      storage.local.set.mockRestore()
    }
  })
})
