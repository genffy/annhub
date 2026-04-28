import { useState, useEffect, useCallback } from 'react'
import { LogseqConfig, DEFAULT_LOGSEQ_CONFIG } from '../../../types/logseq'
import MessageUtils from '../../../utils/message'
import { Button } from '../../../components/ui/button'
import { Card, CheckboxField, Field, PageHeader, StatusMessage, TextInput } from '../components/ui'

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'failed'

interface LogseqPageProps {
  embedded?: boolean
}

export default function LogseqPage({ embedded = false }: LogseqPageProps) {
  const [config, setConfig] = useState<LogseqConfig>({ ...DEFAULT_LOGSEQ_CONFIG })
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [syncStatus, setSyncStatus] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await MessageUtils.sendMessage({ type: 'LOGSEQ_GET_CONFIG' })
        if (resp.success && resp.data) {
          setConfig(resp.data)
        }
      } catch (err) {
        console.error('[LogseqPage] Failed to load config:', err)
      }
    }
    load()
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setSaveMsg('')
    try {
      const resp = await MessageUtils.sendMessage({
        type: 'LOGSEQ_SET_CONFIG',
        config,
      })
      setSaveMsg(resp.success ? 'Settings saved' : `Error: ${resp.error}`)
      setTimeout(() => setSaveMsg(''), 3000)
    } catch {
      setSaveMsg('Failed to save settings')
      setTimeout(() => setSaveMsg(''), 3000)
    } finally {
      setIsSaving(false)
    }
  }, [config])

  const handleTestConnection = useCallback(async () => {
    setConnectionStatus('testing')
    try {
      await MessageUtils.sendMessage({ type: 'LOGSEQ_SET_CONFIG', config })
      const resp = await MessageUtils.sendMessage({ type: 'LOGSEQ_TEST_CONNECTION' })
      setConnectionStatus(resp.success && resp.data ? 'connected' : 'failed')
    } catch {
      setConnectionStatus('failed')
    }
  }, [config])

  const handleSyncAll = useCallback(async () => {
    setSyncStatus('Syncing...')
    try {
      const resp = await MessageUtils.sendMessage({ type: 'LOGSEQ_SYNC_ALL' })
      if (resp.success && resp.data) {
        setSyncStatus(`Done: ${resp.data.synced} synced, ${resp.data.failed} failed`)
      } else {
        setSyncStatus(`Error: ${resp.error}`)
      }
    } catch {
      setSyncStatus('Sync failed')
    }
    setTimeout(() => setSyncStatus(''), 5000)
  }, [])

  const connectionLabel: Record<ConnectionStatus, string> = {
    idle: 'Test Connection',
    testing: 'Testing...',
    connected: 'Connected ✓',
    failed: 'Connection Failed',
  }

  const generatePreview = () => {
    const today = new Date().toISOString().slice(0, 10)
    const customTags = config.customTags.trim() ? config.customTags : '#reading'
    const domainTag = config.autoTagDomain ? ' #example_com' : ''

    return `[[${today}]]

- #annhub ${customTags}${domainTag} [[Article Title]] 🔗
  > This is the highlighted text
    annhub-id:: hl_abc123
    source-url:: https://example.com/article
    color:: #ffeb3b
  - 💭 My note about this highlight`
  }

  const content = (
    <div className="space-y-8">
      <section>
        <h3 className="mb-4 text-base font-semibold text-slate-950">Connection</h3>
        <div className="space-y-4">
          <Field label="Server URL" hint="Logseq local HTTP server address. Default port is 12315.">
            <TextInput
              id="logseq-server-url"
              name="logseqServerUrl"
              type="text"
              value={config.serverUrl}
              onChange={e => setConfig(c => ({ ...c, serverUrl: e.target.value }))}
              placeholder="http://127.0.0.1:12315"
            />
          </Field>

          <Field label="Authorization Token" hint="Find it in Logseq: Settings -> Features -> HTTP APIs Server -> Authorization tokens.">
            <TextInput
              id="logseq-auth-token"
              name="logseqAuthToken"
              type="password"
              value={config.authToken}
              onChange={e => setConfig(c => ({ ...c, authToken: e.target.value }))}
              placeholder="Paste your Logseq API token here"
            />
          </Field>

          <div className="md:pl-[236px]">
            <Button
              onClick={handleTestConnection}
              disabled={connectionStatus === 'testing'}
              className={connectionStatus === 'connected' ? 'bg-emerald-600 hover:bg-emerald-700' : connectionStatus === 'failed' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {connectionLabel[connectionStatus]}
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-base font-semibold text-slate-950">Sync Options</h3>
        <div className="space-y-3">
          <CheckboxField label="Enable Logseq sync" checked={config.enabled} onChange={checked => setConfig(c => ({ ...c, enabled: checked }))} />
          <CheckboxField
            label="Auto-sync on capture"
            hint="Sync highlights and clips as they are created."
            checked={config.autoSync}
            onChange={checked => setConfig(c => ({ ...c, autoSync: checked }))}
          />
          <CheckboxField
            label="Auto-tag domain"
            hint="Add a source domain tag such as #example_com."
            checked={config.autoTagDomain}
            onChange={checked => setConfig(c => ({ ...c, autoTagDomain: checked }))}
          />
          <Field label="Custom Tags" hint="Comma-separated tags to add to all synced items. e.g. #reading, #research">
            <TextInput
              id="logseq-custom-tags"
              name="logseqCustomTags"
              type="text"
              value={config.customTags}
              onChange={e => setConfig(c => ({ ...c, customTags: e.target.value }))}
              placeholder="#reading #research"
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold text-slate-950">Data Format Preview</h3>
        <p className="mb-3 text-sm text-slate-500">Items are synced to journal pages (e.g., [[2025-01-15]]) with tags for categorization.</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
          <pre>{generatePreview()}</pre>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold text-slate-950">Manual Sync</h3>
        <p className="mb-3 text-sm text-slate-500">Sync all existing highlights to Logseq. Duplicates will be automatically skipped.</p>
        <Button onClick={handleSyncAll} disabled={!config.enabled} className="bg-emerald-600 hover:bg-emerald-700">
          Sync All Highlights
        </Button>
        {syncStatus && (
          <StatusMessage tone={syncStatus.startsWith('Error') || syncStatus === 'Sync failed' ? 'error' : 'success'} className="mt-3 inline-block">
            {syncStatus}
          </StatusMessage>
        )}
      </section>

      <div className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">Save Logseq settings</p>
          <p className="mt-1 text-xs text-slate-500">Changes are stored locally in the extension.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
        {saveMsg && <StatusMessage tone={saveMsg.startsWith('Error') ? 'error' : 'success'}>{saveMsg}</StatusMessage>}
      </div>
    </div>
  )

  if (embedded) {
    return content
  }

  return (
    <Card>
      <PageHeader title="Logseq Sync" description="Sync your highlights and clips to Logseq journal pages using tags." />
      {content}
    </Card>
  )
}
