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
import type { EntryQuery, EntryQueryResult } from '../../learning-core/query'
import type { EntryRecord } from '../../learning-core/types'
import { markdownToPlainText } from '../../learning-core/markdown'
import { bucketCount } from '../../learning-core/metrics'
import { MarkdownView } from './markdown-view'
import { relativeTime } from '../../utils/relative-time'
import { currentUiLanguage, uiText } from '../../utils/ui-text'

type View = 'all' | 'clips' | 'screenshots'

interface HashState {
  view: View
  search: string
  host: string
  tag: string
}

function readHash(): HashState {
  const hash = new URLSearchParams(location.hash.replace(/^#\/(all|clips|screenshots)\?*/, '') || '')
  const viewMatch = /^#\/(all|clips|screenshots)/.exec(location.hash)
  return {
    view: (viewMatch?.[1] as View) ?? 'all',
    search: hash.get('q') ?? '',
    host: hash.get('host') ?? '',
    tag: hash.get('tag') ?? '',
  }
}

function writeHash(state: HashState): void {
  const params = new URLSearchParams()
  if (state.search) params.set('q', state.search)
  if (state.host) params.set('host', state.host)
  if (state.tag) params.set('tag', state.tag)
  const query = params.toString()
  const next = `#/${state.view}${query ? `?${query}` : ''}`
  if (location.hash !== next) history.replaceState(null, '', next)
}

export default function App() {
  const [state, setState] = useState<HashState>(readHash)
  const [result, setResult] = useState<EntryQueryResult>({ items: [], total: 0 })
  const [counts, setCounts] = useState({ all: 0, clips: 0, screenshots: 0 })
  const [hosts, setHosts] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EntryRecord | null>(null)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'partial' | 'failed'>('idle')
  const [exportSummary, setExportSummary] = useState('')

  useEffect(() => {
    const onHashChange = () => setState(readHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    writeHash(state)
    const query: EntryQuery = {
      search: state.search || undefined,
      types: state.view === 'all' ? undefined : [state.view === 'clips' ? 'clip' : 'screenshot'],
      hosts: state.host ? [state.host] : undefined,
      tags: state.tag ? [state.tag] : undefined,
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
  }, [state])

  const refreshCounts = useCallback(async () => {
    const [all, clips, screenshots] = await Promise.all([
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: {} }),
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { types: ['clip'] } }),
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { types: ['screenshot'] } }),
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
  }, [])

  useEffect(() => {
    void refreshCounts()
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

  const viewTab = (view: View, key: 'library.all' | 'library.clips' | 'library.screenshots', count: number) => (
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
          <span className="count">{loading ? uiText('common.loading') : uiText('library.count', { count: result.total })}</span>
        </header>

        {result.items.length === 0 ? (
          <div className="empty">
            {counts.all === 0 ? uiText('library.empty') : uiText('library.noResults')}
            {counts.all > 0 && (
              <button type="button" className="link" onClick={() => setState({ view: 'all', search: '', host: '', tag: '' })}>
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
          onClose={() => {
            setSelected(null)
            void refreshCounts()
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

function DetailDrawer({ entryId, onClose }: { entryId: string; onClose: () => void }) {
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
            <MarkdownView markdown={entry.content} />
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
