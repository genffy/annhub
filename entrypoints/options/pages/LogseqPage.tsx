import { useState, useEffect, useCallback } from 'react'
import { LogseqConfig, DEFAULT_LOGSEQ_CONFIG } from '../../../types/logseq'
import MessageUtils from '../../../utils/message'

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'failed'

export default function LogseqPage() {
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

    const connectionClass: Record<ConnectionStatus, string> = {
        idle: '',
        testing: '',
        connected: 'connection-success',
        failed: 'connection-error',
    }

    // Generate preview based on current config
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

    return (
        <div className="content-section">
            <h2>Logseq Sync</h2>
            <p className="section-description">
                Sync your highlights and clips to Logseq journal pages using tags.
            </p>

            <div className="settings-group">
                <h3>Connection</h3>
                <div className="input-group">
                    <label>Server URL</label>
                    <input
                        type="text"
                        className="text-input"
                        value={config.serverUrl}
                        onChange={e => setConfig(c => ({ ...c, serverUrl: e.target.value }))}
                        placeholder="http://127.0.0.1:12315"
                    />
                    <p className="input-help">
                        Logseq local HTTP server address. Default port is 12315.
                    </p>
                </div>

                <div className="input-group">
                    <label>Authorization Token</label>
                    <input
                        type="password"
                        className="text-input"
                        value={config.authToken}
                        onChange={e => setConfig(c => ({ ...c, authToken: e.target.value }))}
                        placeholder="Paste your Logseq API token here"
                    />
                    <p className="input-help">
                        Find it in Logseq: Settings → Features → HTTP APIs Server → Authorization tokens.
                    </p>
                </div>

                <div className="input-group" style={{ marginTop: 16 }}>
                    <button
                        className={`save-button ${connectionClass[connectionStatus]}`}
                        onClick={handleTestConnection}
                        disabled={connectionStatus === 'testing'}
                        style={{
                            backgroundColor: connectionStatus === 'connected' ? '#238636'
                                : connectionStatus === 'failed' ? '#cf222e' : undefined
                        }}
                    >
                        {connectionLabel[connectionStatus]}
                    </button>
                </div>
            </div>

            <div className="settings-group">
                <h3>Sync Options</h3>
                <div className="checkbox-group">
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
                        />
                        <span>Enable Logseq sync</span>
                    </label>

                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={config.autoSync}
                            onChange={e => setConfig(c => ({ ...c, autoSync: e.target.checked }))}
                        />
                        <span>Auto-sync on capture (sync highlights and clips as they are created)</span>
                    </label>

                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={config.autoTagDomain}
                            onChange={e => setConfig(c => ({ ...c, autoTagDomain: e.target.checked }))}
                        />
                        <span>Auto-tag domain (e.g., #example_com)</span>
                    </label>
                </div>

                <div className="input-group" style={{ marginTop: 16 }}>
                    <label>Custom Tags</label>
                    <input
                        type="text"
                        className="text-input"
                        value={config.customTags}
                        onChange={e => setConfig(c => ({ ...c, customTags: e.target.value }))}
                        placeholder="#reading #research"
                    />
                    <p className="input-help">
                        Comma-separated tags to add to all synced items. e.g., <code>#reading, #research</code>
                    </p>
                </div>
            </div>

            <div className="settings-group">
                <h3>Data Format Preview</h3>
                <p className="input-help" style={{ marginBottom: 12 }}>
                    Items are synced to journal pages (e.g., [[2025-01-15]]) with tags for categorization.
                </p>
                <div className="logseq-format-preview">
                    <pre>{generatePreview()}</pre>
                </div>
            </div>

            <div className="settings-group">
                <h3>Manual Sync</h3>
                <p className="input-help" style={{ marginBottom: 12 }}>
                    Sync all existing highlights to Logseq. Duplicates will be automatically skipped.
                </p>
                <button
                    className="save-button"
                    onClick={handleSyncAll}
                    disabled={!config.enabled}
                    style={{ backgroundColor: '#238636' }}
                >
                    Sync All Highlights
                </button>
                {syncStatus && (
                    <p className={`save-message ${syncStatus.startsWith('Error') || syncStatus === 'Sync failed' ? 'error' : 'success'}`}
                       style={{ marginTop: 12, display: 'inline-block' }}>
                        {syncStatus}
                    </p>
                )}
            </div>

            <div className="save-section">
                <button
                    className="save-button"
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
                {saveMsg && (
                    <p className={`save-message ${saveMsg.startsWith('Error') ? 'error' : 'success'}`}>
                        {saveMsg}
                    </p>
                )}
            </div>
        </div>
    )
}
