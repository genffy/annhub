import { useState, useEffect, useCallback } from 'react'
import MessageUtils from '../../../utils/message'
import {
    VocabConfig,
    VocabConfigPublic,
    LlmConfig,
    LlmApiKeySource,
    defaultVocabConfig,
    defaultLlmConfig,
    parseDomainWhitelistInput,
} from '../../../types/vocabulary'

type MessageType = 'success' | 'error'
const MASKED_SECRET_VALUE = '****************'

interface VocabPageProps {
    embedded?: boolean
}

export default function VocabPage({ embedded = false }: VocabPageProps) {
    const [vocabConfig, setVocabConfig] = useState<VocabConfig>({ ...defaultVocabConfig })
    const [llmConfig, setLlmConfig] = useState<LlmConfig>({ ...defaultLlmConfig })
    const [hasEudicToken, setHasEudicToken] = useState(false)
    const [isEudicTokenMasked, setIsEudicTokenMasked] = useState(false)
    const [hasApiKey, setHasApiKey] = useState(false)
    const [apiKeySource, setApiKeySource] = useState<LlmApiKeySource>('none')
    const [isApiKeyMasked, setIsApiKeyMasked] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const [message, setMessage] = useState<{ text: string; type: MessageType } | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const [vocabRes, llmRes] = await Promise.all([
                    MessageUtils.sendMessage({ type: 'GET_VOCAB_CONFIG' }),
                    MessageUtils.sendMessage({ type: 'GET_LLM_CONFIG' }),
                ])

                if (vocabRes.success && vocabRes.data) {
                    const { hasEudicToken: hasToken, ...publicConfig } = vocabRes.data as VocabConfigPublic
                    setVocabConfig(prev => ({
                        ...prev,
                        ...publicConfig,
                        eudicToken: hasToken ? MASKED_SECRET_VALUE : '',
                    }))
                    setHasEudicToken(Boolean(hasToken))
                    setIsEudicTokenMasked(Boolean(hasToken))
                }

                if (llmRes.success && llmRes.data) {
                    const { hasApiKey: hasKey, apiKeySource: source, ...rest } = llmRes.data as any
                    setLlmConfig(prev => ({
                        ...prev,
                        ...rest,
                        apiKey: hasKey ? MASKED_SECRET_VALUE : '',
                    }))
                    setHasApiKey(Boolean(hasKey))
                    setApiKeySource(source ?? 'none')
                    setIsApiKeyMasked(Boolean(hasKey))
                }
            } catch (e) {
                console.error('Failed to load vocab config:', e)
            }
        }
        void load()
    }, [])

    const showMessage = useCallback((text: string, type: MessageType = 'success') => {
        setMessage({ text, type })
        setTimeout(() => setMessage(null), 3500)
    }, [])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const vocabPayload: Partial<VocabConfig> = {
                ...vocabConfig,
            }
            if (isEudicTokenMasked) {
                delete vocabPayload.eudicToken
            }

            const llmPayload: Partial<LlmConfig> = {
                provider: llmConfig.provider,
                baseUrl: llmConfig.baseUrl,
                model: llmConfig.model,
                maxTokens: llmConfig.maxTokens,
                systemPrompt: llmConfig.systemPrompt,
            }
            if (!isApiKeyMasked) {
                llmPayload.apiKey = llmConfig.apiKey.trim()
            }

            const [vocabRes, llmRes] = await Promise.all([
                MessageUtils.sendMessage({ type: 'SET_VOCAB_CONFIG', config: vocabPayload }),
                MessageUtils.sendMessage({ type: 'SET_LLM_CONFIG', config: llmPayload }),
            ])
            if (vocabRes.success && llmRes.success) {
                if (!isEudicTokenMasked) {
                    const hasToken = Boolean(vocabConfig.eudicToken.trim())
                    setHasEudicToken(hasToken)
                    setIsEudicTokenMasked(hasToken)
                    setVocabConfig(prev => ({
                        ...prev,
                        eudicToken: hasToken ? MASKED_SECRET_VALUE : '',
                    }))
                }
                if (!isApiKeyMasked) {
                    const hasKey = Boolean(llmConfig.apiKey.trim())
                    setHasApiKey(hasKey)
                    setApiKeySource(hasKey ? 'storage' : 'none')
                    setIsApiKeyMasked(hasKey)
                    setLlmConfig(prev => ({ ...prev, apiKey: hasKey ? MASKED_SECRET_VALUE : '' }))
                }
                showMessage('Settings saved successfully')
            } else {
                showMessage('Failed to save: ' + (vocabRes.error || llmRes.error || 'Unknown error'), 'error')
            }
        } catch {
            showMessage('Failed to save settings', 'error')
        } finally {
            setIsSaving(false)
        }
    }

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const res = await MessageUtils.sendMessage<{ count: number }>({ type: 'REFRESH_VOCAB', force: true })
            if (res.success && res.data) {
                showMessage(`Synced ${res.data.count} words`)
            } else {
                showMessage('Sync failed: ' + (res.error || 'Unknown error'), 'error')
            }
        } catch {
            showMessage('Sync failed', 'error')
        } finally {
            setIsSyncing(false)
        }
    }

    const content = (
        <div className="vocab-settings">
            {message && (
                <div className={`settings-message ${message.type === 'error' ? 'settings-message--error' : ''}`}>
                    {message.text}
                </div>
            )}

            <section className="settings-section">
                <h3>General</h3>
                <label className="settings-row">
                    <input
                        type="checkbox"
                        checked={vocabConfig.enabled}
                        onChange={e => setVocabConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    />
                    <span>Enable vocabulary labeling</span>
                </label>
                <label className="settings-row">
                    <span>Mastery threshold (star level)</span>
                    <input
                        type="number"
                        min={0}
                        max={5}
                        value={vocabConfig.masteryThreshold}
                        onChange={e => setVocabConfig(prev => ({ ...prev, masteryThreshold: Number(e.target.value) }))}
                    />
                </label>
                <label className="settings-row">
                    <span>Max annotations per page</span>
                    <input
                        type="number"
                        min={1}
                        max={1000}
                        value={vocabConfig.maxAnnotationsPerPage}
                        onChange={e => setVocabConfig(prev => ({ ...prev, maxAnnotationsPerPage: Number(e.target.value) }))}
                    />
                </label>
            </section>

            <section className="settings-section">
                <h3>Eudic Vocabulary Books</h3>
                <label className="settings-row">
                    <span>Authorization Token</span>
                    <input
                        type="password"
                        value={vocabConfig.eudicToken}
                        onFocus={() => {
                            if (!isEudicTokenMasked) return
                            setIsEudicTokenMasked(false)
                            setVocabConfig(prev => ({ ...prev, eudicToken: '' }))
                        }}
                        onBlur={() => {
                            if (!hasEudicToken || vocabConfig.eudicToken.trim()) return
                            setIsEudicTokenMasked(true)
                            setVocabConfig(prev => ({ ...prev, eudicToken: MASKED_SECRET_VALUE }))
                        }}
                        onChange={e => setVocabConfig(prev => ({ ...prev, eudicToken: e.target.value }))}
                        placeholder="Input your Eudic OpenAPI token"
                    />
                </label>
                <div className="settings-row settings-row--hint">
                    <span />
                    <small className="settings-hint">
                        {hasEudicToken
                            ? 'Token detected (saved settings), hidden for security'
                            : 'No token detected. Configure it here to enable Eudic sync'}
                    </small>
                </div>
                <label className="settings-row">
                    <span>Category IDs (comma-separated)</span>
                    <input
                        type="text"
                        value={vocabConfig.eudicCategoryIds.join(', ')}
                        onChange={e => setVocabConfig(prev => ({
                            ...prev,
                            eudicCategoryIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                        }))}
                        placeholder="e.g. 0, abc123"
                    />
                </label>
                <label className="settings-row">
                    <span>Sync period (minutes)</span>
                    <input
                        type="number"
                        min={1}
                        value={vocabConfig.syncPeriodMinutes}
                        onChange={e => setVocabConfig(prev => ({ ...prev, syncPeriodMinutes: Math.max(1, Number(e.target.value)) }))}
                    />
                </label>
                <div className="settings-row">
                    <span />
                    <button type="button" onClick={handleSync} disabled={isSyncing}>
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                </div>
            </section>

            <section className="settings-section">
                <h3>LLM Configuration</h3>
                <label className="settings-row">
                    <span>Provider</span>
                    <select value={llmConfig.provider} disabled>
                        <option value="openai-compatible">OpenAI Compatible</option>
                    </select>
                </label>
                <label className="settings-row">
                    <span>Base URL</span>
                    <input
                        type="text"
                        value={llmConfig.baseUrl}
                        onChange={e => setLlmConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                        placeholder="https://api.openai.com"
                    />
                </label>
                <label className="settings-row">
                    <span>API Key</span>
                    <input
                        type="password"
                        value={llmConfig.apiKey}
                        onFocus={() => {
                            if (!isApiKeyMasked) return
                            setIsApiKeyMasked(false)
                            setLlmConfig(prev => ({ ...prev, apiKey: '' }))
                        }}
                        onBlur={() => {
                            if (!hasApiKey || llmConfig.apiKey.trim()) return
                            setIsApiKeyMasked(true)
                            setLlmConfig(prev => ({ ...prev, apiKey: MASKED_SECRET_VALUE }))
                        }}
                        onChange={e => {
                            if (isApiKeyMasked) {
                                setIsApiKeyMasked(false)
                            }
                            setLlmConfig(prev => ({ ...prev, apiKey: e.target.value }))
                        }}
                        placeholder="Input your API key"
                    />
                </label>
                <div className="settings-row settings-row--hint">
                    <span />
                    <small className="settings-hint">
                        {hasApiKey
                            ? `API key detected (${apiKeySource === 'env' ? 'from legacy env settings' : 'from saved settings'}), hidden for security`
                            : 'No API key detected. Please input one here'}
                    </small>
                </div>
                <label className="settings-row">
                    <span>Model</span>
                    <input
                        type="text"
                        value={llmConfig.model}
                        onChange={e => setLlmConfig(prev => ({ ...prev, model: e.target.value }))}
                        placeholder="glm-4-flash"
                    />
                </label>
                <label className="settings-row">
                    <span>Max tokens (optional)</span>
                    <input
                        type="number"
                        min={0}
                        value={llmConfig.maxTokens ?? ''}
                        onChange={e => setLlmConfig(prev => ({ ...prev, maxTokens: e.target.value ? Number(e.target.value) : undefined }))}
                    />
                </label>
                <label className="settings-row settings-row--textarea">
                    <span>System prompt (optional)</span>
                    <textarea
                        value={llmConfig.systemPrompt ?? ''}
                        onChange={e => setLlmConfig(prev => ({ ...prev, systemPrompt: e.target.value || undefined }))}
                        rows={3}
                        placeholder="Custom system instructions for the LLM..."
                    />
                </label>
            </section>

            <section className="settings-section">
                <h3>Domain Whitelist</h3>
                <label className="settings-row">
                    <input
                        type="checkbox"
                        checked={vocabConfig.domainWhitelist.enabled}
                        onChange={e => setVocabConfig(prev => ({
                            ...prev,
                            domainWhitelist: { ...prev.domainWhitelist, enabled: e.target.checked },
                        }))}
                    />
                    <span>Only annotate on whitelisted domains</span>
                </label>
                <label className="settings-row settings-row--textarea">
                    <span>Domains (one per line, comma/semicolon also supported)</span>
                    <textarea
                        value={vocabConfig.domainWhitelist.domains.join('\n')}
                        onChange={e => setVocabConfig(prev => ({
                            ...prev,
                            domainWhitelist: {
                                ...prev.domainWhitelist,
                                domains: parseDomainWhitelistInput(e.target.value),
                            },
                        }))}
                        rows={4}
                        placeholder={'example.com\nx.com\n*.github.com\nexample.*'}
                    />
                </label>
            </section>

            <div className="settings-actions">
                <button type="button" onClick={handleSave} disabled={isSaving} className="save-button">
                    {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    )

    if (embedded) {
        return content
    }

    return (
        <div className="content-section">
            <h2>Vocabulary Labeling Settings</h2>
            {content}
        </div>
    )
}
