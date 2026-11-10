/**
 * The single-entry download's status bar (download.md §3.1): one dark pill
 * floating at the content column's bottom, never pushing the list, the
 * drawer or the reading column. It follows the run — n/N with cancel, then
 * the result — and keeps the actions the state has: 显示文件, 重试, close.
 * Progress and done speak as a status; a failure speaks as an alert.
 */
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import type { DownloadMissingReason } from '../../types/messages'
import { uiText, type UiTextKey } from './ui-text'
import type { DownloadClientState } from './download-client'

const REASON_KEYS: Record<DownloadMissingReason, UiTextKey> = {
  'unreachable': 'library.downloadReason.unreachable',
  'too-large': 'library.downloadReason.too-large',
  'wrong-type': 'library.downloadReason.wrong-type',
  'offline': 'library.downloadReason.offline',
  'write-failed': 'library.downloadReason.write-failed',
  'limit': 'library.downloadReason.limit',
}

export function missingReasonText(reason: DownloadMissingReason): string {
  return uiText(REASON_KEYS[reason] ?? 'library.downloadReason.unreachable')
}

interface Props {
  state: DownloadClientState
  onCancel(): void
  onShowFiles(): void
  onRetry(): void
  onClose(): void
}

export function DownloadStatusBar({ state, onCancel, onShowFiles, onRetry, onClose }: Props) {
  if (state.phase === 'idle') return null
  const failed = state.phase === 'failed'
  const tone = state.phase === 'failed' ? ' is-error' : state.phase === 'partial' ? ' is-warn' : state.phase === 'busy' ? ' is-info' : ''
  const Icon = failed ? CircleAlert : state.phase === 'partial' ? TriangleAlert : state.phase === 'busy' ? Info : state.phase === 'done' ? CircleCheck : LoaderCircle
  const text =
    state.phase === 'active'
      ? uiText('library.downloadProgress', { done: state.processed, total: state.total })
      : state.phase === 'done'
        ? uiText('library.downloadDone')
        : state.phase === 'partial'
          ? uiText('library.downloadPartialStatus', { count: state.missingCount })
          : state.phase === 'cancelled'
            ? uiText('library.downloadCancelledStatus')
            : state.phase === 'busy'
              ? uiText('library.downloadBusyStatus')
              : state.error || uiText('library.downloadFailed')
  const percent = state.total > 0 ? Math.round((Math.min(state.processed, state.total) / state.total) * 100) : 0
  return (
    <div className={`download-status${tone}`} data-testid="download-status-bar" role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}>
      <span className="download-status-icon">
        <Icon size={15} className={state.phase === 'active' ? 'download-status-spin' : undefined} aria-hidden />
      </span>
      <span className="download-status-text">{text}</span>
      {state.phase === 'active' && (
        <>
          {state.busy && <span className="download-status-busy">{uiText('library.downloadBusyStatus')}</span>}
          <button type="button" className="download-status-act" onClick={onCancel}>
            {uiText('common.cancel')}
          </button>
        </>
      )}
      {(state.phase === 'done' || state.phase === 'partial') && state.downloadId !== undefined && (
        <button type="button" className="download-status-act" onClick={onShowFiles}>
          {uiText('library.downloadShowFiles')}
        </button>
      )}
      {state.phase === 'failed' && (
        <button type="button" className="download-status-act" onClick={onRetry}>
          {uiText('library.downloadRetry')}
        </button>
      )}
      {(state.phase === 'partial' || state.phase === 'failed') && (
        <button type="button" className="download-status-close" aria-label={uiText('library.downloadClose')} title={uiText('library.downloadClose')} onClick={onClose}>
          <X size={14} aria-hidden />
        </button>
      )}
      {state.phase === 'active' && (
        <span className="download-status-track" aria-hidden>
          <i style={{ width: `${percent}%` }} />
        </span>
      )}
    </div>
  )
}
