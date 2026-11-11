/**
 * The library page — the extension's application page (extension.md §2.2,
 * §2.3, §4.1): the left-nav shell with the all / clips / highlights /
 * screenshots / properties / settings views, search and filters per
 * search.md, the detail drawer with editing, and the single "Export
 * content" Markdown ZIP command. Routes and filters live in the URL hash so
 * refresh restores the view.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { EntryQuery, PropertyCondition } from '../../core/query'
import type { EntryRecord, PropertyDefinition } from '../../core/types'

import { ExportDialog } from './export-dialog'
import { DownloadsLayer } from './downloads-layer'
import { SelectionToolbar } from './selection-toolbar'
import { useSelectionController } from './selection-controller'
import { useListQuery } from './use-list-query'
import { useCounts } from './use-counts'
import { useExportState } from './use-export-state'
import { DetailDrawer } from './detail-drawer'
import { EntryCard, propertyPills } from './entry-card'
import { NAV_FOLDED_KEY, readNavFold, SideNav, useNarrowWindow } from './side-nav'
import { ExportStatus, ListHeader } from './list-header'
import { emptyState, onNavKeyDown } from './library-view-helpers'
import { PropertiesView } from './properties-view'
import { SettingsView } from './settings-view'
import { ReadingView } from './reading-view'
import type { HighlightQuery, HighlightQueryResult } from '../../core/query'
import type { HighlightColor } from '../../core/types'
import { relativeTime } from './ui-text'
import { uiText } from './ui-text'

import { buildCondition, localDayRange, recordQueried, SEARCH_DEBOUNCE_MS } from './library-queries'
import { isListView, listHash, readHash, readHashFor, type FilterState, type RouteState, type View } from './route'
import { ArrowUpRight, MessageSquareText } from 'lucide-react'
import { ANN_SCREENSHOT_COMMAND } from '../../constants'

/** The nav's and the page title's words for each view. */

/**
 * The nav folds to its icon rail when the window is this narrow, and by hand at any width (extension.md §2.2):
 * below 720 the rail is the default, from 720 up the nav opens (the design's 720–1099 band, foldable by hand).
 * Only a fold is remembered: unfolding is the narrow window's default undone for this visit, not a preference.
 */

/** The `library.queried` event (metrics.md §9): the search words are `has_text`, never one of the `filters`. */

/** Builds the typed condition from the filter bar's raw strings (search.md §3). */

export default function App() {
  // The URL is the one source of route state (extension.md §2.2): reads
  // happen on hashchange, writes only on user actions.
  const [route, setRoute] = useState<RouteState>(readHash)
  const routeRef = useRef(route)
  routeRef.current = route
  const activeFlush = useRef<(() => Promise<boolean>) | null>(null)
  const drawerTrigger = useRef<HTMLElement | null>(null)
  const hadDrawer = useRef(false)
  const registerFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    activeFlush.current = flush
  }, [])
  const [registry, setRegistry] = useState<PropertyDefinition[]>([])
  /** Set once the registry has answered, or failed to: until then a property condition in the URL has no type to query by. */
  const [registryLoaded, setRegistryLoaded] = useState(false)
  // Only a list view has a first answer to wait for. Properties and settings run no query, so nothing would ever clear a flag they started with.
  const [loading, setLoading] = useState(() => isListView(route.view))
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  // starts from the default binding and follows the browser's own assignment (extension.md §7.1)
  const [shortcutKeys, setShortcutKeys] = useState('Cmd/Ctrl+Shift+S')
  const [shortcutHint, setShortcutHint] = useState(() => uiText('library.shortcutHint', { keys: 'Cmd/Ctrl+Shift+S' }))
  /** The export command's dialog (extension.md §2.2): the nav button opens it, it runs the one export and answers with its state. */
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const exportButton = useRef<HTMLButtonElement>(null)
  const [guideDismissed, setGuideDismissed] = useState(() => Boolean(localStorage.getItem('annhub.guideDismissed')))
  const [highlightResult, setHighlightResult] = useState<HighlightQueryResult>({ groups: [], total: 0 })
  const [defaultColor, setDefaultColor] = useState<HighlightColor>('yellow')
  const [searchDraft, setSearchDraft] = useState(route.search)
  const narrowWindow = useNarrowWindow()
  /** The user's own fold: `true` folded (remembered), `false` unfolded this visit, `null` follows the window width. */
  const [navFold, setNavFold] = useState<boolean | null>(readNavFold)
  const rail = navFold ?? narrowWindow
  const toggleNav = () => {
    const next = !rail
    setNavFold(next)
    try {
      if (next) localStorage.setItem(NAV_FOLDED_KEY, '1')
      else localStorage.removeItem(NAV_FOLDED_KEY)
    } catch {
      // the fold still applies for this visit
    }
  }
  /** The list route a reading view came from; deep links fall back to the entry's type list. */
  const returnHashRef = useRef<string | null>(null)
  /** Set while the user (not the page load) caused the current query (RV-LIB-13). */
  const userQueryRef = useRef(false)
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null)
  const entryGridRef = useRef<HTMLUListElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listQueryKey = route.readId ? listHash({ ...readHash(returnHashRef.current ?? '#/clips'), entryId: null }) : listHash({ ...route, entryId: null })
  const listRoute = useMemo(() => readHash(listQueryKey), [listQueryKey])

  useEffect(() => {
    if (route.entryId) hadDrawer.current = true
    else if (!route.readId && hadDrawer.current) {
      hadDrawer.current = false
      const trigger = drawerTrigger.current
      if (trigger?.isConnected) trigger.focus()
      drawerTrigger.current = null
    }
  }, [route.entryId, route.readId])

  useEffect(() => {
    const onHashChange = () => {
      const next = readHash()
      const previous = routeRef.current
      const leavingOverlay = (previous.entryId && previous.entryId !== next.entryId) || (previous.readId && previous.readId !== next.readId)
      if (leavingOverlay && activeFlush.current) {
        const previousHash = previous.readId ? readHashFor(previous.readId) : listHash(previous)
        void activeFlush.current().then(ok => {
          if (!ok) {
            history.replaceState(null, '', previousHash)
            return
          }
          routeRef.current = next
          setRoute(next)
        })
        return
      }
      routeRef.current = next
      setRoute(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    setSearchDraft(route.search)
  }, [route.search])

  // Search settles after a quiet period; the query path sees one request per
  // settled input, not one per keystroke (search.md §6).
  useEffect(() => {
    if (searchDraft === route.search) return
    const timer = window.setTimeout(() => {
      userQueryRef.current = true
      const next = { ...route, search: searchDraft }
      history.replaceState(null, '', listHash(next))
      setRoute(next)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchDraft, route])

  /** A filter change rewrites the list route in place (no history spam). */
  const setFilter = useCallback((patch: Partial<FilterState>) => {
    setRoute(prev => {
      const next = { ...prev, ...patch }
      history.replaceState(null, '', listHash(next))
      userQueryRef.current = true
      return next
    })
  }, [])

  const queryFor = useCallback(
    (filters: RouteState): EntryQuery => {
      // each condition with a property becomes a typed condition; several AND (search.md §3)
      const conditions = filters.conditions
        .map(condition => {
          const def = registry.find(item => item.name === condition.prop)
          return def && condition.op ? buildCondition(def, condition.op, condition.val, condition.val2) : undefined
        })
        .filter((condition): condition is PropertyCondition => Boolean(condition))
      return {
        search: filters.search || undefined,
        types: filters.view === 'all' ? (filters.type ? [filters.type] : undefined) : [filters.view === 'clips' ? 'clip' : 'screenshot'],
        hosts: filters.hosts.length > 0 ? filters.hosts : undefined,
        tags: filters.tags.length > 0 ? filters.tags : undefined,
        ...(conditions.length > 0 ? { conditions } : {}),
        ...localDayRange(filters.from, filters.to),
      }
    },
    [registry],
  )

  const { counts, countsReady, highlightTotal, hosts, tags, reload, reloadKey } = useCounts()
  const highlightSeq = useRef(0)

  /**
   * Whether a route's query has to wait for the registry: only it gives a property condition its type. Queried
   * before that, the condition would be dropped — the unfiltered list on screen — and the query sent again.
   */
  const awaitsRegistry = (filters: FilterState) => !registryLoaded && filters.conditions.some(condition => condition.prop && condition.op)

  // Each list view's query as text (`null` while it waits for the registry). The effects below re-run when it
  // changes, not whenever the registry does: sending an unchanged query again puts "加载中" back over an empty
  // answer already on screen until the second reply (extension.md §5).
  const entryQueryJson = awaitsRegistry(listRoute) ? null : JSON.stringify(queryFor(listRoute))
  const highlightQueryJson = awaitsRegistry(route)
    ? null
    : JSON.stringify({
        search: route.search || undefined,
        hosts: route.hosts.length > 0 ? route.hosts : undefined,
        tags: route.tags.length > 0 ? route.tags : undefined,
        conditions: queryFor(route).conditions,
        colors: route.colors.length > 0 ? (route.colors as HighlightColor[]) : undefined,
        ...localDayRange(route.from, route.to),
      } satisfies HighlightQuery)

  const list = useListQuery({
    active: listRoute.view !== 'settings' && listRoute.view !== 'properties' && listRoute.view !== 'highlights',
    queryJson: entryQueryJson,
    queryKey: listQueryKey,
    reloadKey,
    query: () => queryFor(route),
    onQueried: total => {
      if (userQueryRef.current) {
        userQueryRef.current = false
        recordQueried(listRoute, total)
      }
    },
  })
  const { items, total, nextCursor, loadingMore, loadMore, takeFocusAfterLoad } = list

  // The highlights view runs its own query with the same filters (RV-LIB-04).
  useEffect(() => {
    if (route.view !== 'highlights') return
    const seq = ++highlightSeq.current
    setLoading(true)
    if (highlightQueryJson === null) return
    const query = JSON.parse(highlightQueryJson) as HighlightQuery
    void (async () => {
      const response = await MessageUtils.sendMessage({ type: 'QUERY_HIGHLIGHTS', query })
      if (seq !== highlightSeq.current) return
      if (response.success) setHighlightResult(response.data!.result)
      setLoading(false)
      if (response.success && userQueryRef.current) {
        userQueryRef.current = false
        recordQueried(route, response.data!.result.total)
      }
    })()
  }, [route, reloadKey, highlightQueryJson])

  // Before paint, so a last page that took the focused button away never leaves the keyboard on the page itself. A
  // user who moved the focus while the page was on its way (into a drawer, back to a card) keeps it where they put it.
  useLayoutEffect(() => {
    const id = takeFocusAfterLoad()
    if (!id) return
    const active = document.activeElement
    if (active && active !== document.body && active !== loadMoreButtonRef.current) return
    entryGridRef.current?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"] > .entry-card-open`)?.focus()
  }, [items, takeFocusAfterLoad])

  useEffect(() => {
    void MessageUtils.sendMessage({ type: 'LIST_PROPERTIES' }).then(response => {
      if (response.success) setRegistry(response.data!.definitions)
      // a registry that cannot be read leaves its conditions out, as an unknown property does: the list still answers
      setRegistryLoaded(true)
    })
    void MessageUtils.sendMessage({ type: 'GET_SETTINGS' }).then(response => {
      if (response.success && response.data?.defaultHighlightColor) setDefaultColor(response.data.defaultHighlightColor)
    })
    void MessageUtils.sendMessage({ type: 'USAGE_ESTIMATE' }).then(response => {
      if (response.success) setUsage(response.data!)
    })
    void chrome.commands.getAll().then(commands => {
      const binding = commands.find(command => command.name === ANN_SCREENSHOT_COMMAND)?.shortcut
      if (binding) {
        setShortcutKeys(binding)
        setShortcutHint(uiText('library.shortcutHint', { keys: binding }))
      }
    })
  }, [])

  const closeDrawer = useCallback(() => {
    if (!route.entryId) return
    const next = { ...route, entryId: null }
    history.replaceState(null, '', listHash(next))
    setRoute(next)
  }, [route])

  /** Entering selection saves the open drawer's pending edit before closing it (root AGENTS rule 5). */
  const beforeSelection = useCallback(async (): Promise<boolean> => {
    const from = routeRef.current
    if ((await activeFlush.current?.()) === false) return false
    if (routeRef.current !== from) return false
    closeDrawer()
    return true
  }, [closeDrawer])

  const selection = useSelectionController({
    listQueryKey,
    items,
    total,
    queryFor: () => queryFor(route),
    beforeEnter: beforeSelection,
    escapeBlocked: Boolean(route.entryId || route.readId || exportDialogOpen),
  })
  const { selecting, selectedIds, download: libraryDownload } = selection

  const openEntry = useCallback(
    async (entry: EntryRecord) => {
      drawerTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      void MessageUtils.sendMessage({ type: 'RECORD_EVENT', name: 'entry.reopened', props: { type: entry.type } })
      // the drawer is part of the route: refresh restores it (extension.md §2.2)
      location.hash = listHash({ ...route, entryId: entry.id })
    },
    [route],
  )

  const { export: exportUi, startExport: onExport } = useExportState()
  const { phase: exportState, summary: exportSummary, missing: exportMissing, error: exportError } = exportUi

  /**
   * The nav item that is the current section. The reading view is a clip read inside whatever list it was opened
   * from, so that list's item stays current (extension.md §4.2: the nav does not change).
   */
  const navView: View = route.readId ? readHash(returnHashRef.current ?? '#/clips').view : route.view

  // "/" puts the keyboard in the search box (extension.md §7.2): only where one is on screen — the
  // reading view and the two pages without list controls have no box to focus, and the drawer is modal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== '/' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      if (!isListView(route.view) || route.readId || route.entryId || selecting) return
      const active = document.activeElement
      if (active instanceof HTMLElement && (active.closest('input, textarea, select, [contenteditable]') !== null || active.isContentEditable)) return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [route.view, route.readId, route.entryId, selecting])

  return (
    <div className={`shell${rail ? ' is-rail' : ''}`}>
      <SideNav
        rail={rail}
        onToggleNav={toggleNav}
        navView={navView}
        counts={{ all: counts.all, clips: counts.clips, screenshots: counts.screenshots }}
        highlightTotal={highlightTotal}
        registryCount={registry.length}
        onNavKeyDown={onNavKeyDown}
        usage={usage}
        exportState={exportState}
        exportSummary={exportSummary}
        exportMissing={exportMissing}
        exportError={exportError}
        onOpenExport={() => setExportDialogOpen(true)}
        exportButtonRef={exportButton}
        shortcutKeys={shortcutKeys}
        shortcutHint={shortcutHint}
      />

      <main className="content">
        {/* behind the reading view the page stays laid out (scroll position, loaded pages) but out of reach: no focus, no pointer, no reader */}
        <div className="content-stage" inert={route.readId ? true : undefined}>
          <ExportStatus exportState={exportState} exportSummary={exportSummary} exportMissing={exportMissing} exportError={exportError} />
          {isListView(route.view) ? (
            <>
              <ListHeader
                route={route}
                total={total}
                counts={counts}
                highlightResult={highlightResult}
                loading={loading}
                searchDraft={searchDraft}
                setSearchDraft={setSearchDraft}
                searchInputRef={searchInputRef}
                hosts={hosts}
                tags={tags}
                registry={registry}
                setFilter={setFilter}
                countsReady={countsReady}
                guideDismissed={guideDismissed}
                {...(route.view !== 'highlights'
                  ? {
                      selecting,
                      onToggleSelection: selection.toggleSelection,
                      selectButtonRef: selection.selectButtonRef,
                      ...(selecting ? { selectionBar: <SelectionToolbar controller={selection} /> } : {}),
                    }
                  : {})}
                onDismissGuide={() => {
                  localStorage.setItem('annhub.guideDismissed', '1')
                  setGuideDismissed(true)
                }}
              >
                {route.view === 'highlights' ? (
                  highlightResult.total === 0 ? (
                    loading ? (
                      <div className="list-loading" role="status">
                        {uiText('common.loading')}
                      </div>
                    ) : (
                      emptyState('highlights', route, shortcutKeys, setFilter)
                    )
                  ) : (
                    <div className="list">
                      <ul className="hl-groups" data-testid="hl-groups">
                        {highlightResult.groups.map(group => (
                          <li key={group.clip.id} className="hl-group">
                            <div className="hl-group-head">
                              <span className="hl-group-title">{String(group.clip.properties['title'] ?? '')}</span>
                              <span className="hl-group-host">{group.clip.sourceHost}</span>
                              <span className="hl-group-count">{uiText('library.sub.count', { count: group.rows.length })}</span>
                              {/* the source link owns the head row's right end and never folds (extension.md §2.3) */}
                              <a className="link" href={group.clip.sourceUrl} target="_blank" rel="noopener noreferrer">
                                {uiText('library.backToSource')}
                                <ArrowUpRight size={13} aria-hidden />
                              </a>
                            </div>
                            <div className="hl-group-rows">
                              {group.rows.map(row => (
                                <button
                                  key={row.highlight.id}
                                  type="button"
                                  className={`hl-item hl-item-${row.highlight.color}`}
                                  aria-label={uiText('reading.highlightLabel', {
                                    color: uiText(`library.color.${row.highlight.color}` as 'library.color.yellow'),
                                    text: row.highlight.quote,
                                  })}
                                  onClick={() => {
                                    // going from a library highlight to the reading view reopens the entry (metrics.md §9)
                                    void MessageUtils.sendMessage({ type: 'RECORD_EVENT', name: 'entry.reopened', props: { type: group.clip.type } })
                                    returnHashRef.current = location.hash
                                    location.hash = readHashFor(group.clip.id, row.highlight.id)
                                  }}
                                >
                                  <i className="hl-item-bar" aria-hidden />
                                  <span className="hl-item-body">
                                    <span className="hl-item-quote">{row.highlight.quote}</span>
                                    {row.highlight.note && (
                                      <span className="hl-item-note">
                                        <MessageSquareText size={13} aria-hidden />
                                        <span>{row.highlight.note}</span>
                                      </span>
                                    )}
                                    <span className="hl-item-meta">
                                      <span>{relativeTime(row.highlight.createdAt)}</span>
                                      {((group.clip.properties['tags'] as string[] | undefined) ?? []).map(tag => (
                                        <span key={tag} className="tag">
                                          #{tag}
                                        </span>
                                      ))}
                                      {propertyPills(group.clip, registry).map(pill => (
                                        <span key={pill.name} className="ppill">
                                          {pill.node}
                                        </span>
                                      ))}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                ) : items.length === 0 && loading ? (
                  // the first answer is still on its way: saying "nothing here" now would be wrong
                  <div className="list-loading" role="status">
                    {uiText('common.loading')}
                  </div>
                ) : items.length === 0 ? (
                  emptyState(route.view === 'clips' ? 'clips' : route.view === 'screenshots' ? 'screenshots' : 'all', route, shortcutKeys, setFilter)
                ) : (
                  <>
                    <div className="list">
                      <ul className="entry-grid" ref={entryGridRef}>
                        {items.map(entry => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            registry={registry}
                            selected={!selecting && route.entryId === entry.id}
                            onOpen={() => void openEntry(entry)}
                            onChanged={!selecting && route.view === 'screenshots' ? reload : undefined}
                            selecting={selecting}
                            checked={selectedIds.includes(entry.id)}
                            atCap={selection.atCap}
                            onToggleSelect={shift => selection.toggleEntrySelection(entry, shift)}
                          />
                        ))}
                      </ul>
                    </div>
                    {nextCursor && items.length < total && (
                      // aria-disabled, not disabled: Chrome takes the focus off a button that becomes disabled and leaves it on the page
                      <button
                        ref={loadMoreButtonRef}
                        type="button"
                        className="link load-more"
                        data-testid="load-more"
                        aria-disabled={loadingMore || undefined}
                        onClick={() => void loadMore()}
                      >
                        {uiText('library.loadMore', { count: total - items.length })}
                      </button>
                    )}
                  </>
                )}
              </ListHeader>
            </>
          ) : route.view === 'settings' ? (
            <SettingsView />
          ) : (
            <PropertiesView
              onRegistryChanged={() => {
                void MessageUtils.sendMessage({ type: 'LIST_PROPERTIES' }).then(response => {
                  if (response.success) setRegistry(response.data!.definitions)
                })
              }}
            />
          )}
        </div>

        {route.readId && (
          <ReadingView
            key={route.readId}
            entryId={route.readId}
            highlightId={route.highlightId}
            defaultColor={defaultColor}
            registry={registry}
            onClose={() => {
              // back to the list route the reading view came from; a deep link
              // falls back to the entry's type list (extension.md §4.2)
              const previous = returnHashRef.current
              returnHashRef.current = null
              if (previous) history.back()
              else {
                const fallback = '#/clips'
                history.replaceState(null, '', fallback)
                setRoute(readHash(fallback))
              }
            }}
            onEntryChanged={() => reload()}
            registerFlush={registerFlush}
            download={libraryDownload}
          />
        )}

        {/* the single-entry status bar floats over the list, the drawer and the reading column (download.md §3.1) */}
        <DownloadsLayer controller={selection} />
      </main>

      {route.entryId && !route.readId && (
        <DetailDrawer
          key={route.entryId}
          entryId={route.entryId}
          defaultColor={defaultColor}
          registry={registry}
          onClose={closeDrawer}
          onDeleted={reload}
          onEntryChanged={reload}
          registerFlush={registerFlush}
          onOpenReading={id => {
            returnHashRef.current = location.hash
            location.hash = readHashFor(id)
          }}
          download={libraryDownload}
        />
      )}

      {exportDialogOpen && (
        <ExportDialog
          phase={exportState}
          count={counts.all}
          summary={exportSummary}
          missing={exportMissing}
          error={exportError}
          onExport={() => void onExport()}
          onClose={() => {
            setExportDialogOpen(false)
            // the dialog took the keyboard from this button; closing gives it back (extension.md §4.1's rule, same shape)
            exportButton.current?.focus()
          }}
        />
      )}
    </div>
  )
}
