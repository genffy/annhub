/**
 * 设置页 — four blocks (extension PRD §2.2 / options-v2 alignment):
 *   1. Desktop 连接（配对、状态、待发送与重试）
 *   2. 采集偏好（深度模式）
 *   3. LLM 配置（可选加速器；Provider 直连）
 *   4. 数据管理（唯一的 Markdown ZIP 导出 + 存储概况）
 * Old English-specialty tabs (vocab/eudic/logseq/family mode) are removed per
 * roadmap R1.1; the vocab annotation layer itself stays dormant in content.
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../../utils/message'
import type { LlmConfig } from '../../../types/vocabulary'
import { PageHeader, SettingsSection, StatusMessage } from '../components/ui'

interface DirectConnectBlock {
  config: { endpoint: string; autoSync: boolean; hasToken: boolean }
  status: { online: boolean; paired: boolean; detail: string; lastSyncAt?: number }
  pending: { pendingFragments: number; pendingAssets: number }
  state: {
    lastError?: string
    lastResult?: { deliveredFragments: number; deliveredAssets: number }
    lastPullAt?: number
    lastPull?: { appliedChanges: number; reports: number; errors: string[] }
  }
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="设置" description="Desktop 连接、采集偏好、LLM 与数据管理" />
      <DesktopConnectionCard />
      <SyncPanelCard />
      <CapturePreferenceCard />
      <LlmCard />
      <DataManagementCard />
      <OrphanAssetsCard />
      <MetricsCard />
    </div>
  )
}

function DesktopConnectionCard() {
  const [block, setBlock] = useState<DirectConnectBlock | null>(null)
  const [endpoint, setEndpoint] = useState('')
  const [token, setToken] = useState('')
  const [autoSync, setAutoSync] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<DirectConnectBlock>({ type: 'GET_DESKTOP_DIRECT_CONNECT' })
    if (response.success && response.data) {
      setBlock(response.data)
      setEndpoint(response.data.config.endpoint)
      setAutoSync(response.data.config.autoSync)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setBusy(true)
    try {
      // The stored pairing code is never sent back to this page: an empty field keeps it.
      const typed = token.trim()
      const response = await MessageUtils.sendMessage({ type: 'SET_DESKTOP_DIRECT_CONNECT', config: { endpoint, autoSync, ...(typed ? { token: typed } : {}) } })
      setMessage(response.success ? { kind: 'success', text: '已保存 Desktop 连接配置' } : { kind: 'error', text: response.error || '保存失败' })
      if (response.success) setToken('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const unpair = async () => {
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage({ type: 'SET_DESKTOP_DIRECT_CONNECT', config: { token: '' } })
      setMessage(response.success ? { kind: 'success', text: '已取消配对，保存的配对码已清除' } : { kind: 'error', text: response.error || '取消配对失败' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const flush = async () => {
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage<{ deliveredFragments: number; deliveredAssets: number; errors: string[] }>({ type: 'FLUSH_DESKTOP_DIRECT_CONNECT' })
      if (response.success && response.data) {
        setMessage(
          response.data.errors.length
            ? { kind: 'error', text: `交付存在错误：${response.data.errors[0]}` }
            : { kind: 'success', text: `已交付 ${response.data.deliveredFragments} 条碎片、${response.data.deliveredAssets} 张图片` },
        )
      } else {
        setMessage({ kind: 'error', text: response.error || '交付失败' })
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection title="Desktop 连接" description="通过本机接口把碎片与图片逐条写入 macOS Desktop（127.0.0.1:8765）">
      <div className="space-y-3 text-sm">
        <label className="block space-y-1">
          <span className="text-xs text-ann-muted">接口地址</span>
          <input
            className="w-full rounded-md border border-ann-border px-3 py-2"
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            placeholder="http://127.0.0.1:8765"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-ann-muted">配对码（在 Desktop 的「系统」页复制）</span>
          <input
            className="w-full rounded-md border border-ann-border px-3 py-2 font-mono"
            type="password"
            autoComplete="off"
            data-testid="pair-token-input"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder={block?.config.hasToken ? '已保存（不会显示），留空则保持不变' : '粘贴 Desktop 显示的配对码'}
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} />
          保存后自动逐条交付（失败时保留待发送队列）
        </label>
        {block && (
          <div className="rounded-md bg-ann-alt p-3 text-xs text-ann-muted" data-testid="desktop-status">
            <div>
              状态：<strong>{block.status.detail}</strong>
            </div>
            <div>
              待发送：{block.pending.pendingFragments} 条碎片 · {block.pending.pendingAssets} 张图片
            </div>
            {block.state.lastResult && (
              <div>
                上次交付：{block.state.lastResult.deliveredFragments} 条 / {block.state.lastResult.deliveredAssets} 图
              </div>
            )}
            {block.state.lastError && <div className="text-ann-danger">最近错误：{block.state.lastError}</div>}
          </div>
        )}
        {message && <StatusMessage tone={message.kind === 'success' ? 'success' : 'error'}>{message.text}</StatusMessage>}
        <div className="flex gap-2">
          <button className="rounded-md bg-ann-accent px-4 py-2 text-sm text-ann-on-accent disabled:opacity-50" onClick={save} disabled={busy}>
            保存配置
          </button>
          <button
            className="rounded-md border border-ann-border px-4 py-2 text-sm disabled:opacity-50"
            onClick={flush}
            disabled={busy || !block?.config.hasToken}
            data-testid="flush-delivery"
          >
            立即交付待发送项
          </button>
          {block?.config.hasToken && (
            <button className="rounded-md border border-ann-border px-4 py-2 text-sm disabled:opacity-50" onClick={unpair} disabled={busy} data-testid="unpair">
              取消配对
            </button>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}

/** R3 sync surface: pull state + visible conflict/skip reports (storage.md §9). */
function SyncPanelCard() {
  const [state, setState] = useState<{ lastPullAt?: number; lastPull?: { appliedChanges: number; reports: number; errors: string[] } } | null>(null)
  const [reports, setReports] = useState<Array<{ id: string; type: string; reason: string; detail?: string; at: number }> | null>(null)

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<DirectConnectBlock>({ type: 'GET_DESKTOP_DIRECT_CONNECT' })
    if (response.success && response.data) setState(response.data.state)
    const reportsResponse = await MessageUtils.sendMessage<Array<{ id: string; type: string; reason: string; detail?: string; at: number }>>({ type: 'GET_SYNC_REPORTS' })
    if (reportsResponse.success) setReports(reportsResponse.data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <SettingsSection title="双向同步" description="扩展会拉取 Desktop 回传的复习结果；无法应用的项目会出现在下面的报告中。">
      <div className="space-y-3 text-sm">
        {state === null ? (
          <div className="text-xs text-ann-muted">加载中…</div>
        ) : (
          <div className="rounded-md bg-ann-alt p-3 text-xs text-ann-muted" data-testid="sync-state">
            <div>上次拉取：{state.lastPullAt ? new Date(state.lastPullAt).toLocaleString() : '尚未同步'}</div>
            {state.lastPull && (
              <>
                <div>
                  最近一批：应用 {state.lastPull.appliedChanges} 条变更，{state.lastPull.reports} 条报告
                </div>
                {state.lastPull.errors.length > 0 && <div className="text-ann-danger">错误：{state.lastPull.errors[0]}</div>}
              </>
            )}
            {!state.lastPull && <div>连接 Desktop 并点击上方的「立即交付待发送项」即可开始同步。</div>}
          </div>
        )}
        {reports !== null && reports.length > 0 && (
          <div className="rounded-md border border-ann-border p-3 text-xs" data-testid="sync-reports">
            <div className="mb-1 font-medium text-ann-text">同步报告（最近 {reports.length} 条）</div>
            <ul className="list-disc space-y-1 pl-4 text-ann-muted">
              {reports.map(report => (
                <li key={report.id}>
                  {new Date(report.at).toLocaleString()} · {report.type} · {report.reason}
                  {report.detail ? ` · ${report.detail}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SettingsSection>
  )
}

/** Capture funnel metrics (R1.4) — counts only. */
function MetricsCard() {
  type Metrics = {
    modalOpened: number
    reachedVerify: number
    reachedApply: number
    saved: number
    exited: Record<string, number>
    exitedWithInput: number
    fallbacks: { highlight: number; clip: number }
  }
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  useEffect(() => {
    void (async () => {
      const response = await MessageUtils.sendMessage<Metrics>({ type: 'GET_CAPTURE_METRICS' })
      if (response.success && response.data) setMetrics(response.data)
    })()
  }, [])
  if (!metrics) return null
  return (
    <SettingsSection title="采集完成率（本地统计）" description="仅记录事件计数，不记录任何正文内容。">
      <div className="grid grid-cols-2 gap-2 text-xs text-ann-muted sm:grid-cols-4" data-testid="capture-metrics">
        <div className="rounded-md bg-ann-alt p-2">打开采集 {metrics.modalOpened}</div>
        <div className="rounded-md bg-ann-alt p-2">到达核验 {metrics.reachedVerify}</div>
        <div className="rounded-md bg-ann-alt p-2">到达应用 {metrics.reachedApply}</div>
        <div className="rounded-md bg-ann-alt p-2">保存成功 {metrics.saved}</div>
        {Object.keys(metrics.exited).length > 0 && (
          <div className="col-span-2 rounded-md bg-ann-alt p-2 sm:col-span-4">
            退出阶段：
            {Object.entries(metrics.exited)
              .map(([step, count]) => `${step} × ${count}`)
              .join('、')}
          </div>
        )}
        {metrics.exitedWithInput > 0 && (
          <div className="col-span-2 rounded-md bg-ann-alt p-2 sm:col-span-4" data-testid="safe-exit-metrics">
            放弃时已有输入 {metrics.exitedWithInput} 次 · 改存高亮 {metrics.fallbacks.highlight} · 改存剪藏 {metrics.fallbacks.clip}（安全出口使用率{' '}
            {Math.round(((metrics.fallbacks.highlight + metrics.fallbacks.clip) / metrics.exitedWithInput) * 100)}%）
          </div>
        )}
      </div>
    </SettingsSection>
  )
}

/** Orphan assets: report + cleanup (storage.md §10). */
function OrphanAssetsCard() {
  const [orphans, setOrphans] = useState<Array<{ id: string; byteLength: number; createdAt: number }> | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<Array<{ id: string; byteLength: number; createdAt: number }>>({ type: 'GET_ORPHAN_ASSETS' })
    setOrphans(response.success && Array.isArray(response.data) ? response.data : [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const cleanup = async () => {
    if (orphans?.length && !window.confirm(`清理 ${orphans.length} 个孤儿图片资产？仅删除无引用且无待交付任务的图片。`)) return
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage<{ removed: number }>({ type: 'CLEANUP_ORPHAN_ASSETS' })
      setMessage(response.success ? { kind: 'success', text: `已清理 ${response.data?.removed ?? 0} 个孤儿资产` } : { kind: 'error', text: response.error || '清理失败' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (orphans === null) return null
  return (
    <SettingsSection title="孤儿图片资产" description="无任何截图集/碎片引用且无待交付任务的图片；可安全清理以释放空间。">
      <div className="space-y-3 text-sm text-ann-muted" data-testid="orphan-assets">
        <div>{orphans.length === 0 ? '没有孤儿资产。' : `${orphans.length} 个孤儿资产（如 ${(orphans.reduce((n, a) => n + a.byteLength, 0) / 1024 / 1024).toFixed(1)}MB）`}</div>
        {message && (
          <div>{message.kind === 'success' ? <StatusMessage tone="success">{message.text}</StatusMessage> : <StatusMessage tone="error">{message.text}</StatusMessage>}</div>
        )}
        {orphans.length > 0 && (
          <button className="rounded-md bg-ann-accent px-4 py-2 text-sm text-ann-on-accent disabled:opacity-50" onClick={cleanup} disabled={busy} data-testid="cleanup-orphans">
            {busy ? '清理中…' : '清理孤儿资产'}
          </button>
        )}
      </div>
    </SettingsSection>
  )
}

function CapturePreferenceCard() {
  const [deepMode, setDeepMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const response = await MessageUtils.sendMessage<{ deepMode: boolean }>({ type: 'GET_CAPTURE_CONFIG' })
      if (response.success && response.data) setDeepMode(response.data.deepMode)
    })()
  }, [])

  const save = async (next: boolean) => {
    setBusy(true)
    try {
      setDeepMode(next)
      const response = await MessageUtils.sendMessage({ type: 'SET_CAPTURE_CONFIG', config: { deepMode: next } })
      setMessage(
        response.success
          ? { kind: 'success', text: next ? '已开启深度模式：采集时先写理解' : '已切换到标准模式：核验 → 应用' }
          : { kind: 'error', text: response.error || '保存失败' },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection title="采集偏好" description="深度模式在采集 Modal 增加「理解」步骤（理解 → 核验 → 应用）">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={deepMode} onChange={e => void save(e.target.checked)} disabled={busy} data-testid="deep-mode-toggle" />
        深度模式（全局默认；单次采集内也可切换）
      </label>
      {message && (
        <div className="mt-2">
          {message.kind === 'success' ? <StatusMessage tone="success">{message.text}</StatusMessage> : <StatusMessage tone="error">{message.text}</StatusMessage>}
        </div>
      )}
    </SettingsSection>
  )
}

function LlmCard() {
  const [config, setConfig] = useState<LlmConfig | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const response = await MessageUtils.sendMessage<LlmConfig>({ type: 'GET_LLM_CONFIG' })
      if (response.success && response.data) setConfig(response.data)
    })()
  }, [])

  if (!config) return null

  const field = (label: string, key: keyof LlmConfig, placeholder: string, type = 'text') => (
    <label className="block space-y-1">
      <span className="text-xs text-ann-muted">{label}</span>
      <input
        type={type}
        className="w-full rounded-md border border-ann-border px-3 py-2 font-mono text-xs"
        value={String(config[key] ?? '')}
        placeholder={placeholder}
        onChange={e => setConfig({ ...config, [key]: e.target.value })}
      />
    </label>
  )

  const save = async () => {
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage({ type: 'SET_LLM_CONFIG', config: { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model } })
      setMessage(response.success ? { kind: 'success', text: '已保存 LLM 配置' } : { kind: 'error', text: response.error || '保存失败' })
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage<{ ok: boolean; modelCount?: number }>({
        type: 'TEST_LLM_CONNECTION',
        config: { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model },
      })
      setMessage(response.success ? { kind: 'success', text: `连接可用（${response.data?.modelCount ?? 0} 个模型）` } : { kind: 'error', text: response.error || '连接失败' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection title="LLM 配置（可选）" description="核验建议等能力的可选加速器；关闭后采集、复习与导出全部可用。密钥只保存在本地。">
      <div className="space-y-3 text-sm">
        {field('Base URL（OpenAI 兼容）', 'baseUrl', 'https://api.example.com/v1')}
        {field('API Key', 'apiKey', 'sk-…', 'password')}
        {field('模型', 'model', 'gpt-…')}
        {message && (
          <div>{message.kind === 'success' ? <StatusMessage tone="success">{message.text}</StatusMessage> : <StatusMessage tone="error">{message.text}</StatusMessage>}</div>
        )}
        <div className="flex gap-2">
          <button className="rounded-md bg-ann-accent px-4 py-2 text-sm text-ann-on-accent disabled:opacity-50" onClick={save} disabled={busy}>
            保存
          </button>
          <button className="rounded-md border border-ann-border px-4 py-2 text-sm disabled:opacity-50" onClick={test} disabled={busy || !config.baseUrl}>
            测试连接
          </button>
        </div>
      </div>
    </SettingsSection>
  )
}

function DataManagementCard() {
  const [stats, setStats] = useState<{ total: number; newThisWeek: number } | null>(null)

  useEffect(() => {
    void (async () => {
      const response = await MessageUtils.sendMessage<{ total: number; newThisWeek: number }>({ type: 'GET_FRAGMENT_STATS' })
      if (response.success && response.data) setStats(response.data)
    })()
  }, [])

  return (
    <SettingsSection title="数据管理" description="本地数据概况。「导出内容」的唯一入口在碎片库的更多菜单（Markdown + 原图 ZIP，不是数据库备份）。">
      <div className="space-y-3 text-sm text-ann-muted">
        {stats && (
          <div>
            本地学习核心：{stats.total} 条碎片（本周新增 {stats.newThisWeek}）
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
