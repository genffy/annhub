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
import type { EntryQuery, EntryQueryResult, PropertyCondition } from '../../learning-core/query'
import type { EntryRecord, PropertyDefinition } from '../../learning-core/types'
import { markdownToPlainText } from '../../learning-core/markdown'
import { EntryStore, type LibraryFacets } from '../../learning-core/store'
import { buildExport, exportFileName } from '../../learning-core/export'
import { bucketCount } from '../../learning-core/metrics'
import { HighlightSurface } from './highlight-surface'
import { FilterBar } from './filter-bar'
import { PropertyPanel, type PropertyPanelHandle } from './property-panel'
import { ExportDialog } from './export-dialog'
import { PropertiesView } from './properties-view'
import { SettingsView } from './settings-view'
import { ReadingView } from './reading-view'
import type { HighlightQuery, HighlightQueryResult } from '../../learning-core/query'
import type { HighlightColor } from '../../learning-core/types'
import { formatBytes } from '../../utils/format-bytes'
import { relativeTime } from '../../utils/relative-time'
import { currentUiLanguage, entryErrorText, uiText, type UiTextKey } from '../../utils/ui-text'
import { exportFailureKey, type ExportStage } from './export-error'
import { EMPTY_FILTERS, hasActiveFilter, isListView, listHash, readHash, readHashFor, type FilterState, type RouteState, type View } from './route'
import {
  ArrowUpRight,
  BookOpen,
  Download,
  Highlighter,
  Image,
  Keyboard,
  Lock,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Scan,
  Search,
  Tags,
  TextQuote,
  Trash2,
  X,
} from 'lucide-react'
import { ENTRY_TYPE_ICONS, PROPERTY_TYPE_ICONS, TypeChip, VIEW_ICONS } from '../../utils/entry-icons'
import { orderRegistry } from './property-order'
import { CONTENT_MAX_CHARS, CONTEXT_MAX_CHARS } from '../../learning-core/validate'
import { ANN_SCREENSHOT_COMMAND } from '../../constants'

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
 * The nav folds to its icon rail when the window is this narrow, and by hand at any width (extension.md §2.2):
 * below 720 the rail is the default, from 720 up the nav opens (the design's 720–1099 band, foldable by hand).
 * Only a fold is remembered: unfolding is the narrow window's default undone for this visit, not a preference.
 */
const NARROW_QUERY = '(max-width: 719.98px)'
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

/** Calendar dates become [start, end) epoch bounds in the user's local timezone (search.md §3). */
function localDayRange(from: string, to: string): { createdFrom?: number; createdTo?: number } {
  const bounds: { createdFrom?: number; createdTo?: number } = {}
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) bounds.createdFrom = new Date(`${from}T00:00:00`).getTime()
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) bounds.createdTo = new Date(`${to}T00:00:00`).getTime() + 24 * 60 * 60 * 1000
  return bounds
}

/** The `library.queried` event (metrics.md §9): the search words are `has_text`, never one of the `filters`. */
function recordQueried(filters: RouteState, results: number): void {
  const enabled = [
    filters.view === 'all' && filters.type,
    filters.hosts.length > 0,
    filters.tags.length > 0,
    ...filters.conditions.map(condition => condition.prop && condition.op),
    filters.from || filters.to,
    filters.colors.length > 0,
  ].filter(Boolean).length
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
  /** Set once the registry has answered, or failed to: until then a property condition in the URL has no type to query by. */
  const [registryLoaded, setRegistryLoaded] = useState(false)
  // Only a list view has a first answer to wait for. Properties and settings run no query, so nothing would ever clear a flag they started with.
  const [loading, setLoading] = useState(() => isListView(route.view))
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  // starts from the default binding and follows the browser's own assignment (extension.md §7.1)
  const [shortcutKeys, setShortcutKeys] = useState('Cmd/Ctrl+Shift+S')
  const [shortcutHint, setShortcutHint] = useState(() => uiText('library.shortcutHint', { keys: 'Cmd/Ctrl+Shift+S' }))
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'partial' | 'failed'>('idle')
  const [exportSummary, setExportSummary] = useState('')
  const [exportMissing, setExportMissing] = useState<string[]>([])
  const [exportError, setExportError] = useState('')
  /** The export command's dialog (extension.md §2.2): the nav button opens it, it runs the one export and answers with its state. */
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const exportButton = useRef<HTMLButtonElement>(null)
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
  /** The card the keyboard goes on from once 显示更多 has added its page (extension.md §2.3): set by `loadMore` only, so a reload or a filter never moves the focus. */
  const focusAfterLoadRef = useRef<string | null>(null)
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null)
  const entryGridRef = useRef<HTMLUListElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
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

  // The list query (first page) — re-runs when the route, its query or an
  // explicit reload changes (RV-LIB-03: writes refresh the list).
  useEffect(() => {
    if (listRoute.view === 'settings' || listRoute.view === 'properties' || listRoute.view === 'highlights') return
    if (lastListQueryKeyRef.current !== listQueryKey) {
      loadedCountRef.current = PAGE_SIZE
      lastListQueryKeyRef.current = listQueryKey
    }
    const seq = ++querySeq.current
    setLoading(true)
    if (entryQueryJson === null) return
    const query = JSON.parse(entryQueryJson) as EntryQuery
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
  }, [listQueryKey, listRoute, entryQueryJson, reloadKey])

  // The highlights view runs its own query with the same filters (RV-LIB-04).
  useEffect(() => {
    if (route.view !== 'highlights') return
    const seq = ++querySeq.current
    setLoading(true)
    if (highlightQueryJson === null) return
    const query = JSON.parse(highlightQueryJson) as HighlightQuery
    void (async () => {
      const response = await MessageUtils.sendMessage<{ result: HighlightQueryResult }>({ type: 'QUERY_HIGHLIGHTS', query })
      if (seq !== querySeq.current) return
      if (response.success) setHighlightResult(response.data!.result)
      setLoading(false)
      if (response.success && userQueryRef.current) {
        userQueryRef.current = false
        recordQueried(route, response.data!.result.total)
      }
    })()
  }, [route, reloadKey, highlightQueryJson])

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
      const page = response.data!.result.items
      // an empty page (its entries deleted meanwhile) still takes the button away: the keyboard stays on the last card
      focusAfterLoadRef.current = (page[0] ?? items[items.length - 1])?.id ?? null
      setItems(prev => [...prev, ...page])
      loadedCountRef.current += page.length
      setTotal(response.data!.result.total)
      setNextCursor(response.data!.result.nextCursor ?? null)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [items, nextCursor, queryFor, route])

  // Before paint, so a last page that took the focused button away never leaves the keyboard on the page itself. A
  // user who moved the focus while the page was on its way (into a drawer, back to a card) keeps it where they put it.
  useLayoutEffect(() => {
    const id = focusAfterLoadRef.current
    focusAfterLoadRef.current = null
    if (!id) return
    const active = document.activeElement
    if (active && active !== document.body && active !== loadMoreButtonRef.current) return
    entryGridRef.current?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"] > .entry-card-open`)?.focus()
  }, [items])

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

  // A clip or screenshot saved from a page tab while this library tab is open:
  // the background broadcasts the mutation, the list refreshes itself instead
  // of waiting for a reload (真机走查 P3-12).
  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('annhub.entries')
      channel.onmessage = () => reload()
    } catch {
      /* without the channel the page keeps its manual reload behaviour */
    }
    return () => channel?.close()
  }, [reload])

  useEffect(() => {
    void refreshCounts()
    void MessageUtils.sendMessage<{ definitions: PropertyDefinition[] }>({ type: 'LIST_PROPERTIES' }).then(response => {
      if (response.success) setRegistry(response.data!.definitions)
      // a registry that cannot be read leaves its conditions out, as an unknown property does: the list still answers
      setRegistryLoaded(true)
    })
    void MessageUtils.sendMessage<{ defaultHighlightColor?: HighlightColor }>({ type: 'GET_SETTINGS' }).then(response => {
      if (response.success && response.data?.defaultHighlightColor) setDefaultColor(response.data.defaultHighlightColor)
    })
    void MessageUtils.sendMessage<{ usage: number; quota: number }>({ type: 'USAGE_ESTIMATE' }).then(response => {
      if (response.success) setUsage(response.data!)
    })
    void chrome.commands.getAll().then(commands => {
      const binding = commands.find(command => command.name === ANN_SCREENSHOT_COMMAND)?.shortcut
      if (binding) {
        setShortcutKeys(binding)
        setShortcutHint(uiText('library.shortcutHint', { keys: binding }))
      }
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
      const exportedAt = Date.now()
      const summary = await buildExport({
        exportedAt,
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
        await chrome.downloads.download({ url, filename: exportFileName(exportedAt), saveAs: false })
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

  // "/" puts the keyboard in the search box (extension.md §7.2): only where one is on screen — the
  // reading view and the two pages without list controls have no box to focus, and the drawer is modal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== '/' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      if (!isListView(route.view) || route.readId || route.entryId) return
      const active = document.activeElement
      if (active instanceof HTMLElement && (active.closest('input, textarea, select, [contenteditable]') !== null || active.isContentEditable)) return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [route.view, route.readId, route.entryId])

  // The nav also answers ↑ ↓: the focus walks the nav items while every one of them stays in the Tab
  // order (extension.md §7.2) — an addition to the keyboard, not a replacement of it.
  const onNavKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
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
  const pageSubtitle = useMemo(() => {
    const shown = route.view === 'highlights' ? highlightResult.total : total
    if (hasActiveFilter(route)) return uiText('library.sub.filtered', { count: shown })
    if (route.view === 'all') return uiText('library.sub.all', { total: counts.all, clips: counts.clips, shots: counts.screenshots })
    if (route.view === 'highlights') return uiText('library.sub.highlights', { count: highlightResult.total, clips: highlightResult.groups.length })
    return uiText('library.sub.count', { count: shown })
  }, [route, total, counts, highlightResult])

  const viewTab = (view: View, count: number) => {
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
  const emptyState = (view: 'all' | 'clips' | 'screenshots' | 'highlights') => {
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

  return (
    <div className={`shell${rail ? ' is-rail' : ''}`}>
      <nav className="side" aria-label={uiText('library.name')} onKeyDown={onNavKeyDown}>
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
        <p className="nav-group-title">{uiText('library.group.library')}</p>
        {viewTab('all', counts.all)}
        {viewTab('clips', counts.clips)}
        {viewTab('highlights', highlightTotal)}
        {viewTab('screenshots', counts.screenshots)}
        <p className="nav-group-title">{uiText('library.group.manage')}</p>
        {viewTab('properties', registry.length)}
        {viewTab('settings', 0)}
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
            ref={exportButton}
            disabled={exportState === 'busy'}
            onClick={() => setExportDialogOpen(true)}
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
          {isListView(route.view) ? (
            <>
              <header className="page-head">
                <div className="page-titles">
                  <h1 className="page-title">{uiText(VIEW_LABEL_KEYS[route.view])}</h1>
                  <p className="page-sub">{pageSubtitle}</p>
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
                      <button
                        type="button"
                        className="ghost sm quiet"
                        onClick={() => {
                          localStorage.setItem('annhub.guideDismissed', '1')
                          setGuideDismissed(true)
                        }}
                      >
                        {uiText('library.guide.dismiss')}
                      </button>
                    </div>
                  </div>
                )}
                {route.view === 'highlights' ? (
                  highlightResult.total === 0 ? (
                    loading ? (
                      <div className="list-loading" role="status">
                        {uiText('common.loading')}
                      </div>
                    ) : (
                      emptyState('highlights')
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
                  emptyState(route.view === 'clips' ? 'clips' : route.view === 'screenshots' ? 'screenshots' : 'all')
                ) : (
                  <>
                    <div className="list">
                      <ul className="entry-grid" ref={entryGridRef}>
                        {items.map(entry => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            registry={registry}
                            selected={route.entryId === entry.id}
                            onOpen={() => void openEntry(entry)}
                            onChanged={route.view === 'screenshots' ? reload : undefined}
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
              </div>
            </>
          ) : route.view === 'settings' ? (
            <SettingsView />
          ) : (
            <PropertiesView
              onRegistryChanged={() => {
                void MessageUtils.sendMessage<{ definitions: PropertyDefinition[] }>({ type: 'LIST_PROPERTIES' }).then(response => {
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

/** As much of a clip as its card shows: the first lines, and the card cuts them off where its box ends. */
const EXCERPT_CHARS = 480

/** How many custom-property pills a card and a highlight row show (extension.md §2.3). */
const CARD_PILL_LIMIT = 2

/**
 * The custom properties a card shows as small pills (extension.md §2.3): the entry's own values, not new
 * fields — the registry's order among the user's properties, at most two, a checkbox only when it is on, a
 * long value ellipsized by the pill itself. A list property shows its first item.
 */
function propertyPills(entry: EntryRecord, registry: PropertyDefinition[]): { name: string; node: React.ReactNode }[] {
  const pills: { name: string; node: React.ReactNode }[] = []
  for (const def of orderRegistry(registry)) {
    if (def.builtin || pills.length >= CARD_PILL_LIMIT) continue
    const value = entry.properties[def.name]
    const Icon = PROPERTY_TYPE_ICONS[def.type]
    if (def.type === 'checkbox') {
      if (value !== true) continue
      pills.push({
        name: def.name,
        node: (
          <>
            <Icon size={11} aria-hidden />
            <span className="ppill-name">{def.name}</span>
          </>
        ),
      })
      continue
    }
    const shown = Array.isArray(value) ? (value[0] == null ? undefined : String(value[0])) : value == null || value === '' ? undefined : String(value)
    if (shown === undefined) continue
    pills.push({
      name: def.name,
      node: (
        <>
          <Icon size={11} aria-hidden />
          <span className="ppill-name">{def.name}</span>
          <b className="ppill-value">{shown}</b>
        </>
      ),
    })
  }
  return pills
}

/**
 * One entry in the All, Clips and Screenshots grids (extension.md §2.3): on top what it holds — the first lines of a
 * clip, the picture of a screenshot — and below its title, tags, type, source and time. Its name is the title and
 * those details; the clip's words are its description, so a reader hears what the card is before all of what it says.
 * `onChanged` gives a screenshot its own download and delete (the Screenshots view).
 */
function EntryCard({
  entry,
  registry,
  selected,
  onOpen,
  onChanged,
}: {
  entry: EntryRecord
  registry: PropertyDefinition[]
  selected?: boolean
  onOpen(): void
  onChanged?(): void
}) {
  const url = useAssetUrl(entry.type === 'screenshot' ? entry.assetId : undefined)
  const title = String(entry.properties['title'] ?? '')
  const tags = (entry.properties['tags'] as string[] | undefined) ?? []
  const highlights = entry.highlights?.length ?? 0
  const pills = propertyPills(entry, registry)
  const excerpt =
    entry.type === 'clip'
      ? markdownToPlainText(entry.content)
          .replace(/\n{2,}/g, '\n')
          .slice(0, EXCERPT_CHARS)
      : ''
  const id = (part: string) => `card-${part}-${entry.id}`
  const named = [title && id('title'), (tags.length > 0 || pills.length > 0) && id('tags'), id('meta')].filter(Boolean).join(' ')
  return (
    <li className={`entry-card${selected ? ' entry-card-selected' : ''}`} data-type={entry.type} data-entry-id={entry.id}>
      <button type="button" className="entry-card-open" onClick={onOpen} aria-labelledby={named} aria-describedby={excerpt ? id('excerpt') : undefined}>
        {entry.type === 'clip' ? (
          <span className="entry-card-preview">
            <span className="entry-card-excerpt" id={id('excerpt')}>
              {excerpt}
            </span>
          </span>
        ) : url ? (
          <img
            className="entry-card-preview"
            src={url}
            alt=""
            loading="lazy"
            onLoad={event => {
              // a long capture fills the box from the top instead of shrinking to a sliver (extension.md §2.3)
              const image = event.currentTarget
              image.dataset.tall = image.naturalHeight / image.naturalWidth >= 2 ? 'true' : 'false'
            }}
          />
        ) : (
          <span className="entry-card-preview screenshot-placeholder" aria-hidden>
            <Scan size={28} />
          </span>
        )}
        <span className="entry-card-body">
          {title && (
            <span className="entry-card-title" id={id('title')}>
              {title}
            </span>
          )}
          {(tags.length > 0 || pills.length > 0) && (
            <span className="entry-card-tags" id={id('tags')}>
              {tags.map(tag => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
              {pills.map(pill => (
                <span key={pill.name} className="ppill">
                  {pill.node}
                </span>
              ))}
            </span>
          )}
          {/* the card's last line: type, source and time on one row, the highlight count at its end (extension.md §2.3) */}
          <span className="entry-card-meta" id={id('meta')}>
            <TypeChip type={entry.type} />
            <span className="entry-card-source">
              {entry.sourceHost} · {relativeTime(entry.createdAt)}
            </span>
            {highlights > 0 && (
              <span className="entry-card-highlights">
                <Highlighter size={13} aria-hidden />
                {uiText('library.highlightsCount', { count: highlights })}
              </span>
            )}
          </span>
        </span>
      </button>
      {onChanged && entry.type === 'screenshot' && <ScreenshotActions entry={entry} url={url} onChanged={onChanged} />}
    </li>
  )
}

/** A screenshot card's download and delete, shown on hover and focus (extension.md §2.3). */
function ScreenshotActions({ entry, url, onChanged }: { entry: EntryRecord; url: string | null; onChanged(): void }) {
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
    <div className="entry-card-actions">
      <button type="button" disabled={!url} title={uiText('shot.tool.download')} aria-label={uiText('shot.tool.download')} onClick={() => void download()}>
        <Download size={16} />
      </button>
      <button type="button" title={uiText('library.delete')} aria-label={uiText('library.delete')} onClick={() => void remove()}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}

/** The confirm's count is its emphasis: the number lands bold wherever the localized sentence put it (zh and en differ). */
function boldenCount(text: string, count: number) {
  const parts = text.split(String(count))
  return (
    <>
      {parts[0]}
      <b>{count}</b>
      {parts.slice(1).join(String(count))}
    </>
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
  /** The header's "删除": the keyboard goes back to it when the confirm goes away without deleting. */
  const deleteButton = useRef<HTMLButtonElement>(null)
  const confirmCancelButton = useRef<HTMLButtonElement>(null)
  const confirmDeleteButton = useRef<HTMLButtonElement>(null)
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

  /** The confirm leaves without deleting; the keyboard goes back to the "删除" button that opened it. */
  const closeConfirm = useCallback(() => {
    setConfirmDelete(false)
    deleteButton.current?.focus()
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
  const highlightCount = entry.highlights?.length ?? 0

  return (
    <>
      <div className="drawer-backdrop" onClick={closeWithSave} />
      <aside ref={drawerElement} className="drawer" role="dialog" aria-modal="true" aria-labelledby={`drawer-title-${entry.id}`} data-entry-id={entry.id}>
        <header className="drawer-header">
          <TypeChip type={entry.type} />
          <span className="drawer-header-space" aria-hidden />
          {/* the header's actions in one row — 阅读 / 回到来源 / 删除 / 关闭 (extension.md §4.1) */}
          <span className="drawer-header-actions">
            {entry.type === 'clip' && (
              <button type="button" className="ghost sm" data-testid="drawer-read" onClick={() => void flush().then(ok => ok && onOpenReading(entry.id))}>
                <BookOpen size={14} aria-hidden /> {uiText('library.read')}
              </button>
            )}
            {/* a link by meaning, a button by look (extension.md §4.1) */}
            <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="ghost sm">
              {uiText('library.backToSource')} <ArrowUpRight size={14} aria-hidden />
            </a>
            <button
              type="button"
              className="ghost-icon"
              ref={deleteButton}
              aria-label={uiText('library.delete')}
              title={uiText('library.delete')}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} aria-hidden />
            </button>
            <button type="button" className="ghost-icon" onClick={closeWithSave} aria-label={uiText('common.close')} title={uiText('common.close')}>
              <X size={15} aria-hidden />
            </button>
          </span>
        </header>
        <div className="drawer-title-block">
          <div className="drawer-title" id={`drawer-title-${entry.id}`}>
            {String(entry.properties['title'] ?? '')}
          </div>
          <p className="drawer-sub">
            {entry.sourceUrl.replace(/^https?:\/\//, '')} · {relativeTime(entry.createdAt)}
          </p>
        </div>
        <div className="drawer-body">
          {entry.type === 'clip' ? (
            <section className="drawer-section" aria-labelledby={`drawer-original-${entry.id}`}>
              <div className="drawer-section-head">
                <h3 id={`drawer-original-${entry.id}`}>
                  <TextQuote size={13} aria-hidden /> {uiText('library.originalText')}
                </h3>
                <span className="drawer-section-space" aria-hidden />
                {contentLocked ? (
                  // the short badge says how many marks hold the text; the whole sentence sits in the title and for readers (extension.md §4.1)
                  <span className="drawer-lock" data-testid="drawer-lock" title={uiText('reading.locked')}>
                    <Lock size={12} aria-hidden /> <span aria-hidden>{uiText('library.originalReadOnly', { count: highlightCount })}</span>
                    <span className="sr-only">{uiText('reading.locked')}</span>
                  </span>
                ) : (
                  editing !== 'content' && (
                    <button type="button" className="link" data-testid="edit-original" aria-label={uiText('library.editOriginal')} onClick={() => startEdit('content')}>
                      {uiText('library.edit')}
                    </button>
                  )
                )}
              </div>
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
              {entry.context && (
                <div className="drawer-context">
                  <div className="drawer-context-head">
                    <b>{uiText('library.context')}</b>
                    {editing !== 'context' && (
                      <button type="button" className="link" data-testid="edit-context" aria-label={uiText('library.editContext')} onClick={() => startEdit('context')}>
                        {uiText('library.edit')}
                      </button>
                    )}
                  </div>
                  {editing === 'context' ? editor(4, uiText('library.context')) : <p>{entry.context}</p>}
                </div>
              )}
            </section>
          ) : (
            <section className="drawer-section" aria-label={uiText('library.image')}>
              <div className="drawer-section-head">
                <h3>
                  <Image size={13} aria-hidden /> {uiText('library.image')}
                </h3>
                <span className="drawer-section-space" aria-hidden />
                {assetUrl && (
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => void chrome.downloads.download({ url: assetUrl, filename: `AnnHub/screenshot-${entry.id}.png`, saveAs: false })}
                  >
                    <Download size={14} aria-hidden /> {uiText('shot.tool.download')}
                  </button>
                )}
              </div>
              {assetMissing ? (
                <p className="warn">{uiText('library.imageMissing')}</p>
              ) : assetUrl ? (
                <button type="button" className="drawer-image-button" onClick={() => setImageZoom(true)} aria-label={uiText('library.imagePreview')}>
                  <img className="drawer-image" src={assetUrl} alt={String(entry.properties['title'] ?? '')} />
                </button>
              ) : (
                <p className="hint">{uiText('common.loading')}</p>
              )}
            </section>
          )}
          <section className="drawer-section">
            <h3>
              <MessageSquareText size={13} aria-hidden /> {uiText('library.note')}
            </h3>
            <textarea value={note} onChange={event => setNote(event.target.value)} onBlur={() => void persist()} placeholder={uiText('library.notePlaceholder')} rows={2} />
          </section>
          <section className="drawer-section drawer-section-last">
            <h3>
              <Tags size={13} aria-hidden /> {uiText('library.properties')}
            </h3>
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
          {error && <p className="drawer-error warn">{error}</p>}
        </div>
        {confirmDelete && (
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`confirm-title-${entry.id}`}
            aria-describedby={highlightCount > 0 ? `confirm-text-${entry.id}` : undefined}
            // a press on the scrim keeps the focus where the trap put it instead of dropping it to the page
            onMouseDown={event => event.preventDefault()}
            // the scrim itself is a way out: like Esc and 取消 it cancels and gives the keyboard back to 删除
            onClick={event => {
              if (event.target === event.currentTarget) closeConfirm()
            }}
            onKeyDownCapture={event => {
              // while the confirm is open it owns the keyboard: Esc cancels the confirm (not the drawer),
              // Tab stays between the two buttons — the same capture the image zoom uses
              if (event.key === 'Escape') {
                event.stopPropagation()
                closeConfirm()
                return
              }
              if (event.key === 'Tab') {
                event.stopPropagation()
                event.preventDefault()
                ;(document.activeElement === confirmDeleteButton.current ? confirmCancelButton : confirmDeleteButton).current?.focus()
              }
            }}
          >
            <div className="modal-card">
              <h2 className="modal-title" id={`confirm-title-${entry.id}`}>
                {highlightCount > 0 ? uiText('library.deleteClipTitle') : uiText('library.deleteConfirm')}
              </h2>
              {highlightCount > 0 && <p id={`confirm-text-${entry.id}`}>{boldenCount(uiText('library.deleteHighlightsBody', { count: highlightCount }), highlightCount)}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost quiet" ref={confirmCancelButton} autoFocus onClick={closeConfirm}>
                  {uiText('common.cancel')}
                </button>
                <button
                  type="button"
                  className="danger"
                  ref={confirmDeleteButton}
                  onClick={() => {
                    void MessageUtils.sendMessage({ type: 'DELETE_ENTRY', id: entry.id }).then(response => {
                      if (!response.success) {
                        // the drawer and the entry survive; the user can retry
                        setError(entryErrorText(response.error))
                        closeConfirm()
                        return
                      }
                      onDeleted()
                      onClose()
                    })
                  }}
                >
                  {highlightCount > 0 && <Trash2 size={14} aria-hidden />}
                  {highlightCount > 0 ? uiText('library.deleteWithHighlightsButton') : uiText('library.delete')}
                </button>
              </div>
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
