/**
 * 碎片库 — the extension's library page (extension PRD §2.2/§5).
 * First-level pages: 碎片库 | 截图集 | 设置. 高亮列表 and 剪藏列表 are views
 * inside 碎片库, reached from the more menu.
 * Fragments view: unified search/filters (docs/v2/search.md), 新建灵感,
 * capture-field edits with re-verification, local delete, and the single
 * "导出内容" Markdown ZIP command. Filters live in the URL hash.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { FragmentQuery, FragmentQueryResult } from '../../learning-core/query'
import type { FragmentRecord, FragmentKind, VerifiedResult } from '../../learning-core/types'
import type { FragmentPatch } from '../../learning-core/fragment-store'
import type { HighlightRecord } from '../../types/highlight'
import type { ClipRecord } from '../../types/clip'
import CaptureModal from '../content/capture/CaptureModal'
import { exportContentZip, downloadZip } from '../../utils/export-content'
import { connectionView, relativeTime, type Connection } from '../../utils/connection-status'
import { extensionPageUrl } from '../../utils/extension-pages'
import { ALL_KINDS, KIND_LABELS } from '../../utils/kind-labels'
import { uiText } from '../../utils/ui-text'
import { buildCaptureDraft, buildInspirationDraft, type CaptureDraft } from '../content/capture/capture-context'
import ScreenshotsView from './Screenshots'
import './style.css'

type View = 'fragments' | 'highlights' | 'clips' | 'screenshots'

const TIME_PRESETS: Array<{ id: string; label: string; from?: () => number }> = [
  { id: 'all', label: '全部时间' },
  { id: 'today', label: '今天', from: () => startOfLocalDay() },
  { id: '7d', label: '近 7 天', from: () => Date.now() - 7 * 86_400_000 },
  { id: '30d', label: '近 30 天', from: () => Date.now() - 30 * 86_400_000 },
]

function startOfLocalDay(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function readHashView(): { view: View; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#/, '')
  const [path = '', query = ''] = raw.split('?')
  const params = new URLSearchParams(query)
  const fromPath = path.replace(/^\//, '')
  const view: View = fromPath === 'highlights' || fromPath === 'clips' || fromPath === 'screenshots' ? fromPath : 'fragments'
  return { view, params }
}

export default function App() {
  const { view: initialView, params: initialParams } = useMemo(readHashView, [])
  const [view, setView] = useState<View>(initialView)

  // ── fragments state ──
  const [search, setSearch] = useState(initialParams.get('q') ?? '')
  const [kinds, setKinds] = useState<string[]>((initialParams.get('kinds') ?? '').split(',').filter(Boolean))
  const [hosts, setHosts] = useState<string[]>((initialParams.get('hosts') ?? '').split(',').filter(Boolean))
  const [tags, setTags] = useState<string[]>((initialParams.get('tags') ?? '').split(',').filter(Boolean))
  const [timePreset, setTimePreset] = useState(initialParams.get('t') ?? 'all')
  const [result, setResult] = useState<FragmentQueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [availableHosts, setAvailableHosts] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [stats, setStats] = useState<{ total: number; newThisWeek: number } | null>(null)
  const [editing, setEditing] = useState<FragmentRecord | null>(null)
  const [inspirationDraft, setInspirationDraft] = useState<CaptureDraft | null>(() =>
    initialParams.get('new') === 'inspiration' ? buildInspirationDraft() : null,
  )
  const [upgradeDraft, setUpgradeDraft] = useState<CaptureDraft | null>(null)
  const [exporting, setExporting] = useState(false)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(initialParams.get('desktop') === '1')
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean | null>(null)
  const [connectHintDismissed, setConnectHintDismissed] = useState<boolean | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exportRequested = useRef(initialParams.get('export') === '1')

  // ── highlights / clips state ──
  const [highlights, setHighlights] = useState<HighlightRecord[] | null>(null)
  const [clips, setClips] = useState<ClipRecord[] | null>(null)

  const query: FragmentQuery = useMemo(() => {
    const preset = TIME_PRESETS.find(p => p.id === timePreset)
    return {
      search: search.trim() || undefined,
      kinds: (kinds.length ? kinds : undefined) as FragmentKind[] | undefined,
      hosts: hosts.length ? hosts : undefined,
      tags: tags.length ? tags : undefined,
      capturedFrom: preset?.from?.(),
    }
  }, [search, kinds, hosts, tags, timePreset])

  // filters in URL, refresh-restorable (PRD §5.2)
  useEffect(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (kinds.length) params.set('kinds', kinds.join(','))
    if (hosts.length) params.set('hosts', hosts.join(','))
    if (tags.length) params.set('tags', tags.join(','))
    if (timePreset !== 'all') params.set('t', timePreset)
    const qs = params.toString()
    window.history.replaceState(null, '', `#${view}${qs ? `?${qs}` : ''}`)
  }, [view, search, kinds, hosts, tags, timePreset])

  const loadFragments = useCallback(
    async (cursor?: string) => {
      setLoading(true)
      try {
        const response = await MessageUtils.sendMessage<FragmentQueryResult>({ type: 'GET_FRAGMENTS', query: { ...query, limit: 50, cursor } })
        if (response.success && response.data) {
          const data: FragmentQueryResult = response.data
          setResult(prev => (cursor && prev ? { ...data, items: [...prev.items, ...data.items] } : data))
        }
      } finally {
        setLoading(false)
      }
    },
    [query],
  )

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => void loadFragments(), 250)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [loadFragments])

  useEffect(() => {
    void (async () => {
      const response = await MessageUtils.sendMessage<{ total: number; newThisWeek: number }>({ type: 'GET_FRAGMENT_STATS' })
      if (response.success && response.data) setStats(response.data)
      const all = await MessageUtils.sendMessage<FragmentQueryResult>({ type: 'GET_FRAGMENTS', query: { limit: 200 } })
      if (all.success && all.data) {
        setAvailableHosts([...new Set(all.data.items.map(f => f.context.sourceHost))].sort())
        setAvailableTags([...new Set(all.data.items.flatMap(f => f.tags))].sort())
      }
    })()
  }, [])

  useEffect(() => {
    chrome.storage.local.get(['annhubOnboardingDismissed', 'annhubConnectHintDismissed'], stored => {
      setOnboardingDismissed(!!stored['annhubOnboardingDismissed'])
      setConnectHintDismissed(!!stored['annhubConnectHintDismissed'])
    })
  }, [])

  const dismissOnboarding = () => {
    chrome.storage.local.set({ annhubOnboardingDismissed: true }, () => setOnboardingDismissed(true))
  }

  const dismissConnectHint = () => {
    chrome.storage.local.set({ annhubConnectHintDismissed: true }, () => setConnectHintDismissed(true))
  }

  const refreshConnection = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{
      status: { online: boolean; paired: boolean; detail: string }
      pending: { pendingFragments: number; pendingAssets: number }
      state: { lastError?: string; lastSyncAt?: number }
    }>({ type: 'GET_DESKTOP_DIRECT_CONNECT' })
    if (response.success && response.data) {
      setConnection({ ...response.data.status, ...response.data.pending, lastError: response.data.state.lastError, lastSyncAt: response.data.state.lastSyncAt })
    }
  }, [])

  useEffect(() => {
    void refreshConnection()
  }, [refreshConnection])

  const loadHighlights = useCallback(async () => {
    const response = await MessageUtils.sendMessage<HighlightRecord[]>({ type: 'GET_HIGHLIGHTS' })
    setHighlights(response.success && Array.isArray(response.data) ? response.data.filter(h => h.status === 'active') : [])
  }, [])

  useEffect(() => {
    if (view === 'highlights' && highlights === null) void loadHighlights()
  }, [view, highlights, loadHighlights])

  const loadClips = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{ 'ann-clips'?: ClipRecord[] }>({ type: 'GET_STORAGE', key: 'ann-clips' })
    if (response.success && response.data) {
      setClips(response.data['ann-clips'] ?? [])
    } else {
      setClips([])
    }
  }, [])

  useEffect(() => {
    if (view === 'clips' && clips === null) void loadClips()
  }, [view, clips, loadClips])

  // ── actions ──
  const deleteFragment = async (id: string) => {
    if (!window.confirm('删除这条碎片？仅作用于本扩展，不影响 Desktop 已接收的副本。')) return
    await MessageUtils.sendMessage({ type: 'DELETE_FRAGMENT', id })
    setResult(prev => (prev ? { ...prev, items: prev.items.filter(f => f.id !== id), total: prev.total - 1 } : prev))
  }

  const exportZip = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { blob, manifest } = await exportContentZip()
      downloadZip(blob)
      if (manifest.partial) {
        window.alert(`部分导出：${manifest.missingAssets.length} 个图片资产缺失，详见 ZIP 内 README.md。`)
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }, [exporting])

  // `export=1` (from the capture window's save-failure exit) starts the export once.
  useEffect(() => {
    if (!exportRequested.current) return
    exportRequested.current = false
    void exportZip()
  }, [exportZip])

  const retryDelivery = async () => {
    await MessageUtils.sendMessage({ type: 'FLUSH_DESKTOP_DIRECT_CONNECT' })
    await refreshConnection()
  }

  const toggleIn = (list: string[], value: string, setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value])
  }

  const clearFilters = () => {
    setKinds([])
    setHosts([])
    setTags([])
    setTimePreset('all')
    setSearch('')
  }

  const hasFilters = kinds.length + hosts.length + tags.length > 0 || timePreset !== 'all' || !!search.trim()
  const conn = connection ? connectionView(connection) : null
  const settingsUrl = extensionPageUrl('settings')
  const inLibrary = view === 'fragments' || view === 'highlights' || view === 'clips'

  return (
    <div className="library-page" data-testid="library-page" style={{ position: 'relative' }}>
      <header className="library-header">
        <nav className="library-nav" aria-label="AnnHub" data-testid="primary-nav">
          <strong className="library-brand">AnnHub</strong>
          <button className={inLibrary ? 'active' : ''} aria-current={inLibrary ? 'page' : undefined} onClick={() => setView('fragments')} data-testid="view-fragments">
            碎片库
          </button>
          <button
            className={view === 'screenshots' ? 'active' : ''}
            aria-current={view === 'screenshots' ? 'page' : undefined}
            onClick={() => setView('screenshots')}
            data-testid="view-screenshots"
          >
            截图集
          </button>
          <a href={settingsUrl} data-testid="nav-settings">
            设置
          </a>
        </nav>

        {inLibrary && (
          <div className="library-sub" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {stats && view === 'fragments' && (
              <span className="library-stats">
                {stats.total} 条碎片 · 本周新增 {stats.newThisWeek}
              </span>
            )}
            {conn && connection && (
              <span className="connection-chip" data-state={conn.state} title={connection.detail} data-testid="desktop-connection">
                <span className="status-dot" aria-hidden="true" />
                Desktop：{conn.label}
              </span>
            )}
            {conn?.state === 'unpaired' && (
              <a className="badge" href={settingsUrl} data-testid="pair-link">
                去配对
              </a>
            )}
            {conn?.state === 'error' && (
              <>
                <button className="badge" onClick={retryDelivery} data-testid="retry-delivery">
                  重试
                </button>
                <a className="badge" href={settingsUrl}>
                  查看详情
                </a>
                <button className="badge" onClick={() => void exportZip()} disabled={exporting} data-testid="export-on-error">
                  导出内容
                </button>
              </>
            )}
            {conn?.state === 'pending' && (
              <button className="badge" onClick={retryDelivery}>
                立即重试
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button className="primary" onClick={() => setInspirationDraft(buildInspirationDraft())} data-testid="new-inspiration">
              + 新建灵感
            </button>
            <button className="primary-outline" onClick={() => setDesktopPanelOpen(!desktopPanelOpen)} data-testid="open-desktop">
              打开 Desktop
            </button>
            <span style={{ position: 'relative' }}>
              <button className="badge" onClick={() => setMoreMenuOpen(!moreMenuOpen)} aria-haspopup="menu" aria-expanded={moreMenuOpen} data-testid="more-menu">
                更多 ▾
              </button>
              {moreMenuOpen && (
                <span className="more-menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      void exportZip()
                    }}
                    disabled={exporting}
                    data-testid="export-content"
                  >
                    {exporting ? '导出中…' : '导出内容（Markdown ZIP）'}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      setView('highlights')
                    }}
                    data-testid="view-highlights"
                  >
                    高亮列表
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      setView('clips')
                    }}
                    data-testid="view-clips"
                  >
                    剪藏列表
                  </button>
                </span>
              )}
            </span>
            {desktopPanelOpen && (
              <span className="desktop-panel" data-testid="desktop-panel">
                <strong>Desktop 说明</strong>
                <br />
                扩展不依赖 Desktop 也能采集、检索与导出。要在 Desktop 复习：启动 Mac 上的 AnnHub Desktop 应用，在其「系统」页复制配对码，然后到
                <a href={settingsUrl} target="_blank" rel="noreferrer">
                  设置 → Desktop 连接
                </a>
                粘贴并保存。
                {connection?.online && <span style={{ color: '#226a3c' }}>当前已连接：{connection.detail}。</span>}
                <button className="badge" style={{ marginTop: 6 }} onClick={() => setDesktopPanelOpen(false)}>
                  知道了
                </button>
              </span>
            )}
          </div>
        )}
      </header>

      {(view === 'highlights' || view === 'clips') && (
        <div className="library-crumb" data-testid="list-crumb">
          <button className="badge" onClick={() => setView('fragments')}>
            ← 碎片库
          </button>
          <strong>{view === 'highlights' ? '高亮列表' : '剪藏列表'}</strong>
          <span className="library-sub">
            {view === 'highlights' ? (highlights ? `${highlights.length} 条高亮` : '') : clips ? `${clips.length} 条剪藏` : ''}
          </span>
        </div>
      )}

      {view === 'fragments' && (
        <>
          {onboardingDismissed === false && (
            <div className="fragment-card" style={{ border: '1px dashed #b6bac3', background: '#f8f9fb' }} data-testid="onboarding-guide">
              <div className="fragment-content">{uiText('library.onboarding.title')}</div>
              <div className="fragment-excerpt">{uiText('library.onboarding.body')}</div>
              <div className="fragment-actions">
                <button onClick={() => window.open(chrome.runtime.getURL('/sample.html'), '_blank')} data-testid="onboarding-sample">
                  打开示例页面
                </button>
                <button onClick={dismissOnboarding} data-testid="onboarding-dismiss">
                  知道了
                </button>
              </div>
            </div>
          )}
          {connectHintDismissed === false && connection && !connection.paired && (stats?.total ?? 0) > 0 && (
            <div className="fragment-card" style={{ border: '1px solid #d6d8de', background: '#fff' }} data-testid="connect-hint">
              <div className="fragment-content">连接 Desktop 开始复习</div>
              <ol className="fragment-excerpt" style={{ paddingLeft: 18 }}>
                <li>下载并启动 Desktop</li>
                <li>在 Desktop 的「系统」页复制配对码</li>
                <li>在扩展的设置中输入配对码，状态变为「已连接」</li>
              </ol>
              <div className="fragment-actions">
                <a href={settingsUrl}>去设置</a>
                <button onClick={dismissConnectHint} data-testid="connect-hint-dismiss">
                  跳过
                </button>
              </div>
            </div>
          )}
          <div className="library-search">
            <input type="search" placeholder={uiText('library.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} data-testid="fragment-search" />
          </div>
          <div className="library-filters">
            <div className="filter-row">
              <span className="filter-label">类型</span>
              <div className="filter-options">
                {ALL_KINDS.map(kind => (
                  <button key={kind} className={`filter-chip${kinds.includes(kind) ? ' active' : ''}`} onClick={() => toggleIn(kinds, kind, setKinds)} data-testid={`filter-kind-${kind}`}>
                    {KIND_LABELS[kind]}
                  </button>
                ))}
              </div>
            </div>
            {availableHosts.length > 0 && (
              <div className="filter-row">
                <span className="filter-label">来源</span>
                <div className="filter-options">
                  {availableHosts.slice(0, 12).map(host => (
                    <button key={host} className={`filter-chip${hosts.includes(host) ? ' active' : ''}`} onClick={() => toggleIn(hosts, host, setHosts)}>
                      {host}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {availableTags.length > 0 && (
              <div className="filter-row">
                <span className="filter-label">标签</span>
                <div className="filter-options">
                  {availableTags.slice(0, 12).map(tag => (
                    <button key={tag} className={`filter-chip${tags.includes(tag) ? ' active' : ''}`} onClick={() => toggleIn(tags, tag, setTags)}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="filter-row">
              <span className="filter-label">时间</span>
              <div className="filter-options">
                {TIME_PRESETS.map(p => (
                  <button key={p.id} className={`filter-chip${timePreset === p.id ? ' active' : ''}`} onClick={() => setTimePreset(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              {result && (
                <span className="library-sub" data-testid="result-count">
                  共 {result.total} 条
                </span>
              )}
              {hasFilters && (
                <button className="clear-filters" onClick={clearFilters}>
                  清除筛选
                </button>
              )}
            </div>
          </div>

          <main className="library-list" data-testid="fragment-list">
            {result === null || (loading && result.items.length === 0) ? (
              <p className="library-empty">加载中…</p>
            ) : result.items.length === 0 ? (
              hasFilters ? (
                <div className="library-empty" data-testid="fragment-empty">
                  <p>{uiText('library.noMatch')}</p>
                  <button className="clear-filters" onClick={clearFilters}>
                    清除筛选
                  </button>
                </div>
              ) : (
                <div className="library-empty" data-testid="fragment-empty">
                  <p>{uiText('library.empty.title')}</p>
                  <p className="library-empty-actions">
                    <span>{uiText('library.empty.hint')}</span>
                    <button className="primary" onClick={() => setInspirationDraft(buildInspirationDraft())}>
                      新建一条灵感
                    </button>
                    <button className="badge" onClick={() => window.open(chrome.runtime.getURL('/sample.html'), '_blank')} data-testid="open-sample">
                      打开示例页面
                    </button>
                  </p>
                </div>
              )
            ) : (
              <>
                {result.items.map(fragment => (
                  <FragmentCard key={fragment.id} fragment={fragment} onEdit={() => setEditing(fragment)} onDelete={() => deleteFragment(fragment.id)} />
                ))}
                {result.nextCursor && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
                    <button className="badge" onClick={() => void loadFragments(result.nextCursor)} data-testid="load-more">
                      加载更多（{result.items.length}/{result.total}）
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}

      {view === 'highlights' && <HighlightsView highlights={highlights} onUpgrade={setUpgradeDraft} onReload={loadHighlights} />}
      {view === 'clips' && <ClipsView clips={clips} onUpgrade={setUpgradeDraft} onReload={loadClips} />}
      {view === 'screenshots' && <ScreenshotsView onSaved={() => void loadFragments()} />}

      {editing && (
        <FragmentEditor
          fragment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void loadFragments()
          }}
        />
      )}

      {(inspirationDraft || upgradeDraft) && (
        <CaptureModal
          draft={(inspirationDraft ?? upgradeDraft)!}
          deepMode={false}
          selectedRange={null}
          createHighlight={async () => null}
          manualInspiration={!!inspirationDraft}
          onClose={() => {
            setInspirationDraft(null)
            setUpgradeDraft(null)
            void loadFragments()
          }}
        />
      )}
    </div>
  )
}

// ── fragment card (PRD §5.3: card shows only the essentials) ─────────────

function FragmentCard({ fragment, onEdit, onDelete }: { fragment: FragmentRecord; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const v = fragment.processing.verified
  return (
    <article className="fragment-card" data-testid="fragment-card">
      <div
        className="fragment-headline"
        onClick={() => setOpen(!open)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(!open)}
      >
        <span className="badge badge-platform">{KIND_LABELS[fragment.kind]}</span>
        <span className="fragment-content">{fragment.content}</span>
      </div>
      <div className="fragment-excerpt">{fragment.context.excerpt.slice(0, 140)}</div>
      <div className="fragment-badges">
        <span className="fragment-date">
          {fragment.context.sourceHost} · {relativeTime(fragment.context.capturedAt)}
          {fragment.review.lastReviewedAt ? ` · 最近复习 ${relativeTime(fragment.review.lastReviewedAt)}` : ''}
        </span>
        <span className="fragment-tags">
          {fragment.tags.slice(0, 6).map(tag => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </span>
        <span style={{ flex: 1 }} />
        <a href={fragment.context.sourceUrl} target="_blank" rel="noreferrer" title="回到原文">
          原文
        </a>
      </div>
      {open && (
        <div className="fragment-details" data-testid="fragment-details">
          {fragment.processing.guess && (
            <div>
              <div className="detail-label">理解</div>
              <p className="fragment-guess">{fragment.processing.guess}</p>
            </div>
          )}
          <div>
            <div className="detail-label">
              核验（{v.source === 'source-material' ? '原文材料' : v.source === 'manual' ? '手工核对' : 'LLM'}，{new Date(v.confirmedAt).toLocaleString()}）
            </div>
            {v.summary && <p className="fragment-summary">{v.summary}</p>}
            {!v.summary && !v.notes && <p className="fragment-summary" style={{ opacity: 0.6 }}>已确认，无摘要</p>}
            {v.notes && <p className="fragment-summary">{v.notes}</p>}
          </div>
          <div>
            <div className="detail-label">应用</div>
            <p className="fragment-use">{fragment.processing.use}</p>
          </div>
          <div className="fragment-actions">
            <button onClick={onEdit} data-testid="fragment-edit">
              编辑
            </button>
            <button className="danger" onClick={onDelete} data-testid="fragment-delete">
              删除
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

// ── capture-field editor (PRD §5.4) ─────────────────────────────────────

function FragmentEditor({ fragment, onClose, onSaved }: { fragment: FragmentRecord; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<string>(fragment.kind)
  const [content, setContent] = useState(fragment.content)
  const [excerpt, setExcerpt] = useState(fragment.context.excerpt)
  const [sourceUrl, setSourceUrl] = useState(fragment.context.sourceUrl)
  const [useText, setUse] = useState(fragment.processing.use)
  const [guess, setGuess] = useState(fragment.processing.guess ?? '')
  const [tags, setTags] = useState(fragment.tags.join(', '))
  const [reverified, setReverified] = useState<VerifiedResult | null>(null)
  const [summary, setSummary] = useState(fragment.processing.verified.summary ?? '')
  const [notes, setNotes] = useState(fragment.processing.verified.notes ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const verifiedMetaChanged = summary.trim() !== (fragment.processing.verified.summary ?? '') || notes.trim() !== (fragment.processing.verified.notes ?? '')

  const protectedChanged =
    kind !== fragment.kind ||
    content.trim() !== fragment.content ||
    excerpt !== fragment.context.excerpt ||
    sourceUrl.trim() !== fragment.context.sourceUrl

  const confirmReverify = () => {
    setReverified({ confirmedAt: Date.now(), source: 'manual' })
  }

  const save = async () => {
    if (saving) return
    if (protectedChanged && !reverified) {
      setError('修改了内容、语境、来源或类型，需要重新确认核验。')
      return
    }
    const patch: FragmentPatch = {
      kind: kind as FragmentKind,
      content: content.trim(),
      excerpt,
      sourceUrl: sourceUrl.trim(),
      use: useText.trim(),
      guess: guess.trim() || undefined,
      tags: tags
        .split(/[,，]/)
        .map(t => t.trim())
        .filter(Boolean),
      // Editing optional 核验摘要/备注 never clears the confirmation (§5.4).
      ...(reverified
        ? { verified: reverified }
        : verifiedMetaChanged
          ? { verified: { ...fragment.processing.verified, summary: summary.trim() || undefined, notes: notes.trim() || undefined } }
          : {}),
    }
    setSaving(true)
    setError('')
    try {
      const response = await MessageUtils.sendMessage({ type: 'UPDATE_FRAGMENT', id: fragment.id, patch })
      if (!response.success) throw new Error(response.error || '保存失败')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败（输入已保留）')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fragment-editor" data-ann-ui="fragment-editor">
      <h3>编辑碎片（当前修订 {fragment.captureRevision}）</h3>
      <label className="filter-label">类型</label>
      <select value={kind} onChange={e => setKind(e.target.value)}>
        {ALL_KINDS.map(k => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <label className="filter-label">内容</label>
      <textarea rows={2} maxLength={500} value={content} onChange={e => setContent(e.target.value)} />
      <label className="filter-label">上下文（需包含内容）</label>
      <textarea rows={3} maxLength={2000} value={excerpt} onChange={e => setExcerpt(e.target.value)} />
      <label className="filter-label">来源 URL</label>
      <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
      <label className="filter-label">理解</label>
      <textarea rows={2} value={guess} onChange={e => setGuess(e.target.value)} />
      <label className="filter-label">应用</label>
      <textarea rows={3} value={useText} onChange={e => setUse(e.target.value)} />
      <label className="filter-label">核验摘要（可选，编辑不影响已确认状态）</label>
      <textarea rows={2} value={summary} onChange={e => setSummary(e.target.value)} data-testid="verified-summary-input" />
      <label className="filter-label">核验备注（可选）</label>
      <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      <label className="filter-label">标签（逗号分隔）</label>
      <input value={tags} onChange={e => setTags(e.target.value)} />
      {protectedChanged && (
        <div className="editor-note">
          {reverified ? (
            <span>已重新确认核验（{new Date(reverified.confirmedAt).toLocaleTimeString()}）。</span>
          ) : (
            <button className="badge" onClick={confirmReverify} data-testid="reverify">
              内容已修改 — 重新确认核验
            </button>
          )}
        </div>
      )}
      {error && <p className="editor-error">{error}</p>}
      <div className="editor-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" onClick={save} disabled={saving} data-testid="editor-save">
          {saving ? '保存中…' : '保存修改'}
        </button>
      </div>
    </div>
  )
}

// ── highlights view: upgrade path into fragments (PRD §3.2) ─────────────

function HighlightsView({ highlights, onUpgrade, onReload }: { highlights: HighlightRecord[] | null; onUpgrade: (draft: CaptureDraft) => void; onReload: () => void }) {
  if (highlights === null) {
    return (
      <main className="library-list">
        <p className="library-empty">加载中…</p>
      </main>
    )
  }
  const remove = async (id: string) => {
    if (!window.confirm('删除该高亮？')) return
    await MessageUtils.sendMessage({ type: 'DELETE_HIGHLIGHT', data: { id } })
    onReload()
  }
  return (
    <main className="library-list" data-testid="highlight-list">
      {highlights.length === 0 ? (
        <div className="library-empty" data-testid="highlight-empty">
          <p>还没有高亮。在网页选中文本后选择「高亮」。</p>
        </div>
      ) : (
        highlights.map(h => (
          <article key={h.id} className="fragment-card" data-testid="highlight-card">
            <div className="fragment-content">{h.originalText}</div>
            {h.user_note && <div className="fragment-excerpt">备注：{h.user_note}</div>}
            <div className="fragment-badges">
              <span className="fragment-date">
                {h.domain} · {new Date(h.timestamp).toLocaleDateString()}
              </span>
              <span style={{ flex: 1 }} />
              <a href={h.metadata.sourceUrl ?? h.url} target="_blank" rel="noreferrer">
                原文
              </a>
            </div>
            <div className="fragment-actions">
              <button
                data-testid="highlight-upgrade"
                onClick={() =>
                  onUpgrade(
                    buildCaptureDraft({
                      content: h.originalText,
                      containerText: `${h.context.before}${h.originalText}${h.context.after}`,
                      selectionStart: h.context.before.length,
                      selectionEnd: h.context.before.length + h.originalText.length,
                      sourceUrl: h.metadata.sourceUrl ?? h.url,
                      sourceTitle: h.metadata.pageTitle ?? '',
                    }),
                  )
                }
              >
                {uiText('library.upgrade')}
              </button>
              <button className="danger" onClick={() => remove(h.id)}>
                删除
              </button>
            </div>
          </article>
        ))
      )}
    </main>
  )
}

// ── clips view: upgrade path into fragments (PRD §3.3) ──────────────────

function ClipsView({ clips, onUpgrade }: { clips: ClipRecord[] | null; onUpgrade: (draft: CaptureDraft) => void; onReload: () => void }) {
  if (clips === null) {
    return (
      <main className="library-list">
        <p className="library-empty">加载中…</p>
      </main>
    )
  }
  return (
    <main className="library-list" data-testid="clip-list">
      {clips.length === 0 ? (
        <div className="library-empty" data-testid="clip-empty">
          <p>还没有剪藏。在网页选中文本后选择「剪藏」。</p>
        </div>
      ) : (
        clips.map(c => (
          <article key={c.id} className="fragment-card" data-testid="clip-card">
            <div className="fragment-content">{c.content}</div>
            {c.user_note && <div className="fragment-excerpt">备注：{c.user_note}</div>}
            <div className="fragment-badges">
              <span className="fragment-date">
                {safeClipHost(c)} · {relativeTime(Date.parse(c.capture_time) || Date.now())}
              </span>
              <span style={{ flex: 1 }} />
              <a href={c.source_detail_url ?? c.source_url} target="_blank" rel="noreferrer">
                原文
              </a>
            </div>
            <div className="fragment-actions">
              <button
                data-testid="clip-upgrade"
                onClick={() =>
                  onUpgrade(
                    buildCaptureDraft({
                      content: c.content,
                      containerText: `${c.context_before}${c.content}${c.context_after}`,
                      selectionStart: c.context_before.length,
                      selectionEnd: c.context_before.length + c.content.length,
                      sourceUrl: c.source_detail_url ?? c.source_url,
                      sourceTitle: c.source_title ?? '',
                    }),
                  )
                }
              >
                {uiText('library.convert')}
              </button>
            </div>
          </article>
        ))
      )}
    </main>
  )
}

function safeClipHost(c: ClipRecord): string {
  try {
    return new URL(c.source_url).hostname
  } catch {
    return c.source_url
  }
}
