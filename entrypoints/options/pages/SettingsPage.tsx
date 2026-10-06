/**
 * Settings page — three blocks (extension PRD §2.2):
 *   1. Capture preferences (deep mode)
 *   2. LLM settings (optional accelerator; direct Provider calls)
 *   3. Data (the only Markdown ZIP export entry + storage overview)
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../../utils/message'
import { uiCount, uiText } from '../../../utils/ui-text'
import type { LlmConfigPublic } from '../../../types/llm'
import { PageHeader, SettingsSection, StatusMessage } from '../components/ui'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={uiText('library.nav.settings')} description={uiText('settings.description')} />
      <CapturePreferenceCard />
      <LlmCard />
      <DataManagementCard />
      <OrphanAssetsCard />
      <MetricsCard />
    </div>
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

/** Orphan assets: report + cleanup (storage.md §7). */
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
