import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordingService, listenForRecording } from '../index'
import { writeSettings } from '../../../settings-schema'
import type { ResponseMessage } from '../../../../types/messages'

/**
 * annotate.md §2 with stubs where the browser would act: a recording starts
 * only from an extension page (never a tab), refuses restricted pages, keeps
 * at most one unsaved video, turns the offscreen document's events into
 * state, badge and the one metric, and keeps a failed download until it is
 * retried or discarded. The route survives a worker restart through
 * chrome.storage.session (RV-REC-02); a fresh instance reads it back.
 * The recording itself is a real-machine item (roadmap.md §5) — automation
 * cannot start it like a user does.
 */

/** The browser surface the service touches, stubbed once; the listeners register at the script's top level and stay. */
const downloads = { download: vi.fn(), search: vi.fn(async () => [] as chrome.downloads.DownloadItem[]), onChanged: { addListener: vi.fn() } }
const tabs = { get: vi.fn(), query: vi.fn(), sendMessage: vi.fn(async () => undefined), create: vi.fn(async () => ({})), onRemoved: { addListener: vi.fn() } }
const tabCapture = { getMediaStreamId: vi.fn(async () => 'stream-cmd') }
const action = { setBadgeText: vi.fn(async () => undefined), setBadgeBackgroundColor: vi.fn(async () => undefined) }
const runtime = { sendMessage: vi.fn(async () => ({ success: true })), getContexts: vi.fn(async () => [] as unknown[]), lastError: undefined as { message: string } | undefined }
const offscreen = { createDocument: vi.fn(async () => undefined), Reason: { USER_MEDIA: 'USER_MEDIA' } }
/** Real backing stores, so the metrics singleton's and the route's get→modify→set round trips are observable. */
const localStorageMap = new Map<string, unknown>()
const sessionStorageMap = new Map<string, unknown>()
const storage = {
  local: {
    get: vi.fn(async (key: string) => (localStorageMap.has(key) ? { [key]: localStorageMap.get(key) } : {})),
    set: vi.fn(async (objects: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(objects)) localStorageMap.set(key, value)
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) localStorageMap.delete(key)
    }),
  },
  session: {
    get: vi.fn(async (key: string) => (sessionStorageMap.has(key) ? { [key]: sessionStorageMap.get(key) } : {})),
    set: vi.fn(async (objects: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(objects)) sessionStorageMap.set(key, value)
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) sessionStorageMap.delete(key)
    }),
  },
}
const permissions = { query: vi.fn(async () => ({ state: 'granted' })) }

vi.stubGlobal('chrome', {
  runtime: { ...runtime, getURL: (path = '') => `chrome-extension://abc/${String(path).replace(/^\//, '')}`, id: 'abc', ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' } },
  downloads: { ...downloads, onChanged: downloads.onChanged },
  tabs,
  tabCapture,
  action,
  offscreen,
  storage,
})
vi.stubGlobal('navigator', { ...globalThis.navigator, permissions })

const service = RecordingService.getInstance()
const extensionSender = { url: 'chrome-extension://abc/popup.html', tab: undefined } as unknown as chrome.runtime.MessageSender
const tabSender = { url: 'https://example.com/post', tab: { id: 7 }, frameId: 0 } as unknown as chrome.runtime.MessageSender

type LooseHandler = (message: Record<string, unknown>, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>

async function dispatch(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> {
  await service.initialize()
  const handlers = service.getMessageHandlers() as unknown as Record<string, LooseHandler>
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
  // the tab and download listeners register at the worker script's top level (RV-REC-02)
  listenForRecording()
  await service.initialize()
  onDownloadChanged = downloads.onChanged.addListener.mock.calls[0]![0] as never
  onTabRemoved = tabs.onRemoved.addListener.mock.calls[0]![0] as never
})

beforeEach(() => {
  downloads.download.mockReset()
  downloads.search.mockResolvedValue([])
  runtime.sendMessage.mockClear()
  runtime.getContexts.mockClear()
  runtime.getContexts.mockResolvedValue([])
  tabCapture.getMediaStreamId.mockClear()
  action.setBadgeText.mockClear()
  localStorageMap.clear()
  sessionStorageMap.clear()
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

  it('a mic that fails at start keeps recording video-only, unchecks 带麦克风 through the settings schema, and keeps the other keys (annotate.md §2.4, RV-REC-04)', async () => {
    localStorageMap.set('annhub.settings', { recording: { withMic: true }, downloadFormat: 'png', blockEntryEnabled: true })
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: true }, extensionSender)
    await dispatch({ type: 'RECORDING_EVENT', event: 'mic-unavailable', micNotice: 'denied' }, extensionSender)
    const state = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string; withMic: boolean; micNotice?: string }
    expect(state.status).toBe('recording')
    expect(state.withMic).toBe(false)
    expect(state.micNotice).toBe('denied')
    expect(storage.local.set).toHaveBeenCalledWith({ 'annhub.settings': expect.objectContaining({ recording: expect.objectContaining({ withMic: false }) }) })
    const settings = localStorageMap.get('annhub.settings') as { downloadFormat: string; blockEntryEnabled: boolean; recording: { withMic: boolean } }
    expect(settings.downloadFormat, 'the untouched keys are not reset by the mic write').toBe('png')
    expect(settings.blockEntryEnabled).toBe(true)
    await windDown(3, 'AnnHub/recording-t3.webm')
  })

  it('the mic write and a preference write at the same time both survive (RV-REC-04)', async () => {
    localStorageMap.set('annhub.settings', { recording: { withMic: true }, downloadFormat: 'png' })
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: true }, extensionSender)
    // the settings page saves a format choice — the same serialized write SET_SETTINGS takes — while the microphone dies
    await Promise.all([dispatch({ type: 'RECORDING_EVENT', event: 'mic-unavailable', micNotice: 'denied' }, extensionSender), writeSettings({ downloadFormat: 'jpeg' })])
    const settings = localStorageMap.get('annhub.settings') as { downloadFormat: string; recording: { withMic: boolean } }
    expect(settings.recording.withMic).toBe(false)
    expect(settings.downloadFormat).toBe('jpeg')
    await windDown(50, 'AnnHub/recording-cc.webm')
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
    // the listener hands the event to the service without awaiting; let the stop land
    await new Promise(resolve => setTimeout(resolve, 0))
    // the reason travels with the stop: the metric's stopped_by comes from it
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_STOP', stoppedBy: 'tab_closed' })
    await windDown(12, 'AnnHub/recording-t4.webm')
  })

  it('answers the state read only for extension pages', async () => {
    const answer = await dispatch({ type: 'GET_RECORDING_STATE' }, tabSender)
    expect(answer.success).toBe(false)
  })

  it('a start the offscreen document refuses leaves no recording behind', async () => {
    runtime.sendMessage.mockImplementationOnce(async () => ({ success: false }))
    const answer = await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 'refused', withMic: false }, extensionSender)
    expect(answer.error).toBe('RECORDING_FAILED')
    const state = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string }
    expect(state.status).toBe('idle')
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
  })

  it('a second start while the first is still asking the browser is refused, not taken for a first', async () => {
    const [first, second] = await Promise.all([
      dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 'race-1', withMic: false }, extensionSender),
      dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 'race-2', withMic: false }, extensionSender),
    ])
    expect(first.success).toBe(true)
    expect(second.error).toBe('RECORDING_ACTIVE')
    await windDown(20, 'AnnHub/recording-race.webm')
  })

  it('a stop the offscreen document cannot take ends the recording at once', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 'stuck', withMic: false }, extensionSender)
    runtime.sendMessage.mockRejectedValueOnce(new Error('no offscreen document'))
    const answer = await dispatch({ type: 'STOP_RECORDING' }, extensionSender)
    expect(answer.success).toBe(true)
    expect((answer.data as { status: string }).status).toBe('idle')
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
  })

  it('a heartbeat keeps the worker alive and touches no state (annotate.md §2.4, RV-REC-02)', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    const before = await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)
    const answer = await dispatch({ type: 'RECORDING_EVENT', event: 'heartbeat' }, extensionSender)
    expect(answer.success).toBe(true)
    expect(await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).toEqual(before)
    await windDown(40, 'AnnHub/recording-hb.webm')
  })

  it('a restarted worker reads the route back: still recording, and the stop reaches the offscreen document (RV-REC-02)', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: true }, extensionSender)
    const live = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { startedAt?: number }
    // the offscreen document survived the restart (the heartbeat kept it alive)
    runtime.getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    const restarted = new RecordingService()
    await restarted.initialize()

    const handlers = restarted.getMessageHandlers() as unknown as Record<string, LooseHandler>
    const state = (await handlers.GET_RECORDING_STATE({}, extensionSender)).data as { status: string; tabId?: number; startedAt?: number; tabTitle?: string }
    expect(state.status).toBe('recording')
    expect(state.tabId).toBe(7)
    expect(state.startedAt).toBe(live.startedAt)
    expect(state.tabTitle, 'the title comes from the tab again, not from the record').toBe('A post')
    runtime.sendMessage.mockClear()
    const stopped = await handlers.STOP_RECORDING({}, extensionSender)
    expect(stopped.success).toBe(true)
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_STOP', stoppedBy: 'user' })

    // the successor reports the finished stop; the original singleton winds down its own state
    await windDown(41, 'AnnHub/recording-rr.webm')
  })

  it('a restart without the offscreen document goes back to idle, clears the badge and drops the record (RV-REC-02)', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    expect(sessionStorageMap.has('annhub.recording')).toBe(true)
    // no contexts: the recorder died with its document
    runtime.getContexts.mockResolvedValue([])
    const restarted = new RecordingService()
    await restarted.initialize()
    const handlers = restarted.getMessageHandlers() as unknown as Record<string, LooseHandler>
    const answer = await handlers.GET_RECORDING_STATE({}, extensionSender)
    expect((answer.data as { status: string }).status).toBe('idle')
    expect(sessionStorageMap.has('annhub.recording')).toBe(false)
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
    await windDown(42, 'AnnHub/recording-gone.webm')
  })

  it('a restarted worker answers the stopped event: lifecycle to the tab, video to the disk (RV-REC-02)', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    runtime.getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    const restarted = new RecordingService()
    await restarted.initialize()
    downloads.download.mockImplementation((_options: unknown, callback: (id: number) => void) => callback(43))
    runtime.sendMessage.mockClear()
    const handlers = restarted.getMessageHandlers() as unknown as Record<string, LooseHandler>
    await handlers.RECORDING_EVENT({ type: 'RECORDING_EVENT', event: 'stopped', blobUrl: 'blob:video', filename: 'AnnHub/recording-r.webm', durationMs: 1_000, stoppedBy: 'tab_closed', withMic: false }, extensionSender)
    expect(tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'RECORDING_LIFECYCLE', active: false })
    expect(downloads.download).toHaveBeenCalledWith({ url: 'blob:video', filename: 'AnnHub/recording-r.webm', saveAs: false }, expect.any(Function))
    // the download the successor started lands, and the route record goes with it
    await restarted.onDownloadDelta({ id: 43, state: { previous: 'in_progress', current: 'complete' } })
    expect(sessionStorageMap.has('annhub.recording')).toBe(false)
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
    await windDown(44, 'AnnHub/recording-r2.webm')
  })

  it('the first shortcut press after a restart stops instead of starting (RV-REC-02)', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    runtime.getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    const restarted = new RecordingService()
    await restarted.initialize()
    runtime.sendMessage.mockClear()
    await restarted.toggleFromCommand()
    expect(tabCapture.getMediaStreamId, 'the shortcut must not take a second stream').not.toHaveBeenCalled()
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_STOP', stoppedBy: 'user' })
    await windDown(45, 'AnnHub/recording-tg.webm')
  })

  it('a restart while the video waits for the disk picks the download back up (RV-REC-02)', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: false }, extensionSender)
    downloads.download.mockImplementation((_options: unknown, callback: (id: number) => void) => callback(46))
    await dispatch(
      { type: 'RECORDING_EVENT', event: 'stopped', blobUrl: 'blob:video', filename: 'AnnHub/recording-p.webm', durationMs: 1_000, stoppedBy: 'user', withMic: false },
      extensionSender,
    )
    // the browser still runs the download the previous worker started
    downloads.search.mockResolvedValue([{ id: 46, url: 'blob:video', state: 'in_progress' } as chrome.downloads.DownloadItem])
    runtime.getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    const restarted = new RecordingService()
    await restarted.initialize()
    expect(downloads.search).toHaveBeenCalledWith({ url: 'blob:video' })
    // the adopted download completes: the record is dropped, the video's bytes released
    runtime.sendMessage.mockClear()
    await restarted.onDownloadDelta({ id: 46, state: { previous: 'in_progress', current: 'complete' } })
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORDING_CLEANUP' })
    expect(sessionStorageMap.has('annhub.recording')).toBe(false)
    await windDown(47, 'AnnHub/recording-p2.webm')
  })

  it('the shortcut with 带麦克风 but no live grant opens the settings page and records nothing (annotate.md §2.1, RV-REC-03)', async () => {
    tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com/post', title: 'A post' }])
    permissions.query.mockResolvedValueOnce({ state: 'prompt' })
    await service.startFromCommand()
    expect(tabs.create).toHaveBeenCalledWith({ url: expect.stringContaining('options.html?recordTab=7') })
    expect(tabCapture.getMediaStreamId, 'nothing records before the browser asks').not.toHaveBeenCalled()
    expect(runtime.sendMessage, 'the worker cannot answer its own runtime message').not.toHaveBeenCalledWith(expect.objectContaining({ type: 'RECORDING_START' }))
    const state = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string }
    expect(state.status).toBe('idle')
  })

  it('the shortcut without the microphone takes the stream itself and starts recording (RV-REC-03)', async () => {
    localStorageMap.set('annhub.settings', { recording: { withMic: false } })
    await service.startFromCommand()
    expect(tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 7 })
    expect(runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECORDING_START', streamId: 'stream-cmd' }))
    expect(tabs.create).not.toHaveBeenCalled()
    const state = (await dispatch({ type: 'GET_RECORDING_STATE' }, extensionSender)).data as { status: string }
    expect(state.status).toBe('recording')
    await windDown(49, 'AnnHub/recording-cmd.webm')
  })

  it('the shortcut does nothing on a restricted page (RV-REC-03)', async () => {
    tabs.query.mockResolvedValueOnce([{ id: 9, url: 'chrome://version', title: 'chrome://version' }])
    await service.startFromCommand()
    expect(tabs.create).not.toHaveBeenCalled()
    expect(tabCapture.getMediaStreamId).not.toHaveBeenCalled()
    expect(runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('the session record carries only the route: no title, no page URL, no video bytes (RV-REC-02)', async () => {
    await dispatch({ type: 'START_RECORDING', tabId: 7, streamId: 's1', withMic: true }, extensionSender)
    const route = sessionStorageMap.get('annhub.recording') as Record<string, unknown>
    expect(Object.keys(route).sort()).toEqual(['startedAt', 'status', 'tabId', 'withMic'])
    await dispatch({ type: 'RECORDING_EVENT', event: 'mic-unavailable', micNotice: 'denied' }, extensionSender)
    const withNotice = sessionStorageMap.get('annhub.recording') as Record<string, unknown>
    expect(Object.keys(withNotice).sort()).toEqual(['micNotice', 'startedAt', 'status', 'tabId', 'withMic'])
    downloads.download.mockImplementation((_options: unknown, callback: (id: number) => void) => callback(48))
    await dispatch(
      { type: 'RECORDING_EVENT', event: 'stopped', blobUrl: 'blob:video', filename: 'AnnHub/recording-x.webm', durationMs: 1_000, stoppedBy: 'user', withMic: false },
      extensionSender,
    )
    const pending = sessionStorageMap.get('annhub.recording') as { pending?: Record<string, unknown> }
    expect(Object.keys(pending).sort()).toEqual(['micNotice', 'pending', 'status', 'tabId', 'withMic'])
    expect(Object.keys(pending.pending!).sort()).toEqual(['blobUrl', 'filename'])
    expect(JSON.stringify(pending), 'no page URL or bytes in the record').not.toContain('example.com/post')
    await windDown(48, 'AnnHub/recording-x.webm')
  })
})
