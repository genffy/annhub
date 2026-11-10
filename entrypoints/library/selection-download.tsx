/**
 * The selection's download dialog (download.md §3.3): the export dialog's
 * shell and keyboard behaviour, with the download's own states — the prepare
 * state states the counts, the form, the media choice and the file estimate;
 * the running state shows n/N and CAN be cancelled (network work, unlike the
 * export's start-means-done); the results name the files, the missing media
 * and the next action. Closing leaves selection mode and the picked entries
 * exactly as they were.
 */
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Download, Info, TriangleAlert } from 'lucide-react'
import MessageUtils from '../../utils/message'
import { uiText, type UiTextKey } from '../../utils/ui-text'
import { DOWNLOAD_LIMITS, type DownloadForm } from '../../core/download'
import type { EstimateDownloadResult } from '../../types/messages'
import type { LibraryDownload } from './download-client'
import { missingReasonText } from './download-status-bar'

interface Props {
  entryIds: string[]
  /** The settings' defaults, offered first (download.md §3.3, §4.1). */
  defaults: { form: DownloadForm; withMedia: boolean }
  download: LibraryDownload
  onClose(): void
}

export function SelectionDownload({ entryIds, defaults, download, onClose }: Props) {
  const [form, setForm] = useState<DownloadForm>(defaults.form)
  const [withMedia, setWithMedia] = useState(defaults.withMedia)
  const [estimate, setEstimate] = useState<EstimateDownloadResult | null>(null)
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const [started, setStarted] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void MessageUtils.sendMessage({ type: 'ESTIMATE_DOWNLOAD', entryIds }).then(response => {
      if (active && response.success && response.data) setEstimate(response.data)
    })
    return () => {
      active = false
    }
  }, [entryIds])

  useEffect(() => {
    const online = (): void => setOffline(false)
    const offlineNow = (): void => setOffline(true)
    window.addEventListener('online', online)
    window.addEventListener('offline', offlineNow)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offlineNow)
    }
  }, [])

  const state = download.state
  const phase = (started || blocked) && state.phase !== 'idle' && state.phase !== 'busy' ? state.phase : 'prepare'
  const busy = phase === 'active'
  const finished = phase === 'done' || phase === 'partial' || phase === 'failed' || phase === 'cancelled'
  const stateKey: UiTextKey =
    phase === 'done'
      ? 'library.downloadState.full'
      : phase === 'partial'
        ? 'library.downloadState.partial'
        : phase === 'failed'
          ? 'library.downloadState.failed'
          : phase === 'cancelled'
            ? 'library.downloadState.cancelled'
            : busy
              ? 'library.downloadState.busy'
              : 'library.downloadState.ready'

  // the keyboard enters at the primary action and follows the state (download.md §3.3)
  useEffect(() => {
    if (phase === 'active') root.current?.querySelector<HTMLElement>('[data-testid="download-cancel"]')?.focus({ preventScroll: true })
    else if (phase === 'prepare') root.current?.querySelector<HTMLElement>('[data-testid="download-start"]')?.focus({ preventScroll: true })
    else if (phase === 'failed') root.current?.querySelector<HTMLElement>('[data-testid="download-retry"]')?.focus({ preventScroll: true })
    else root.current?.querySelector<HTMLElement>('[data-testid="download-finish"], [data-testid="download-again"]')?.focus({ preventScroll: true })
  }, [phase])

  /** Esc and the scrim close the dialog — except while the run goes on: cancel is the only way out (download.md §3.3). */
  const closeIfIdle = (): void => {
    if (!busy) close()
  }

  const start = async (): Promise<void> => {
    setBlocked(false)
    setStarted(true)
    const accepted = await download.start({ entryIds, via: 'selection', form, withMedia: withMedia && !offline })
    if (!accepted) {
      // Busy returns to preparation; failures keep their reason and retry action.
      setStarted(false)
      setBlocked(true)
    }
  }

  const close = (): void => {
    download.dismiss()
    onClose()
  }

  const path = estimate?.basePath ?? 'AnnHub'
  const target = form === 'zip' ? `${path}.zip` : path
  const files = estimate?.files ?? entryIds.length
  const summary = estimate
    ? uiText('library.downloadSummaryLine', { count: estimate.entryCount, clips: estimate.clips, screenshots: estimate.screenshots, files: estimate.files })
    : uiText('common.loading')

  return (
    <div
      ref={root}
      className="export-backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) closeIfIdle()
      }}
      onKeyDownCapture={event => {
        if (event.key === 'Escape') {
          if (!busy) {
            event.stopPropagation()
            close()
          }
          return
        }
        if (event.key !== 'Tab' || !root.current) return
        const focusable = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')]
        if (focusable.length === 0) return
        const first = focusable[0]!
        const last = focusable[focusable.length - 1]!
        if (event.shiftKey && (document.activeElement === first || !root.current.contains(document.activeElement))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !root.current.contains(document.activeElement))) {
          event.preventDefault()
          first.focus()
        }
      }}
    >
      <div className="export-card download-dialog" role="dialog" aria-modal="true" aria-labelledby="download-dialog-title" aria-busy={busy} data-testid="download-dialog">
        <div className="export-head">
          <h3 id="download-dialog-title">{uiText('library.downloadDialogTitle')}</h3>
          <span
            className={`export-state${phase === 'done' ? ' export-state-done' : phase === 'partial' ? ' export-state-partial' : phase === 'failed' ? ' export-state-failed' : ''}`}
          >
            {uiText(stateKey)}
          </span>
        </div>

        {phase === 'prepare' && (
          <>
            <div className="download-sum" data-testid="download-summary">
              <b>{summary}</b>
            </div>
            <div className="download-choices">
              <div className="download-field">
                <span className="download-label">{uiText('library.downloadForm')}</span>
                <div className="seg download-seg" role="radiogroup" aria-label={uiText('library.downloadForm')}>
                  {(['folder', 'zip'] as const).map(option => (
                    <label key={option} className="seg-item">
                      <input type="radio" name="download-form" checked={form === option} onChange={() => setForm(option)} />
                      {uiText(option === 'folder' ? 'library.downloadFolder' : 'library.downloadZip')}
                    </label>
                  ))}
                </div>
                <span className="download-help">{uiText(form === 'zip' ? 'library.downloadFormHelpZip' : 'library.downloadFormHelpFolder')}</span>
                <span className="download-help download-path">{uiText('library.downloadSaveTo', { path: target })}</span>
              </div>
              <div className="download-field">
                <label className={`download-media${offline ? ' is-off' : ''}`}>
                  <input type="checkbox" checked={withMedia && !offline} disabled={offline} onChange={event => setWithMedia(event.target.checked)} />
                  <span>{uiText('library.downloadWithMedia')}</span>
                </label>
                <span className={`download-help${offline ? ' download-warn' : ''}`}>{uiText(offline ? 'library.downloadOffline' : 'library.downloadMediaHelp')}</span>
              </div>
              {files > DOWNLOAD_LIMITS.zipAdviceFiles && (
                <p className="download-advice" data-testid="download-zip-advice">
                  <Info size={14} aria-hidden /> {uiText('library.downloadZipAdvice', { files })}
                </p>
              )}
              {blocked && (
                <p className="download-warn" role="alert" data-testid="download-blocked">
                  {uiText('library.downloadBusy')}
                </p>
              )}
            </div>
            <div className="export-actions">
              <button type="button" className="ghost quiet" onClick={close}>
                {uiText('common.cancel')}
              </button>
              <button type="button" className="primary" data-testid="download-start" disabled={entryIds.length === 0} onClick={() => void start()}>
                <Download size={14} aria-hidden /> {uiText('library.downloadStart')}
              </button>
            </div>
          </>
        )}

        {phase === 'active' && (
          <>
            <p className="export-intro">{uiText('library.downloadStage')}</p>
            <div className="download-progress-line">
              <span>{uiText(state.stage === 'write' ? 'library.downloadStageWrite' : 'library.downloadStageFetch')}</span>
              <span className="download-progress-count" data-testid="download-progress">
                {state.processed} / {state.total}
              </span>
            </div>
            <progress aria-label={uiText('library.downloadProgress', { done: state.processed, total: state.total })} value={state.processed} max={Math.max(state.total, 1)} />
            <div className="export-actions">
              <button type="button" className="ghost quiet" data-testid="download-cancel" onClick={download.cancel}>
                {uiText('common.cancel')}
              </button>
            </div>
          </>
        )}

        {finished && (
          <>
            {phase === 'done' && (
              <div className="banner banner-ok" data-testid="download-done-banner">
                <CheckCircle2 size={15} aria-hidden />
                <div>{uiText('library.downloadDoneBanner', { count: entryIds.length, path: target })}</div>
              </div>
            )}
            {phase === 'partial' && (
              <div className="banner banner-warn" data-testid="download-partial-banner">
                <TriangleAlert size={15} aria-hidden />
                <div>
                  {uiText('library.downloadPartialBanner', { count: state.missingCount })}
                  {state.missing.length > 0 && (
                    <ul className="download-missing">
                      {state.missing.slice(0, 5).map(item => (
                        <li key={item.url}>
                          <span className="download-missing-url">{item.url}</span>
                          <span className="download-missing-reason">{missingReasonText(item.reason)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {phase === 'failed' && (
              <div className="banner banner-danger" data-testid="download-failed-banner">
                <CircleAlert size={15} aria-hidden />
                <div>{state.error || uiText('library.downloadFailed')}</div>
              </div>
            )}
            {phase === 'cancelled' && (
              <div className="banner" data-testid="download-cancelled-banner">
                <Info size={15} aria-hidden />
                <div>{uiText('library.downloadCancelledBanner', { path: target })}</div>
              </div>
            )}
            {phase === 'partial' && <p className="export-note">{uiText('library.downloadMissingRest')}</p>}
            {phase === 'failed' && <p className="export-note">{uiText('library.downloadFailedNote')}</p>}
            {phase === 'cancelled' && <p className="export-note">{uiText('library.downloadCancelledNote', { count: entryIds.length })}</p>}
            <div className="export-actions">
              {(phase === 'cancelled' || phase === 'failed') && (
                <button type="button" className="ghost quiet" onClick={close}>
                  {uiText('library.downloadClose')}
                </button>
              )}
              {(phase === 'done' || phase === 'partial') && state.downloadId !== undefined && (
                <button type="button" className="ghost quiet" data-testid="download-show-files" onClick={download.showFiles}>
                  {uiText('library.downloadShowFiles')}
                </button>
              )}
              {(phase === 'done' || phase === 'partial') && (
                <button type="button" className="primary" data-testid="download-finish" onClick={close}>
                  {uiText('library.exportFinish')}
                </button>
              )}
              {phase === 'failed' && (
                <button
                  type="button"
                  className="primary"
                  data-testid="download-retry"
                  onClick={() => {
                    if (state.retryForm) setForm(state.retryForm)
                    download.retry()
                  }}
                >
                  {uiText('library.downloadRetry')}
                </button>
              )}
              {phase === 'cancelled' && (
                <button type="button" className="primary" data-testid="download-again" onClick={download.retry}>
                  {uiText('library.downloadAgain')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
