import { useState, useEffect, useCallback } from 'react'
import { Button } from '../../../components/ui/button'
import MessageUtils from '../../../utils/message'
import {
  VocabConfig,
  VocabConfigPublic,
  LlmConfig,
  LlmApiKeySource,
  defaultVocabConfig,
  defaultLlmConfig,
  parseDomainWhitelistInput,
  type CEFRLevel,
} from '../../../types/vocabulary'
import { Card, CheckboxField, Field, PageHeader, SelectInput, SettingsSection, StatusMessage, TextareaInput, TextInput } from '../components/ui'

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
        const [vocabRes, llmRes] = await Promise.all([MessageUtils.sendMessage({ type: 'GET_VOCAB_CONFIG' }), MessageUtils.sendMessage({ type: 'GET_LLM_CONFIG' })])

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
    <div>
      {message && (
        <StatusMessage tone={message.type} className="mb-6">
          {message.text}
        </StatusMessage>
      )}

      <SettingsSection title="General">
        <CheckboxField label="Enable vocabulary labeling" checked={vocabConfig.enabled} onChange={checked => setVocabConfig(prev => ({ ...prev, enabled: checked }))} />
        <Field label="Mastery threshold (star level)">
          <TextInput
            name="vocabMasteryThreshold"
            type="number"
            min={0}
            max={5}
            value={vocabConfig.masteryThreshold}
            onChange={e => setVocabConfig(prev => ({ ...prev, masteryThreshold: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Max annotations per page">
          <TextInput
            name="vocabMaxAnnotationsPerPage"
            type="number"
            min={1}
            max={1000}
            value={vocabConfig.maxAnnotationsPerPage}
            onChange={e => setVocabConfig(prev => ({ ...prev, maxAnnotationsPerPage: Number(e.target.value) }))}
          />
        </Field>
        <Field label="English level (CEFR)" hint="Words at or below your level will be skipped. Higher level = fewer annotations.">
          <SelectInput name="vocabCefrLevel" value={vocabConfig.cefrLevel} onChange={e => setVocabConfig(prev => ({ ...prev, cefrLevel: e.target.value as CEFRLevel }))}>
            <option value="A1">A1 – Beginner</option>
            <option value="A2">A2 – Elementary</option>
            <option value="B1">B1 – Intermediate</option>
            <option value="B2">B2 – Upper Intermediate</option>
            <option value="C1">C1 – Advanced</option>
            <option value="C2">C2 – Proficient</option>
          </SelectInput>
        </Field>
      </SettingsSection>

      <SettingsSection title="Eudic Vocabulary Books">
        <Field
          label="Authorization Token"
          hint={hasEudicToken ? 'Token detected (saved settings), hidden for security' : 'No token detected. Configure it here to enable Eudic sync'}
        >
          <TextInput
            name="vocabEudicToken"
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
        </Field>
        <Field label="Category IDs (comma-separated)">
          <TextInput
            name="vocabEudicCategoryIds"
            type="text"
            value={vocabConfig.eudicCategoryIds.join(', ')}
            onChange={e =>
              setVocabConfig(prev => ({
                ...prev,
                eudicCategoryIds: e.target.value
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean),
              }))
            }
            placeholder="e.g. 0, abc123"
          />
        </Field>
        <Field label="Sync period (minutes)">
          <TextInput
            name="vocabSyncPeriodMinutes"
            type="number"
            min={1}
            value={vocabConfig.syncPeriodMinutes}
            onChange={e => setVocabConfig(prev => ({ ...prev, syncPeriodMinutes: Math.max(1, Number(e.target.value)) }))}
          />
        </Field>
        <div className="md:pl-[236px]">
          <Button type="button" variant="secondary" onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="LLM Configuration">
        <Field label="Provider">
          <SelectInput name="llmProvider" value={llmConfig.provider} disabled>
            <option value="openai-compatible">OpenAI Compatible</option>
          </SelectInput>
        </Field>
        <Field label="Base URL">
          <TextInput
            name="llmBaseUrl"
            type="text"
            value={llmConfig.baseUrl}
            onChange={e => setLlmConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
            placeholder="https://api.openai.com"
          />
        </Field>
        <Field
          label="API Key"
          hint={
            hasApiKey
              ? `API key detected (${apiKeySource === 'env' ? 'from legacy env settings' : 'from saved settings'}), hidden for security`
              : 'No API key detected. Please input one here'
          }
        >
          <TextInput
            name="llmApiKey"
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
        </Field>
        <Field label="Model">
          <TextInput name="llmModel" type="text" value={llmConfig.model} onChange={e => setLlmConfig(prev => ({ ...prev, model: e.target.value }))} placeholder="glm-4-flash" />
        </Field>
        <Field label="Max tokens (optional)">
          <TextInput
            name="llmMaxTokens"
            type="number"
            min={0}
            value={llmConfig.maxTokens ?? ''}
            onChange={e => setLlmConfig(prev => ({ ...prev, maxTokens: e.target.value ? Number(e.target.value) : undefined }))}
          />
        </Field>
        <Field label="System prompt (optional)" align="start">
          <TextareaInput
            name="llmSystemPrompt"
            value={llmConfig.systemPrompt ?? ''}
            onChange={e => setLlmConfig(prev => ({ ...prev, systemPrompt: e.target.value || undefined }))}
            rows={3}
            placeholder="Custom system instructions for the LLM..."
          />
        </Field>
      </SettingsSection>

      <SettingsSection title="Domain Whitelist">
        <CheckboxField
          label="Only annotate on whitelisted domains"
          checked={vocabConfig.domainWhitelist.enabled}
          onChange={checked =>
            setVocabConfig(prev => ({
              ...prev,
              domainWhitelist: { ...prev.domainWhitelist, enabled: checked },
            }))
          }
        />
        <Field label="Domains" hint="One per line. Comma and semicolon are also supported." align="start">
          <TextareaInput
            name="vocabDomainWhitelist"
            value={vocabConfig.domainWhitelist.domains.join('\n')}
            onChange={e =>
              setVocabConfig(prev => ({
                ...prev,
                domainWhitelist: {
                  ...prev.domainWhitelist,
                  domains: parseDomainWhitelistInput(e.target.value),
                },
              }))
            }
            rows={4}
            placeholder={'example.com\nx.com\n*.github.com\nexample.*'}
          />
        </Field>
      </SettingsSection>

      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )

  if (embedded) {
    return content
  }

  return (
    <Card>
      <PageHeader title="Vocabulary Labeling Settings" />
      {content}
    </Card>
  )
}
