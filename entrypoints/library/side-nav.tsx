/**
 * The library shell's left nav (extension.md §2.2): the brand, the fold button, the two groups of
 * views, and the footer with storage, export and the shortcut hint. Moved verbatim from App.tsx;
 * the state it read from the App closure now arrives as props.
 */
import { useEffect, useState, type KeyboardEvent, type RefObject } from 'react'
import { Download, Keyboard, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { formatBytes } from '../../utils/format-bytes'
import { uiText } from './ui-text'
import { viewTab } from './library-view-helpers'
import type { View } from './route'

const NARROW_QUERY = '(max-width: 719.98px)'
export const NAV_FOLDED_KEY = 'annhub.navFolded'

export function useNarrowWindow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY)
    const onChange = () => setNarrow(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export function readNavFold(): boolean | null {
  try {
    return localStorage.getItem(NAV_FOLDED_KEY) === '1' ? true : null
  } catch {
    return null
  }
}

export type ExportState = 'idle' | 'busy' | 'done' | 'partial' | 'failed'

export function SideNav({
  rail,
  onToggleNav,
  navView,
  counts,
  highlightTotal,
  registryCount,
  onNavKeyDown,
  usage,
  exportState,
  exportSummary,
  exportMissing,
  exportError,
  onOpenExport,
  exportButtonRef,
  shortcutKeys,
  shortcutHint,
}: {
  rail: boolean
  onToggleNav(): void
  navView: View
  counts: { all: number; clips: number; screenshots: number }
  highlightTotal: number
  registryCount: number
  onNavKeyDown(event: KeyboardEvent<HTMLElement>): void
  usage: { usage: number; quota: number } | null
  exportState: ExportState
  exportSummary: string
  exportMissing: string[]
  exportError: string
  onOpenExport(): void
  exportButtonRef: RefObject<HTMLButtonElement | null>
  shortcutKeys: string
  shortcutHint: string
}) {
  return (
    <nav className="side" aria-label={uiText('library.name')} onKeyDown={onNavKeyDown}>
      <div className="nav-top">
        <div className="brand">AnnHub</div>
        <button
          type="button"
          className="nav-fold"
          aria-expanded={!rail}
          aria-label={uiText(rail ? 'library.navExpand' : 'library.navCollapse')}
          title={uiText(rail ? 'library.navExpand' : 'library.navCollapse')}
          onClick={onToggleNav}
        >
          {rail ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
        </button>
      </div>
      <p className="nav-group-title">{uiText('library.group.library')}</p>
      {viewTab('all', counts.all, navView)}
      {viewTab('clips', counts.clips, navView)}
      {viewTab('highlights', highlightTotal, navView)}
      {viewTab('screenshots', counts.screenshots, navView)}
      <p className="nav-group-title">{uiText('library.group.manage')}</p>
      {viewTab('properties', registryCount, navView)}
      {viewTab('settings', 0, navView)}
      <div className="nav-foot">
        {usage && usage.quota > 0 && (
          <p className="nav-note nav-storage">
            {uiText('library.storageUsed', { size: formatBytes(usage.usage) })}
            <progress value={usage.usage} max={usage.quota} aria-hidden />
          </p>
        )}
        <button
          type="button"
          className="nav-export"
          ref={exportButtonRef}
          disabled={exportState === 'busy'}
          onClick={onOpenExport}
          aria-label={exportState === 'busy' ? uiText('library.exporting') : uiText('library.export')}
          title={uiText('library.export')}
        >
          <Download size={16} aria-hidden />
          <span className="nav-export-label">{exportState === 'busy' ? uiText('library.exporting') : uiText('library.export')}</span>
        </button>
        {exportState === 'done' && (
          <span className="nav-note">
            {uiText('library.exportDone')} · {exportSummary}
          </span>
        )}
        {exportState === 'partial' && (
          <div className="nav-note nav-note-warn">
            {uiText('library.exportPartial')} · {exportSummary}
            <ul>
              {exportMissing.map(id => (
                <li key={id}>
                  <code>{id}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
        {exportState === 'failed' && <span className="nav-note nav-note-warn">{exportError}</span>}
        <p className="nav-shortcut" title={shortcutHint}>
          <Keyboard size={15} aria-hidden />
          <span>
            {uiText('library.shortcutHint.lead')}{' '}
            {shortcutKeys
              .split('+')
              .filter(Boolean)
              .map((key, index) => (
                <kbd key={`${key}-${index}`}>{key}</kbd>
              ))}{' '}
            {uiText('library.shortcutHint.tail')}
          </span>
        </p>
      </div>
    </nav>
  )
}
