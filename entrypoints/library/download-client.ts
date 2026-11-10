/**
 * The library's download client (download.md §3): one hook every entry point
 * shares — the drawer's and reading view's direct single-entry start, the
 * selection's dialog. It starts the run in the worker (one download at a
 * time, there), follows the worker's notices for its own run only, and can
 * cancel, retry, reveal the landed file and dismiss the result. Progress is
 * cancellable network work, unlike the export's "started means done".
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { DownloadForm, DownloadMissingItem, DownloadNoticeMessage } from '../../types/messages'
import { currentUiLanguage, uiText } from '../../utils/ui-text'

export type DownloadPhase = 'idle' | 'active' | 'done' | 'partial' | 'failed' | 'cancelled' | 'busy'

export interface DownloadClientState {
  phase: DownloadPhase
  processed: number
  total: number
  missingCount: number
  /** The media that kept their addresses, for the dialog's short list (the README carries all). */
  missing: DownloadMissingItem[]
  /** A localized failure line, already worded (never the raw code). */
  error: string
  /** `done`/`partial`: the run's first landed file (the Markdown, the ZIP or the multi root's README). */
  downloadId?: number
  /** `active`: which half of the run is working. */
  stage?: 'fetch' | 'write'
  /** A second entrance while one runs (download.md §3.1); the notice clears itself. */
  busy: boolean
  retryForm?: DownloadForm
}

export interface LibraryDownload {
  state: DownloadClientState
  start(input: DownloadStartInput): Promise<boolean>
  cancel(): void
  retry(): void
  showFiles(): void
  dismiss(): void
}

const IDLE: DownloadClientState = { phase: 'idle', processed: 0, total: 0, missingCount: 0, missing: [], error: '', busy: false }

/** How long 「上一个还在进行」 stays on screen (download.md §3.1). */
const BUSY_MS = 2600

export interface DownloadStartInput {
  entryIds: string[]
  via: 'drawer' | 'reading' | 'selection'
  form?: DownloadForm
  withMedia?: boolean
}

export function useLibraryDownload(): LibraryDownload {
  const [state, setState] = useState<DownloadClientState>(IDLE)
  /** Only the run this hook started is tracked: another page's download is not this surface's business. */
  const tracking = useRef(false)
  const current = useRef<DownloadClientState>(IDLE)
  current.current = state
  const lastInput = useRef<DownloadStartInput | null>(null)
  const busyTimer = useRef<number | null>(null)
  /** A terminal notice can beat the start answer (a local fixture is that fast); it must not be overwritten by it. */
  const finished = useRef(false)
  const starting = useRef(false)
  const cancelRequested = useRef(false)
  const clientRunId = useRef('')

  const clearBusyTimer = useCallback(() => {
    if (busyTimer.current !== null) window.clearTimeout(busyTimer.current)
    busyTimer.current = null
  }, [])
  useEffect(() => clearBusyTimer, [clearBusyTimer])

  useEffect(() => {
    const listener = (message: DownloadNoticeMessage): void => {
      if (!tracking.current || message?.type !== 'DOWNLOAD_NOTICE' || message.clientRunId !== clientRunId.current) return
      if (message.phase === 'progress') {
        setState({
          ...IDLE,
          phase: 'active',
          processed: message.processed,
          total: message.total,
          stage: message.stage ?? 'fetch',
        })
        return
      }
      tracking.current = false
      finished.current = true
      if (message.phase === 'done' || message.phase === 'partial') {
        setState({
          ...IDLE,
          phase: message.phase,
          processed: message.processed,
          total: message.total,
          missingCount: message.missingCount,
          missing: message.missing ?? [],
          ...(message.downloadId !== undefined ? { downloadId: message.downloadId } : {}),
        })
        return
      }
      if (message.phase === 'cancelled') {
        setState({ ...IDLE, phase: 'cancelled' })
        return
      }
      const retryForm = message.errorCode === 'DOWNLOAD_ZIP_FAILED' ? 'folder' : undefined
      if (retryForm && lastInput.current) lastInput.current = { ...lastInput.current, form: retryForm }
      setState({ ...IDLE, phase: 'failed', error: failureLine(message.errorCode), ...(retryForm ? { retryForm } : {}) })
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  /** 「上一个还在进行」: on the running bar when this hook owns the run, alone otherwise; it clears by itself (download.md §3.1). */
  const showBusy = useCallback(() => {
    clearBusyTimer()
    setState(previous => (previous.phase === 'active' ? { ...previous, busy: true } : { ...IDLE, phase: 'busy', busy: true }))
    busyTimer.current = window.setTimeout(() => {
      busyTimer.current = null
      setState(previous => (previous.phase === 'busy' ? IDLE : previous.busy ? { ...previous, busy: false } : previous))
    }, BUSY_MS)
  }, [clearBusyTimer])

  const start = useCallback(
    async (input: DownloadStartInput): Promise<boolean> => {
      if (tracking.current || starting.current || current.current.phase === 'active') {
        showBusy()
        return false
      }
      lastInput.current = input
      starting.current = true
      cancelRequested.current = false
      clearBusyTimer()
      finished.current = false
      clientRunId.current = crypto.randomUUID()
      // listen before the request: the run's first notices may beat the answer (a fast local fixture does)
      tracking.current = true
      current.current = { ...IDLE, phase: 'active', stage: 'fetch' }
      setState(current.current)
      const response = await MessageUtils.sendMessage({
        type: 'START_LIBRARY_DOWNLOAD',
        clientRunId: clientRunId.current,
        ...input,
        lang: currentUiLanguage(),
      })
      starting.current = false
      if (!response.success) {
        tracking.current = false
        if (response.error === 'DOWNLOAD_ACTIVE') {
          showBusy()
          return false
        }
        setState({ ...IDLE, phase: 'failed', error: failureLine(response.error) })
        return false
      }
      if (!finished.current) setState({ ...IDLE, phase: 'active', total: response.data?.total ?? 0, stage: 'fetch' })
      if (cancelRequested.current && !finished.current) void MessageUtils.sendMessage({ type: 'CANCEL_DOWNLOAD' })
      return true
    },
    [clearBusyTimer, showBusy],
  )

  const cancel = useCallback(() => {
    cancelRequested.current = true
    if (starting.current) return
    void MessageUtils.sendMessage({ type: 'CANCEL_DOWNLOAD' })
  }, [])

  const retry = useCallback(() => {
    const input = lastInput.current
    if (!input) return
    setState(IDLE)
    void start(input)
  }, [start])

  const showFiles = useCallback(() => {
    const id = current.current.downloadId
    if (id === undefined) return
    void MessageUtils.sendMessage({ type: 'SHOW_DOWNLOAD_FILE', downloadId: id })
  }, [])

  const dismiss = useCallback(() => {
    if (tracking.current || starting.current) return
    clearBusyTimer()
    tracking.current = false
    finished.current = false
    setState(IDLE)
  }, [clearBusyTimer])

  return { state, start, cancel, retry, showFiles, dismiss }
}

/** The worker's stable codes, worded for people (download.md §8). */
function failureLine(code: string | undefined): string {
  if (code === 'DOWNLOAD_ZIP_FAILED') return uiText('download.zipFailed')
  if (code === 'DOWNLOAD_ACTIVE') return uiText('library.downloadBusy')
  if (code === 'DOWNLOAD_TOO_MANY') return uiText('library.downloadTooMany')
  if (code === 'DOWNLOAD_EMPTY') return uiText('library.downloadEmpty')
  return uiText('library.downloadFailed')
}
