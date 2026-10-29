/**
 * Recording service — annotate.md §2. Tab recording starts only from the
 * extension's own pages (the toolbar popup, or the browser command), never
 * from a page; the tab stream id comes from chrome.tabCapture in the popup's
 * user gesture (or the command handler's), and the actual recording runs in
 * the offscreen document. The worker keeps the state the popup reads, drives
 * the badge, downloads the finished video and writes the one metric.
 */
import type { IService } from '../../service-manager'
import type { ResponseMessage, RecordingEventMessage, RecordingState } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isTopFrameTabSender } from '../../sender'
import { readSettings } from '../../settings-schema'
import MessageUtils from '../../../utils/message'
import { Logger } from '../../../utils/logger'
import { bucketRecordingDuration, type RecordingDurationBucket } from '../../../learning-core/metrics'
import { recordEvent } from '../metrics/record'

const OFFSCREEN_URL = 'offscreen.html'
const SETTINGS_KEY = 'annhub.settings'

/** The page classes a tab may be recorded on; everything else (chrome://, the store) has no entry (annotate.md §2.4). */
function recordableUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
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
  private downloadListener?: (delta: chrome.downloads.DownloadDelta) => void
  private tabRemovedListener?: (tabId: number) => void

  static getInstance(): RecordingService {
    RecordingService.instance ??= new RecordingService()
    return RecordingService.instance
  }

  async initialize(): Promise<void> {
    if (this.initDone) return
    this.initDone = true
    this.downloadListener = delta => {
      if (!this.pendingDownload || delta.id !== this.pendingDownload.downloadId || !delta.state) return
      if (delta.state.current === 'complete') void this.finishDownload()
      if (delta.state.current === 'interrupted') void this.failDownload()
    }
    chrome.downloads.onChanged.addListener(this.downloadListener)
    // closing the recorded tab stops the recording and downloads what is there (annotate.md §2.4)
    this.tabRemovedListener = tabId => {
      if (this.state.status === 'recording' && this.state.tabId === tabId) void this.stopRecording('tab_closed')
    }
    chrome.tabs.onRemoved.addListener(this.tabRemovedListener)
    Logger.info('[RecordingService] Initialized')
  }

  getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
    return {
      START_RECORDING: async (message, sender): Promise<ResponseMessage> => {
        // only the extension's own pages — the popup — may start a recording (annotate.md §2.1)
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        return this.startRecording(message.tabId as number, message.streamId as string, message.withMic === true)
      },

      GET_RECORDING_STATE: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        return MessageUtils.createResponse(true, this.state)
      },

      STOP_RECORDING: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        if (this.state.status !== 'recording') return MessageUtils.createResponse(false, undefined, 'RECORDING_NOT_ACTIVE')
        await this.stopRecording('user')
        return MessageUtils.createResponse(true, this.state)
      },

      RETRY_RECORDING_DOWNLOAD: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        if (this.state.status !== 'download-failed' || !this.pendingDownload) return MessageUtils.createResponse(false, undefined, 'RECORDING_NOT_ACTIVE')
        await this.downloadPending()
        return MessageUtils.createResponse(true, this.state)
      },

      DISCARD_RECORDING: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        if (this.state.status !== 'download-failed') return MessageUtils.createResponse(false, undefined, 'RECORDING_NOT_ACTIVE')
        await this.tellOffscreen({ type: 'RECORDING_CLEANUP' })
        this.pendingDownload = null
        this.state = { status: 'idle', withMic: false }
        this.syncBadge()
        return MessageUtils.createResponse(true, this.state)
      },

      /** The recorded tab asks on load whether a recording is live (annotate.md §3.2): read-only, no user data. */
      RECORDING_STATUS: async (_message, sender): Promise<ResponseMessage> => {
        if (!isTopFrameTabSender(sender) && !isExtensionPageSender(sender)) return forbiddenResponse()
        const settings = await readSettings()
        return MessageUtils.createResponse(true, { recording: this.state.status === 'recording', cursorHighlight: settings.recording.cursorHighlight })
      },

      RECORDING_EVENT: async (message, sender): Promise<ResponseMessage> => {
        // the offscreen document is an extension page; a tab sender is not the recorder
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        await this.handleEvent(message as RecordingEventMessage)
        return MessageUtils.createResponse(true)
      },
    }
  }

  isInitialized(): boolean {
    return this.initDone
  }

  /** For the command toggle: the state as it stands (extension.md §7.1). */
  currentState(): RecordingState {
    return this.state
  }

  /** The command's stop half: the same road the popup's button takes. */
  async stopFromCommand(): Promise<void> {
    if (this.state.status !== 'recording') return
    await this.stopRecording('user')
  }

  /** The command entry (extension.md §7.1): the shortcut counts as the user's gesture, so the worker asks for the stream itself. */
  async startFromCommand(): Promise<void> {
    if (this.state.status !== 'idle') return
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !recordableUrl(tab.url)) return
    try {
      const withMic = await this.readMicPreference()
      if (withMic && !(await this.micGranted())) {
        // no live grant: the settings page asks, this does not record (annotate.md §2.1, D-43)
        await chrome.runtime.sendMessage({ type: 'OPEN_EXTENSION_PAGE', page: 'settings', params: { recordTabId: tab.id } }).catch(() => undefined)
        return
      }
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id })
      if (!streamId) return
      await this.startRecording(tab.id, streamId, withMic)
    } catch (error) {
      Logger.info('[RecordingService] Command start failed:', error)
    }
  }

  private async readMicPreference(): Promise<boolean> {
    const stored = await chrome.storage.local.get(SETTINGS_KEY)
    return (stored[SETTINGS_KEY] as { recording?: { withMic?: boolean } } | undefined)?.recording?.withMic === true
  }

  private async micGranted(): Promise<boolean> {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      return status.state === 'granted'
    } catch {
      return false
    }
  }

  private async startRecording(tabId: number, streamId: string, withMic: boolean): Promise<ResponseMessage> {
    if (this.state.status !== 'idle') return MessageUtils.createResponse(false, undefined, 'RECORDING_ACTIVE')
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)
    if (!tab || !recordableUrl(tab.url)) return MessageUtils.createResponse(false, undefined, 'RECORDING_RESTRICTED_PAGE')

    await this.ensureOffscreenDocument()
    const answer = await this.tellOffscreen({ type: 'RECORDING_START', streamId, withMic })
    if (!answer.ok) return MessageUtils.createResponse(false, undefined, 'RECORDING_FAILED')
    this.state = { status: 'recording', withMic, tabId, tabTitle: tab.title, startedAt: Date.now() }
    this.syncBadge()
    await this.broadcastLifecycle(true)
    return MessageUtils.createResponse(true, this.state)
  }

  private async stopRecording(stoppedBy: 'user' | 'tab_closed'): Promise<void> {
    // the offscreen document reports the stop with this reason and its own length
    await this.tellOffscreen({ type: 'RECORDING_STOP', stoppedBy })
  }

  /** 录制开始与停止告诉被录的标签页：光标高亮只在录制中出现，批注层收起工具栏 (annotate.md §3)。 */
  private async broadcastLifecycle(active: boolean): Promise<void> {
    const tabId = this.state.tabId
    if (!tabId) return
    try {
      const settings = active ? await readSettings() : undefined
      await chrome.tabs.sendMessage(tabId, { type: 'RECORDING_LIFECYCLE', active, ...(settings ? { cursorHighlight: settings.recording.cursorHighlight } : {}) })
    } catch {
      // the tab may have closed or not have the content script yet; recording continues
    }
  }

  private async handleEvent(message: RecordingEventMessage): Promise<void> {
    switch (message.event) {
      case 'mic-unavailable': {
        // the video keeps going with the tab's sound; the popup says why and the choice is unchecked (annotate.md §2.4)
        this.state = { ...this.state, withMic: false, micNotice: message.micNotice ?? 'denied' }
        await writeMicPreference(false)
        return
      }
      case 'failed': {
        // the tab stream never opened: back to idle, the user can try again
        await this.broadcastLifecycle(false)
        this.state = { status: 'idle', withMic: false }
        this.syncBadge()
        return
      }
      case 'stopped': {
        await this.broadcastLifecycle(false)
        if (!message.blobUrl || !message.filename) return
        this.pendingDownload = {
          blobUrl: message.blobUrl,
          filename: message.filename,
          meta: {
            durationMs: message.durationMs ?? 0,
            withMic: message.withMic === true,
            stoppedBy: message.stoppedBy ?? 'user',
            limit: message.limit,
          },
        }
        this.state = {
          status: 'idle',
          withMic: false,
          ...(message.stoppedBy === 'limit' ? { limitNotice: message.limit ?? 'time' } : {}),
          // the reason the microphone is missing outlives the recording, so the popup can still say it
          ...(this.state.micNotice ? { micNotice: this.state.micNotice } : {}),
        }
        await this.downloadPending()
        return
      }
      default:
        return
    }
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

  private async finishDownload(): Promise<void> {
    const pending = this.pendingDownload
    console.log('FINISH DOWNLOAD CALLED, pending:', Boolean(pending), pending?.downloadId)
    if (!pending) return
    const { meta } = pending
    await this.tellOffscreen({ type: 'RECORDING_CLEANUP' })
    this.pendingDownload = null
    this.state = { status: 'idle', withMic: false, ...(meta.stoppedBy === 'limit' ? { limitNotice: meta.limit ?? 'time' } : {}) }
    this.syncBadge()
    // recording.downloaded is about the file that landed (metrics.md §9, M-31)
    const duration: RecordingDurationBucket = bucketRecordingDuration(meta.durationMs)
    await recordEvent('recording.downloaded', { duration, mic: meta.withMic, stopped_by: meta.stoppedBy })
  }

  private async failDownload(): Promise<void> {
    if (!this.pendingDownload) return
    // the video stays until 重新下载 succeeds or the user gives up (annotate.md §2.4)
    this.state = { status: 'download-failed', withMic: false, failedDownload: { filename: this.pendingDownload.filename } }
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
    if (typeof chrome.runtime.getContexts === 'function') {
      const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
      if (contexts.length > 0) return
    }
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Recording the tab the user asked to record (annotate.md §2)',
    })
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

async function writeMicPreference(withMic: boolean): Promise<void> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  const current = (stored[SETTINGS_KEY] ?? {}) as Record<string, unknown>
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, recording: { ...((current.recording as { withMic?: boolean } | undefined) ?? {}), withMic } } })
}
