/**
 * Offscreen document — annotate.md §2 for the recording, download.md §4–§5
 * for downloads.
 *
 * The service worker has no page environment, so the recording runs here: the
 * tab stream (by the stream id the worker obtained after the user's gesture)
 * plus, when asked and granted, the microphone. The tab's audio is played
 * back through the speakers — a captured tab stops playing its audio unless
 * the recorder plays it — while the microphone never is. MediaRecorder
 * collects the video in memory; the worker downloads it from the blob URL
 * this document keeps alive until the file has landed.
 *
 * Downloads share the same split for the same reason: this document (the
 * extension API set here stops at messaging) fetches the media and packs the
 * ZIP, handing each body to the worker as a blob URL it keeps alive until
 * the run's cleanup.
 *
 * Bytes never leave the browser: the blobs live in this document, the
 * downloads are the worker's chrome.downloads calls, and nothing is uploaded.
 */
import type { DownloadCancelMessage, DownloadExtractMessage, DownloadFinishMessage, DownloadRunMessage, RecordingCommandMessage, RecordingEventMessage } from '../../types/messages'
import { fixWebmDuration } from '../../utils/webm-duration'
import { fromOwnBackground } from './background-sender'
import { acceptDownloadRun, cleanupDownloadRun, deliverFinish } from './download-run'
import { extractDownloadPage } from './download-extract'
import { syncHeartbeat } from './heartbeat'

/** 15 minutes or about 500 MB, first reached wins (annotate.md §2.1). */
const TIME_LIMIT_MS = 15 * 60_000
const SIZE_LIMIT_BYTES = 500 * 1024 * 1024

interface Recording {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  sizeBytes: number
  startedAt: number
  withMic: boolean
  timer: number
  stoppedBy: 'user' | 'tab_closed' | 'limit'
  limit?: 'time' | 'size'
}

let recording: Recording | null = null
/** The last video, kept for 重新下载 until the worker reports the file landed or the user gave up. */
let unsavedVideo: { blobUrl: string; filename: string; durationMs: number; withMic: boolean } | null = null

function report(event: RecordingEventMessage['event'], extra: Partial<RecordingEventMessage> = {}): void {
  void chrome.runtime.sendMessage({ type: 'RECORDING_EVENT', event, ...extra } satisfies RecordingEventMessage).catch(() => {
    /* the worker is gone (browser closing): the recording dies with it, as the spec says */
  })
}

function pickMimeType(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return candidates.find(candidate => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) ?? ''
}

function stopRecording(stoppedBy?: 'user' | 'tab_closed'): void {
  const current = recording
  if (!current) return
  window.clearTimeout(current.timer)
  recording = null
  // the worker knows whether the user stopped it or the tab closed; the timer path set 'limit' already
  if (stoppedBy && current.stoppedBy !== 'limit') current.stoppedBy = stoppedBy
  current.recorder.stop()
}

/** True while a start is on its way: a double press must not start two recordings in the time the first one awaits. */
let starting = false

/** Starts a recording; the answer goes back to the worker, which keeps its state only when it is true. */
async function beginRecording(message: RecordingCommandMessage & { type: 'RECORDING_START' }): Promise<boolean> {
  // a start already on its way owns the document: a second one must not take another
  // stream, and the worker is not asked — there is no finished video to ask about yet
  if (starting) return false
  if (recording && recording.recorder.state === 'recording') return false
  if (recording || unsavedVideo) {
    // stale-state recovery (RV-REC-05): RECORDING_CLEANUP can get lost when the worker
    // dies during the download wait, and this document then holds state from a run that
    // is over. A recorder that is still rolling is a real recording; anything else asks
    // the worker, and only its clear "no video" drops the state — the video is not
    // given up before the download has landed (annotate.md §2.5), and no answer at all
    // (the worker is gone) counts as holding it, so the state stays for its recovery.
    if (await workerStillHoldsVideo()) return false
    if (recording) {
      // the recorder is not rolling; stop any tracks it still holds and drop the state
      recording.stream.getTracks().forEach(track => track.stop())
      recording = null
    }
    if (unsavedVideo) {
      URL.revokeObjectURL(unsavedVideo.blobUrl)
      unsavedVideo = null
    }
  }
  starting = true
  try {
    return await startCapture(message)
  } finally {
    starting = false
  }
}

/**
 * The worker's answer on whether it still wants the finished video (RV-REC-05):
 * true when it holds one — or when it cannot be asked, so the caller keeps the state.
 */
async function workerStillHoldsVideo(): Promise<boolean> {
  try {
    const answer = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' })
    return !(answer?.success === true && answer?.data?.holdsVideo === false)
  } catch {
    return true // the worker is gone: keep the state, the recovery on its side owns it
  }
}

async function startCapture(message: RecordingCommandMessage & { type: 'RECORDING_START' }): Promise<boolean> {
  const mimeType = pickMimeType()
  let tabStream: MediaStream
  try {
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab' as const, chromeMediaSourceId: message.streamId } },
      video: { mandatory: { chromeMediaSource: 'tab' as const, chromeMediaSourceId: message.streamId, maxFrameRate: 30 } },
    } as MediaStreamConstraints)
  } catch {
    report('failed')
    return false
  }

  let micStream: MediaStream | null = null
  if (message.withMic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      // Denied (the grant lapsed), missing or busy: keep recording with the tab's
      // sound only, and say so — the video is not the reason to stop (annotate.md §2.4).
      const notice =
        error instanceof DOMException && error.name === 'NotFoundError' ? 'missing' : error instanceof DOMException && error.name === 'NotReadableError' ? 'busy' : 'denied'
      report('mic-unavailable', { micNotice: notice })
    }
  }

  // the captured tab stops playing its audio unless the recorder plays it back;
  // the microphone never is (annotate.md §2.2)
  const audioContext = new AudioContext()
  audioContext.createMediaStreamSource(new MediaStream(tabStream.getAudioTracks())).connect(audioContext.destination)

  // the video carries the tab's picture and sound, plus the microphone when it is there
  const tracks = [...tabStream.getVideoTracks(), ...tabStream.getAudioTracks(), ...(micStream?.getAudioTracks() ?? [])]
  const stream = new MediaStream(tracks)
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : { videoBitsPerSecond: 2_500_000 })
  const current: Recording = {
    recorder,
    stream,
    chunks: [],
    sizeBytes: 0,
    startedAt: Date.now(),
    withMic: micStream !== null,
    timer: window.setTimeout(() => {
      current.stoppedBy = 'limit'
      current.limit = 'time'
      stopRecording()
    }, TIME_LIMIT_MS),
    stoppedBy: 'user',
  }
  recording = current

  recorder.ondataavailable = chunk => {
    if (!chunk.data.size) return
    current.chunks.push(chunk.data)
    current.sizeBytes += chunk.data.size
    if (current.sizeBytes >= SIZE_LIMIT_BYTES) {
      current.stoppedBy = 'limit'
      current.limit = 'size'
      stopRecording()
    }
  }
  recorder.onstop = async () => {
    audioContext.close().catch(() => undefined)
    tabStream.getTracks().forEach(track => track.stop())
    micStream?.getTracks().forEach(track => track.stop())
    const durationMs = Date.now() - current.startedAt
    const withMic = current.withMic
    const stoppedBy = current.stoppedBy
    const limit = current.limit
    // the muxer never writes the segment duration: patch it in, so players can
    // show a length and drag the progress bar (annotate.md §2.2)
    const raw = new Blob(current.chunks, { type: 'video/webm' })
    const bytes = fixWebmDuration(new Uint8Array(await raw.arrayBuffer()), durationMs)
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/webm' })
    const blobUrl = URL.createObjectURL(blob)
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    // local time, the same 口径 as the screenshot filename (storage.md §6)
    const filename = `AnnHub/recording-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.webm`
    unsavedVideo = { blobUrl, filename, durationMs, withMic }
    syncHeartbeat(() => report('heartbeat'), true)
    report('stopped', { blobUrl, filename, durationMs, stoppedBy, withMic, ...(limit ? { limit } : {}) })
  }
  recorder.start(1000)
  report('started', {})
  syncHeartbeat(() => report('heartbeat'), true)
  return true
}

function cleanupVideo(): void {
  if (unsavedVideo) URL.revokeObjectURL(unsavedVideo.blobUrl)
  unsavedVideo = null
  syncHeartbeat(() => report('heartbeat'), false)
}

chrome.runtime.onMessage.addListener(
  (message: RecordingCommandMessage | DownloadRunMessage | DownloadFinishMessage | DownloadCancelMessage | DownloadExtractMessage, sender, sendResponse) => {
    // only the extension's own background talks to this document (RV-BG-11, notes/sender-rules.md):
    // a tab sender is any page's content script, a foreign id is another extension — either one
    // could stop a recording or start a download nobody asked for. No answer, ever.
    if (!fromOwnBackground(sender)) return
    if (message.type === 'DOWNLOAD_EXTRACT') {
      void extractDownloadPage(message).then(
        html => sendResponse({ success: true, data: { html } }),
        () => sendResponse({ success: false, error: 'DOWNLOAD_FAILED' }),
      )
      return true
    }
    if (message.type === 'RECORDING_START') {
      // the answer is the only word the worker gets on whether a recording exists, so it waits for it
      void beginRecording({ ...message, type: 'RECORDING_START' }).then(started => sendResponse({ success: started }))
      return true
    }
    if (message.type === 'RECORDING_STOP') stopRecording(message.stoppedBy)
    // the download landed or the user gave up: the video's bytes can go
    if (message.type === 'RECORDING_CLEANUP') cleanupVideo()

    // Markdown downloads (download.md): this document fetches the media and writes the files
    if (message.type === 'DOWNLOAD_RUN') {
      sendResponse({ success: acceptDownloadRun(message) })
      return
    }
    if (message.type === 'DOWNLOAD_FINISH') {
      sendResponse({ success: deliverFinish(message) })
      return
    }
    if (message.type === 'DOWNLOAD_CANCEL') {
      // the answer comes when the files the run wrote are gone (download.md §2.5)
      void cleanupDownloadRun(message).then(() => sendResponse({ success: true }))
      return true
    }
  },
)
