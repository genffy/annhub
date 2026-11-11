/**
 * Recording service — annotate.md §2. Tab recording starts only from the
 * extension's own pages (the toolbar popup, or the browser command), never
 * from a page; the tab stream id comes from chrome.tabCapture in the popup's
 * user gesture (or the command handler's), and the actual recording runs in
 * the offscreen document. The worker keeps the state the popup reads, drives
 * the badge, downloads the finished video and writes the one metric.
 *
 * The state outlives the worker: a route record in chrome.storage.session is
 * written as the recording moves (start, stop, download failure) and read
 * back on startup, because Chrome suspends this worker after ~30 s idle and
 * the offscreen document's heartbeat is what wakes it again (annotate.md
 * §2.4, RV-REC-02). The tab and download listeners register at the worker
 * script's top level (listenForRecording), not here — and the recovery read
 * is started by whichever state read arrives first (ensureRecovered), because
 * initialize() runs after other services have opened their databases and the
 * event that woke the worker does not wait for that.
 */
import type { IService, MessageHandlers } from '../../service-manager'
import type { ResponseMessage, RecordingEventMessage, RecordingState, TabMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isSameOriginTabSender, isTopFrameTabSender } from '../../sender'
import { ensureOffscreenDocument } from '../../offscreen-document'
import { readSettings, writeSettings } from '../../settings-storage'
import { openExtensionPage } from '../../../utils/extension-pages'
import MessageUtils from '../../../utils/message'
import { Logger } from '../../../utils/logger'
import { bucketRecordingDuration, type RecordingDurationBucket } from '../../../core/metrics'
import { RECORDING_FLAG_KEY } from '../../../core/storage-keys'
import { recordEvent } from '../metrics/record'

const SESSION_KEY = 'annhub.recording'

/** The page classes a tab may be recorded on; everything else (chrome://, the store) has no entry (annotate.md §2.4). */
function recordableUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/** The route a restarted worker reads back; only these fields — never the tab title, the page URL or video bytes. */
interface PersistedRecordingRoute {
  status: 'recording' | 'pending-download' | 'download-failed'
  tabId?: number
  startedAt?: number
  withMic: boolean
  micNotice?: 'denied' | 'missing' | 'busy'
  limitNotice?: 'time' | 'size'
  /** The video waiting for the disk: the offscreen document keeps the blob URL alive until the cleanup; the meta is read back for the landed video's metric (RV-REC-02). */
  pending?: { blobUrl: string; filename: string; durationMs: number; withMic: boolean; stoppedBy: 'user' | 'tab_closed' | 'limit'; limit?: 'time' | 'size' }
}

interface FinishedRecording {
  durationMs: number
  withMic: boolean
  stoppedBy: 'user' | 'tab_closed' | 'limit'
  limit?: 'time' | 'size'
}

export class RecordingService implements IService {
  readonly name = 'recording' as const
  private static instance: RecordingService | null = null
  private initDone = false
  private state: RecordingState = { status: 'idle', withMic: false }
  /** A finished video on its way to the disk: the blob URL the offscreen document keeps alive until the file has landed. */
  private pendingDownload: { blobUrl: string; filename: string; downloadId?: number; meta: FinishedRecording } | null = null
  /** The tab whose recording produced the pending download; the route record keeps it after the state moved to idle. */
  private recordedTabId?: number
  /** The recovery read, started by whoever reads state first — an event that beats initialize() must not find the idle default (RV-REC-02). */
  private recovery: Promise<void> | null = null

  static getInstance(): RecordingService {
    RecordingService.instance ??= new RecordingService()
    return RecordingService.instance
  }

  async initialize(): Promise<void> {
    if (this.initDone) return
    this.initDone = true
    await this.ensureRecovered()
    Logger.info('[RecordingService] Initialized')
  }

  /** The first state read starts the recovery; every later one — initialize() included — waits for the same run (RV-REC-02). */
  private ensureRecovered(): Promise<void> {
    this.recovery ??= this.recover()
    return this.recovery
  }

  /** Reads the route back before any state read answers: a restart mid-recording must not look idle (annotate.md §2.4, RV-REC-02). */
  private async recover(): Promise<void> {
    const stored = (await chrome.storage.session.get(SESSION_KEY).catch(() => ({}))) as Record<string, unknown>
    const route = stored[SESSION_KEY] as PersistedRecordingRoute | undefined
    if (!route) return
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] }).catch(() => [])
    if (contexts.length === 0 && !(await this.offscreenAnswers())) {
      // the recorder died with its document: nothing to stop, nothing to download. The contexts read alone
      // is not proof — a worker cold-started by a command can see no contexts for a document that is alive
      // (seen on a real machine, RV-REC-02), so the document itself is asked before its route is dropped.
      await chrome.storage.session.remove(SESSION_KEY).catch(() => undefined)
      this.resetToIdle()
      return
    }
    this.recordedTabId = route.tabId
    if (route.status === 'recording') {
      // the title is not stored: the tab is asked for it again
      const tab = route.tabId !== undefined ? await chrome.tabs.get(route.tabId).catch(() => undefined) : undefined
      this.state = {
        status: 'recording',
        withMic: route.withMic,
        ...(route.tabId !== undefined ? { tabId: route.tabId } : {}),
        ...(tab?.title ? { tabTitle: tab.title } : {}),
        ...(route.startedAt !== undefined ? { startedAt: route.startedAt } : {}),
        ...(route.micNotice ? { micNotice: route.micNotice } : {}),
      }
    } else if (route.pending) {
      this.pendingDownload = {
        blobUrl: route.pending.blobUrl,
        filename: route.pending.filename,
        // the meta travels with the pending video, so a restart keeps the metric true (RV-REC-02)
        meta: {
          durationMs: route.pending.durationMs,
          withMic: route.pending.withMic,
          stoppedBy: route.pending.stoppedBy,
          ...(route.pending.limit ? { limit: route.pending.limit } : {}),
        },
      }
      this.state = {
        status: route.status === 'download-failed' ? 'download-failed' : 'idle',
        withMic: false,
        ...(route.limitNotice ? { limitNotice: route.limitNotice } : {}),
        ...(route.micNotice ? { micNotice: route.micNotice } : {}),
        ...(route.status === 'download-failed' ? { failedDownload: { filename: route.pending.filename } } : {}),
      }
    }
    this.syncBadge()
    if (route.status === 'pending-download') await this.resumePendingDownload()
  }

  /**
   * Writes the route the next worker will read; a live flow with nothing to carry deletes the record.
   * The one-boolean flag in chrome.storage.local rides along: pages read it instead of waking the
   * worker for a status answer (annotate.md §3.2, RV-CAP-19).
   */
  private async persistRoute(): Promise<void> {
    await chrome.storage.local.set({ [RECORDING_FLAG_KEY]: this.state.status === 'recording' })
    const route: PersistedRecordingRoute | null =
      this.state.status === 'recording'
        ? {
            status: 'recording',
            withMic: this.state.withMic,
            ...(this.state.tabId !== undefined ? { tabId: this.state.tabId } : {}),
            ...(this.state.startedAt !== undefined ? { startedAt: this.state.startedAt } : {}),
            ...(this.state.micNotice ? { micNotice: this.state.micNotice } : {}),
          }
        : this.pendingDownload
          ? {
              status: this.state.status === 'download-failed' ? 'download-failed' : 'pending-download',
              withMic: false,
              ...(this.recordedTabId !== undefined ? { tabId: this.recordedTabId } : {}),
              ...(this.state.limitNotice ? { limitNotice: this.state.limitNotice } : {}),
              ...(this.state.micNotice ? { micNotice: this.state.micNotice } : {}),
              pending: {
                blobUrl: this.pendingDownload.blobUrl,
                filename: this.pendingDownload.filename,
                durationMs: this.pendingDownload.meta.durationMs,
                withMic: this.pendingDownload.meta.withMic,
                stoppedBy: this.pendingDownload.meta.stoppedBy,
                ...(this.pendingDownload.meta.limit ? { limit: this.pendingDownload.meta.limit } : {}),
              },
            }
          : null
    try {
      if (route) await chrome.storage.session.set({ [SESSION_KEY]: route })
      else await chrome.storage.session.remove(SESSION_KEY)
    } catch {
      // the record is a restart's road map; a storage failure must not break the live flow
    }
  }

  getMessageHandlers(): MessageHandlers {
    return {
      START_RECORDING: async (message, sender) => {
        // only the extension's own pages — the popup — may start a recording (annotate.md §2.1)
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        return this.startRecording(message.tabId, message.streamId, message.withMic === true)
      },

      GET_RECORDING_STATE: async (_message, sender) => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        await this.ensureRecovered()
        // holdsVideo: the offscreen document's stale-state recovery asks whether the worker
        // still wants the finished video (RV-REC-05); the popup ignores the field
        return MessageUtils.createResponse(true, { ...this.state, holdsVideo: this.pendingDownload !== null })
      },

      STOP_RECORDING: async (_message, sender) => {
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        await this.ensureRecovered()
        if (this.state.status !== 'recording') return MessageUtils.createResponse(false, undefined, 'RECORDING_NOT_ACTIVE')
        await this.stopRecording('user')
        return MessageUtils.createResponse(true, this.state)
      },

      RETRY_RECORDING_DOWNLOAD: async (_message, sender) => {
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        await this.ensureRecovered()
        if (this.state.status !== 'download-failed' || !this.pendingDownload) return MessageUtils.createResponse(false, undefined, 'RECORDING_NOT_ACTIVE')
        await this.downloadPending()
        return MessageUtils.createResponse(true, this.state)
      },

      DISCARD_RECORDING: async (_message, sender) => {
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        await this.ensureRecovered()
        if (this.state.status !== 'download-failed') return MessageUtils.createResponse(false, undefined, 'RECORDING_NOT_ACTIVE')
        await this.tellOffscreen({ type: 'RECORDING_CLEANUP' })
        this.pendingDownload = null
        this.recordedTabId = undefined
        this.state = { status: 'idle', withMic: false }
        await this.persistRoute()
        this.syncBadge()
        return MessageUtils.createResponse(true, this.state)
      },

      /** The recorded tab asks on load whether a recording is live (annotate.md §3.2): read-only, no user data. A same-origin subframe asks for its own cursor highlight. */
      RECORDING_STATUS: async (_message, sender) => {
        if (!isTopFrameTabSender(sender) && !isSameOriginTabSender(sender) && !isExtensionPageSender(sender)) return forbiddenResponse()
        await this.ensureRecovered()
        const settings = await readSettings()
        return MessageUtils.createResponse(true, { recording: this.state.status === 'recording', cursorHighlight: settings.recording.cursorHighlight })
      },

      RECORDING_EVENT: async (message, sender) => {
        // the offscreen document is an extension page; a tab sender is not the recorder
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        await this.handleEvent(message)
        return MessageUtils.createResponse(true)
      },
    }
  }

  isInitialized(): boolean {
    return this.initDone
  }

  /** The recorded tab closed: stop and download what is there; waits for the route's recovery first (RV-REC-02). */
  async onTabRemoved(tabId: number): Promise<void> {
    await this.ensureRecovered()
    if (this.state.status === 'recording' && this.state.tabId === tabId) await this.stopRecording('tab_closed')
  }

  /** The recorded video landed or broke; waits for the route's recovery first (RV-REC-02). */
  async onDownloadDelta(delta: chrome.downloads.DownloadDelta): Promise<void> {
    await this.ensureRecovered()
    if (!this.pendingDownload || delta.id !== this.pendingDownload.downloadId || !delta.state) return
    if (delta.state.current === 'complete') await this.finishDownload()
    if (delta.state.current === 'interrupted') await this.failDownload()
  }

  /** The command toggle's state read, after the route's recovery (extension.md §7.1, RV-REC-02). */
  async currentStateAfterRecovery(): Promise<RecordingState> {
    await this.ensureRecovered()
    return this.state
  }

  /** The command's stop half: the same road the popup's button takes. */
  async stopFromCommand(): Promise<void> {
    await this.ensureRecovered()
    if (this.state.status !== 'recording') return
    await this.stopRecording('user')
  }

  /** The command entry (extension.md §7.1): the shortcut counts as the user's gesture, so the worker asks for the stream itself. */
  async startFromCommand(): Promise<void> {
    await this.ensureRecovered()
    if (this.state.status !== 'idle') return
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !recordableUrl(tab.url)) return
    try {
      const withMic = await this.readMicPreference()
      if (withMic && !(await this.micGranted())) {
        // no live grant: the settings page asks, this does not record (annotate.md §2.1).
        // openExtensionPage goes straight to chrome.tabs — a runtime message would come
        // back to this very worker and find no one to answer it
        await openExtensionPage('settings', { recordTabId: tab.id }).catch(() => undefined)
        return
      }
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id })
      if (!streamId) return
      await this.startRecording(tab.id, streamId, withMic)
    } catch (error) {
      Logger.info('[RecordingService] Command start failed:', error)
    }
  }

  /** The shortcut's toggle, read after the recovery: the first press after a restart stops the live recording (RV-REC-02). */
  async toggleFromCommand(): Promise<void> {
    await this.ensureRecovered()
    if (this.state.status === 'recording') await this.stopFromCommand()
    else await this.startFromCommand()
  }

  private async readMicPreference(): Promise<boolean> {
    // through the settings schema: the same validated, serialized writes the popup's choice takes (RV-REC-04)
    return (await readSettings()).recording.withMic
  }

  private async micGranted(): Promise<boolean> {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' })
      return status.state === 'granted'
    } catch {
      return false
    }
  }

  /** A start between its first await and the state it sets: a second start in that gap must not be taken for a first. */
  private startInFlight = false

  private async startRecording(tabId: number, streamId: string, withMic: boolean): Promise<ResponseMessage<RecordingState | undefined>> {
    if (this.state.status !== 'idle' || this.startInFlight) return MessageUtils.createResponse(false, undefined, 'RECORDING_ACTIVE')
    this.startInFlight = true
    try {
      return await this.beginRecording(tabId, streamId, withMic)
    } finally {
      this.startInFlight = false
    }
  }

  private async beginRecording(tabId: number, streamId: string, withMic: boolean): Promise<ResponseMessage<RecordingState | undefined>> {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)
    if (!tab || !recordableUrl(tab.url)) return MessageUtils.createResponse(false, undefined, 'RECORDING_RESTRICTED_PAGE')

    await this.ensureOffscreenDocument()
    // the state is set before the offscreen document answers, so a microphone notice it reports on the way is kept
    this.state = { status: 'recording', withMic, tabId, tabTitle: tab.title, startedAt: Date.now() }
    const answer = await this.tellOffscreen({ type: 'RECORDING_START', streamId, withMic })
    if (!answer.ok) {
      this.state = { status: 'idle', withMic: false, ...(this.state.micNotice ? { micNotice: this.state.micNotice } : {}) }
      await this.persistRoute()
      this.syncBadge()
      return MessageUtils.createResponse(false, undefined, 'RECORDING_FAILED')
    }
    this.recordedTabId = tabId
    await this.persistRoute()
    this.syncBadge()
    await this.broadcastLifecycle(true)
    return MessageUtils.createResponse(true, this.state)
  }

  private async stopRecording(stoppedBy: 'user' | 'tab_closed'): Promise<void> {
    // the offscreen document reports the stop with this reason and its own length
    const answer = await this.tellOffscreen({ type: 'RECORDING_STOP', stoppedBy })
    // no recorder is left to report a stop: the state must not wait for one that never comes
    if (!answer.ok) {
      await this.broadcastLifecycle(false)
      this.state = { status: 'idle', withMic: false }
      await this.persistRoute()
      this.syncBadge()
    }
  }

  private resetToIdle(): void {
    this.state = { status: 'idle', withMic: false }
    // the flag rides the route write: a route dropped here also clears it (annotate.md §3.2)
    void this.persistRoute()
    this.syncBadge()
  }

  /** 录制开始与停止告诉被录的标签页：光标高亮只在录制中出现，批注层收起工具栏 (annotate.md §3)。 */
  private async broadcastLifecycle(active: boolean): Promise<void> {
    const tabId = this.state.tabId
    if (!tabId) return
    try {
      const settings = active ? await readSettings() : undefined
      const message: TabMessage = { type: 'RECORDING_LIFECYCLE', active, ...(settings ? { cursorHighlight: settings.recording.cursorHighlight } : {}) }
      await chrome.tabs.sendMessage(tabId, message)
    } catch {
      // the tab may have closed or not have the content script yet; recording continues
    }
  }

  private async handleEvent(message: RecordingEventMessage): Promise<void> {
    switch (message.event) {
      case 'heartbeat': {
        // the answer keeps the worker alive; there is nothing to route
        return
      }
      case 'mic-unavailable': {
        // the video keeps going with the tab's sound; the popup says why and the choice is unchecked (annotate.md §2.4)
        this.state = { ...this.state, withMic: false, micNotice: message.micNotice ?? 'denied' }
        await this.persistRoute()
        await writeMicPreference(false)
        return
      }
      case 'failed': {
        // the tab stream never opened: back to idle, the user can try again
        await this.broadcastLifecycle(false)
        this.recordedTabId = undefined
        this.state = { status: 'idle', withMic: false }
        await this.persistRoute()
        this.syncBadge()
        return
      }
      case 'stopped': {
        await this.broadcastLifecycle(false)
        if (!message.blobUrl || !message.filename) {
          // a stop without a file leaves nothing to download: the state goes back, as a stop that never came would not
          this.recordedTabId = undefined
          this.state = { status: 'idle', withMic: false }
          await this.persistRoute()
          this.syncBadge()
          return
        }
        // named before the state moves on: the recorded tab is still this recording's tab
        const stoppedBy = await this.stoppedByOf(message.stoppedBy)
        this.pendingDownload = {
          blobUrl: message.blobUrl,
          filename: message.filename,
          meta: {
            durationMs: message.durationMs ?? 0,
            withMic: message.withMic === true,
            stoppedBy,
            limit: message.limit,
          },
        }
        this.state = {
          status: 'idle',
          withMic: false,
          ...(stoppedBy === 'limit' ? { limitNotice: message.limit ?? 'time' } : {}),
          // the reason the microphone is missing outlives the recording, so the popup can still say it
          ...(this.state.micNotice ? { micNotice: this.state.micNotice } : {}),
        }
        await this.persistRoute()
        await this.downloadPending()
        return
      }
      case 'started':
      default:
        return
    }
  }

  /**
   * Who ended the recording, named by the side that can tell (annotate.md §2.1, metrics.md §9, RV-REC-02). The
   * offscreen document reports `user` for every stop nobody told it the cause of: when the recorded tab closes, the
   * recorder stops itself as the tab's tracks end — a moment before this worker's tabs.onRemoved reaches it — so a
   * closed tab and the browser's own stop-sharing look the same there. A limit is the recorder's own word and a
   * `tab_closed` is this worker's, so both stand. For `user` the recorded tab is asked: gone means it was closed.
   * A tab this worker cannot name (the route was dropped) leaves the report as it is, rather than guessing.
   */
  private async stoppedByOf(reported: 'user' | 'tab_closed' | 'limit' | undefined): Promise<'user' | 'tab_closed' | 'limit'> {
    if (reported === 'limit' || reported === 'tab_closed') return reported
    const tabId = this.state.tabId ?? this.recordedTabId
    if (tabId === undefined) return 'user'
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)
    return tab ? 'user' : 'tab_closed'
  }

  private async downloadPending(): Promise<void> {
    const pending = this.pendingDownload
    if (!pending) return
    try {
      const downloadId = await new Promise<number>((resolve, reject) => {
        chrome.downloads.download({ url: pending.blobUrl, filename: pending.filename, saveAs: false }, id => {
          const error = chrome.runtime.lastError
          if (error || id === undefined) reject(new Error(error?.message ?? 'DOWNLOAD_FAILED'))
          else resolve(id)
        })
      })
      pending.downloadId = downloadId
      this.syncBadge()
    } catch (error) {
      Logger.warn('[RecordingService] Recording download failed:', error)
      await this.failDownload()
    }
  }

  /** A restart during the wait for the disk: adopt the download the browser still runs, or start it again (RV-REC-02). */
  private async resumePendingDownload(): Promise<void> {
    const pending = this.pendingDownload
    if (!pending) return
    const items = await chrome.downloads.search({ url: pending.blobUrl }).catch(() => [])
    const item = items[0]
    if (!item) {
      await this.downloadPending()
      return
    }
    if (item.state === 'complete') await this.finishDownload()
    else if (item.state === 'interrupted') await this.failDownload()
    else pending.downloadId = item.id
  }

  private async finishDownload(): Promise<void> {
    const pending = this.pendingDownload
    if (!pending) return
    const { meta } = pending
    await this.tellOffscreen({ type: 'RECORDING_CLEANUP' })
    this.pendingDownload = null
    this.recordedTabId = undefined
    this.state = { status: 'idle', withMic: false, ...(meta.stoppedBy === 'limit' ? { limitNotice: meta.limit ?? 'time' } : {}) }
    await this.persistRoute()
    this.syncBadge()
    // recording.downloaded is about the file that landed (metrics.md §9, M-31)
    const duration: RecordingDurationBucket = bucketRecordingDuration(meta.durationMs)
    await recordEvent('recording.downloaded', { duration, mic: meta.withMic, stopped_by: meta.stoppedBy })
  }

  private async failDownload(): Promise<void> {
    if (!this.pendingDownload) return
    // the video stays until 重新下载 succeeds or the user gives up (annotate.md §2.4)
    this.state = { status: 'download-failed', withMic: false, failedDownload: { filename: this.pendingDownload.filename } }
    await this.persistRoute()
    this.syncBadge()
  }

  private syncBadge(): void {
    if (this.state.status === 'recording') {
      void chrome.action.setBadgeBackgroundColor({ color: '#c4271e' })
      void chrome.action.setBadgeText({ text: 'REC' })
      return
    }
    if (this.state.status === 'download-failed') {
      void chrome.action.setBadgeBackgroundColor({ color: '#c4271e' })
      void chrome.action.setBadgeText({ text: '!' })
      return
    }
    void chrome.action.setBadgeText({ text: '' })
  }

  private async ensureOffscreenDocument(): Promise<void> {
    // the one document both flows share (RV-BG-11)
    await ensureOffscreenDocument()
  }

  /** True when the offscreen document answers a ping: the recorder is alive whatever the contexts read said (RV-REC-02). */
  private async offscreenAnswers(): Promise<boolean> {
    try {
      return await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), 1500)
        void chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' }).then(
          answer => {
            clearTimeout(timer)
            resolve(answer?.success === true)
          },
          () => {
            clearTimeout(timer)
            resolve(false)
          },
        )
      })
    } catch {
      return false
    }
  }

  private async tellOffscreen(message: { type: string } & Record<string, unknown>): Promise<{ ok: boolean }> {
    try {
      const answer = await chrome.runtime.sendMessage(message)
      return { ok: answer?.success !== false }
    } catch {
      return { ok: false }
    }
  }
}

/**
 * Registered at the worker script's synchronous top level (entrypoints/background/index.ts,
 * next to listenForFrames): the tab and download events a cold-started worker must not
 * drop. The handlers wait for the route's recovery before they read any state (RV-REC-02).
 */
export function listenForRecording(): void {
  chrome.downloads.onChanged.addListener(delta => {
    void RecordingService.getInstance().onDownloadDelta(delta)
  })
  // closing the recorded tab stops the recording and downloads what is there (annotate.md §2.4)
  chrome.tabs.onRemoved.addListener(tabId => {
    void RecordingService.getInstance().onTabRemoved(tabId)
  })
}

async function writeMicPreference(withMic: boolean): Promise<void> {
  await writeSettings({ recording: { withMic } })
}
