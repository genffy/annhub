import { useState, useEffect, useCallback } from 'react'
import { Button } from '../../../components/ui/button'
import MessageUtils from '../../../utils/message'
import {
  VocabConfig,
  VocabConfigPublic,
  LlmConfig,
  LlmApiKeySource,
  LlmConnectionTestResult,
  LlmModelOption,
  VocabSyncState,
  defaultVocabConfig,
  defaultLlmConfig,
  parseDomainWhitelistInput,
  type CEFRLevel,
} from '../../../types/vocabulary'
import { Card, CheckboxField, Field, PageHeader, SelectInput, SettingsSection, StatusMessage, TextareaInput, TextInput } from '../components/ui'
import { CUSTOM_LLM_PROVIDER_ID, findLlmProviderEndpoint, findLlmProviderPreset, getLlmProviderEndpoint, LLM_PROVIDER_PRESETS, normalizeLlmModelOptions } from '../../../utils/llm-provider-presets'

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
  const [learningSyncState, setLearningSyncState] = useState<VocabSyncState | null>(null)
  const [learningCategories, setLearningCategories] = useState<Array<{ id: string; name: string }>>([])
  const [selectedLearningCategoryId, setSelectedLearningCategoryId] = useState('')
  const [llmModels, setLlmModels] = useState<LlmModelOption[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [isTestingLlm, setIsTestingLlm] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState<LlmConnectionTestResult | null>(null)
  const [llmTestError, setLlmTestError] = useState<string | null>(null)

  const activePreset = findLlmProviderPreset(llmConfig.providerPresetId)
  const activeEndpoint = findLlmProviderEndpoint(llmConfig.providerPresetId, llmConfig.providerEndpointId)

  useEffect(() => {
    const load = async () => {
      try {
        const [vocabRes, llmRes, learningStateRes] = await Promise.all([
          MessageUtils.sendMessage({ type: 'GET_VOCAB_CONFIG' }),
          MessageUtils.sendMessage({ type: 'GET_LLM_CONFIG' }),
          MessageUtils.sendMessage({ type: 'GET_VOCAB_LEARNING_SYNC_STATE' }),
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
          const preset = findLlmProviderPreset(rest.providerPresetId)
          const providerEndpointId = rest.providerEndpointId ?? preset?.endpointVariants?.[0]?.id
          const endpoint = findLlmProviderEndpoint(rest.providerPresetId, providerEndpointId)
          setLlmConfig(prev => ({
            ...prev,
            ...rest,
            providerPresetId: rest.providerPresetId ?? CUSTOM_LLM_PROVIDER_ID,
            providerEndpointId,
            apiMode: rest.apiMode ?? endpoint?.apiMode ?? preset?.apiMode ?? 'openai-compatible',
            baseUrl: rest.baseUrl || endpoint?.baseUrl || preset?.baseUrl || '',
            model: rest.model || endpoint?.defaultModel || preset?.defaultModel || '',
            modelsEndpoint: rest.modelsEndpoint || endpoint?.modelsEndpoint || preset?.modelsEndpoint,
            omitTemperature: rest.omitTemperature ?? endpoint?.omitTemperature ?? preset?.omitTemperature,
            apiKey: hasKey ? MASKED_SECRET_VALUE : '',
          }))
          setLlmModels(normalizeLlmModelOptions(endpoint?.models ?? preset?.models ?? (rest.model ? [rest.model] : [])))
          setHasApiKey(Boolean(hasKey))
          setApiKeySource(source ?? 'none')
          setIsApiKeyMasked(Boolean(hasKey))
        }

        if (learningStateRes.success && learningStateRes.data) {
          const state = learningStateRes.data as VocabSyncState
          setLearningSyncState(state)
          setSelectedLearningCategoryId(state.learningCategoryId ?? '')
        }

        if (vocabRes.success && vocabRes.data && (vocabRes.data as VocabConfigPublic).hasEudicToken) {
          const categoryRes = await MessageUtils.sendMessage<{ id: string; name: string }[]>({ type: 'GET_EUDIC_CATEGORIES' })
          if (categoryRes.success && Array.isArray(categoryRes.data)) {
            setLearningCategories(categoryRes.data.map(item => ({ id: item.id, name: item.name })))
          }
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

  const buildLlmConfigPayload = useCallback((includeMaskedApiKey = false): Partial<LlmConfig> => {
    const payload: Partial<LlmConfig> = {
      provider: llmConfig.provider,
      apiMode: llmConfig.apiMode,
      providerPresetId: llmConfig.providerPresetId || CUSTOM_LLM_PROVIDER_ID,
      providerEndpointId: llmConfig.providerEndpointId,
      customProviderName: llmConfig.customProviderName,
      baseUrl: llmConfig.baseUrl.trim(),
      model: llmConfig.model.trim(),
      modelsEndpoint: llmConfig.modelsEndpoint?.trim() || undefined,
      omitTemperature: llmConfig.omitTemperature,
      requestTimeoutMs: llmConfig.requestTimeoutMs,
      maxTokens: llmConfig.maxTokens,
      systemPrompt: llmConfig.systemPrompt,
    }

    if (!isApiKeyMasked || includeMaskedApiKey) {
      payload.apiKey = isApiKeyMasked ? undefined : llmConfig.apiKey.trim()
    }

    return payload
  }, [isApiKeyMasked, llmConfig])

  const handleProviderPresetChange = (providerPresetId: string) => {
    const preset = findLlmProviderPreset(providerPresetId)
    setLlmTestResult(null)
    setLlmTestError(null)

    if (!preset) {
      setLlmModels([])
      setLlmConfig(prev => ({
        ...prev,
        providerPresetId: CUSTOM_LLM_PROVIDER_ID,
        providerEndpointId: undefined,
        apiMode: 'openai-compatible',
        baseUrl: '',
        model: '',
        modelsEndpoint: undefined,
        omitTemperature: undefined,
      }))
      return
    }

    const endpoint = getLlmProviderEndpoint(preset, preset.endpointVariants?.[0]?.id)
    setLlmModels(normalizeLlmModelOptions(endpoint.models ?? preset.models))
    setLlmConfig(prev => ({
      ...prev,
      providerPresetId: preset.id,
      providerEndpointId: endpoint.id === preset.id ? undefined : endpoint.id,
      customProviderName: undefined,
      apiMode: endpoint.apiMode ?? preset.apiMode ?? 'openai-compatible',
      baseUrl: endpoint.baseUrl,
      model: endpoint.defaultModel || preset.defaultModel,
      modelsEndpoint: endpoint.modelsEndpoint || preset.modelsEndpoint,
      omitTemperature: endpoint.omitTemperature ?? preset.omitTemperature,
    }))
  }

  const handleProviderEndpointChange = (providerEndpointId: string) => {
    if (!activePreset) return
    const endpoint = getLlmProviderEndpoint(activePreset, providerEndpointId)
    setLlmTestResult(null)
    setLlmTestError(null)
    setLlmModels(normalizeLlmModelOptions(endpoint.models ?? activePreset.models))
    setLlmConfig(prev => ({
      ...prev,
      providerEndpointId: endpoint.id === activePreset.id ? undefined : endpoint.id,
      apiMode: endpoint.apiMode ?? activePreset.apiMode ?? 'openai-compatible',
      baseUrl: endpoint.baseUrl,
      model: endpoint.defaultModel || activePreset.defaultModel,
      modelsEndpoint: endpoint.modelsEndpoint || activePreset.modelsEndpoint,
      omitTemperature: endpoint.omitTemperature ?? activePreset.omitTemperature,
    }))
  }

  const handleFetchLlmModels = async () => {
    setIsFetchingModels(true)
    setLlmTestError(null)
    try {
      const res = await MessageUtils.sendMessage<LlmModelOption[]>({
        type: 'FETCH_LLM_MODELS',
        config: buildLlmConfigPayload(),
      })
      if (res.success && Array.isArray(res.data)) {
        const models = normalizeLlmModelOptions(res.data)
        setLlmModels(models)
        if (!models.some(model => model.id === llmConfig.model) && models[0]) {
          setLlmConfig(prev => ({ ...prev, model: models[0].id }))
        }
        showMessage(`Loaded ${models.length} models`)
      } else {
        setLlmTestError(res.error || 'Failed to fetch models')
      }
    } catch (error) {
      setLlmTestError(error instanceof Error ? error.message : 'Failed to fetch models')
    } finally {
      setIsFetchingModels(false)
    }
  }

  const handleTestLlmConnection = async () => {
    setIsTestingLlm(true)
    setLlmTestResult(null)
    setLlmTestError(null)
    try {
      const res = await MessageUtils.sendMessage<LlmConnectionTestResult>({
        type: 'TEST_LLM_CONNECTION',
        config: buildLlmConfigPayload(),
      })
      if (res.success && res.data) {
        setLlmTestResult(res.data)
        if (res.data.availableModels?.length) {
          setLlmModels(normalizeLlmModelOptions(res.data.availableModels))
        }
        showMessage('LLM connection test passed')
      } else {
        setLlmTestError(res.error || 'Connection test failed')
      }
    } catch (error) {
      setLlmTestError(error instanceof Error ? error.message : 'Connection test failed')
    } finally {
      setIsTestingLlm(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const vocabPayload: Partial<VocabConfig> = {
        ...vocabConfig,
      }
      if (isEudicTokenMasked) {
        delete vocabPayload.eudicToken
      }

      const llmPayload = buildLlmConfigPayload()

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

  const defaultLearningCategoryId = vocabConfig.eudicCategoryIds[0] ?? ''
  const effectiveLearningCategoryId = selectedLearningCategoryId || defaultLearningCategoryId

  const handleSyncLearningProfile = async () => {
    setIsSyncing(true)
    try {
      const res = await MessageUtils.sendMessage({ type: 'SYNC_VOCAB_LEARNING_PROFILE', force: true })
      if (res.success) {
        const stateRes = await MessageUtils.sendMessage({ type: 'GET_VOCAB_LEARNING_SYNC_STATE' })
        if (stateRes.success && stateRes.data) {
          setLearningSyncState(stateRes.data as VocabSyncState)
        }
        showMessage('Learning profile synced')
      } else {
        showMessage('Learning profile sync failed: ' + (res.error || 'Unknown error'), 'error')
      }
    } catch {
      showMessage('Learning profile sync failed', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleEnsureLearningBook = async () => {
    try {
      const res = await MessageUtils.sendMessage<{ categoryId: string }>({ type: 'ENSURE_VOCAB_LEARNING_CATEGORY' })
      if (!res.success || !res.data) {
        showMessage('Failed to setup learning book: ' + (res.error || 'Unknown error'), 'error')
        return
      }
      setSelectedLearningCategoryId(res.data.categoryId)
      const stateRes = await MessageUtils.sendMessage({ type: 'GET_VOCAB_LEARNING_SYNC_STATE' })
      if (stateRes.success && stateRes.data) {
        setLearningSyncState(stateRes.data as VocabSyncState)
      }
      showMessage('Learning book is ready')
    } catch {
      showMessage('Failed to setup learning book', 'error')
    }
  }

  const handleSelectLearningBook = async () => {
    const categoryId = selectedLearningCategoryId || defaultLearningCategoryId
    if (!categoryId) return
    try {
      const res = await MessageUtils.sendMessage({
        type: 'SELECT_VOCAB_LEARNING_CATEGORY',
        categoryId,
      })
      if (!res.success) {
        showMessage('Failed to select learning book: ' + (res.error || 'Unknown error'), 'error')
        return
      }
      const stateRes = await MessageUtils.sendMessage({ type: 'GET_VOCAB_LEARNING_SYNC_STATE' })
      if (stateRes.success && stateRes.data) {
        setLearningSyncState(stateRes.data as VocabSyncState)
      }
      showMessage('Learning book selected')
    } catch {
      showMessage('Failed to select learning book', 'error')
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
        <CheckboxField
          label="Enable adaptive learning"
          checked={vocabConfig.adaptiveLearningEnabled}
          onChange={checked => setVocabConfig(prev => ({ ...prev, adaptiveLearningEnabled: checked }))}
        />
        <Field label="Annotation aggressiveness">
          <SelectInput
            name="annotationAggressiveness"
            value={vocabConfig.annotationAggressiveness}
            onChange={e => setVocabConfig(prev => ({ ...prev, annotationAggressiveness: e.target.value as VocabConfig['annotationAggressiveness'] }))}
          >
            <option value="review-light">Review-light</option>
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
          </SelectInput>
        </Field>
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
        <Field label="Category IDs (optional)" hint="Leave blank to sync all Eudic vocabulary books. Set one or more IDs to limit sync and choose the default feedback target.">
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
            placeholder="Blank = all books, or e.g. 0, abc123"
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

      <SettingsSection title="Adaptive Learning Book">
        <Field
          label="Feedback target book"
          hint={`Defaults to the first Category ID (${defaultLearningCategoryId || 'not set'}). Pending events: ${learningSyncState?.learningPendingCount ?? 0}${learningSyncState?.learningLastError ? `, last error: ${learningSyncState.learningLastError}` : ''}`}
        >
          <SelectInput
            name="learningCategoryId"
            value={effectiveLearningCategoryId}
            onChange={e => setSelectedLearningCategoryId(e.target.value)}
          >
            {defaultLearningCategoryId ? (
              <option value={defaultLearningCategoryId}>Default ({defaultLearningCategoryId})</option>
            ) : (
              <option value="">Select a book...</option>
            )}
            {learningCategories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.id})
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="md:pl-[236px] flex gap-2">
          <Button type="button" variant="secondary" onClick={handleEnsureLearningBook}>
            Ensure Feedback Book
          </Button>
          <Button type="button" variant="secondary" onClick={handleSelectLearningBook} disabled={!effectiveLearningCategoryId}>
            Use This Book
          </Button>
          <Button type="button" variant="secondary" onClick={handleSyncLearningProfile} disabled={isSyncing}>
            {isSyncing ? 'Syncing...' : 'Sync Learning Now'}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="LLM Configuration">
        <Field label="Provider" hint={activePreset ? `${activePreset.region ?? 'OpenAI compatible'} provider preset` : 'Use any OpenAI-compatible endpoint'}>
          <SelectInput name="llmProviderPreset" value={llmConfig.providerPresetId || CUSTOM_LLM_PROVIDER_ID} onChange={e => handleProviderPresetChange(e.target.value)}>
            {LLM_PROVIDER_PRESETS.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
            <option value={CUSTOM_LLM_PROVIDER_ID}>Custom OpenAI Compatible</option>
          </SelectInput>
        </Field>
        {activePreset?.endpointVariants?.length ? (
          <Field
            label="Endpoint"
            hint={activeEndpoint?.description || `${activeEndpoint?.region ?? activePreset.region ?? 'Global'} endpoint, ${activeEndpoint?.apiMode ?? activePreset.apiMode ?? 'openai-compatible'}`}
          >
            <SelectInput
              name="llmProviderEndpoint"
              value={llmConfig.providerEndpointId || activePreset.endpointVariants[0]?.id || ''}
              onChange={e => handleProviderEndpointChange(e.target.value)}
            >
              {activePreset.endpointVariants.map(endpoint => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        {!activePreset && (
          <Field label="Custom provider name">
            <TextInput
              name="llmCustomProviderName"
              type="text"
              value={llmConfig.customProviderName ?? ''}
              onChange={e => setLlmConfig(prev => ({ ...prev, customProviderName: e.target.value }))}
              placeholder="My provider"
            />
          </Field>
        )}
        <Field label="Base URL">
          <TextInput
            name="llmBaseUrl"
            type="text"
            value={llmConfig.baseUrl}
            onChange={e => setLlmConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
            placeholder="https://api.openai.com"
          />
        </Field>
        {!activePreset && (
          <Field label="Models endpoint" hint="Optional. Leave blank to use Base URL + /v1/models.">
            <TextInput
              name="llmModelsEndpoint"
              type="text"
              value={llmConfig.modelsEndpoint ?? ''}
              onChange={e => setLlmConfig(prev => ({ ...prev, modelsEndpoint: e.target.value || undefined }))}
              placeholder="https://api.example.com/v1/models"
            />
          </Field>
        )}
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
        <Field label="Model" hint="Choose a preset model or type a custom model id.">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.5fr)]">
            <SelectInput
              name="llmModelSelect"
              value={llmModels.some(model => model.id === llmConfig.model) ? llmConfig.model : ''}
              onChange={e => setLlmConfig(prev => ({ ...prev, model: e.target.value }))}
            >
              <option value="">Custom model...</option>
              {llmModels.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name || model.id}
                </option>
              ))}
            </SelectInput>
            <TextInput
              name="llmModel"
              type="text"
              value={llmConfig.model}
              onChange={e => setLlmConfig(prev => ({ ...prev, model: e.target.value }))}
              placeholder={activePreset?.defaultModel || 'model-id'}
            />
          </div>
        </Field>
        <div className="md:pl-[236px] flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={handleFetchLlmModels} disabled={isFetchingModels || isTestingLlm}>
            {isFetchingModels ? 'Loading models...' : 'Fetch Models'}
          </Button>
          <Button type="button" variant="secondary" onClick={handleTestLlmConnection} disabled={isTestingLlm || isFetchingModels}>
            {isTestingLlm ? 'Testing...' : 'Test Connection'}
          </Button>
          {activePreset?.apiKeyUrl && (
            <a className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-slate-600 hover:text-slate-950" href={activePreset.apiKeyUrl} target="_blank" rel="noreferrer">
              Get API key
            </a>
          )}
          {activePreset?.docsUrl && (
            <a className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-slate-600 hover:text-slate-950" href={activePreset.docsUrl} target="_blank" rel="noreferrer">
              Docs
            </a>
          )}
        </div>
        {(llmTestResult || llmTestError) && (
          <div className="md:pl-[236px]">
            <StatusMessage tone={llmTestError ? 'error' : 'success'}>
              {llmTestError ? llmTestError : `Connected to ${llmTestResult?.model} at ${llmTestResult?.endpoint}. Response: ${llmTestResult?.responsePreview || 'OK'}`}
            </StatusMessage>
          </div>
        )}
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
