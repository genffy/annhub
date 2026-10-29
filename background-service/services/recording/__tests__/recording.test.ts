import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordingService } from '../index'
import type { ResponseMessage } from '../../../../types/messages'

/**
 * annotate.md §2 with stubs where the browser would act: a recording starts
 * only from an extension page (never a tab), refuses restricted pages, keeps
 * at most one unsaved video, turns the offscreen document's events into
 * state, badge and the one metric, and keeps a failed download until it is
 * retried or discarded. The recording itself is a real-machine item
 * (roadmap.md §5) — automation cannot start it like a user does.
 */

/** The browser surface the service touches, stubbed once; the listeners register on first initialize and stay. */
const downloads = { download: vi.fn(), onChanged: { addListener: vi.fn() } }
const tabs = { get: vi.fn(), query: vi.fn(), onRemoved: { addListener: vi.fn() } }
const action = { setBadgeText: vi.fn(async () => undefined), setBadgeBackgroundColor: vi.fn(async () => undefined) }
const runtime = { sendMessage: vi.fn(async () => ({ success: true })), getContexts: vi.fn(async () => [] as unknown[]), lastError: undefined as { message: string } | undefined }
const offscreen = { createDocument: vi.fn(async () => undefined), Reason: { USER_MEDIA: 'USER_MEDIA' } }
/** A real backing store, so the metrics singleton's get→modify→set round trip is observable. */
const localStorageMap = new Map<string, unknown>()
const storage = {
  local: {
    get: vi.fn(async (key: string) => (localStorageMap.has(key) ? { [key]: localStorageMap.get(key) } : {})),
    set: vi.fn(async (objects: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(objects)) localStorageMap.set(key, value)
    }),
  },
}
const permissions = { query: vi.fn(async () => ({ state: 'granted' })) }

vi.stubGlobal('chrome', {
  runtime: { ...runtime, getURL: (path = '') => `chrome-extension://abc/${String(path).replace(/^\//, '')}`, id: 'abc', ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' } },
  downloads: { ...downloads, onChanged: downloads.onChanged },
  tabs,
  action,
  offscreen,
  storage,
})
vi.stubGlobal('navigator', { ...globalThis.navigator, permissions })

const service = RecordingService.getInstance()
const extensionSender = { url: 'chrome-extension://abc/popup.html', tab: undefined } as unknown as chrome.runtime.MessageSender
const tabSender = { url: 'https://example.com/post', tab: { id: 7 }, frameId: 0 } as unknown as chrome.runtime.MessageSender

async function dispatch(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> {
  await service.initialize()
  const handlers = service.getMessageHandlers()
  const handler = handlers[message.type as string]
  if (!handler) throw new Error(`no handler for ${String(message.type)}`)
  return handler(message, sender)
}

/** The service's downloads.onChanged listener, captured once — the browser's callbacks stay stable across tests. */
let onDownloadChanged: (delta: { id: number; state: { previous: string; current: string } }) => void
let onTabRemoved: (tabId: number) => void

/** Reports the finished recording and lands its download, so the next test starts from idle. */
async function windDown(id: number, filename: string): Promise<void> {
  downloads.download.mockImplementation((_options: unknown, callback: (id: number) => void) => callback(id))
  await dispatch({ type: 'RECORDING_EVENT', event: 'stopped', blobUrl: `blob:${filename}`, filename, durationMs: 1_000, stoppedBy: 'user', withMic: false }, extensionSender)
  onDownloadChanged({ id, state: { previous: 'in_progress', current: 'complete' } })
}

beforeAll(async () => {
  tabs.get.mockResolvedValue({ id: 7, url: 'https://example.com/post', title: 'A post' })
  tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com/post', title: 'A post' }])
  await service.initialize()
  onDownloadChanged = downloads.onChanged.addListener.mock.calls[0]![0] as never
  onTabRemoved = tabs.onRemoved.addListener.mock.calls[0]![0] as never
})

beforeEach(() => {
  downloads.download.mockReset()
  runtime.sendMessage.mockClear()
  action.setBadgeText.mockClear()
  localStorageMap.clear()
  localStorageMap.set('annhub.settings', { recording: { withMic: true } })
  tabs.get.mockResolvedValue({ id: 7, url: 'https://example.com/post', title: 'A post' })
})

describe('recording service (annotate.md §2)', () => {
  it('refuses a start from a tab — pages cannot start a recording', async () => {
    const answer = await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, tabSender)
    expect(answer.success).toBe(false)
    expect(runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('refuses restricted pages and does not touch the offscreen document', async () => {
    tabs.get.mockResolvedValue({ id: 7, url: 'chrome://version', title: 'chrome://version' })
    const answer = await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    expect(answer.success).toBe(false)
    expect(answer.error).toBe('RECORDING_RESTRICTED_PAGE')
    expect(offscreen.createDocument).not.toHaveBeenCalled()
  })

  it('starts from the popup: creates the offscreen document, hands over the stream, shows the REC badge', async () => {
    const answer = await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    expect(answer.success).toBe(true)
    expect(offscreen.createDocument).toHaveBeenCalledTimes(1)
    expect(runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECORDING_START', streamId: 's1' }))
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' })
    const state = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string; tabTitle?: string }
    expect(state.status).toBe('recording')
    expect(state.tabTitle).toBe('A post')
    await windDown(1, 'AnnHub/recording-t1.webm')
  })

  it('keeps a single recording: a second start is refused until the first ends', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    const second = await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's2', withMic: false }, extensionSender)
    expect(second.success).toBe(false)
    expect(second.error).toBe('RECORDING_ACTIVE')
    await windDown(2, 'AnnHub/recording-t2.webm')
  })

  it('a mic that fails at start keeps recording video-only and unchecks 带麦克风', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: true }, extensionSender)
    await dispatch({ type: 'RECORDING_EVENT', event: 'mic-unavailable', micNotice: 'denied' }, extensionSender)
    const state = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string; withMic: boolean; micNotice?: string }
    expect(state.status).toBe('recording')
    expect(state.withMic).toBe(false)
    expect(state.micNotice).toBe('denied')
    expect(storage.local.set).toHaveBeenCalledWith({ 'annhub.settings': expect.objectContaining({ recording: expect.objectContaining({ withMic: false }) }) })
    await windDown(3, 'AnnHub/recording-t3.webm')
  })

  it('downloads the finished video into AnnHub/, clears the badge, and the metric waits for the completion report', async () => {
    downloads.download.mockImplementation((_options: unknown, callback: (id: number) => void) => callback(10))
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: true }, extensionSender)
    await dispatch(
      { type: 'RECORDING_EVENT', event: 'stopped', blobUrl: 'blob:video', filename: 'AnnHub/recording-x.webm', durationMs: 90_000, stoppedBy: 'user', withMic: true },
      extensionSender,
    )
    expect(downloads.download).toHaveBeenCalledWith({ url: 'blob:video', filename: 'AnnHub/recording-x.webm', saveAs: false }, expect.any(Function))
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' })
    // the metrics store has nothing yet: recording.downloaded is about the file that landed
    const metricsBefore = (await storage.local.get('annhub.metrics')) as { 'annhub.metrics'?: Record<string, Record<string, unknown>> }
    expect(metricsBefore['annhub.metrics']?.['recording.downloaded']).toBeUndefined()
    // the browser reports the download's completion
    onDownloadChanged({ id: 10, state: { previous: 'in_progress', current: 'complete' } })
    // the metric write is fire-and-forget; let it settle
    await new Promise(resolve => setTimeout(resolve, 50))
    console.log(
      'STORE KEYS',
      [...localStorageMap.keys()],
      'metric set calls',
      storage.local.set.mock.calls.map(call => Object.keys(call[0] as object)),
    )
    const metrics = (await storage.local.get('annhub.metrics')) as {
      'annhub.metrics': { 'recording.downloaded': Record<string, { total: number; byProps: Record<string, number> }> }
    }
    const day = Object.values(metrics['annhub.metrics']!['recording.downloaded']!)[0]!
    expect(day.total).toBe(1)
    expect(Object.keys(day.byProps)).toEqual(['duration=1-3min|mic=true|stopped_by=user'])
    // the video's bytes were released in the offscreen document
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_CLEANUP' })
  })

  it('a failed download keeps the video, badges "!", blocks new recordings, and 放弃 releases it', async () => {
    downloads.download.mockImplementation((_options: unknown, _callback: (id?: number) => void) => {
      runtime.lastError = { message: 'disk full' }
      ;(_callback as (id?: number) => void)(undefined)
      runtime.lastError = undefined
    })
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    await dispatch(
      { type: 'RECORDING_EVENT', event: 'stopped', blobUrl: 'blob:video', filename: 'AnnHub/recording-x.webm', durationMs: 5_000, stoppedBy: 'user', withMic: false },
      extensionSender,
    )
    const state = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string; failedDownload?: { filename: string } }
    expect(state.status).toBe('download-failed')
    expect(state.failedDownload?.filename).toBe('AnnHub/recording-x.webm')
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' })

    const retry = await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's2', withMic: false }, extensionSender)
    expect(retry.success).toBe(false)

    // 重新下载 succeeds this time
    downloads.download.mockImplementation((_options: unknown, callback: (id: number) => void) => callback(11))
    const retried = await dispatch({ type: 'RETRY_RECORDING_DOWNLOAD' }, extensionSender)
    expect(retried.success).toBe(true)

    // the browser breaks it again; 放弃 lets go of the video
    onDownloadChanged({ id: 11, state: { previous: 'in_progress', current: 'interrupted' } })
    const failed = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string }
    expect(failed.status).toBe('download-failed')
    await dispatch({ type: 'DISCARD_RECORDING' }, extensionSender)
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_CLEANUP' })
    const cleared = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string }
    expect(cleared.status).toBe('idle')
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
  })

  it('closing the recorded tab stops the recording', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    onTabRemoved(7)
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_STOP' })
    await windDown(12, 'AnnHub/recording-t4.webm')
  })

  it('answers the state read only for extension pages', async () => {
    const answer = await dispatch({ type: 'GET_RECORDING_STATE' }, tabSender)
    expect(answer.success).toBe(false)
  })
})
