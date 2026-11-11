/**
 * The selection bar (download.md §3.2): it takes the filter bar's place, the
 * same height at the same spot — the exit button, the count (spoken as it
 * changes), the whole-filter pick under the 200-entry cap, clear, the way to
 * select, and the one action at the row's end (下载所选). Nothing here wraps:
 * the hint gives way first, then the pick's count; the exit, count, clear and
 * download always stay.
 */
import { useEffect, useRef, type Ref } from 'react'
import { Download, X } from 'lucide-react'
import { DOWNLOAD_LIMITS } from '../../core/download'
import { uiText } from './ui-text'

interface Props {
  selectedCount: number
  filteredTotal: number
  onSelectAll(): void
  onClear(): void
  onDownload(): void
  onExit(): void
  /** The dialog hands the focus back here when it closes (download.md §3.3). */
  downloadButtonRef?: Ref<HTMLButtonElement>
}

export function SelectionBar({ selectedCount, filteredTotal, onSelectAll, onClear, onDownload, onExit, downloadButtonRef }: Props) {
  // the count is spoken as it changes: the bar is the selection's live region
  const count = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (count.current) count.current.textContent = uiText('library.selectedCount', { count: selectedCount })
  }, [selectedCount])
  const cap = DOWNLOAD_LIMITS.libraryMaxEntries
  const overCap = filteredTotal > cap
  const full = selectedCount >= cap
  const hint = full
    ? uiText('library.selectHintFull', { max: cap })
    : overCap
      ? uiText('library.selectHintCap', { max: cap })
      : selectedCount === 0
        ? uiText('library.selectHintEmpty')
        : ''
  return (
    <div className="selection-bar" data-testid="selection-bar" role="toolbar" aria-label={uiText('library.select')}>
      <button type="button" className="selection-exit" aria-label={uiText('library.exitSelection')} title={uiText('library.exitSelection')} onClick={onExit}>
        <X size={15} aria-hidden />
      </button>
      <span className={selectedCount > 0 ? 'selection-count is-on' : 'selection-count'} ref={count} role="status" aria-live="polite">
        {uiText('library.selectedCount', { count: selectedCount })}
      </span>
      <button
        type="button"
        className="selection-action selection-all"
        data-testid="select-all"
        disabled={filteredTotal === 0 || overCap || selectedCount >= filteredTotal}
        title={overCap ? uiText('library.selectHintCap', { max: cap }) : undefined}
        onClick={onSelectAll}
      >
        <span className="selection-all-full">{uiText('library.selectAll', { count: filteredTotal })}</span>
        <span className="selection-all-short">{uiText('library.selectAllShort')}</span>
      </button>
      <button type="button" className="selection-action quiet" disabled={selectedCount === 0} onClick={onClear}>
        {uiText('library.clearSelection')}
      </button>
      <span className="selection-hint">{hint}</span>
      <button
        ref={downloadButtonRef}
        type="button"
        className="primary sm selection-download"
        data-testid="download-selected"
        disabled={selectedCount === 0}
        title={selectedCount === 0 ? uiText('library.selectBeforeDownload') : undefined}
        onClick={onDownload}
      >
        <Download size={14} aria-hidden /> {uiText('library.downloadSelected')}
      </button>
    </div>
  )
}
