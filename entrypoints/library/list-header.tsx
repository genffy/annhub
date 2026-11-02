/**
 * The list view's header strip (extension.md §2.2): the page title and subtitle, the search field,
 * the filter bar (empty libraries leave it out), and the first-use guide card. Moved verbatim from
 * App.tsx; the state it read from the App closure now arrives as props.
 */
import type { ReactNode, RefObject } from 'react'
import { ArrowUpRight, Search } from 'lucide-react'
import type { PropertyDefinition } from '../../learning-core/types'
import type { HighlightQueryResult } from '../../learning-core/query'
import { currentUiLanguage, uiText } from '../../utils/ui-text'
import { ENTRY_TYPE_ICONS, VIEW_ICONS } from '../../utils/entry-icons'
import { FilterBar } from './filter-bar'
import { VIEW_LABEL_KEYS, pageSubtitle } from './library-view-helpers'
import { hasActiveFilter, type RouteState } from './route'

/** The export result line over the content while the dialog itself is closed (extension.md §2.2). */
export function ExportStatus({
  exportState,
  exportSummary,
  exportMissing,
  exportError,
}: {
  exportState: 'idle' | 'busy' | 'done' | 'partial' | 'failed'
  exportSummary: string
  exportMissing: string[]
  exportError: string
}) {
  return (
    <>
      {exportState !== 'idle' && exportState !== 'busy' && (
        <div className="mobile-export-status" role="status">
          {exportState === 'failed' ? exportError : `${uiText(exportState === 'partial' ? 'library.exportPartial' : 'library.exportDone')} · ${exportSummary}`}
          {exportState === 'partial' && (
            <ul>
              {exportMissing.map(id => (
                <li key={id}>
                  <code>{id}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

export function ListHeader({
  route,
  total,
  counts,
  highlightResult,
  loading,
  searchDraft,
  setSearchDraft,
  searchInputRef,
  hosts,
  tags,
  registry,
  setFilter,
  countsReady,
  guideDismissed,
  onDismissGuide,
  children,
}: {
  route: RouteState
  total: number
  counts: { all: number; clips: number; screenshots: number }
  highlightResult: HighlightQueryResult
  loading: boolean
  searchDraft: string
  setSearchDraft(next: string): void
  searchInputRef: RefObject<HTMLInputElement | null>
  hosts: string[]
  tags: string[]
  registry: PropertyDefinition[]
  setFilter(next: RouteState): void
  countsReady: boolean
  guideDismissed: boolean
  onDismissGuide(): void
  /** the lists of the active view: they are page-body children, as in the original single file */
  children?: ReactNode
}) {
  return (
    <>
      <header className="page-head">
        <div className="page-titles">
          <h1 className="page-title">{uiText(VIEW_LABEL_KEYS[route.view])}</h1>
          <p className="page-sub">{pageSubtitle(route, total, counts, highlightResult)}</p>
        </div>
        <div className="page-actions">
          <div className="search-field">
            <Search size={15} aria-hidden />
            <input
              ref={searchInputRef}
              className="search"
              type="search"
              placeholder={uiText('library.searchPlaceholder')}
              value={searchDraft}
              onChange={event => setSearchDraft(event.target.value)}
              aria-label={uiText('library.searchPlaceholder')}
            />
            {!searchDraft && <kbd aria-hidden>/</kbd>}
          </div>
        </div>
      </header>
      <div className="page-body">
        {/* nothing to filter yet: the toolbar leaves an empty, unfiltered library alone (extension.md §5) */}
        {!(countsReady && counts.all === 0 && !hasActiveFilter(route)) && (
          <FilterBar
            view={route.view}
            filters={route}
            hosts={hosts}
            tags={tags}
            registry={registry}
            countLabel={loading ? uiText('common.loading') : uiText('library.count', { count: route.view === 'highlights' ? highlightResult.total : total })}
            onChange={setFilter}
          />
        )}
        {countsReady && counts.all === 0 && !loading && total === 0 && !guideDismissed && (
          <div className="guide-card" data-testid="guide-card">
            <div className="guide-grid">
              {(
                [
                  { Icon: ENTRY_TYPE_ICONS.clip, nameKey: 'library.clips', textKey: 'library.guide.clip', view: 'clips' },
                  { Icon: ENTRY_TYPE_ICONS.screenshot, nameKey: 'library.screenshots', textKey: 'library.guide.shot', view: 'screenshots' },
                  { Icon: VIEW_ICONS.highlights, nameKey: 'library.highlights', textKey: 'library.guide.hl', view: 'highlights' },
                ] as const
              ).map(({ Icon, nameKey, textKey, view }) => (
                <div className="guide-item" key={nameKey} data-view={view}>
                  <span className="guide-item-head">
                    <span className="guide-tile">
                      <Icon size={17} aria-hidden />
                    </span>
                    <span className="guide-name">{uiText(nameKey)}</span>
                  </span>
                  <p>{uiText(textKey)}</p>
                </div>
              ))}
            </div>
            <div className="guide-actions">
              <button
                type="button"
                className="primary"
                onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL(currentUiLanguage() === 'zh' ? 'sample.html' : 'sample.en.html') })}
              >
                <ArrowUpRight size={15} aria-hidden />
                {uiText('library.guide.sample')}
              </button>
              <span className="guide-note">{uiText('library.guide.note')}</span>
              <span className="guide-spacer" />
              <button type="button" className="ghost sm quiet" onClick={onDismissGuide}>
                {uiText('library.guide.dismiss')}
              </button>
            </div>
          </div>
        )}
        {children}
      </div>
    </>
  )
}
