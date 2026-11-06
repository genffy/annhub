/**
 * The shell's shared view helpers, moved verbatim from App.tsx: the state they used to close over
 * now arrives as arguments (App.tsx passes it at the call sites).
 */
import type { KeyboardEvent, ReactNode } from 'react'
import { Search } from 'lucide-react'
import { VIEW_ICONS } from '../../utils/entry-icons'
import { uiText, type UiTextKey } from '../../utils/ui-text'
import { EMPTY_FILTERS, hasActiveFilter, type FilterState, type RouteState, type View } from './route'
import type { HighlightQueryResult } from '../../core/query'

export const VIEW_LABEL_KEYS: Record<View, UiTextKey> = {
  all: 'library.all',
  clips: 'library.clips',
  highlights: 'library.highlights',
  screenshots: 'library.screenshots',
  properties: 'library.properties',
  settings: 'library.settings',
}

// The nav also answers ↑ ↓: the focus walks the nav items while every one of them stays in the Tab
// order (extension.md §7.2) — an addition to the keyboard, not a replacement of it.
export function onNavKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('.nav-item')]
  const index = items.indexOf(document.activeElement as HTMLElement)
  if (index === -1) return
  event.preventDefault()
  items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
}

/**
 * The subtitle under the page title (extension.md §2.2): what the view holds — the library's make-up on “全部”,
 * the highlights' own count and sources on “高亮”, the plain count elsewhere — and, once a filter or search is
 * on, the count that came back for it.
 */
export function pageSubtitle(route: RouteState, total: number, counts: { all: number; clips: number; screenshots: number }, highlightResult: HighlightQueryResult): string {
  const shown = route.view === 'highlights' ? highlightResult.total : total
  if (hasActiveFilter(route)) return uiText('library.sub.filtered', { count: shown })
  if (route.view === 'all') return uiText('library.sub.all', { total: counts.all, clips: counts.clips, shots: counts.screenshots })
  if (route.view === 'highlights') return uiText('library.sub.highlights', { count: highlightResult.total, clips: highlightResult.groups.length })
  return uiText('library.sub.count', { count: shown })
}

export function viewTab(view: View, count: number, navView: View): ReactNode {
  const Icon = VIEW_ICONS[view]
  const label = uiText(VIEW_LABEL_KEYS[view])
  return (
    <a
      key={view}
      href={`#/${view}`}
      data-view={view}
      className={`nav-item${navView === view ? ' nav-item-current' : ''}`}
      aria-current={navView === view ? 'page' : undefined}
      aria-label={label}
      title={label}
    >
      <Icon size={17} aria-hidden />
      <span className="nav-label">{label}</span>
      {count > 0 && <span className="nav-count">{count}</span>}
    </a>
  )
}

/**
 * An answer with nothing in it (extension.md §5): with a filter on it says "no results" and offers the way out
 * while keeping every filter; otherwise each view explains its own way in, with the shortcut as the browser
 * actually binds it.
 */
function emptyStateImpl(view: 'all' | 'clips' | 'screenshots' | 'highlights', route: RouteState, shortcutKeys: string, setFilter: (next: FilterState) => void): ReactNode {
  if (hasActiveFilter(route)) {
    return (
      <div className="empty">
        <span className="empty-icon">
          <Search size={22} aria-hidden />
        </span>
        <p className="empty-heading">{uiText('library.noResults')}</p>
        <p className="empty-desc">{uiText('library.noResults.desc')}</p>
        <button type="button" className="primary" onClick={() => setFilter({ ...EMPTY_FILTERS })}>
          {uiText('library.clearFilters')}
        </button>
      </div>
    )
  }
  if (view === 'all') {
    // the empty library explains both ways in
    return (
      <div className="empty">
        <span className="empty-icon">
          <VIEW_ICONS.all size={22} aria-hidden />
        </span>
        <p className="empty-heading">{uiText('library.empty.heading')}</p>
        <p className="empty-desc">{uiText('library.empty.how.clip')}</p>
        <p className="empty-desc">{uiText('library.empty.how.shot', { keys: shortcutKeys })}</p>
      </div>
    )
  }
  const { title, desc } = {
    clips: { title: uiText('library.empty.clips.title'), desc: uiText('library.empty.clips.desc') },
    screenshots: { title: uiText('library.empty.screenshots.title'), desc: uiText('library.empty.screenshots.desc', { keys: shortcutKeys }) },
    highlights: { title: uiText('library.empty.highlights.title'), desc: uiText('library.empty.highlights.desc') },
  }[view]
  const Icon = VIEW_ICONS[view]
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={22} aria-hidden />
      </span>
      <p className="empty-heading">{title}</p>
      <p className="empty-desc">{desc}</p>
    </div>
  )
}

export function emptyState(view: 'all' | 'clips' | 'screenshots' | 'highlights', route: RouteState, shortcutKeys: string, setFilter: (next: FilterState) => void): ReactNode {
  return emptyStateImpl(view, route, shortcutKeys, setFilter)
}
