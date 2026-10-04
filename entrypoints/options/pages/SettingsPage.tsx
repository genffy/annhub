/**
 * Settings page — four blocks (extension PRD §2.2 / options-v2 alignment):
 *   1. Desktop connection (pairing, status, pending items and retry)
 *   2. Capture preferences (deep mode)
 *   3. LLM settings (optional accelerator; direct Provider calls)
 *   4. Data (the only Markdown ZIP export entry + storage overview)
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../../utils/message'
import { uiCount, uiText } from '../../../utils/ui-text'
import type { LlmConfigPublic } from '../../../types/llm'
import { PageHeader, SettingsSection, StatusMessage } from '../components/ui'

interface DirectConnectBlock {
  config: { endpoint: string; autoSync: boolean; hasToken: boolean }
  status: { online: boolean; paired: boolean; detail: string; lastSyncAt?: number }
  pending: { pendingFragments: number; pendingAssets: number; rejected: number }
  /** Items Desktop refused for good: kept in the queue, parked until the user decides. */
  rejected: Array<{ eventId: string; kind: 'fragment' | 'asset'; targetId: string; code: string; status: number; at: number }>
  state: {
    lastError?: string
    lastResult?: { deliveredFragments: number; deliveredAssets: number }
    lastPullAt?: number
    lastPull?: { appliedChanges: number; reports: number; errors: string[] }
  }
}

const REJECTION_CODES = ['DESKTOP_DELETED', 'CONFLICT', 'TOO_LARGE', 'INVALID', 'REJECTED', 'DESKTOP_ERROR', 'LOCAL_INVALID'] as const

const SYNC_REASONS = ['LOCAL_DELETED', 'DESKTOP_DELETED', 'UNKNOWN_FRAGMENT', 'STALE_REVIEW'] as const

/** What a sync report's reason means for the user; a conflict code is shown as it is. */
function syncReasonLabel(reason: string): string {
  return (SYNC_REASONS as readonly string[]).includes(reason) ? uiText(`settings.syncReason.${reason as (typeof SYNC_REASONS)[number]}`) : reason
}

/** What a parked delivery's code means for the user; an unknown code is shown as it is. */
function rejectionLabel(code: string): string {
  return (REJECTION_CODES as readonly string[]).includes(code) ? uiText(`settings.reason.${code as (typeof REJECTION_CODES)[number]}`) : code
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={uiText('library.nav.settings')} description={uiText('settings.description')} />
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
  // The form is the stored settings plus what the user changes. Until the stored settings have come
  // back there is nothing to change yet, and a late answer would overwrite what was typed meanwhile
  // (or a quick save would send an empty endpoint), so the form waits for them.
  const [asked, setAsked] = useState(false)

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<DirectConnectBlock>({ type: 'GET_DESKTOP_DIRECT_CONNECT' })
    if (response.success && response.data) {
      setBlock(response.data)
      setEndpoint(response.data.config.endpoint)
      setAutoSync(response.data.config.autoSync)
    }
    setAsked(true)
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
      setMessage(response.success ? { kind: 'success', text: uiText('settings.desktop.saved') } : { kind: 'error', text: response.error || uiText('capture.error.saveFailed') })
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
      setMessage(
        response.success ? { kind: 'success', text: uiText('settings.desktop.unpaired') } : { kind: 'error', text: response.error || uiText('settings.desktop.unpairFailed') },
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  const resolveRejected = async (action: 'retry' | 'dismiss') => {
    if (action === 'dismiss' && !window.confirm(uiText('settings.rejected.confirmDismiss'))) return
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage<{ count: number }>({ type: 'RESOLVE_REJECTED_DELIVERIES', action })
      setMessage(
        response.success
          ? { kind: 'success', text: uiText(action === 'retry' ? 'settings.rejected.retried' : 'settings.rejected.dismissed', { count: response.data?.count ?? 0 }) }
          : { kind: 'error', text: response.error || uiText('settings.rejected.failed') },
      )
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
            ? { kind: 'error', text: uiText('settings.desktop.deliveryErrors', { error: response.data.errors[0]! }) }
            : { kind: 'success', text: uiText('settings.desktop.delivered', { fragments: response.data.deliveredFragments, assets: response.data.deliveredAssets }) },
        )
      } else {
        setMessage({ kind: 'error', text: response.error || uiText('settings.desktop.deliveryFailed') })
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection title={uiText('settings.desktop.title')} description={uiText('settings.desktop.description')}>
      <div className="space-y-3 text-sm">
        <label className="block space-y-1">
          <span className="text-xs text-ann-muted">{uiText('settings.desktop.endpoint')}</span>
          <input
            className="w-full rounded-md border border-ann-border px-3 py-2 disabled:opacity-60"
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            placeholder="http://127.0.0.1:8765"
            disabled={!asked}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-ann-muted">{uiText('settings.desktop.token')}</span>
          <input
            className="w-full rounded-md border border-ann-border px-3 py-2 font-mono disabled:opacity-60"
            type="password"
            autoComplete="off"
            data-testid="pair-token-input"
            value={token}
            onChange={e => setToken(e.target.value)}
            disabled={!asked}
            placeholder={uiText(block?.config.hasToken ? 'settings.secretKept' : 'settings.desktop.tokenPlaceholder')}
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} disabled={!asked} />
          {uiText('settings.desktop.autoSync')}
        </label>
        {block && (
          <div className="rounded-md bg-ann-alt p-3 text-xs text-ann-muted" data-testid="desktop-status">
            <div>
              {uiText('settings.desktop.status')}
              <strong>{block.status.detail}</strong>
            </div>
            <div>{uiText('settings.desktop.pending', { fragments: block.pending.pendingFragments, assets: block.pending.pendingAssets })}</div>
            {block.state.lastResult && (
              <div>{uiText('settings.desktop.lastDelivery', { fragments: block.state.lastResult.deliveredFragments, assets: block.state.lastResult.deliveredAssets })}</div>
            )}
            {block.state.lastError && <div className="text-ann-danger">{uiText('settings.desktop.lastError', { error: block.state.lastError })}</div>}
          </div>
        )}
        {block && block.rejected.length > 0 && (
          <div className="space-y-2 rounded-md border border-ann-danger p-3 text-xs" data-testid="rejected-deliveries">
            <div className="font-medium text-ann-danger">{uiText('settings.rejected.title', { count: block.pending.rejected })}</div>
            <ul className="space-y-1 text-ann-muted">
              {block.rejected.map(item => (
                <li key={item.eventId} data-testid="rejected-item">
                  {uiText(item.kind === 'asset' ? 'settings.rejected.asset' : 'settings.rejected.fragment')} <span className="font-mono">{item.targetId.slice(0, 14)}</span> ·{' '}
                  {rejectionLabel(item.code)}
                  {item.status > 0 ? uiText('settings.rejected.http', { status: item.status }) : ''}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                className="rounded-md border border-ann-border px-3 py-1 disabled:opacity-50"
                onClick={() => void resolveRejected('retry')}
                disabled={busy}
                data-testid="rejected-retry"
              >
                {uiText('settings.rejected.retry')}
              </button>
              <button
                className="rounded-md border border-ann-border px-3 py-1 disabled:opacity-50"
                onClick={() => void resolveRejected('dismiss')}
                disabled={busy}
                data-testid="rejected-dismiss"
              >
                {uiText('settings.rejected.dismiss')}
              </button>
            </div>
          </div>
        )}
        {message && <StatusMessage tone={message.kind === 'success' ? 'success' : 'error'}>{message.text}</StatusMessage>}
        <div className="flex gap-2">
          <button className="rounded-md bg-ann-accent px-4 py-2 text-sm text-ann-on-accent disabled:opacity-50" onClick={save} disabled={busy || !asked}>
            {uiText('settings.desktop.save')}
          </button>
          <button
            className="rounded-md border border-ann-border px-4 py-2 text-sm disabled:opacity-50"
            onClick={flush}
            disabled={busy || !block?.config.hasToken}
            data-testid="flush-delivery"
          >
            {uiText('settings.desktop.flush')}
          </button>
          {block?.config.hasToken && (
            <button className="rounded-md border border-ann-border px-4 py-2 text-sm disabled:opacity-50" onClick={unpair} disabled={busy} data-testid="unpair">
              {uiText('settings.desktop.unpair')}
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
    <SettingsSection title={uiText('settings.sync.title')} description={uiText('settings.sync.description')}>
      <div className="space-y-3 text-sm">
        {state === null ? (
          <div className="text-xs text-ann-muted">{uiText('common.loading')}</div>
        ) : (
          <div className="rounded-md bg-ann-alt p-3 text-xs text-ann-muted" data-testid="sync-state">
            <div>{uiText('settings.sync.lastPull', { time: state.lastPullAt ? new Date(state.lastPullAt).toLocaleString() : uiText('settings.sync.never') })}</div>
            {state.lastPull && (
              <>
                <div>{uiText('settings.sync.lastBatch', { applied: state.lastPull.appliedChanges, reports: state.lastPull.reports })}</div>
                {state.lastPull.errors.length > 0 && <div className="text-ann-danger">{uiText('settings.sync.error', { error: state.lastPull.errors[0]! })}</div>}
              </>
            )}
            {!state.lastPull && <div>{uiText('settings.sync.start')}</div>}
          </div>
        )}
        {reports !== null && reports.length > 0 && (
          <div className="rounded-md border border-ann-border p-3 text-xs" data-testid="sync-reports">
            <div className="mb-1 font-medium text-ann-text">{uiText('settings.sync.reports', { count: reports.length })}</div>
            <ul className="list-disc space-y-1 pl-4 text-ann-muted">
              {reports.map(report => (
                <li key={report.id}>
                  {new Date(report.at).toLocaleString()} · {report.type} · {syncReasonLabel(report.reason)}
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
    <SettingsSection title={uiText('settings.metrics.title')} description={uiText('settings.metrics.description')}>
      <div className="grid grid-cols-2 gap-2 text-xs text-ann-muted sm:grid-cols-4" data-testid="capture-metrics">
        <div className="rounded-md bg-ann-alt p-2">{uiText('settings.metrics.opened', { count: metrics.modalOpened })}</div>
        <div className="rounded-md bg-ann-alt p-2">{uiText('settings.metrics.reachedVerify', { count: metrics.reachedVerify })}</div>
        <div className="rounded-md bg-ann-alt p-2">{uiText('settings.metrics.reachedApply', { count: metrics.reachedApply })}</div>
        <div className="rounded-md bg-ann-alt p-2">{uiText('settings.metrics.saved', { count: metrics.saved })}</div>
        {Object.keys(metrics.exited).length > 0 && (
          <div className="col-span-2 rounded-md bg-ann-alt p-2 sm:col-span-4">
            {uiText('settings.metrics.exitedAt')}
            {Object.entries(metrics.exited)
              .map(([step, count]) => `${step} × ${count}`)
              .join(uiText('settings.metrics.separator'))}
          </div>
        )}
        {metrics.exitedWithInput > 0 && (
          <div className="col-span-2 rounded-md bg-ann-alt p-2 sm:col-span-4" data-testid="safe-exit-metrics">
            {uiText('settings.metrics.safeExit', {
              withInput: metrics.exitedWithInput,
              highlight: metrics.fallbacks.highlight,
              clip: metrics.fallbacks.clip,
              rate: Math.round(((metrics.fallbacks.highlight + metrics.fallbacks.clip) / metrics.exitedWithInput) * 100),
            })}
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
    if (orphans?.length && !window.confirm(uiText('settings.orphans.confirm', { count: orphans.length }))) return
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage<{ removed: number }>({ type: 'CLEANUP_ORPHAN_ASSETS' })
      setMessage(
        response.success
          ? { kind: 'success', text: uiText('settings.orphans.cleaned', { count: response.data?.removed ?? 0 }) }
          : { kind: 'error', text: response.error || uiText('settings.orphans.failed') },
      )
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (orphans === null) return null
  return (
    <SettingsSection title={uiText('settings.orphans.title')} description={uiText('settings.orphans.description')}>
      <div className="space-y-3 text-sm text-ann-muted" data-testid="orphan-assets">
        <div>
          {orphans.length === 0
            ? uiText('settings.orphans.none')
            : uiText('settings.orphans.summary', { count: orphans.length, size: (orphans.reduce((n, a) => n + a.byteLength, 0) / 1024 / 1024).toFixed(1) })}
        </div>
        {message && (
          <div>{message.kind === 'success' ? <StatusMessage tone="success">{message.text}</StatusMessage> : <StatusMessage tone="error">{message.text}</StatusMessage>}</div>
        )}
        {orphans.length > 0 && (
          <button className="rounded-md bg-ann-accent px-4 py-2 text-sm text-ann-on-accent disabled:opacity-50" onClick={cleanup} disabled={busy} data-testid="cleanup-orphans">
            {uiText(busy ? 'settings.orphans.cleaning' : 'settings.orphans.cleanup')}
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
          ? { kind: 'success', text: uiText(next ? 'settings.capture.deepOn' : 'settings.capture.deepOff') }
          : { kind: 'error', text: response.error || uiText('capture.error.saveFailed') },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection title={uiText('settings.capture.title')} description={uiText('settings.capture.description')}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={deepMode} onChange={e => void save(e.target.checked)} disabled={busy} data-testid="deep-mode-toggle" />
        {uiText('settings.capture.deepMode')}
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
  const [config, setConfig] = useState<LlmConfigPublic | null>(null)
  // The stored key is never sent to this page: the field starts empty and an empty field keeps it.
  const [apiKey, setApiKey] = useState('')
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<LlmConfigPublic>({ type: 'GET_LLM_CONFIG' })
    if (response.success && response.data) setConfig(response.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!config) return null

  const typedKey = apiKey.trim()
  const formValues = { baseUrl: config.baseUrl, model: config.model, ...(typedKey ? { apiKey: typedKey } : {}) }

  const save = async () => {
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage({ type: 'SET_LLM_CONFIG', config: formValues })
      setMessage(response.success ? { kind: 'success', text: uiText('settings.llm.saved') } : { kind: 'error', text: response.error || uiText('capture.error.saveFailed') })
      if (response.success) setApiKey('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const response = await MessageUtils.sendMessage<{ ok: boolean; availableModels?: unknown[] }>({ type: 'TEST_LLM_CONNECTION', config: formValues })
      setMessage(
        response.success
          ? { kind: 'success', text: response.data?.availableModels ? uiText('settings.llm.okModels', { count: response.data.availableModels.length }) : uiText('settings.llm.ok') }
          : { kind: 'error', text: response.error || uiText('settings.llm.failed') },
      )
    } finally {
      setBusy(false)
    }
  }

  const textField = (label: string, value: string, placeholder: string, onChange: (value: string) => void, extra: { type?: string; testId?: string } = {}) => (
    <label className="block space-y-1">
      <span className="text-xs text-ann-muted">{label}</span>
      <input
        type={extra.type ?? 'text'}
        autoComplete="off"
        data-testid={extra.testId}
        className="w-full rounded-md border border-ann-border px-3 py-2 font-mono text-xs"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )

  return (
    <SettingsSection title={uiText('settings.llm.title')} description={uiText('settings.llm.description')}>
      <div className="space-y-3 text-sm">
        {textField(uiText('settings.llm.baseUrl'), config.baseUrl, 'https://api.example.com/v1', baseUrl => setConfig({ ...config, baseUrl }), { testId: 'llm-base-url' })}
        {textField('API Key', apiKey, config.hasApiKey ? uiText('settings.secretKept') : 'sk-…', setApiKey, { type: 'password', testId: 'llm-api-key' })}
        {textField(uiText('settings.llm.model'), config.model, 'gpt-…', model => setConfig({ ...config, model }), { testId: 'llm-model' })}
        {message && (
          <div>{message.kind === 'success' ? <StatusMessage tone="success">{message.text}</StatusMessage> : <StatusMessage tone="error">{message.text}</StatusMessage>}</div>
        )}
        <div className="flex gap-2">
          <button className="rounded-md bg-ann-accent px-4 py-2 text-sm text-ann-on-accent disabled:opacity-50" onClick={save} disabled={busy}>
            {uiText('common.save')}
          </button>
          <button className="rounded-md border border-ann-border px-4 py-2 text-sm disabled:opacity-50" onClick={test} disabled={busy || !config.baseUrl} data-testid="llm-test">
            {uiText('settings.llm.test')}
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
    <SettingsSection title={uiText('settings.data.title')} description={uiText('settings.data.description')}>
      <div className="space-y-3 text-sm text-ann-muted">{stats && <div>{uiCount('settings.data.stats', stats.total, { added: stats.newThisWeek })}</div>}</div>
    </SettingsSection>
  )
}
