/**
 * The library page — the extension's application page (extension.md §2.2,
 * §2.3, §4.1). R1 scope: the unified list (all / clips / screenshots),
 * search and filters per search.md, the detail drawer with editing, and the
 * single "Export content" Markdown ZIP command. The full left-nav shell
 * with highlight and properties views is R2; filters already live in the
 * URL hash so refresh restores the view.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { EntryQuery, EntryQueryResult, PropertyCondition } from '../../learning-core/query'
import type { EntryRecord, PropertyDefinition, PropertyType } from '../../learning-core/types'
import { markdownToPlainText } from '../../learning-core/markdown'
import { bucketCount } from '../../learning-core/metrics'
import { HighlightSurface } from './highlight-surface'
import { PropertyPanel } from './property-panel'
import { PropertiesView } from './properties-view'
import { SettingsView } from './settings-view'
import { ReadingView } from './reading-view'
import type { HighlightQueryResult } from '../../learning-core/query'
import type { HighlightColor } from '../../learning-core/types'
import { relativeTime } from '../../utils/relative-time'
import { currentUiLanguage, uiText } from '../../utils/ui-text'
import { EMPTY_FILTERS, listHash, readHash, readHashFor, type FilterState, type RouteState, type View } from './route'

/** The five highlight colors a highlights view can filter by (search.md §5). */
const HIGHLIGHT_FILTER_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

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
  const [items, setItems] = useState<EntryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [counts, setCounts] = useState({ all: 0, clips: 0, screenshots: 0 })
  const [hosts, setHosts] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [registry, setRegistry] = useState<PropertyDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'partial' | 'failed'>('idle')
  const [exportSummary, setExportSummary] = useState('')
  const [guideDismissed, setGuideDismissed] = useState(() => Boolean(localStorage.getItem('annhub.guideDismissed')))
  const [highlightResult, setHighlightResult] = useState<HighlightQueryResult>({ groups: [], total: 0 })
  const [defaultColor, setDefaultColor] = useState<HighlightColor>('yellow')
  const [searchDraft, setSearchDraft] = useState(route.search)
  const [reloadKey, setReloadKey] = useState(0)
  /** The list route a reading view came from; deep links fall back to the entry's type list. */
  const returnHashRef = useRef<string | null>(null)
  /** Set while the user (not the page load) caused the current query (RV-LIB-13). */
  const userQueryRef = useRef(false)
  const querySeq = useRef(0)

  useEffect(() => {
    const onHashChange = () => setRoute(readHash())
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
        types: filters.view === 'all' ? undefined : [filters.view === 'clips' ? 'clip' : 'screenshot'],
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
    if (route.view === 'settings' || route.view === 'properties' || route.view === 'highlights') return
    const seq = ++querySeq.current
    setLoading(true)
    const query = queryFor(route)
    void (async () => {
      const response = await MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { ...query, limit: PAGE_SIZE } })
      if (seq !== querySeq.current) return
      if (response.success) {
        setItems(response.data!.result.items)
        setTotal(response.data!.result.total)
        setNextCursor(response.data!.result.nextCursor ?? null)
      }
      setLoading(false)
      if (response.success && userQueryRef.current) {
        userQueryRef.current = false
        const enabled = [route.search, route.host, route.tag, route.prop, route.from, route.to].filter(Boolean).length
        void MessageUtils.sendMessage({
          type: 'RECORD_EVENT',
          name: 'library.queried',
          props: { has_text: Boolean(route.search), filters: String(enabled) as '0', results: bucketCount(response.data!.result.total) },
        })
      }
    })()
  }, [route, registry, reloadKey, queryFor])

  // The highlights view runs its own query with the same filters (RV-LIB-04).
  useEffect(() => {
    if (route.view !== 'highlights') return
    const seq = ++querySeq.current
    setLoading(true)
    void (async () => {
      const response = await MessageUtils.sendMessage<{ result: HighlightQueryResult }>({
        type: 'QUERY_HIGHLIGHTS',
        query: {
          search: route.search || undefined,
          hosts: route.host ? [route.host] : undefined,
          tags: route.tag ? [route.tag] : undefined,
          colors: route.color ? [route.color as HighlightColor] : undefined,
          ...localDayRange(route.from, route.to),
        },
      })
      if (seq !== querySeq.current) return
      if (response.success) setHighlightResult(response.data!.result)
      setLoading(false)
    })()
  }, [route, reloadKey])

  const loadMore = useCallback(async () => {
    if (!nextCursor) return
    const seq = querySeq.current
    const response = await MessageUtils.sendMessage<{ result: EntryQueryResult }>({
      type: 'QUERY_ENTRIES',
      query: { ...queryFor(route), limit: PAGE_SIZE, cursor: nextCursor },
    })
    if (seq !== querySeq.current || !response.success) return
    setItems(prev => [...prev, ...response.data!.result.items])
    setTotal(response.data!.result.total)
    setNextCursor(response.data!.result.nextCursor ?? null)
  }, [nextCursor, queryFor, route])

  const refreshCounts = useCallback(async () => {
    const [all, clips, screenshots, highlights] = await Promise.all([
      // candidates must cover the whole library, not the first page (RV-LIB-02);
      // a real faceted index arrives with RV-BG-04
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { limit: 10_000 } }),
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { types: ['clip'] } }),
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { types: ['screenshot'] } }),
      MessageUtils.sendMessage<{ result: HighlightQueryResult }>({ type: 'QUERY_HIGHLIGHTS', query: {} }),
    ])
    const hostSet = new Set<string>()
    const tagSet = new Set<string>()
    for (const entry of all.data?.result.items ?? []) {
      hostSet.add(entry.sourceHost)
      for (const tag of (entry.properties['tags'] as string[] | undefined) ?? []) tagSet.add(tag)
    }
    setHosts([...hostSet].sort())
    setTags([...tagSet].sort())
    setCounts({
      all: all.data?.result.total ?? 0,
      clips: clips.data?.result.total ?? 0,
      screenshots: screenshots.data?.result.total ?? 0,
    })
    setHighlightResult(highlights.data?.result ?? { groups: [], total: 0 })
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
      void MessageUtils.sendMessage({ type: 'RECORD_EVENT', name: 'entry.reopened', props: { type: entry.type } })
      // the drawer is part of the route: refresh restores it (extension.md §2.2)
      location.hash = listHash({ ...route, entryId: entry.id })
    },
    [route],
  )

  const onExport = useCallback(async () => {
    setExportState('busy')
    const response = await MessageUtils.sendMessage<{ result: 'full' | 'partial'; clips: number; screenshots: number; missingAssets: string[] }>({
      type: 'EXPORT_ZIP',
      lang: currentUiLanguage(),
    })
    if (!response.success) {
      setExportState('failed')
      return
    }
    const { result, clips, screenshots, missingAssets } = response.data!
    setExportSummary(`${clips + screenshots} (${clips} / ${screenshots})${missingAssets.length > 0 ? ` · ${missingAssets.length} missing` : ''}`)
    setExportState(result === 'full' ? 'done' : 'partial')
  }, [])

  const viewTab = (view: View, key: 'library.all' | 'library.clips' | 'library.highlights' | 'library.screenshots' | 'library.properties' | 'library.settings', count: number) => (
    <a key={view} href={`#/${view}`} className={`nav-item${route.view === view ? ' nav-item-current' : ''}`} aria-current={route.view === view ? 'page' : undefined}>
      {uiText(key)} {count > 0 && <span className="nav-count">{count}</span>}
    </a>
  )

  return (
    <div className="shell">
      <nav className="side" aria-label={uiText('library.openLibrary')}>
        <div className="brand">AnnHub</div>
        {viewTab('all', 'library.all', counts.all)}
        {viewTab('clips', 'library.clips', counts.clips)}
        {viewTab('highlights', 'library.highlights', highlightResult.total)}
        {viewTab('screenshots', 'library.screenshots', counts.screenshots)}
        <div className="nav-spacer" />
        {viewTab('properties', 'library.properties', registry.length)}
        {viewTab('settings', 'library.settings', 0)}
        <button type="button" className="nav-export" disabled={exportState === 'busy'} onClick={() => void onExport()}>
          {exportState === 'busy' ? uiText('library.exporting') : uiText('library.export')}
        </button>
        {exportState === 'done' && (
          <span className="nav-note">
            {uiText('library.exportDone')} · {exportSummary}
          </span>
        )}
        {exportState === 'partial' && (
          <span className="nav-note nav-note-warn">
            {uiText('library.exportPartial')} · {exportSummary}
          </span>
        )}
        {exportState === 'failed' && <span className="nav-note nav-note-warn">{uiText('toast.saveFailed')}</span>}
        {usage && usage.quota > 0 && <span className="nav-note">{uiText('library.storageUsed', { size: formatBytes(usage.usage) })}</span>}
      </nav>

      <main className="content">
        <header className="toolbar">
          <input
            className="search"
            type="search"
            placeholder={uiText('library.searchPlaceholder')}
            value={searchDraft}
            onChange={event => setSearchDraft(event.target.value)}
            aria-label={uiText('library.searchPlaceholder')}
          />
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
        </header>

        {counts.all === 0 && !guideDismissed && route.view !== 'settings' && route.view !== 'properties' && (
          <div className="guide-card" data-testid="guide-card">
            <p>{uiText('library.guide.clip')}</p>
            <p>{uiText('library.guide.shot')}</p>
            <p>{uiText('library.guide.hl')}</p>
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
            <div className="empty">{uiText('library.empty.highlights')}</div>
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
                        location.hash = readHashFor(group.clip.id)
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
        ) : items.length === 0 ? (
          <div className="empty">
            {counts.all === 0
              ? uiText(route.view === 'clips' ? 'library.empty.clips' : route.view === 'screenshots' ? 'library.empty.screenshots' : 'library.empty')
              : uiText('library.noResults')}
            {counts.all > 0 && (
              <button type="button" className="link" onClick={() => setFilter({ ...EMPTY_FILTERS })}>
                {uiText('library.clearFilters')}
              </button>
            )}
          </div>
        ) : (
          <>
            <ul className="list">
              {items.map(entry => (
                <EntryRow key={entry.id} entry={entry} onOpen={() => void openEntry(entry)} />
              ))}
            </ul>
            {nextCursor && items.length < total && (
              <button type="button" className="link load-more" data-testid="load-more" onClick={() => void loadMore()}>
                {uiText('library.loadMore', { count: total - items.length })}
              </button>
            )}
          </>
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
            reload()
          }}
          onOpenReading={id => {
            returnHashRef.current = location.hash
            location.hash = readHashFor(id)
          }}
        />
      )}

      {route.readId && (
        <ReadingView
          key={route.readId}
          entryId={route.readId}
          defaultColor={defaultColor}
          registry={registry}
          onClose={() => {
            // back to the list route the reading view came from; a deep link
            // falls back to the entry's type list (extension.md §4.2)
            const fallback = '#/clips'
            location.hash = returnHashRef.current ?? fallback
            returnHashRef.current = null
            reload()
          }}
          onEntryChanged={() => reload()}
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
        <span className={`type-chip type-${entry.type}`} data-type={entry.type}>
          {uiText(entry.type === 'clip' ? 'library.clips' : 'library.screenshots')}
        </span>
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

function DetailDrawer({
  entryId,
  defaultColor,
  registry,
  onClose,
  onOpenReading,
}: {
  entryId: string
  defaultColor: HighlightColor
  registry: PropertyDefinition[]
  onClose: () => void
  onOpenReading(id: string): void
}) {
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [assetMissing, setAssetMissing] = useState(false)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({ type: 'GET_ENTRY', id: entryId })
    if (!response.success || !response.data?.entry) {
      setError(response.error ?? 'not found')
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
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const persist = useCallback(async () => {
    if (!entry) return
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
      type: 'UPDATE_ENTRY',
      id: entry.id,
      // null clears the note; an undefined key would not survive the JSON transport
      patch: { note: note.trim() ? note.trim() : null },
    })
    if (!response.success) setError(response.error ?? 'update failed')
    else setEntry(response.data!.entry)
  }, [entry, note])

  if (!entry) {
    return (
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-body">{error || uiText('common.loading')}</div>
      </aside>
    )
  }

  return (
    <aside className="drawer" role="dialog" aria-modal="true" data-entry-id={entry.id}>
      <header className="drawer-header">
        <span className={`type-chip type-${entry.type}`}>{uiText(entry.type === 'clip' ? 'library.clips' : 'library.screenshots')}</span>
        <span className="drawer-title">{String(entry.properties['title'] ?? '')}</span>
        <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
          {uiText('library.backToSource')}
        </a>
        {entry.type === 'clip' && (
          <button type="button" className="ghost" data-testid="drawer-read" onClick={() => onOpenReading(entry.id)}>
            {uiText('library.read')}
          </button>
        )}
        <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
          {uiText('library.delete')}
        </button>
        <button type="button" className="ghost" onClick={onClose} aria-label={uiText('common.close')}>
          ✕
        </button>
      </header>
      <div className="drawer-body">
        <section className="drawer-section" aria-label={uiText('library.originalText')}>
          {entry.type === 'clip' ? (
            <HighlightSurface entry={entry} defaultColor={defaultColor} onEntryChanged={setEntry} />
          ) : assetMissing ? (
            <p className="warn">{uiText('library.imageMissing')}</p>
          ) : assetUrl ? (
            <img className="drawer-image" src={assetUrl} alt={String(entry.properties['title'] ?? '')} />
          ) : (
            <p className="hint">{uiText('common.loading')}</p>
          )}
        </section>
        {entry.context && (
          <section className="drawer-section drawer-context">
            <h3>{uiText('library.originalText')} · context</h3>
            <p>{entry.context}</p>
          </section>
        )}
        <section className="drawer-section">
          <h3>{uiText('library.note')}</h3>
          <textarea value={note} onChange={event => setNote(event.target.value)} onBlur={() => void persist()} rows={2} />
        </section>
        <section className="drawer-section">
          <h3>{uiText('library.properties')}</h3>
          <PropertyPanel entry={entry} registry={registry} onEntryChanged={setEntry} />
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
                    setError(response.error ?? uiText('toast.saveFailed'))
                    setConfirmDelete(false)
                    return
                  }
                  onClose()
                })
              }}
            >
              {uiText('library.delete')}
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
