/**
 * The library page — the extension's application page (extension.md §2.2,
 * §2.3, §4.1). R1 scope: the unified list (all / clips / screenshots),
 * search and filters per search.md, the detail drawer with editing, and the
 * single "Export content" Markdown ZIP command. The full left-nav shell
 * with highlight and properties views is R2; filters already live in the
 * URL hash so refresh restores the view.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { EntryQuery, EntryQueryResult, PropertyCondition } from '../../learning-core/query'
import type { EntryRecord, PropertyDefinition, PropertyType } from '../../learning-core/types'
import { markdownToPlainText } from '../../learning-core/markdown'
import { EntryStore, type LibraryFacets } from '../../learning-core/store'
import { buildExport } from '../../learning-core/export'
import { bucketCount } from '../../learning-core/metrics'
import { HighlightSurface } from './highlight-surface'
import { PropertyPanel, type PropertyPanelHandle } from './property-panel'
import { PropertiesView } from './properties-view'
import { SettingsView } from './settings-view'
import { ReadingView } from './reading-view'
import type { HighlightQueryResult } from '../../learning-core/query'
import type { HighlightColor } from '../../learning-core/types'
import { formatBytes } from '../../utils/format-bytes'
import { relativeTime } from '../../utils/relative-time'
import { currentUiLanguage, entryErrorText, uiText, type UiTextKey } from '../../utils/ui-text'
import { exportFailureKey, type ExportStage } from './export-error'
import { EMPTY_FILTERS, hasActiveFilter, isListView, listHash, readHash, readHashFor, type FilterState, type RouteState, type View } from './route'
import { Download, Keyboard, Lock, PanelLeftClose, PanelLeftOpen, Scan, Trash2, X } from 'lucide-react'
import { TypeChip, VIEW_ICONS } from '../../utils/entry-icons'
import { CONTENT_MAX_CHARS, CONTEXT_MAX_CHARS } from '../../learning-core/validate'

/** The five highlight colors a highlights view can filter by (search.md §5). */
const HIGHLIGHT_FILTER_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

/** The nav's and the page title's words for each view. */
const VIEW_LABEL_KEYS: Record<View, UiTextKey> = {
  all: 'library.all',
  clips: 'library.clips',
  highlights: 'library.highlights',
  screenshots: 'library.screenshots',
  properties: 'library.properties',
  settings: 'library.settings',
}

/**
 * The nav folds to its icon rail when the window is this narrow, and by hand at any width (extension.md §2.2).
 * Only a fold is remembered: unfolding is the narrow window's default undone for this visit, not a preference.
 */
const NARROW_QUERY = '(max-width: 720px)'
const NAV_FOLDED_KEY = 'annhub.navFolded'

function useNarrowWindow(): boolean {
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

function readNavFold(): boolean | null {
  try {
    return localStorage.getItem(NAV_FOLDED_KEY) === '1' ? true : null
  } catch {
    return null
  }
}

let assetStorePromise: Promise<EntryStore> | null = null

function assetStore(): Promise<EntryStore> {
  assetStorePromise ??= (async () => {
    const store = new EntryStore('annhub')
    await store.initialize()
    return store
  })().catch(error => {
    assetStorePromise = null
    throw error
  })
  return assetStorePromise
}

function useAssetUrl(assetId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!assetId) return
    let active = true
    let objectUrl: string | null = null
    void assetStore()
      .then(store => store.getAsset(assetId))
      .then(asset => {
        if (!active || !asset) return
        objectUrl = URL.createObjectURL(asset.bytes)
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId])
  return url
}

/** One page of the list (RV-LIB-02: “显示更多” appends the next page). */
const PAGE_SIZE = 50

/** The search box debounces before it hits the query path (search.md §6). */
const SEARCH_DEBOUNCE_MS = 250

/** Operators per property type (search.md §3). */
const OPERATORS: Record<PropertyType, { op: PropertyCondition['op']; key: string }[]> = {
  text: [
    { op: 'contains', key: 'library.op.contains' },
    { op: 'equals', key: 'library.op.equals' },
  ],
  list: [{ op: 'has', key: 'library.op.has' }],
  number: [
    { op: 'eq', key: 'library.op.eq' },
    { op: 'gt', key: 'library.op.gt' },
    { op: 'lt', key: 'library.op.lt' },
    { op: 'between', key: 'library.op.between' },
  ],
  checkbox: [{ op: 'is', key: 'library.op.is' }],
  date: [{ op: 'between', key: 'library.op.between' }],
  datetime: [{ op: 'between', key: 'library.op.between' }],
}

/** Calendar dates become [start, end) epoch bounds in the user's local timezone (search.md §3). */
function localDayRange(from: string, to: string): { createdFrom?: number; createdTo?: number } {
  const bounds: { createdFrom?: number; createdTo?: number } = {}
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) bounds.createdFrom = new Date(`${from}T00:00:00`).getTime()
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) bounds.createdTo = new Date(`${to}T00:00:00`).getTime() + 24 * 60 * 60 * 1000
  return bounds
}

/** The `library.queried` event (metrics.md §9): the search words are `has_text`, never one of the `filters`. */
function recordQueried(filters: RouteState, results: number): void {
  const enabled = [filters.view === 'all' && filters.type, filters.host, filters.tag, filters.prop && filters.op, filters.from || filters.to, filters.color].filter(Boolean).length
  void MessageUtils.sendMessage({
    type: 'RECORD_EVENT',
    name: 'library.queried',
    props: { has_text: Boolean(filters.search), filters: bucketCount(enabled), results: bucketCount(results) },
  })
}

/** Builds the typed condition from the filter bar's raw strings (search.md §3). */
function buildCondition(def: PropertyDefinition, op: string, val: string, val2: string): PropertyCondition | undefined {
  const typedOp = op as PropertyCondition['op']
  if (def.type === 'number') {
    const value = Number(val)
    if (!Number.isFinite(value)) return undefined
    if (op === 'between') {
      const upper = val2 === '' ? value : Number(val2)
      return Number.isFinite(upper) ? { name: def.name, op: typedOp, value, value2: upper } : undefined
    }
    return { name: def.name, op: typedOp, value }
  }
  if (def.type === 'checkbox') {
    return { name: def.name, op: 'is', value: val === 'yes' }
  }
  if (!val) return undefined
  return op === 'between' ? { name: def.name, op: typedOp, value: val, value2: val2 || val } : { name: def.name, op: typedOp, value: val }
}

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
  const [items, setItems] = useState<EntryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [counts, setCounts] = useState({ all: 0, clips: 0, screenshots: 0 })
  const [countsReady, setCountsReady] = useState(false)
  const [highlightTotal, setHighlightTotal] = useState(0)
  const [hosts, setHosts] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [registry, setRegistry] = useState<PropertyDefinition[]>([])
  // Only a list view has a first answer to wait for. Properties and settings run no query, so nothing would ever clear a flag they started with.
  const [loading, setLoading] = useState(() => isListView(route.view))
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'partial' | 'failed'>('idle')
  const [exportSummary, setExportSummary] = useState('')
  const [exportMissing, setExportMissing] = useState<string[]>([])
  const [exportError, setExportError] = useState('')
  const [guideDismissed, setGuideDismissed] = useState(() => Boolean(localStorage.getItem('annhub.guideDismissed')))
  const [highlightResult, setHighlightResult] = useState<HighlightQueryResult>({ groups: [], total: 0 })
  const [defaultColor, setDefaultColor] = useState<HighlightColor>('yellow')
  const [searchDraft, setSearchDraft] = useState(route.search)
  const [reloadKey, setReloadKey] = useState(0)
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
  const querySeq = useRef(0)
  /** A page of the list is on its way: a second click on 显示更多 would ask for the same page again and add it twice. */
  const loadingMoreRef = useRef(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadedCountRef = useRef(PAGE_SIZE)
  const lastListQueryKeyRef = useRef<string | null>(null)
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
      const propDef = registry.find(def => def.name === filters.prop)
      const condition = propDef && filters.op ? buildCondition(propDef, filters.op, filters.val, filters.val2) : undefined
      return {
        search: filters.search || undefined,
        types: filters.view === 'all' ? (filters.type ? [filters.type] : undefined) : [filters.view === 'clips' ? 'clip' : 'screenshot'],
        hosts: filters.host ? [filters.host] : undefined,
        tags: filters.tag ? [filters.tag] : undefined,
        ...(condition ? { conditions: [condition] } : {}),
        ...localDayRange(filters.from, filters.to),
      }
    },
    [registry],
  )

  // The list query (first page) — re-runs when the route, the registry or an
  // explicit reload changes (RV-LIB-03: writes refresh the list).
  useEffect(() => {
    if (listRoute.view === 'settings' || listRoute.view === 'properties' || listRoute.view === 'highlights') return
    if (lastListQueryKeyRef.current !== listQueryKey) {
      loadedCountRef.current = PAGE_SIZE
      lastListQueryKeyRef.current = listQueryKey
    }
    const seq = ++querySeq.current
    setLoading(true)
    const query = queryFor(listRoute)
    void (async () => {
      const response = await MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { ...query, limit: loadedCountRef.current } })
      if (seq !== querySeq.current) return
      if (response.success) {
        setItems(response.data!.result.items)
        setTotal(response.data!.result.total)
        setNextCursor(response.data!.result.nextCursor ?? null)
        loadedCountRef.current = Math.max(PAGE_SIZE, response.data!.result.items.length)
      }
      setLoading(false)
      if (response.success && userQueryRef.current) {
        userQueryRef.current = false
        recordQueried(listRoute, response.data!.result.total)
      }
    })()
  }, [listQueryKey, listRoute, registry, reloadKey, queryFor])

  // The highlights view runs its own query with the same filters (RV-LIB-04).
  useEffect(() => {
    if (route.view !== 'highlights') return
    const seq = ++querySeq.current
    setLoading(true)
    const { conditions } = queryFor(route)
    void (async () => {
      const response = await MessageUtils.sendMessage<{ result: HighlightQueryResult }>({
        type: 'QUERY_HIGHLIGHTS',
        query: {
          search: route.search || undefined,
          hosts: route.host ? [route.host] : undefined,
          tags: route.tag ? [route.tag] : undefined,
          conditions,
          colors: route.color ? [route.color as HighlightColor] : undefined,
          ...localDayRange(route.from, route.to),
        },
      })
      if (seq !== querySeq.current) return
      if (response.success) setHighlightResult(response.data!.result)
      setLoading(false)
      if (response.success && userQueryRef.current) {
        userQueryRef.current = false
        recordQueried(route, response.data!.result.total)
      }
    })()
  }, [route, reloadKey, queryFor])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const seq = querySeq.current
      const response = await MessageUtils.sendMessage<{ result: EntryQueryResult }>({
        type: 'QUERY_ENTRIES',
        query: { ...queryFor(route), limit: PAGE_SIZE, cursor: nextCursor },
      })
      if (seq !== querySeq.current || !response.success) return
      setItems(prev => [...prev, ...response.data!.result.items])
      loadedCountRef.current += response.data!.result.items.length
      setTotal(response.data!.result.total)
      setNextCursor(response.data!.result.nextCursor ?? null)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [nextCursor, queryFor, route])

  const refreshCounts = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{ facets: LibraryFacets }>({ type: 'QUERY_FACETS' })
    if (!response.success || !response.data?.facets) return
    const { counts: next, hosts: nextHosts, tags: nextTags } = response.data.facets
    setHosts(nextHosts)
    setTags(nextTags)
    setCounts({ all: next.all, clips: next.clips, screenshots: next.screenshots })
    setHighlightTotal(next.highlights)
    setCountsReady(true)
  }, [])

  /** Any successful write refreshes list, counts and candidates together (RV-LIB-03). */
  const reload = useCallback(() => {
    setReloadKey(key => key + 1)
    void refreshCounts()
  }, [refreshCounts])

  useEffect(() => {
    void refreshCounts()
    void MessageUtils.sendMessage<{ definitions: PropertyDefinition[] }>({ type: 'LIST_PROPERTIES' }).then(response => {
      if (response.success) setRegistry(response.data!.definitions)
    })
    void MessageUtils.sendMessage<{ defaultHighlightColor?: HighlightColor }>({ type: 'GET_SETTINGS' }).then(response => {
      if (response.success && response.data?.defaultHighlightColor) setDefaultColor(response.data.defaultHighlightColor)
    })
    void MessageUtils.sendMessage<{ usage: number; quota: number }>({ type: 'USAGE_ESTIMATE' }).then(response => {
      if (response.success) setUsage(response.data!)
    })
  }, [refreshCounts])

  const openEntry = useCallback(
    async (entry: EntryRecord) => {
      drawerTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      void MessageUtils.sendMessage({ type: 'RECORD_EVENT', name: 'entry.reopened', props: { type: entry.type } })
      // the drawer is part of the route: refresh restores it (extension.md §2.2)
      location.hash = listHash({ ...route, entryId: entry.id })
    },
    [route],
  )

  const onExport = useCallback(async () => {
    setExportState('busy')
    setExportError('')
    setExportMissing([])
    const store = new EntryStore('annhub')
    let stage: ExportStage = 'build'
    try {
      await store.initialize()
      const summary = await buildExport({
        exportedAt: Date.now(),
        lang: currentUiLanguage(),
        entries: await store.listEntries(),
        registry: await store.listPropertyDefinitions(),
        readAsset: async assetId => {
          const asset = await store.getAsset(assetId)
          return asset ? { metadata: asset.metadata, bytes: asset.bytes } : undefined
        },
      })
      const url = URL.createObjectURL(summary.blob)
      stage = 'download'
      try {
        const filename = `AnnHub-export-${new Date().toISOString().slice(0, 10)}.zip`
        await chrome.downloads.download({ url, filename, saveAs: false })
      } catch (error) {
        URL.revokeObjectURL(url)
        throw error
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      void MessageUtils.sendMessage({
        type: 'RECORD_EVENT',
        name: 'export.completed',
        props: { result: summary.result, missing_assets: bucketCount(summary.missingAssets.length) },
      })
      setExportSummary(uiText('library.exportSummary', { clips: summary.clips, screenshots: summary.screenshots, missing: summary.missingAssets.length }))
      setExportMissing(summary.missingAssets)
      setExportState(summary.result === 'full' ? 'done' : 'partial')
    } catch (error) {
      setExportError(uiText(exportFailureKey(error, stage)))
      setExportState('failed')
    } finally {
      await store.close()
    }
  }, [])

  /**
   * The nav item that is the current section. The reading view is a clip read inside whatever list it was opened
   * from, so that list's item stays current (extension.md §4.2: the nav does not change).
   */
  const navView: View = route.readId ? readHash(returnHashRef.current ?? '#/clips').view : route.view

  const viewTab = (view: View, count: number) => {
    const Icon = VIEW_ICONS[view]
    const label = uiText(VIEW_LABEL_KEYS[view])
    return (
      <a
        key={view}
        href={`#/${view}`}
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

  /** An answer with nothing in it: the view's own entry hint, or — when a filter is on — "no results" and the way out (extension.md §5). */
  const emptyState = (hint: UiTextKey) => {
    const filtered = hasActiveFilter(route)
    return (
      <div className="empty">
        {uiText(filtered ? 'library.noResults' : hint)}
        {filtered && (
          <button type="button" className="link" onClick={() => setFilter({ ...EMPTY_FILTERS })}>
            {uiText('library.clearFilters')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`shell${rail ? ' is-rail' : ''}`}>
      <nav className="side" aria-label={uiText('library.openLibrary')}>
        <div className="nav-top">
          <div className="brand">AnnHub</div>
          <button
            type="button"
            className="nav-fold"
            aria-expanded={!rail}
            aria-label={uiText(rail ? 'library.navExpand' : 'library.navCollapse')}
            title={uiText(rail ? 'library.navExpand' : 'library.navCollapse')}
            onClick={toggleNav}
          >
            {rail ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
          </button>
        </div>
        {viewTab('all', counts.all)}
        {viewTab('clips', counts.clips)}
        {viewTab('highlights', highlightTotal)}
        {viewTab('screenshots', counts.screenshots)}
        <div className="nav-spacer" />
        {viewTab('properties', registry.length)}
        {viewTab('settings', 0)}
        <p className="nav-shortcut" title={uiText('library.shortcutHint')}>
          <Keyboard size={16} aria-hidden />
          <span>{uiText('library.shortcutHint')}</span>
        </p>
        <button
          type="button"
          className="nav-export"
          disabled={exportState === 'busy'}
          onClick={() => void onExport()}
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
        {usage && usage.quota > 0 && <span className="nav-note">{uiText('library.storageUsed', { size: formatBytes(usage.usage) })}</span>}
      </nav>

      <main className="content">
        {/* behind the reading view the page stays laid out (scroll position, loaded pages) but out of reach: no focus, no pointer, no reader */}
        <div className="content-stage" inert={route.readId ? true : undefined}>
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
          {isListView(route.view) && (
            <>
              <header className="page-head">
                <h1 className="page-title">{uiText(VIEW_LABEL_KEYS[route.view])}</h1>
                <input
                  className="search"
                  type="search"
                  placeholder={uiText('library.searchPlaceholder')}
                  value={searchDraft}
                  onChange={event => setSearchDraft(event.target.value)}
                  aria-label={uiText('library.searchPlaceholder')}
                />
              </header>
              <div className="toolbar" role="group" aria-label={uiText('library.filters')}>
                {route.view === 'all' && (
                  <select
                    className="filter"
                    value={route.type}
                    onChange={event => setFilter({ type: event.target.value as FilterState['type'] })}
                    aria-label={uiText('library.filter.type')}
                  >
                    <option value="">{uiText('library.filter.type')}: —</option>
                    <option value="clip">{uiText('library.clips')}</option>
                    <option value="screenshot">{uiText('library.screenshots')}</option>
                  </select>
                )}
                {route.view === 'highlights' && (
                  <select className="filter" value={route.color} onChange={event => setFilter({ color: event.target.value })} aria-label={uiText('library.filter.color')}>
                    <option value="">{uiText('library.filter.color')}: —</option>
                    {HIGHLIGHT_FILTER_COLORS.map(color => (
                      <option key={color} value={color}>
                        {uiText(`library.color.${color}` as 'library.color.yellow')}
                      </option>
                    ))}
                  </select>
                )}
                {hosts.length > 0 && (
                  <select className="filter" value={route.host} onChange={event => setFilter({ host: event.target.value })} aria-label={uiText('library.filter.host')}>
                    <option value="">{uiText('library.filter.host')}: —</option>
                    {hosts.map(host => (
                      <option key={host} value={host}>
                        {host}
                      </option>
                    ))}
                  </select>
                )}
                {tags.length > 0 && (
                  <select className="filter" value={route.tag} onChange={event => setFilter({ tag: event.target.value })} aria-label={uiText('library.filter.tag')}>
                    <option value="">{uiText('library.filter.tag')}: —</option>
                    {tags.map(tag => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                )}
                {registry.length > 0 && (
                  <>
                    <select
                      className="filter"
                      value={route.prop}
                      aria-label={uiText('library.filter.property')}
                      onChange={event => {
                        const prop = event.target.value
                        const def = registry.find(item => item.name === prop)
                        const op = def ? OPERATORS[def.type][0]!.op : ''
                        setFilter({ prop, op, val: '', val2: '' })
                      }}
                    >
                      <option value="">{uiText('library.filter.property')}: —</option>
                      {registry.map(def => (
                        <option key={def.name} value={def.name}>
                          {def.name}
                        </option>
                      ))}
                    </select>
                    {route.prop &&
                      (() => {
                        const def = registry.find(item => item.name === route.prop)
                        if (!def) return null
                        const operators = OPERATORS[def.type]
                        const valueInput = (key: 'val' | 'val2', labelKey?: 'library.filter.value2') => {
                          if (def!.type === 'checkbox') {
                            return (
                              <select
                                className="filter filter-value"
                                value={route[key]}
                                aria-label={labelKey ? uiText(labelKey) : uiText('library.filter.value')}
                                onChange={event => setFilter({ [key]: event.target.value })}
                              >
                                <option value="">{uiText('library.filter.value')}: —</option>
                                <option value="yes">{uiText('library.value.yes')}</option>
                                <option value="no">{uiText('library.value.no')}</option>
                              </select>
                            )
                          }
                          const inputType = def!.type === 'number' ? 'number' : def!.type === 'date' ? 'date' : def!.type === 'datetime' ? 'datetime-local' : 'text'
                          return (
                            <input
                              className="filter filter-value"
                              type={inputType}
                              value={route[key]}
                              aria-label={labelKey ? uiText(labelKey) : uiText('library.filter.value')}
                              onChange={event => setFilter({ [key]: event.target.value })}
                            />
                          )
                        }
                        return (
                          <>
                            {operators.length > 1 && (
                              <select
                                className="filter"
                                value={route.op}
                                aria-label={uiText('library.filter.operator')}
                                onChange={event => setFilter({ op: event.target.value, val: '', val2: '' })}
                              >
                                {operators.map(({ op, key: opKey }) => (
                                  <option key={op} value={op}>
                                    {uiText(opKey as 'library.op.contains')}
                                  </option>
                                ))}
                              </select>
                            )}
                            {valueInput('val')}
                            {route.op === 'between' && valueInput('val2', 'library.filter.value2')}
                          </>
                        )
                      })()}
                  </>
                )}
                <label className="filter filter-time" aria-label={uiText('library.filter.time')}>
                  <span className="filter-time-label">{uiText('library.filter.time')}</span>
                  <input type="date" value={route.from} aria-label={uiText('library.filter.timeFrom')} onChange={event => setFilter({ from: event.target.value })} />
                  <span>–</span>
                  <input type="date" value={route.to} aria-label={uiText('library.filter.timeTo')} onChange={event => setFilter({ to: event.target.value })} />
                </label>
                <span className="count" data-testid="list-count">
                  {loading ? uiText('common.loading') : uiText('library.count', { count: route.view === 'highlights' ? highlightResult.total : total })}
                </span>
              </div>
            </>
          )}

          {countsReady && counts.all === 0 && !loading && total === 0 && !guideDismissed && isListView(route.view) && (
            <div className="guide-card" data-testid="guide-card">
              <p>{uiText('library.guide.clip')}</p>
              <p>{uiText('library.guide.shot')}</p>
              <p>{uiText('library.guide.hl')}</p>
              <button
                type="button"
                className="ghost"
                onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL(currentUiLanguage() === 'zh' ? 'sample.html' : 'sample.en.html') })}
              >
                {uiText('library.guide.sample')}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  localStorage.setItem('annhub.guideDismissed', '1')
                  setGuideDismissed(true)
                }}
              >
                {uiText('library.guide.dismiss')}
              </button>
            </div>
          )}
          {route.view === 'settings' ? (
            <SettingsView />
          ) : route.view === 'properties' ? (
            <PropertiesView
              onRegistryChanged={() => {
                void MessageUtils.sendMessage<{ definitions: PropertyDefinition[] }>({ type: 'LIST_PROPERTIES' }).then(response => {
                  if (response.success) setRegistry(response.data!.definitions)
                })
              }}
            />
          ) : route.view === 'highlights' ? (
            highlightResult.total === 0 ? (
              loading ? (
                <div className="list-loading" role="status">
                  {uiText('common.loading')}
                </div>
              ) : (
                emptyState('library.empty.highlights')
              )
            ) : (
              <ul className="list hl-groups" data-testid="hl-groups">
                {highlightResult.groups.map(group => (
                  <li key={group.clip.id} className="hl-group">
                    <div className="hl-group-head">
                      <span className="row-title">{String(group.clip.properties['title'] ?? '')}</span>
                      <span className="row-meta">
                        {group.clip.sourceHost} · {uiText('library.highlightsCount', { count: group.rows.length })}
                      </span>
                      <a className="link" href={group.clip.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {uiText('library.backToSource')}
                      </a>
                    </div>
                    {group.rows.map(row => (
                      <button
                        key={row.highlight.id}
                        type="button"
                        className={`hl-row hl-row-${row.highlight.color}`}
                        onClick={() => {
                          returnHashRef.current = location.hash
                          location.hash = readHashFor(group.clip.id, row.highlight.id)
                        }}
                      >
                        <p className="hl-quote">{row.highlight.quote}</p>
                        {row.highlight.note && <p className="hl-note-text">{row.highlight.note}</p>}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            )
          ) : items.length === 0 && loading ? (
            // the first answer is still on its way: saying "nothing here" now would be wrong
            <div className="list-loading" role="status">
              {uiText('common.loading')}
            </div>
          ) : items.length === 0 ? (
            emptyState(route.view === 'clips' ? 'library.empty.clips' : route.view === 'screenshots' ? 'library.empty.screenshots' : 'library.empty')
          ) : (
            <>
              <ul className={route.view === 'screenshots' ? 'screenshot-gallery' : 'list'}>
                {items.map(entry =>
                  route.view === 'screenshots' ? (
                    <ScreenshotTile key={entry.id} entry={entry} onOpen={() => void openEntry(entry)} onChanged={reload} />
                  ) : (
                    <EntryRow key={entry.id} entry={entry} onOpen={() => void openEntry(entry)} />
                  ),
                )}
              </ul>
              {nextCursor && items.length < total && (
                <button type="button" className="link load-more" data-testid="load-more" disabled={loadingMore} onClick={() => void loadMore()}>
                  {uiText('library.loadMore', { count: total - items.length })}
                </button>
              )}
            </>
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
          />
        )}
      </main>

      {route.entryId && !route.readId && (
        <DetailDrawer
          key={route.entryId}
          entryId={route.entryId}
          defaultColor={defaultColor}
          registry={registry}
          onClose={() => {
            const next = { ...route, entryId: null }
            history.replaceState(null, '', listHash(next))
            setRoute(next)
          }}
          onDeleted={reload}
          onEntryChanged={reload}
          registerFlush={registerFlush}
          onOpenReading={id => {
            returnHashRef.current = location.hash
            location.hash = readHashFor(id)
          }}
        />
      )}
    </div>
  )
}

function EntryRow({ entry, onOpen }: { entry: EntryRecord; onOpen: () => void }) {
  const title = String(entry.properties['title'] ?? '')
  const tags = (entry.properties['tags'] as string[] | undefined) ?? []
  const summary = entry.type === 'clip' ? markdownToPlainText(entry.content).slice(0, 160) : ''
  return (
    <li className="row" data-type={entry.type} data-entry-id={entry.id}>
      <button type="button" className="row-main" onClick={onOpen}>
        {entry.type === 'screenshot' && <ScreenshotThumbnail assetId={entry.assetId} className="row-thumbnail" />}
        <TypeChip type={entry.type} />
        <span className="row-body">
          {title && <span className="row-title">{title}</span>}
          {summary && <span className="row-summary">{summary}</span>}
          <span className="row-meta">
            {entry.sourceHost} · {relativeTime(entry.createdAt)}
            {(entry.highlights?.length ?? 0) > 0 && <span className="row-highlights"> · {uiText('library.highlightsCount', { count: entry.highlights!.length })}</span>}
          </span>
        </span>
        {tags.length > 0 && (
          <span className="row-tags">
            {tags.map(tag => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  )
}

function ScreenshotThumbnail({ assetId, className }: { assetId?: string; className: string }) {
  const url = useAssetUrl(assetId)
  return url ? (
    <img className={className} src={url} alt="" loading="lazy" />
  ) : (
    <span className={`${className} screenshot-placeholder`} aria-hidden>
      <Scan size={20} />
    </span>
  )
}

function ScreenshotTile({ entry, onOpen, onChanged }: { entry: EntryRecord; onOpen(): void; onChanged(): void }) {
  const url = useAssetUrl(entry.assetId)
  const title = String(entry.properties['title'] ?? '')
  const download = async () => {
    if (!url) return
    try {
      await chrome.downloads.download({ url, filename: `AnnHub/screenshot-${entry.id}.png`, saveAs: false })
    } catch {
      window.alert(uiText('shot.error.downloadFailed'))
    }
  }
  const remove = async () => {
    if (!window.confirm(uiText('library.deleteConfirm'))) return
    const response = await MessageUtils.sendMessage({ type: 'DELETE_ENTRY', id: entry.id })
    if (response.success) onChanged()
    else window.alert(entryErrorText(response.error))
  }
  return (
    <li className="screenshot-tile" data-entry-id={entry.id}>
      <button type="button" className="screenshot-tile-open" onClick={onOpen} aria-label={title}>
        {url ? (
          <img src={url} alt="" loading="lazy" />
        ) : (
          <span className="screenshot-placeholder">
            <Scan size={28} />
          </span>
        )}
        <span className="screenshot-tile-title">{title}</span>
        <span className="screenshot-tile-host">{entry.sourceHost}</span>
      </button>
      <div className="screenshot-tile-actions">
        <button type="button" disabled={!url} title={uiText('shot.tool.download')} aria-label={uiText('shot.tool.download')} onClick={() => void download()}>
          <Download size={16} />
        </button>
        <button type="button" title={uiText('library.delete')} aria-label={uiText('library.delete')} onClick={() => void remove()}>
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  )
}

/** Why the original text or the context was not written: the lock and the two limits have their own words (entry.md §4.7, §5). */
function editFailureText(field: 'content' | 'context', code?: string): string {
  if (code === 'ENTRY_CONTENT_LOCKED') return uiText('reading.locked')
  if (code === 'ENTRY_CONTENT_INVALID') {
    return field === 'content'
      ? uiText('library.error.contentInvalid', { limit: CONTENT_MAX_CHARS.toLocaleString() })
      : uiText('library.error.contextInvalid', { limit: CONTEXT_MAX_CHARS.toLocaleString() })
  }
  return entryErrorText(code)
}

function DetailDrawer({
  entryId,
  defaultColor,
  registry,
  onClose,
  onDeleted,
  onEntryChanged,
  registerFlush,
  onOpenReading,
}: {
  entryId: string
  defaultColor: HighlightColor
  registry: PropertyDefinition[]
  onClose: () => void
  onDeleted(): void
  onEntryChanged(): void
  registerFlush(flush: (() => Promise<boolean>) | null): void
  onOpenReading(id: string): void
}) {
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [assetMissing, setAssetMissing] = useState(false)
  const [imageZoom, setImageZoom] = useState(false)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  // the clip's own two texts: one of them can be open for editing, and its draft stays in the textarea until it is written (extension.md §4.1)
  const [editing, setEditing] = useState<'content' | 'context' | null>(null)
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState('')
  const editWrite = useRef<Promise<boolean> | null>(null)
  /** The text whose "编辑" button takes the keyboard back when its editor closes through Save or Cancel. */
  const restoreFocus = useRef<'content' | 'context' | null>(null)
  const propertyPanel = useRef<PropertyPanelHandle>(null)
  const drawerElement = useRef<HTMLElement>(null)
  const loadedEntryId = entry?.id

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({ type: 'GET_ENTRY', id: entryId })
    if (!response.success || !response.data?.entry) {
      setError(uiText('library.error.notFound'))
      return
    }
    const loaded = response.data.entry
    setEntry(loaded)
    setNote(loaded.note ?? '')
    setAssetMissing(false)
    setAssetUrl(null)
    if (loaded.type === 'screenshot' && loaded.assetId) {
      const asset = await MessageUtils.sendMessage<{ dataUrl: string }>({ type: 'GET_ASSET_DATA_URL', assetId: loaded.assetId })
      if (asset.success && asset.data?.dataUrl) setAssetUrl(asset.data.dataUrl)
      else setAssetMissing(true)
    }
  }, [entryId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!loadedEntryId) return
    drawerElement.current?.querySelector<HTMLElement>('a[href], button:not([disabled]), input, textarea, select')?.focus()
  }, [loadedEntryId])

  const persist = useCallback(async (): Promise<boolean> => {
    // nothing loaded (still loading, or the entry is gone) means nothing to save, and the drawer must still close
    if (!entry) return true
    if (note === (entry.note ?? '')) return true
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
      type: 'UPDATE_ENTRY',
      id: entry.id,
      // null clears the note; an undefined key would not survive the JSON transport
      patch: { note: note.trim() ? note.trim() : null },
    })
    if (!response.success) {
      setError(entryErrorText(response.error))
      return false
    }
    setEntry(response.data!.entry)
    onEntryChanged()
    return true
  }, [entry, note, onEntryChanged])

  /** Writes the open text if it changed and leaves editing; a failure keeps the draft and says why next to it. */
  const commitEdit = useCallback(async (): Promise<boolean> => {
    if (editWrite.current) return editWrite.current
    if (!entry || !editing) return true
    const field = editing
    if (draft === (field === 'content' ? entry.content : (entry.context ?? ''))) {
      setEditing(null)
      setEditError('')
      return true
    }
    const task = (async (): Promise<boolean> => {
      const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
        type: 'UPDATE_ENTRY',
        id: entry.id,
        // an emptied context is removed; an emptied original is a mistake the worker refuses
        patch: field === 'content' ? { content: draft } : { context: draft.trim() ? draft : null },
      })
      if (!response.success) {
        setEditError(editFailureText(field, response.error))
        return false
      }
      setEntry(response.data!.entry)
      setEditing(null)
      setEditError('')
      onEntryChanged()
      return true
    })()
    editWrite.current = task
    const ok = await task
    editWrite.current = null
    return ok
  }, [entry, editing, draft, onEntryChanged])

  /** Opens a text for editing; the other one, if it was open, is written first. */
  const startEdit = (field: 'content' | 'context'): void => {
    if (!entry) return
    void commitEdit().then(ok => {
      if (!ok) return
      setDraft(field === 'content' ? entry.content : (entry.context ?? ''))
      setEditError('')
      setEditing(field)
    })
  }

  /** Save: the same write a blur makes, and the keyboard goes back to the text's "编辑" button when it worked. */
  const saveEdit = (): void => {
    restoreFocus.current = editing
    void commitEdit().then(ok => {
      if (!ok) restoreFocus.current = null
    })
  }

  /** Cancel: the way out of a draft the worker refuses; what was typed is dropped, the saved text stays. */
  const cancelEdit = (): void => {
    restoreFocus.current = editing
    setEditing(null)
    setEditError('')
  }

  useEffect(() => {
    if (editing !== null || !restoreFocus.current) return
    const target = restoreFocus.current === 'content' ? 'edit-original' : 'edit-context'
    restoreFocus.current = null
    drawerElement.current?.querySelector<HTMLElement>(`[data-testid="${target}"]`)?.focus()
  }, [editing])

  /** The open text: a textarea that writes when it loses focus, the error beside it, and Save and Cancel under it. */
  const editor = (rows: number, label: string) => (
    <>
      <textarea
        className="drawer-edit"
        autoFocus
        rows={rows}
        value={draft}
        aria-label={label}
        onChange={event => setDraft(event.target.value)}
        onBlur={event => {
          // going to Save or Cancel is not leaving the editor: the button decides
          if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('.drawer-edit-actions')) return
          void commitEdit()
        }}
      />
      {editError && (
        <p className="warn" role="alert">
          {editError}
        </p>
      )}
      <div className="drawer-edit-actions">
        {/* mousedown would take the focus off the textarea and write the draft before Cancel could drop it */}
        <button type="button" className="ghost" onMouseDown={event => event.preventDefault()} onClick={saveEdit}>
          {uiText('common.save')}
        </button>
        <button type="button" className="ghost" onMouseDown={event => event.preventDefault()} onClick={cancelEdit}>
          {uiText('common.cancel')}
        </button>
      </div>
    </>
  )

  const flush = useCallback(async (): Promise<boolean> => {
    if ((await propertyPanel.current?.flush()) === false) return false
    if (!(await commitEdit())) return false
    return persist()
  }, [persist, commitEdit])

  useEffect(() => {
    registerFlush(flush)
    return () => registerFlush(null)
  }, [flush, registerFlush])

  /** Every close path commits the property and note drafts first. */
  const closeWithSave = useCallback(() => {
    void flush().then(ok => {
      if (ok) onClose()
    })
  }, [flush, onClose])

  // The key handler is subscribed once and calls the latest save-and-close. A listener rebuilt in a passive effect
  // leaves a gap after an async render (the entry arriving) in which Escape still reaches the previous render's closure.
  const closeRef = useRef(closeWithSave)
  useLayoutEffect(() => {
    closeRef.current = closeWithSave
  }, [closeWithSave])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) closeRef.current()
      if (event.key !== 'Tab' || !drawerElement.current) return
      const focusable = [
        ...drawerElement.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && (document.activeElement === first || !drawerElement.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !drawerElement.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!entry) {
    return (
      <>
        <div className="drawer-backdrop" onClick={closeWithSave} />
        <aside ref={drawerElement} className="drawer" role="dialog" aria-modal="true" aria-label={uiText('library.properties')}>
          <div className="drawer-body">{error || uiText('common.loading')}</div>
        </aside>
      </>
    )
  }

  // a clip with highlights keeps its original text as it is: their ranges point into it (entry.md §4.7)
  const contentLocked = entry.type === 'clip' && (entry.highlights?.length ?? 0) > 0

  return (
    <>
      <div className="drawer-backdrop" onClick={closeWithSave} />
      <aside ref={drawerElement} className="drawer" role="dialog" aria-modal="true" aria-labelledby={`drawer-title-${entry.id}`} data-entry-id={entry.id}>
        <header className="drawer-header">
          <TypeChip type={entry.type} />
          <span className="drawer-title" id={`drawer-title-${entry.id}`}>
            {String(entry.properties['title'] ?? '')}
          </span>
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
            {uiText('library.backToSource')}
          </a>
          {entry.type === 'clip' && (
            <button type="button" className="ghost" data-testid="drawer-read" onClick={() => void flush().then(ok => ok && onOpenReading(entry.id))}>
              {uiText('library.read')}
            </button>
          )}
          <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
            {uiText('library.delete')}
          </button>
          <button type="button" className="ghost" onClick={closeWithSave} aria-label={uiText('common.close')}>
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="drawer-body">
          {entry.type === 'clip' ? (
            <section className="drawer-section" aria-labelledby={`drawer-original-${entry.id}`}>
              <div className="drawer-section-head">
                <h3 id={`drawer-original-${entry.id}`}>{uiText('library.originalText')}</h3>
                {!contentLocked && editing !== 'content' && (
                  <button type="button" className="link" data-testid="edit-original" aria-label={uiText('library.editOriginal')} onClick={() => startEdit('content')}>
                    {uiText('library.edit')}
                  </button>
                )}
              </div>
              {contentLocked && (
                <p className="drawer-lock" data-testid="drawer-lock">
                  <Lock size={13} aria-hidden /> {uiText('reading.locked')}
                </p>
              )}
              {editing === 'content' ? (
                editor(10, uiText('library.originalMarkdown'))
              ) : (
                <HighlightSurface
                  entry={entry}
                  defaultColor={defaultColor}
                  onEntryChanged={next => {
                    setEntry(next)
                    onEntryChanged()
                  }}
                />
              )}
            </section>
          ) : (
            <section className="drawer-section" aria-label={uiText('library.originalText')}>
              {assetMissing ? (
                <p className="warn">{uiText('library.imageMissing')}</p>
              ) : assetUrl ? (
                <>
                  <button type="button" className="drawer-image-button" onClick={() => setImageZoom(true)} aria-label={uiText('library.imagePreview')}>
                    <img className="drawer-image" src={assetUrl} alt={String(entry.properties['title'] ?? '')} />
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => void chrome.downloads.download({ url: assetUrl, filename: `AnnHub/screenshot-${entry.id}.png`, saveAs: false })}
                  >
                    <Download size={16} aria-hidden /> {uiText('shot.tool.download')}
                  </button>
                </>
              ) : (
                <p className="hint">{uiText('common.loading')}</p>
              )}
            </section>
          )}
          {entry.type === 'clip' && entry.context && (
            <section className="drawer-section drawer-context" aria-labelledby={`drawer-context-${entry.id}`}>
              <div className="drawer-section-head">
                <h3 id={`drawer-context-${entry.id}`}>{uiText('library.context')}</h3>
                {editing !== 'context' && (
                  <button type="button" className="link" data-testid="edit-context" aria-label={uiText('library.editContext')} onClick={() => startEdit('context')}>
                    {uiText('library.edit')}
                  </button>
                )}
              </div>
              {editing === 'context' ? editor(4, uiText('library.context')) : <p>{entry.context}</p>}
            </section>
          )}
          <section className="drawer-section">
            <h3>{uiText('library.note')}</h3>
            <textarea value={note} onChange={event => setNote(event.target.value)} onBlur={() => void persist()} rows={2} />
          </section>
          <section className="drawer-section">
            <h3>{uiText('library.properties')}</h3>
            <PropertyPanel
              ref={propertyPanel}
              entry={entry}
              registry={registry}
              onEntryChanged={next => {
                setEntry(next)
                onEntryChanged()
              }}
            />
          </section>
          {error && <p className="warn">{error}</p>}
        </div>
        {confirmDelete && (
          <div className="modal" role="alertdialog">
            <p>{(entry.highlights?.length ?? 0) > 0 ? uiText('library.deleteWithHighlights', { count: entry.highlights!.length }) : uiText('library.deleteConfirm')}</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirmDelete(false)}>
                {uiText('common.cancel')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void MessageUtils.sendMessage({ type: 'DELETE_ENTRY', id: entry.id }).then(response => {
                    if (!response.success) {
                      // the drawer and the entry survive; the user can retry
                      setError(entryErrorText(response.error))
                      setConfirmDelete(false)
                      return
                    }
                    onDeleted()
                    onClose()
                  })
                }}
              >
                {uiText('library.delete')}
              </button>
            </div>
          </div>
        )}
        {imageZoom && assetUrl && (
          <div
            className="image-zoom"
            role="dialog"
            aria-modal="true"
            aria-label={uiText('library.imagePreview')}
            onKeyDownCapture={event => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setImageZoom(false)
              }
            }}
          >
            <button type="button" className="ghost" onClick={() => setImageZoom(false)} aria-label={uiText('common.close')}>
              <X size={18} aria-hidden />
            </button>
            <img src={assetUrl} alt={String(entry.properties['title'] ?? '')} />
          </div>
        )}
      </aside>
    </>
  )
}
