/**
 * 碎片库 — the extension's library page (extension PRD §2.2/§5).
 * Three views: 碎片 (fragments) | 高亮 (highlights) | 截图 (screenshots).
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
import { appliedFragmentIds, weeklyAppliedCounts } from '../../learning-core/output'
import type { WritingTaskRecord } from '../../learning-core/types'
import { buildCaptureDraft, buildInspirationDraft, type CaptureDraft } from '../content/capture/capture-context'
import ScreenshotsView from './Screenshots'
import './style.css'

type View = 'fragments' | 'highlights' | 'clips' | 'screenshots'

const KIND_LABELS: Record<string, string> = {
  excerpt: '摘录',
  concept: '概念',
  claim: '主张',
  procedure: '方法',
  decision: '决策',
  question: '问题',
  inspiration: '灵感',
  visual: '视觉',
}

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
  const [inspirationDraft, setInspirationDraft] = useState<CaptureDraft | null>(null)
  const [upgradeDraft, setUpgradeDraft] = useState<CaptureDraft | null>(null)
  const [exporting, setExporting] = useState(false)
  const [connection, setConnection] = useState<{
    online: boolean
    paired: boolean
    detail: string
    pendingFragments: number
    pendingAssets: number
    lastError?: string
  } | null>(null)
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [writingTasks, setWritingTasks] = useState<WritingTaskRecord[] | null>(null)
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const appliedIds = useMemo(() => (writingTasks ? appliedFragmentIds(writingTasks) : new Set<string>()), [writingTasks])
  const weeklyApplied = useMemo(() => (writingTasks ? weeklyAppliedCounts(writingTasks) : new Map<string, number>()), [writingTasks])

  // ── highlights state ──
  const [highlights, setHighlights] = useState<HighlightRecord[] | null>(null)

  // ── clips state ──
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
    void (async () => {
      const response = await MessageUtils.sendMessage<WritingTaskRecord[]>({ type: 'GET_WRITING_TASKS' })
      setWritingTasks(response.success && Array.isArray(response.data) ? response.data : [])
      chrome.storage.local.get('annhubOnboardingDismissed', result => setOnboardingDismissed(!!result['annhubOnboardingDismissed']))
    })()
  }, [])

  const dismissOnboarding = () => {
    chrome.storage.local.set({ annhubOnboardingDismissed: true }, () => setOnboardingDismissed(true))
  }

  const refreshConnection = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{
      status: { online: boolean; paired: boolean; detail: string }
      pending: { pendingFragments: number; pendingAssets: number }
      state: { lastError?: string }
    }>({ type: 'GET_DESKTOP_DIRECT_CONNECT' })
    if (response.success && response.data) {
      setConnection({ ...response.data.status, ...response.data.pending, lastError: response.data.state.lastError })
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

  const exportZip = async () => {
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
  }

  const retryDelivery = async () => {
    await MessageUtils.sendMessage({ type: 'FLUSH_DESKTOP_DIRECT_CONNECT' })
    await refreshConnection()
  }

  const toggleIn = (list: string[], value: string, setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value])
  }

  const hasFilters = kinds.length + hosts.length + tags.length > 0 || timePreset !== 'all' || !!search.trim()

  return (
    <div className="words-page" data-testid="words-page" style={{ position: 'relative' }}>
      <header className="words-header">
        <div className="words-sub" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <strong>碎片库</strong>
          {stats && (
            <span className="words-stats">
              {stats.total} 条碎片 · 本周新增 {stats.newThisWeek}
              {weeklyApplied.size > 0 ? ` · 本周应用 ${weeklyApplied.size}` : ''}
            </span>
          )}
          {connection && (
            <span
              className={`badge ${connection.online ? '' : 'badge-register-casual'}`}
              title={connection.detail}
              data-testid="desktop-connection"
            >
              Desktop：
              {!connection.paired ? '未配置' : connection.lastError ? '交付错误' : connection.online ? '已连接' : '未连接'}
              {connection.pendingFragments + connection.pendingAssets > 0 ? ` · 待发送 ${connection.pendingFragments + connection.pendingAssets}` : ''}
            </span>
          )}
          {connection && !connection.paired && (
            <button className="badge" onClick={() => window.open(chrome.runtime.getURL('/options/index.html#/settings'), '_blank')}>
              去配对
            </button>
          )}
          {connection && connection.lastError && (
            <>
              <button className="badge" onClick={retryDelivery} data-testid="retry-delivery">
                重试
              </button>
              <button className="badge" onClick={() => window.open(chrome.runtime.getURL('/options/index.html#/settings'), '_blank')}>
                查看详情
              </button>
            </>
          )}
          {connection && connection.paired && !connection.lastError && connection.pendingFragments + connection.pendingAssets > 0 && (
            <button className="badge" onClick={retryDelivery}>
              立即重试
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="primary" onClick={() => setInspirationDraft(buildInspirationDraft())} data-testid="new-inspiration">
            + 新建灵感
          </button>
          <button className="badge" onClick={() => setDesktopPanelOpen(!desktopPanelOpen)} data-testid="open-desktop">
            打开 Desktop
          </button>
          <span style={{ position: 'relative' }}>
            <button className="badge" onClick={() => setMoreMenuOpen(!moreMenuOpen)} data-testid="more-menu">
              更多 ▾
            </button>
            {moreMenuOpen && (
              <span
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '120%',
                  zIndex: 30,
                  background: '#fff',
                  border: '1px solid #d6d8de',
                  borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 160,
                  overflow: 'hidden',
                }}
              >
                <button
                  className="badge"
                  style={{ border: 'none', borderRadius: 0, textAlign: 'left' }}
                  onClick={() => {
                    setMoreMenuOpen(false)
                    void exportZip()
                  }}
                  disabled={exporting}
                  data-testid="export-content"
                >
                  {exporting ? '导出中…' : '导出内容（Markdown ZIP）'}
                </button>
              </span>
            )}
          </span>
          {desktopPanelOpen && (
            <span
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                top: 96,
                zIndex: 30,
                background: '#f8f9fb',
                border: '1px solid #d6d8de',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 13,
                color: '#3c4048',
                lineHeight: 1.7,
              }}
              data-testid="desktop-panel"
            >
              <strong>Desktop 说明</strong>
              <br />
              扩展不依赖 Desktop 也能采集、检索与导出。要使用复习与输出工坊：启动 Mac 上的 AnnHub Desktop 应用，在其「系统」页复制配对 Token，然后到
              <a href={chrome.runtime.getURL('/options/index.html#/settings')} target="_blank" rel="noreferrer">
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
        <div className="words-view-switch" role="tablist">
          {(['fragments', 'highlights', 'clips', 'screenshots'] as View[]).map(v => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'active' : ''} onClick={() => setView(v)} data-testid={`view-${v}`}>
              {v === 'fragments' ? '碎片' : v === 'highlights' ? '高亮' : v === 'clips' ? '剪藏' : '截图'}
            </button>
          ))}
        </div>
      </header>

      {view === 'fragments' && (
        <>
          {onboardingDismissed === false && (
            <div className="fragment-card" style={{ border: '1px dashed #b6bac3', background: '#f8f9fb' }} data-testid="onboarding-guide">
              <div className="fragment-content">高亮 ≠ 碎片</div>
              <div className="fragment-excerpt">
                高亮只标记页面位置；剪藏保存原文备查；只有完成「核验 + 应用」的 Fragment 才进入复习与应用。不想内化的内容，用高亮或剪藏就够了。
              </div>
              <div className="fragment-actions">
                <button onClick={dismissOnboarding} data-testid="onboarding-dismiss">
                  知道了
                </button>
              </div>
            </div>
          )}
          <div className="words-search">
            <input
              type="search"
              placeholder="搜索内容、理解、核验、应用、标签、来源…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="fragment-search"
            />
          </div>
          <div className="words-filters">
            <div className="filter-row">
              <span className="filter-label">类型</span>
              <div className="filter-options">
                {Object.entries(KIND_LABELS).map(([kind, label]) => (
                  <button key={kind} className={`filter-chip${kinds.includes(kind) ? ' active' : ''}`} onClick={() => toggleIn(kinds, kind, setKinds)} data-testid={`filter-kind-${kind}`}>
                    {label}
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
                    <button key={tag} className={`filter-chip${tags.includes(tag) ? 'active' : ''}`} onClick={() => toggleIn(tags, tag, setTags)}>
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
                  <button key={p.id} className={`filter-chip${timePreset === p.id ? 'active' : ''}`} onClick={() => setTimePreset(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              {hasFilters && (
                <button
                  className="clear-filters"
                  onClick={() => {
                    setKinds([])
                    setHosts([])
                    setTags([])
                    setTimePreset('all')
                    setSearch('')
                  }}
                >
                  清除筛选
                </button>
              )}
            </div>
          </div>

          <main className="words-list" data-testid="fragment-list">
            {result === null || (loading && result.items.length === 0) ? (
              <p className="words-empty">加载中…</p>
            ) : result.items.length === 0 ? (
              hasFilters ? (
                <div className="words-empty" data-testid="fragment-empty">
                  <p>没有匹配的碎片。</p>
                  <button
                    className="clear-filters"
                    onClick={() => {
                      setKinds([])
                      setHosts([])
                      setTags([])
                      setTimePreset('all')
                      setSearch('')
                    }}
                  >
                    清除筛选
                  </button>
                </div>
              ) : (
                <div className="words-empty" data-testid="fragment-empty">
                  <p>选中网页中的一段内容，保存你的第一个知识碎片。</p>
                  <p className="words-empty-actions">
                    <span>在页面上选中文本后选择「Fragment」，或</span>
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
                  <FragmentCard key={fragment.id} fragment={fragment} applied={appliedIds.has(fragment.id)} onEdit={() => setEditing(fragment)} onDelete={() => deleteFragment(fragment.id)} />
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

function FragmentCard({ fragment, applied, onEdit, onDelete }: { fragment: FragmentRecord; applied: boolean; onEdit: () => void; onDelete: () => void }) {
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
        <span className="badge badge-platform">{KIND_LABELS[fragment.kind] ?? fragment.kind}</span>
        <span className="fragment-content">{fragment.content}</span>
      </div>
      <div className="fragment-excerpt">{fragment.context.excerpt.slice(0, 140)}</div>
      <div className="fragment-badges">
        <span className="fragment-date">
          {fragment.context.sourceHost} · {relativeTime(fragment.context.capturedAt)}
          {fragment.review.lastReviewedAt ? ` · 最近复习 ${relativeTime(fragment.review.lastReviewedAt)}` : ''}
        </span>
        {applied && (
          <span className="badge" title="已确认应用于某次输出">
            已应用
          </span>
        )}
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
        {Object.entries(KIND_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
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
      <main className="words-list">
        <p className="words-empty">加载中…</p>
      </main>
    )
  }
  const remove = async (id: string) => {
    if (!window.confirm('删除该高亮？')) return
    await MessageUtils.sendMessage({ type: 'DELETE_HIGHLIGHT', data: { id } })
    onReload()
  }
  return (
    <main className="words-list" data-testid="highlight-list">
      {highlights.length === 0 ? (
        <div className="words-empty" data-testid="highlight-empty">
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
                升级为 Fragment
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
      <main className="words-list">
        <p className="words-empty">加载中…</p>
      </main>
    )
  }
  return (
    <main className="words-list" data-testid="clip-list">
      {clips.length === 0 ? (
        <div className="words-empty" data-testid="clip-empty">
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
                转为 Fragment
              </button>
            </div>
          </article>
        ))
      )}
    </main>
  )
}

/** 相对时间（PRD §5.3）：刚刚 / N 分钟前 / N 小时前 / N 天前 / 超过 7 天回落日期。 */
export function relativeTime(epochMs: number, now = Date.now()): string {
  const delta = now - epochMs
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)} 天前`
  return new Date(epochMs).toLocaleDateString()
}

function safeClipHost(c: ClipRecord): string {
  try {
    return new URL(c.source_url).hostname
  } catch {
    return c.source_url
  }
}
