/**
 * The library page — the extension's application page (extension.md §2.2,
 * §2.3, §4.1). R1 scope: the unified list (all / clips / screenshots),
 * search and filters per search.md, the detail drawer with editing, and the
 * single "Export content" Markdown ZIP command. The full left-nav shell
 * with highlight and properties views is R2; filters already live in the
 * URL hash so refresh restores the view.
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { EntryQuery, EntryQueryResult, PropertyCondition } from '../../learning-core/query'
import type { EntryRecord, PropertyDefinition, PropertyType } from '../../learning-core/types'
import { markdownToPlainText } from '../../learning-core/markdown'
import { bucketCount } from '../../learning-core/metrics'
import { HighlightSurface } from './highlight-surface'
import { ReadingView } from './reading-view'
import type { HighlightQueryResult } from '../../learning-core/query'
import type { HighlightColor } from '../../learning-core/types'
import { relativeTime } from '../../utils/relative-time'
import { currentUiLanguage, uiText } from '../../utils/ui-text'

type View = 'all' | 'clips' | 'highlights' | 'screenshots'

interface HashState {
  view: View
  search: string
  host: string
  tag: string
  prop: string
  op: string
  val: string
  val2: string
  from: string
  to: string
}

const EMPTY_HASH: Omit<HashState, 'view'> = { search: '', host: '', tag: '', prop: '', op: '', val: '', val2: '', from: '', to: '' }

function readHash(): HashState {
  const hash = new URLSearchParams(location.hash.replace(/^#\/(all|clips|screenshots)\?*/, '') || '')
  const viewMatch = /^#\/(all|clips|highlights|screenshots)/.exec(location.hash)
  return {
    view: (viewMatch?.[1] as View) ?? 'all',
    search: hash.get('q') ?? '',
    host: hash.get('host') ?? '',
    tag: hash.get('tag') ?? '',
    prop: hash.get('prop') ?? '',
    op: hash.get('op') ?? '',
    val: hash.get('val') ?? '',
    val2: hash.get('val2') ?? '',
    from: hash.get('from') ?? '',
    to: hash.get('to') ?? '',
  }
}

function writeHash(state: HashState): void {
  const params = new URLSearchParams()
  if (state.search) params.set('q', state.search)
  if (state.host) params.set('host', state.host)
  if (state.tag) params.set('tag', state.tag)
  if (state.prop) params.set('prop', state.prop)
  if (state.op) params.set('op', state.op)
  if (state.val) params.set('val', state.val)
  if (state.val2) params.set('val2', state.val2)
  if (state.from) params.set('from', state.from)
  if (state.to) params.set('to', state.to)
  const query = params.toString()
  const next = `#/${state.view}${query ? `?${query}` : ''}`
  if (location.hash !== next) history.replaceState(null, '', next)
}

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
  const [state, setState] = useState<HashState>(readHash)
  const [result, setResult] = useState<EntryQueryResult>({ items: [], total: 0 })
  const [counts, setCounts] = useState({ all: 0, clips: 0, screenshots: 0 })
  const [hosts, setHosts] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [registry, setRegistry] = useState<PropertyDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EntryRecord | null>(null)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'partial' | 'failed'>('idle')
  const [exportSummary, setExportSummary] = useState('')
  const [readingId, setReadingId] = useState<string | null>(/^#\/read\/(.+)/.exec(location.hash)?.[1] ?? null)
  const [highlightResult, setHighlightResult] = useState<HighlightQueryResult>({ groups: [], total: 0 })
  const [defaultColor, setDefaultColor] = useState<HighlightColor>('yellow')

  useEffect(() => {
    const onHashChange = () => {
      setReadingId(/^#\/read\/(.+)/.exec(location.hash)?.[1] ?? null)
      setState(readHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    writeHash(state)
    const propDef = registry.find(def => def.name === state.prop)
    const condition = propDef && state.op ? buildCondition(propDef, state.op, state.val, state.val2) : undefined
    const query: EntryQuery = {
      search: state.search || undefined,
      types: state.view === 'all' ? undefined : [state.view === 'clips' ? 'clip' : 'screenshot'],
      hosts: state.host ? [state.host] : undefined,
      tags: state.tag ? [state.tag] : undefined,
      ...(condition ? { conditions: [condition] } : {}),
      ...localDayRange(state.from, state.to),
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const response = await MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query })
      if (!cancelled && response.success) setResult(response.data!.result)
      if (!cancelled) setLoading(false)
      if (response.success) {
        void MessageUtils.sendMessage<{ entry: EntryRecord }>({
          type: 'RECORD_EVENT',
          name: 'library.queried',
          props: { has_text: Boolean(state.search), filters: '0', results: bucketCount(response.data!.result.total) },
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state, registry])

  const refreshCounts = useCallback(async () => {
    const [all, clips, screenshots, highlights] = await Promise.all([
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: {} }),
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

  const openEntry = useCallback(async (entry: EntryRecord) => {
    setSelected(entry)
    void MessageUtils.sendMessage({ type: 'RECORD_EVENT', name: 'entry.reopened', props: { type: entry.type } })
  }, [])

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

  const viewTab = (view: View, key: 'library.all' | 'library.clips' | 'library.highlights' | 'library.screenshots', count: number) => (
    <a
      key={view}
      href={`#/${view}`}
      className={`nav-item${state.view === view ? ' nav-item-current' : ''}`}
      aria-current={state.view === view ? 'page' : undefined}
      onClick={() => setState(prev => ({ ...prev, view }))}
    >
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
        <a className="nav-item" href={chrome.runtime.getURL('options.html')}>
          {uiText('library.settings')}
        </a>
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
            value={state.search}
            onChange={event => setState(prev => ({ ...prev, search: event.target.value }))}
            aria-label={uiText('library.searchPlaceholder')}
          />
          {hosts.length > 0 && (
            <select className="filter" value={state.host} onChange={event => setState(prev => ({ ...prev, host: event.target.value }))} aria-label={uiText('library.filter.host')}>
              <option value="">{uiText('library.filter.host')}: —</option>
              {hosts.map(host => (
                <option key={host} value={host}>
                  {host}
                </option>
              ))}
            </select>
          )}
          {tags.length > 0 && (
            <select className="filter" value={state.tag} onChange={event => setState(prev => ({ ...prev, tag: event.target.value }))} aria-label={uiText('library.filter.tag')}>
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
                value={state.prop}
                aria-label={uiText('library.filter.property')}
                onChange={event => {
                  const prop = event.target.value
                  const def = registry.find(item => item.name === prop)
                  const op = def ? OPERATORS[def.type][0]!.op : ''
                  setState(prev => ({ ...prev, prop, op, val: '', val2: '' }))
                }}
              >
                <option value="">{uiText('library.filter.property')}: —</option>
                {registry.map(def => (
                  <option key={def.name} value={def.name}>
                    {def.name}
                  </option>
                ))}
              </select>
              {state.prop &&
                (() => {
                  const def = registry.find(item => item.name === state.prop)
                  if (!def) return null
                  const operators = OPERATORS[def.type]
                  const valueInput = (key: 'val' | 'val2', labelKey?: 'library.filter.value2') => {
                    if (def!.type === 'checkbox') {
                      return (
                        <select
                          className="filter filter-value"
                          value={state[key]}
                          aria-label={labelKey ? uiText(labelKey) : uiText('library.filter.value')}
                          onChange={event => setState(prev => ({ ...prev, [key]: event.target.value }))}
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
                        value={state[key]}
                        aria-label={labelKey ? uiText(labelKey) : uiText('library.filter.value')}
                        onChange={event => setState(prev => ({ ...prev, [key]: event.target.value }))}
                      />
                    )
                  }
                  return (
                    <>
                      {operators.length > 1 && (
                        <select
                          className="filter"
                          value={state.op}
                          aria-label={uiText('library.filter.operator')}
                          onChange={event => setState(prev => ({ ...prev, op: event.target.value, val: '', val2: '' }))}
                        >
                          {operators.map(({ op, key: opKey }) => (
                            <option key={op} value={op}>
                              {uiText(opKey as 'library.op.contains')}
                            </option>
                          ))}
                        </select>
                      )}
                      {valueInput('val')}
                      {state.op === 'between' && valueInput('val2', 'library.filter.value2')}
                    </>
                  )
                })()}
            </>
          )}
          <label className="filter filter-time" aria-label={uiText('library.filter.time')}>
            <span className="filter-time-label">{uiText('library.filter.time')}</span>
            <input type="date" value={state.from} aria-label={uiText('library.filter.timeFrom')} onChange={event => setState(prev => ({ ...prev, from: event.target.value }))} />
            <span>–</span>
            <input type="date" value={state.to} aria-label={uiText('library.filter.timeTo')} onChange={event => setState(prev => ({ ...prev, to: event.target.value }))} />
          </label>
          <span className="count">{loading ? uiText('common.loading') : uiText('library.count', { count: result.total })}</span>
        </header>

        {state.view === 'highlights' ? (
          highlightResult.total === 0 ? (
            <div className="empty">{counts.all === 0 ? uiText('library.empty') : uiText('reading.empty')}</div>
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
                        location.hash = `#/read/${group.clip.id}`
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
        ) : result.items.length === 0 ? (
          <div className="empty">
            {counts.all === 0 ? uiText('library.empty') : uiText('library.noResults')}
            {counts.all > 0 && (
              <button type="button" className="link" onClick={() => setState({ view: 'all', ...EMPTY_HASH })}>
                {uiText('library.clearFilters')}
              </button>
            )}
          </div>
        ) : (
          <ul className="list">
            {result.items.map(entry => (
              <EntryRow key={entry.id} entry={entry} onOpen={() => void openEntry(entry)} />
            ))}
          </ul>
        )}
      </main>

      {selected && (
        <DetailDrawer
          entryId={selected.id}
          defaultColor={defaultColor}
          onClose={() => {
            setSelected(null)
            void refreshCounts()
          }}
          onOpenReading={id => {
            setSelected(null)
            location.hash = `#/read/${id}`
          }}
        />
      )}

      {readingId && (
        <ReadingView
          entryId={readingId}
          defaultColor={defaultColor}
          onClose={() => {
            history.back()
          }}
          onEntryChanged={() => void refreshCounts()}
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

function DetailDrawer({ entryId, defaultColor, onClose, onOpenReading }: { entryId: string; defaultColor: HighlightColor; onClose: () => void; onOpenReading(id: string): void }) {
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [assetMissing, setAssetMissing] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
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
    setTitle(String(loaded.properties['title'] ?? ''))
    setNote(loaded.note ?? '')
    setTags(((loaded.properties['tags'] as string[] | undefined) ?? []).join(', '))
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
    const tagList = tags
      .split(/[,，]/)
      .map(tag => tag.trim())
      .filter(Boolean)
    const properties: Record<string, string | string[]> = { ...entry.properties, title: title.trim() || String(entry.properties['title'] ?? '') }
    if (tagList.length > 0) properties.tags = tagList
    else delete properties.tags
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
      type: 'UPDATE_ENTRY',
      id: entry.id,
      patch: { properties, ...(note.trim() ? { note: note.trim() } : { note: undefined }) },
    })
    if (!response.success) setError(response.error ?? 'update failed')
    else setEntry(response.data!.entry)
  }, [entry, note, tags, title])

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
        <span className="drawer-title">{title}</span>
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
            <img className="drawer-image" src={assetUrl} alt={title} />
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
          <label className="field">
            <span>{uiText('edit.title')}</span>
            <input value={title} onChange={event => setTitle(event.target.value)} onBlur={() => void persist()} />
          </label>
          <label className="field">
            <span>{uiText('edit.tags')}</span>
            <input value={tags} onChange={event => setTags(event.target.value)} onBlur={() => void persist()} />
          </label>
          <p className="drawer-system">
            <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
              {entry.sourceHost}
            </a>{' '}
            · {new Date(entry.createdAt).toLocaleString()}
          </p>
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
                void MessageUtils.sendMessage({ type: 'DELETE_ENTRY', id: entry.id }).then(() => onClose())
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
