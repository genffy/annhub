import { Logger } from '../../../utils/logger'
import { IService } from '../../service-manager'
import { ResponseMessage } from '../../../types/messages'
import {
  VocabConfig,
  defaultVocabConfig,
  LlmConfig,
  resolveDefaultLlmConfig,
  LlmConfigPublic,
  LlmApiKeySource,
  VocabConfigPublic,
  resolveDefaultVocabConfig,
  VocabSnapshot,
  VocabSyncState,
  VocabEntry,
  GlossResult,
  GlossCacheEntry,
  normalizeDomainRuleList,
  normalizeWord,
  VocabLearningEvent,
  VocabLearningPendingEvent,
  LlmConnectionTestResult,
  LlmModelOption,
  WordMemoryStore,
  MemoryEvent,
  MemoryEventType,
  RecallState,
  RecallStateCache,
  VocabSyncIdentity,
  VocabMemorySyncState,
} from '../../../types/vocabulary'
import { applyEvent, recallProbability, recallToStar, type WordMemory, type WordMemoryEventType } from '../../../entrypoints/content/annotation-core/word-memory'
import { MemorySyncClient, MEMORY_EVENT_BATCH_LIMIT } from './memory-sync'
import { findLlmProviderEndpoint, findLlmProviderPreset, normalizeLlmModelOptions } from '../../../utils/llm-provider-presets'
import {
  EudicCategory,
  EudicWord,
  EudicWordDetail,
  addWord,
  createCategory,
  deleteCategory,
  deleteWordsFromCategory,
  fetchAllWords,
  fetchCategories,
  fetchWords,
  getWord,
  renameCategory,
} from '../../../utils/eudic-openapi'
import { createLlmClient, type ILlmClient } from '../llm'
import { messageHandlers } from './message-handles'

const STORAGE_KEYS = {
  vocabConfig: 'vocabConfig',
  llmConfig: 'llmConfig',
  vocabSnapshot: 'vocabSnapshot',
  vocabSyncState: 'vocabSyncState',
  glossCache: 'glossCache',
  vocabLearningCategoryId: 'vocabLearningCategoryId',
  vocabMasteredCategoryId: 'vocabMasteredCategoryId',
  vocabLearningPendingEvents: 'vocabLearningPendingEvents',
  vocabWordMemory: 'vocabWordMemory',
  // T1-B: memory sync (server personalization). See docs/vocab-server-memory-model-design.md §2.3.
  vocabMemoryEventQueue: 'vocabMemoryEventQueue',
  vocabRecallCache: 'vocabRecallCache',
  vocabSyncIdentity: 'vocabSyncIdentity',
  vocabMemorySyncState: 'vocabMemorySyncState',
} as const

const ALARM_NAME = 'vocab-sync'
const MEMORY_SYNC_ALARM_NAME = 'vocab-memory-sync'
const GLOSS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
const DAY_MS = 24 * 60 * 60 * 1000
/** Recall-cache staleness window; past this the local estimate is used instead (design §5). */
const RECALL_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
/** Bound the offline event queue so storage can't grow without limit; oldest events drop first. */
const MAX_QUEUED_MEMORY_EVENTS = 5000
/** Background flush cadence for queued memory events (independent of the Eudic sync alarm). */
const MEMORY_SYNC_PERIOD_MINUTES = 15
const DEFAULT_LEARNING_CATEGORY_NAME = 'AnnHub Learning'
const DEFAULT_MASTERED_CATEGORY_NAME = 'AnnHub Mastered'

export class VocabularyService implements IService {
  readonly name = 'vocabulary' as const
  private static instance: VocabularyService
  private initialized = false
  private alarmListener: ((alarm: chrome.alarms.Alarm) => void) | null = null

  private constructor() {}

  static getInstance(): VocabularyService {
    if (!VocabularyService.instance) {
      VocabularyService.instance = new VocabularyService()
    }
    return VocabularyService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      Logger.info('[VocabularyService] Already initialized, skipping...')
      return
    }

    try {
      Logger.info('[VocabularyService] Initializing...')

      const config = await this.getVocabConfig()

      if (config.enabled && config.eudicToken) {
        // Non-blocking initial sync
        this.syncFromEudic().catch(err => {
          Logger.error('[VocabularyService] Initial sync failed:', err)
        })
      }

      // Set up periodic sync alarm
      if (config.enabled && config.syncPeriodMinutes > 0) {
        await this.setupAlarm(config.syncPeriodMinutes)
      }

      // T1-B: periodic memory-event flush (opt-in, independent of Eudic sync).
      if (config.memorySyncEnabled) {
        await this.setupMemorySyncAlarm()
      }

      // Listen for alarm
      if (this.alarmListener) {
        chrome.alarms.onAlarm.removeListener(this.alarmListener)
      }
      this.alarmListener = (alarm: chrome.alarms.Alarm) => {
        if (alarm.name === ALARM_NAME) {
          this.syncFromEudic().catch(err => {
            Logger.error('[VocabularyService] Alarm sync failed:', err)
          })
        } else if (alarm.name === MEMORY_SYNC_ALARM_NAME) {
          this.flushMemoryEvents().catch(err => {
            Logger.error('[VocabularyService] Memory sync flush failed:', err)
          })
        }
      }
      chrome.alarms.onAlarm.addListener(this.alarmListener)

      this.initialized = true
      Logger.info('[VocabularyService] Initialized successfully')
    } catch (error) {
      Logger.error('[VocabularyService] Failed to initialize:', error)
      throw error
    }
  }

  getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
    return messageHandlers
  }

  isInitialized(): boolean {
    return this.initialized
  }

  // ── Config access ──

  async getVocabConfig(): Promise<VocabConfig> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabConfig)
    const stored = result[STORAGE_KEYS.vocabConfig] as Partial<VocabConfig> | undefined
    const envDefaults = resolveDefaultVocabConfig()
    if (!stored) {
      return envDefaults
    }

    const merged: VocabConfig = {
      ...defaultVocabConfig,
      ...envDefaults,
      ...stored,
      domainWhitelist: {
        ...defaultVocabConfig.domainWhitelist,
        ...envDefaults.domainWhitelist,
        ...(stored.domainWhitelist ?? {}),
      },
    }

    if (!stored.eudicToken?.trim()) {
      merged.eudicToken = envDefaults.eudicToken
    }

    if (!stored.eudicCategoryIds) {
      merged.eudicCategoryIds = envDefaults.eudicCategoryIds
    }

    merged.domainWhitelist.domains = normalizeDomainRuleList(merged.domainWhitelist.domains)

    return merged
  }

  async setVocabConfig(config: Partial<VocabConfig>): Promise<void> {
    const current = await this.getVocabConfig()
    const merged: VocabConfig = {
      ...current,
      ...config,
      domainWhitelist: {
        ...current.domainWhitelist,
        ...(config.domainWhitelist ?? {}),
      },
    }
    merged.domainWhitelist.domains = normalizeDomainRuleList(merged.domainWhitelist.domains)
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabConfig]: merged })

    // Update alarm if sync period changed
    if (config.syncPeriodMinutes !== undefined || config.enabled !== undefined) {
      if (merged.enabled && merged.syncPeriodMinutes > 0) {
        await this.setupAlarm(merged.syncPeriodMinutes)
      } else {
        await chrome.alarms.clear(ALARM_NAME)
      }
    }

    // Toggle the memory-sync flush alarm when opt-in changes.
    if (config.memorySyncEnabled !== undefined) {
      if (merged.memorySyncEnabled) {
        await this.setupMemorySyncAlarm()
      } else {
        await chrome.alarms.clear(MEMORY_SYNC_ALARM_NAME)
      }
    }
  }

  async getVocabConfigPublic(): Promise<VocabConfigPublic> {
    const config = await this.getVocabConfig()
    const hasEudicToken = Boolean(config.eudicToken?.trim())
    const { eudicToken, ...publicConfig } = config
    return {
      ...publicConfig,
      hasEudicToken,
    }
  }

  async getLlmConfig(): Promise<LlmConfig> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.llmConfig)
    const stored = result[STORAGE_KEYS.llmConfig] as Partial<LlmConfig> | undefined
    if (stored && stored.baseUrl && stored.apiKey) return stored as LlmConfig
    const envDefaults = resolveDefaultLlmConfig()
    if (!stored) return envDefaults
    const merged = { ...envDefaults }
    for (const [k, v] of Object.entries(stored)) {
      if (v !== undefined && v !== '') {
        ;(merged as any)[k] = v
      }
    }
    return merged
  }

  async setLlmConfig(config: Partial<LlmConfig>): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.llmConfig)
    const stored = result[STORAGE_KEYS.llmConfig] as Partial<LlmConfig> | undefined
    const merged: Partial<LlmConfig> = { ...(stored ?? {}) }

    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        ;(merged as any)[key] = value
      }
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.llmConfig]: merged })
  }

  async getLlmConfigPublic(): Promise<LlmConfigPublic> {
    const config = await this.getLlmConfig()
    const storedResult = await chrome.storage.local.get(STORAGE_KEYS.llmConfig)
    const stored = storedResult[STORAGE_KEYS.llmConfig] as Partial<LlmConfig> | undefined
    const envDefaultApiKey = resolveDefaultLlmConfig().apiKey.trim()
    const storedApiKey = (stored?.apiKey ?? '').trim()
    const hasApiKey = Boolean(config.apiKey?.trim())

    let apiKeySource: LlmApiKeySource = 'none'
    if (hasApiKey) {
      if (storedApiKey) {
        // Backward-compatible: treat stored value identical to env default as env source.
        apiKeySource = envDefaultApiKey && storedApiKey === envDefaultApiKey ? 'env' : 'storage'
      } else if (envDefaultApiKey) {
        apiKeySource = 'env'
      } else {
        apiKeySource = 'storage'
      }
    }

    const { apiKey, ...publicConfig } = config
    return { ...publicConfig, hasApiKey, apiKeySource }
  }

  private mergePresetIntoLlmConfig(config: LlmConfig): LlmConfig {
    const preset = findLlmProviderPreset(config.providerPresetId)
    const endpoint = findLlmProviderEndpoint(config.providerPresetId, config.providerEndpointId)
    if (!preset || !endpoint) return config

    return {
      ...config,
      apiMode: endpoint.apiMode ?? preset.apiMode ?? config.apiMode ?? 'openai-compatible',
      baseUrl: config.baseUrl || endpoint.baseUrl,
      model: config.model || endpoint.defaultModel || preset.defaultModel,
      modelsEndpoint: config.modelsEndpoint || endpoint.modelsEndpoint || preset.modelsEndpoint,
      omitTemperature: config.omitTemperature ?? endpoint.omitTemperature ?? preset.omitTemperature,
    }
  }

  async getLlmRuntimeConfig(override?: Partial<LlmConfig>): Promise<LlmConfig> {
    const stored = await this.getLlmConfig()
    const merged: LlmConfig = {
      ...stored,
      ...(override ?? {}),
    }

    if (override && override.apiKey === undefined) {
      merged.apiKey = stored.apiKey
    }

    return this.mergePresetIntoLlmConfig(merged)
  }

  private getLlmFallbackModels(config: LlmConfig): LlmModelOption[] {
    const preset = findLlmProviderPreset(config.providerPresetId)
    if (!preset) return []
    const endpoint = findLlmProviderEndpoint(config.providerPresetId, config.providerEndpointId)
    return normalizeLlmModelOptions(endpoint?.models ?? preset.models)
  }

  async fetchLlmModels(configOverride?: Partial<LlmConfig>): Promise<LlmModelOption[]> {
    const config = await this.getLlmRuntimeConfig(configOverride)
    const fallbackModels = this.getLlmFallbackModels(config)

    if (config.apiMode && config.apiMode !== 'openai-compatible') {
      return fallbackModels
    }

    if (!config.baseUrl || !config.apiKey) {
      return fallbackModels
    }

    try {
      const client = createLlmClient(config)
      const remoteModels = await client.listModels?.()
      const normalizedRemote = normalizeLlmModelOptions(remoteModels ?? [])
      return normalizedRemote.length > 0 ? normalizedRemote : fallbackModels
    } catch (error) {
      Logger.warn('[VocabularyService] Failed to fetch LLM models:', error)
      if (fallbackModels.length > 0) return fallbackModels
      throw error
    }
  }

  async testLlmConnection(configOverride?: Partial<LlmConfig>): Promise<LlmConnectionTestResult> {
    const config = await this.getLlmRuntimeConfig(configOverride)
    if (!config.baseUrl || !config.apiKey || !config.model) {
      throw new Error('LLM config incomplete: Base URL, API key, and model are required')
    }
    if (config.apiMode && config.apiMode !== 'openai-compatible') {
      throw new Error(`Provider endpoint uses ${config.apiMode}; AnnHub currently supports Test Connection for OpenAI-compatible endpoints only`)
    }

    const client = createLlmClient(config)
    const response = await client.completeChat({
      system: 'Reply with exactly OK.',
      user: 'Connection test.',
      temperature: 0,
      maxTokens: 8,
      timeoutMs: config.requestTimeoutMs ?? 30000,
    })

    let availableModels: LlmModelOption[] | undefined
    try {
      availableModels = await this.fetchLlmModels(config)
    } catch {
      availableModels = undefined
    }

    return {
      ok: true,
      endpoint: config.baseUrl,
      model: config.model,
      responsePreview: response.slice(0, 80),
      availableModels,
    }
  }

  // ── Eudic category/word management ──

  async listEudicCategories(language = 'en'): Promise<EudicCategory[]> {
    const token = await this.getEudicToken()
    return fetchCategories(token, language)
  }

  async createEudicCategory(name: string, language = 'en'): Promise<EudicCategory> {
    const token = await this.getEudicToken()
    return createCategory(token, { language, name })
  }

  async renameEudicCategory(id: string, name: string, language = 'en'): Promise<void> {
    const token = await this.getEudicToken()
    await renameCategory(token, { id, language, name })
  }

  async deleteEudicCategory(id: string, name: string, language = 'en'): Promise<void> {
    const token = await this.getEudicToken()
    await deleteCategory(token, { id, language, name })
  }

  async listEudicWords(
    categoryId: string,
    options: {
      language?: string
      page?: number
      pageSize?: number
    } = {},
  ): Promise<{ words: EudicWord[]; hasMore: boolean }> {
    const token = await this.getEudicToken()
    const language = options.language ?? 'en'
    const page = options.page ?? 0
    const pageSize = options.pageSize ?? 100
    return fetchWords(token, categoryId, language, page, pageSize)
  }

  async addEudicWord(
    word: string,
    options: {
      language?: string
      star?: number
      contextLine?: string
      categoryIds?: string[]
    } = {},
  ): Promise<void> {
    const token = await this.getEudicToken()
    await addWord(token, {
      language: options.language ?? 'en',
      word,
      star: options.star,
      contextLine: options.contextLine,
      categoryIds: options.categoryIds,
    })
  }

  async deleteEudicWords(categoryId: string, words: string[], language = 'en'): Promise<void> {
    const token = await this.getEudicToken()
    await deleteWordsFromCategory(token, { categoryId, language, words })
  }

  async getEudicWord(word: string, language = 'en'): Promise<EudicWordDetail | null> {
    const token = await this.getEudicToken()
    return getWord(token, word, language)
  }

  // ── Sync ──

  async syncFromEudic(_options?: { force?: boolean }): Promise<{ count: number; syncedAt: number }> {
    const config = await this.getVocabConfig()

    if (!config.eudicToken) {
      throw new Error('Eudic token not configured')
    }

    Logger.info('[VocabularyService] Starting Eudic sync...')

    try {
      const categoryIds = await this.resolveSyncCategoryIds(config)
      const learningCategoryId = await this.getLearningCategoryId()
      if (learningCategoryId && !categoryIds.includes(learningCategoryId)) {
        categoryIds.push(learningCategoryId)
      }
      const masteredCategoryId = await this.getMasteredCategoryId()
      if (masteredCategoryId && !categoryIds.includes(masteredCategoryId)) {
        categoryIds.push(masteredCategoryId)
      }

      const words = await fetchAllWords(config.eudicToken, categoryIds)

      const entries: Record<string, VocabEntry> = {}
      for (const w of words) {
        const key = normalizeWord(w.word)
        if (!key) continue
        entries[key] = {
          proficiency: w.star ?? 0,
          exp: w.exp,
          star: w.star,
        }
      }
      if (masteredCategoryId) {
        const masteredWords = await fetchAllWords(config.eudicToken, [masteredCategoryId])
        for (const w of masteredWords) {
          const key = normalizeWord(w.word)
          if (!key) continue
          entries[key] = {
            ...entries[key],
            proficiency: 5,
            exp: w.exp ?? entries[key]?.exp,
            star: 5,
          }
        }
      }
      await this.overlayPendingLearningEvents(entries)

      const snapshot: VocabSnapshot = {
        version: '1.0',
        updatedAt: Date.now(),
        entries,
      }

      await chrome.storage.local.set({ [STORAGE_KEYS.vocabSnapshot]: snapshot })

      const syncState: VocabSyncState = {
        lastSyncAt: Date.now(),
        lastSyncStatus: 'ok',
        learningCategoryId: learningCategoryId || undefined,
        masteredCategoryId: masteredCategoryId || undefined,
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.vocabSyncState]: syncState })

      Logger.info(`[VocabularyService] Synced ${Object.keys(entries).length} words`)
      return { count: Object.keys(entries).length, syncedAt: snapshot.updatedAt }
    } catch (error) {
      const syncState: VocabSyncState = {
        lastSyncAt: Date.now(),
        lastSyncStatus: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.vocabSyncState]: syncState })
      throw error
    }
  }

  private async resolveSyncCategoryIds(config: VocabConfig): Promise<string[]> {
    if (config.eudicCategoryIds.length > 0) {
      return [...config.eudicCategoryIds]
    }

    const categories = await this.listEudicCategories('en')
    return categories.map(category => category.id).filter(Boolean)
  }

  async ensureLearningCategory(
    options: {
      language?: string
      name?: string
      forceRefresh?: boolean
    } = {},
  ): Promise<{ categoryId: string; created: boolean }> {
    const language = options.language ?? 'en'
    const categoryName = options.name?.trim() || DEFAULT_LEARNING_CATEGORY_NAME
    const storedCategoryId = options.forceRefresh ? '' : await this.getLearningCategoryId()
    if (storedCategoryId) {
      return { categoryId: storedCategoryId, created: false }
    }

    const configuredDefaultCategoryId = await this.getConfiguredDefaultCategoryId()
    if (configuredDefaultCategoryId) {
      await chrome.storage.local.set({ [STORAGE_KEYS.vocabLearningCategoryId]: configuredDefaultCategoryId })
      await this.updateLearningSyncState({
        learningCategoryId: configuredDefaultCategoryId,
      })
      return { categoryId: configuredDefaultCategoryId, created: false }
    }

    const categories = await this.listEudicCategories(language)
    const matched = categories.find(category => category.name.trim() === categoryName)
    if (matched) {
      await chrome.storage.local.set({ [STORAGE_KEYS.vocabLearningCategoryId]: matched.id })
      await this.updateLearningSyncState({
        learningCategoryId: matched.id,
      })
      return { categoryId: matched.id, created: false }
    }

    const created = await this.createEudicCategory(categoryName, language)
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabLearningCategoryId]: created.id })
    await this.updateLearningSyncState({
      learningCategoryId: created.id,
    })
    return { categoryId: created.id, created: true }
  }

  async selectLearningCategory(categoryId: string): Promise<void> {
    const normalizedId = categoryId.trim()
    if (!normalizedId) {
      throw new Error('Learning category ID is required')
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.vocabLearningCategoryId]: normalizedId })
    await this.updateLearningSyncState({
      learningCategoryId: normalizedId,
    })
  }

  async ensureMasteredCategory(
    options: {
      language?: string
      name?: string
      forceRefresh?: boolean
    } = {},
  ): Promise<{ categoryId: string; created: boolean }> {
    const language = options.language ?? 'en'
    const categoryName = options.name?.trim() || DEFAULT_MASTERED_CATEGORY_NAME
    const storedCategoryId = options.forceRefresh ? '' : await this.getMasteredCategoryId()
    if (storedCategoryId) {
      return { categoryId: storedCategoryId, created: false }
    }

    const categories = await this.listEudicCategories(language)
    const matched = categories.find(category => category.name.trim() === categoryName)
    if (matched) {
      await chrome.storage.local.set({ [STORAGE_KEYS.vocabMasteredCategoryId]: matched.id })
      await this.updateLearningSyncState({
        masteredCategoryId: matched.id,
      })
      return { categoryId: matched.id, created: false }
    }

    const created = await this.createEudicCategory(categoryName, language)
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabMasteredCategoryId]: created.id })
    await this.updateLearningSyncState({
      masteredCategoryId: created.id,
    })
    return { categoryId: created.id, created: true }
  }

  async selectMasteredCategory(categoryId: string): Promise<void> {
    const normalizedId = categoryId.trim()
    if (!normalizedId) {
      throw new Error('Mastered category ID is required')
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.vocabMasteredCategoryId]: normalizedId })
    await this.updateLearningSyncState({
      masteredCategoryId: normalizedId,
    })
  }

  async syncLearningProfileFromEudic(options: { force?: boolean; language?: string } = {}): Promise<{ count: number; syncedAt: number }> {
    const language = options.language ?? 'en'
    const category = await this.ensureLearningCategory({ language, forceRefresh: options.force })
    const token = await this.getEudicToken()
    const words = await fetchAllWords(token, [category.categoryId], language)

    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabSnapshot)
    const snapshot = (result[STORAGE_KEYS.vocabSnapshot] as VocabSnapshot | undefined) ?? {
      version: '1.0',
      updatedAt: Date.now(),
      entries: {},
    }
    const entries: Record<string, VocabEntry> = { ...snapshot.entries }
    for (const word of words) {
      const key = normalizeWord(word.word)
      if (!key) continue
      const star = this.normalizeStar(word.star)
      entries[key] = {
        ...entries[key],
        proficiency: star,
        star,
        exp: word.exp ?? entries[key]?.exp,
      }
    }

    const updatedSnapshot: VocabSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      entries,
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabSnapshot]: updatedSnapshot })
    await this.updateLearningSyncState({
      learningCategoryId: category.categoryId,
      learningLastSyncAt: Date.now(),
      learningLastSyncStatus: 'ok',
      learningLastError: undefined,
    })

    return { count: words.length, syncedAt: updatedSnapshot.updatedAt }
  }

  async recordLearningEvent(event: VocabLearningEvent): Promise<{
    queued: number
    star: number
    word: string
    flush?: { successCount: number; failedCount: number; pendingCount: number }
  }> {
    const word = normalizeWord(event.word)
    if (!word) {
      throw new Error('Word is required')
    }

    const currentStar = await this.getCurrentWordStar(word)
    const targetStar = this.resolveTargetStar(event, currentStar)
    await this.upsertWordLearningState(word, targetStar)

    // Update the local recall-probability memory in parallel with the Eudic-bound star.
    await this.applyWordMemoryEvent(word, this.mapLearningEventToMemory(event.eventType))

    const pending = await this.getPendingLearningEvents()
    const now = Date.now()
    const pendingEvent: VocabLearningPendingEvent = {
      id: `${now}_${Math.random().toString(36).slice(2, 10)}`,
      word,
      star: targetStar,
      eventType: event.eventType,
      sentence: event.sentence,
      language: event.language ?? 'en',
      createdAt: event.timestamp ?? now,
      updatedAt: now,
      attempts: 0,
    }
    pending.push(pendingEvent)
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabLearningPendingEvents]: pending })
    await this.updateLearningSyncState({
      learningPendingCount: pending.length,
    })

    let flushResult: { successCount: number; failedCount: number; pendingCount: number } | undefined
    try {
      flushResult = await this.flushLearningPendingEvents()
    } catch (error) {
      await this.updateLearningSyncState({
        learningPendingCount: pending.length,
        learningLastSyncAt: Date.now(),
        learningLastSyncStatus: 'error',
        learningLastError: error instanceof Error ? error.message : String(error),
      })
      Logger.warn('[VocabularyService] Failed to flush pending learning events', error)
    }

    return { queued: flushResult?.pendingCount ?? pending.length, star: targetStar, word, flush: flushResult }
  }

  async flushLearningPendingEvents(): Promise<{ successCount: number; failedCount: number; pendingCount: number }> {
    const pending = await this.getPendingLearningEvents()
    if (pending.length === 0) {
      await this.updateLearningSyncState({ learningPendingCount: 0 })
      return { successCount: 0, failedCount: 0, pendingCount: 0 }
    }

    const category = await this.ensureLearningCategory({ language: pending[0]?.language ?? 'en' })
    const categoryId = category.categoryId

    const nextPending: VocabLearningPendingEvent[] = []
    let successCount = 0
    let failedCount = 0
    for (const event of pending) {
      const eventType = this.normalizeLearningEventType(event.eventType)
      if (eventType === 'unknown' || eventType === 'reveal') {
        successCount += 1
        continue
      }
      try {
        await this.dispatchEudicLearningEvent(event, categoryId)
        successCount += 1
      } catch (error) {
        failedCount += 1
        nextPending.push({
          ...event,
          attempts: event.attempts + 1,
          updatedAt: Date.now(),
          lastError: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.vocabLearningPendingEvents]: nextPending })
    await this.updateLearningSyncState({
      learningCategoryId: categoryId,
      learningPendingCount: nextPending.length,
      learningLastSyncAt: Date.now(),
      learningLastSyncStatus: failedCount > 0 ? 'error' : 'ok',
      learningLastError: failedCount > 0 ? (nextPending[0]?.lastError ?? 'Unknown error') : undefined,
    })

    return {
      successCount,
      failedCount,
      pendingCount: nextPending.length,
    }
  }

  async getLearningSyncState(): Promise<VocabSyncState> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabSyncState)
    const state = result[STORAGE_KEYS.vocabSyncState] as VocabSyncState | undefined
    const defaultCategoryId = await this.getConfiguredDefaultCategoryId()
    const masteredCategoryId = await this.getMasteredCategoryId()
    if (!state) {
      const pending = await this.getPendingLearningEvents()
      const learningCategoryId = await this.getLearningCategoryId()
      return {
        lastSyncAt: 0,
        lastSyncStatus: 'ok',
        learningCategoryId: learningCategoryId || defaultCategoryId || undefined,
        masteredCategoryId: masteredCategoryId || undefined,
        learningPendingCount: pending.length,
      }
    }
    return {
      ...state,
      learningCategoryId: state.learningCategoryId || defaultCategoryId || undefined,
      masteredCategoryId: state.masteredCategoryId || masteredCategoryId || undefined,
    }
  }

  async getLearningProfile(words?: string[]): Promise<{ stars: Record<string, number>; pendingCount: number }> {
    const snapshot = await this.getSnapshot(words)
    const pending = await this.getPendingLearningEvents()
    const memoryStore = await this.getWordMemoryStore()
    const now = Date.now()
    const filterSet = words && words.length > 0 ? new Set(words.map(normalizeWord).filter(Boolean)) : null

    const stars: Record<string, number> = {}
    const entries = snapshot?.entries ?? {}
    for (const [word, entry] of Object.entries(entries)) {
      if (filterSet && !filterSet.has(word)) continue
      const raw = typeof entry.star === 'number' ? entry.star : entry.proficiency
      stars[word] = this.normalizeStar(raw)
    }

    for (const event of pending) {
      const eventType = this.normalizeLearningEventType(event.eventType)
      if (eventType === 'unknown' || eventType === 'reveal') continue
      if (filterSet && !filterSet.has(event.word)) continue
      stars[event.word] = this.normalizeStar(event.star)
    }

    // Fold in the local recall-probability memory. Passive exposure (seen but not
    // clicked) decays/grows independently of Eudic star, so a word repeatedly shown
    // climbs toward "known" and stops being annotated. We take the MAX of the
    // snapshot/pending star and the recall-derived star so an explicit Eudic "known"
    // is never weakened, but passive learning can still raise a word's effective star.
    for (const [word, memory] of Object.entries(memoryStore)) {
      if (filterSet && !filterSet.has(word)) continue
      const recallStar = recallToStar(recallProbability(memory, now))
      stars[word] = Math.max(stars[word] ?? 1, recallStar)
    }

    // T1-B: fold in server-computed recall (cached). Preferred-but-never-weakening: like the
    // local recall above it only ever raises a word's star (max), so an explicit Eudic "known"
    // is safe. Stale entries (past TTL) are ignored and fall back to the local estimate.
    const recallCache = await this.getRecallCache()
    for (const [word, state] of Object.entries(recallCache)) {
      if (filterSet && !filterSet.has(word)) continue
      const serverStar = this.recallStarFromState(state, now)
      if (serverStar !== null) stars[word] = Math.max(stars[word] ?? 1, serverStar)
    }

    // When opt-in and an endpoint is configured, refresh recall for requested words that are
    // missing/expired in the cache — fire-and-forget so the annotation hot path never blocks.
    if (filterSet) {
      const config = await this.getVocabConfig()
      if (config.memorySyncEnabled && config.memorySyncEndpoint.trim()) {
        const toRefresh = Array.from(filterSet).filter(word => {
          const cached = recallCache[word]
          return !cached || now - cached.computedAt > RECALL_CACHE_TTL_MS
        })
        if (toRefresh.length > 0) {
          void this.refreshRecallStates(toRefresh).catch(() => {})
        }
      }
    }

    return { stars, pendingCount: pending.length }
  }

  async resetWordLearning(word: string, language = 'en'): Promise<{ queued: number; star: number; word: string }> {
    return this.recordLearningEvent({
      word,
      language,
      eventType: 'reset',
    })
  }

  // ── Snapshot access ──

  async getSnapshot(words?: string[]): Promise<VocabSnapshot | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabSnapshot)
    const snapshot = result[STORAGE_KEYS.vocabSnapshot] as VocabSnapshot | undefined

    if (!snapshot) return null

    if (words && words.length > 0) {
      const filtered: Record<string, VocabEntry> = {}
      for (const w of words) {
        const key = normalizeWord(w)
        if (snapshot.entries[key]) {
          filtered[key] = snapshot.entries[key]
        }
      }
      return { ...snapshot, entries: filtered }
    }

    return snapshot
  }

  // ── Gloss resolution ──

  async resolveGloss(word: string, sentence: string, targetLanguage = 'zh-CN'): Promise<GlossResult> {
    const wordNorm = normalizeWord(word)

    // 1. Check vocab snapshot for exp
    const snapshot = await this.getSnapshot()
    if (snapshot?.entries[wordNorm]?.exp) {
      return { gloss: snapshot.entries[wordNorm].exp!, source: 'exp' }
    }

    // 2. Check gloss cache
    const cacheKey = `${wordNorm}:${this.hashSentence(sentence)}`
    const cache = await this.getGlossCache()
    if (cache[cacheKey] && Date.now() - cache[cacheKey].updatedAt < GLOSS_CACHE_TTL) {
      return { gloss: cache[cacheKey].gloss, source: 'cache' }
    }

    // 3. Call LLM
    const llmConfig = await this.getLlmRuntimeConfig()
    if (!llmConfig.baseUrl || !llmConfig.apiKey || !llmConfig.model) {
      return { gloss: '', source: 'llm' }
    }

    try {
      const client: ILlmClient = createLlmClient(llmConfig)
      const systemPrompt = llmConfig.systemPrompt || '你是一位精通英语与中文的翻译专家，擅长根据上下文语境提供准确、简洁的词义。'

      const gloss = await client.completeChat({
        system: systemPrompt,
        user:
          `源句子：\n"""\n${sentence}\n"""\n\n` +
          `请根据上述句子的语境，给出单词 "${word}" 在此处的简短${targetLanguage}释义。\n\n` +
          `要求：\n` +
          `1. 忠实于源句子语境，给出该词在此处的确切含义。\n` +
          `2. 释义不超过8个字。\n` +
          `3. 仅输出释义本身，不要输出任何其他内容。`,
        temperature: 0.3,
        maxTokens: 50,
      })

      // Cache the result
      cache[cacheKey] = { gloss, updatedAt: Date.now() }
      await chrome.storage.local.set({ [STORAGE_KEYS.glossCache]: cache })

      return { gloss, source: 'llm' }
    } catch (error) {
      Logger.error('[VocabularyService] LLM gloss failed:', error)
      return { gloss: '', source: 'llm' }
    }
  }

  // ── Helpers ──

  private async setupAlarm(periodInMinutes: number): Promise<void> {
    await chrome.alarms.clear(ALARM_NAME)
    // Chrome MV3 minimum is 1 minute (was 0.5 in some versions)
    const period = Math.max(1, periodInMinutes)
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: period })
    Logger.info(`[VocabularyService] Alarm set: every ${period} minutes`)
  }

  private async setupMemorySyncAlarm(): Promise<void> {
    await chrome.alarms.clear(MEMORY_SYNC_ALARM_NAME)
    await chrome.alarms.create(MEMORY_SYNC_ALARM_NAME, { periodInMinutes: MEMORY_SYNC_PERIOD_MINUTES })
    Logger.info(`[VocabularyService] Memory sync alarm set: every ${MEMORY_SYNC_PERIOD_MINUTES} minutes`)
  }

  /**
   * S4: LLM-assisted word selection + gloss. Given candidate words (each with its
   * sentence), ask the LLM which are genuinely unfamiliar to the user's CEFR level and
   * gloss them in one round-trip. Words already in the Eudic snapshot or gloss cache are
   * resolved locally. Returns word → { unfamiliar, gloss }.
   */
  async selectAndGloss(candidates: Array<{ word: string; sentence: string }>, targetLanguage = 'zh-CN'): Promise<Record<string, { unfamiliar: boolean; gloss: string }>> {
    const result: Record<string, { unfamiliar: boolean; gloss: string }> = {}
    if (candidates.length === 0) return result

    const config = await this.getVocabConfig()
    const llmConfig = await this.getLlmRuntimeConfig()
    const llmReady = Boolean(llmConfig.baseUrl && llmConfig.apiKey && llmConfig.model)

    const toAsk: Array<{ word: string; sentence: string }> = []

    const snapshot = await this.getSnapshot()
    const cache = await this.getGlossCache()
    for (const c of candidates) {
      const wordNorm = normalizeWord(c.word)
      const exp = snapshot?.entries[wordNorm]?.exp
      if (exp) {
        // Eudic learning-list word: still worth showing → unfamiliar, with its exp.
        result[c.word] = { unfamiliar: true, gloss: exp }
        continue
      }
      const cacheKey = `${wordNorm}:${this.hashSentence(c.sentence)}`
      const cached = cache[cacheKey]
      if (cached && Date.now() - cached.updatedAt < GLOSS_CACHE_TTL) {
        result[c.word] = { unfamiliar: true, gloss: cached.gloss }
        continue
      }
      toAsk.push(c)
    }

    if (toAsk.length === 0) return result

    if (!llmReady || !config.llmWordSelectionEnabled) {
      // No LLM / selection disabled: leave LLM-undecided candidates as unfamiliar so the
      // caller's local gate (which already selected them) still annotates them.
      for (const c of toAsk) result[c.word] = { unfamiliar: true, gloss: '' }
      return result
    }

    try {
      const client = createLlmClient(llmConfig)
      if (!client.selectAndGloss) {
        for (const c of toAsk) result[c.word] = { unfamiliar: true, gloss: '' }
        return result
      }
      const verdicts = await client.selectAndGloss({
        candidates: toAsk,
        targetLanguage,
        cefrLevel: config.cefrLevel,
      })
      for (const c of toAsk) {
        const v = verdicts[c.word] ?? { unfamiliar: false, gloss: '' }
        result[c.word] = v
        if (v.unfamiliar && v.gloss) {
          const cacheKey = `${normalizeWord(c.word)}:${this.hashSentence(c.sentence)}`
          cache[cacheKey] = { gloss: v.gloss, updatedAt: Date.now() }
        }
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.glossCache]: cache })
    } catch (error) {
      Logger.error('[VocabularyService] selectAndGloss failed:', error)
      for (const c of toAsk) result[c.word] = { unfamiliar: true, gloss: '' }
    }

    return result
  }

  private hashSentence(sentence: string): string {
    let hash = 0
    const str = sentence.toLowerCase().trim()
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0 // Convert to 32bit int
    }
    return hash.toString(36)
  }

  private async getGlossCache(): Promise<Record<string, GlossCacheEntry>> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.glossCache)
    const raw = result[STORAGE_KEYS.glossCache] as Record<string, GlossCacheEntry> | undefined
    return raw ?? {}
  }

  // ── Word memory (local recall-probability model) ──

  private async getWordMemoryStore(): Promise<WordMemoryStore> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabWordMemory)
    const raw = result[STORAGE_KEYS.vocabWordMemory] as WordMemoryStore | undefined
    return raw ?? {}
  }

  private async setWordMemoryStore(store: WordMemoryStore): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabWordMemory]: store })
  }

  /**
   * Record a batch of passive exposures ("seen") for words annotated on a page.
   * Grows each word's memory stability so repeatedly-shown words stop being annotated.
   */
  async recordWordExposures(words: string[]): Promise<{ updated: number }> {
    const normalized = Array.from(new Set(words.map(normalizeWord).filter(Boolean)))
    if (normalized.length === 0) return { updated: 0 }

    const store = await this.getWordMemoryStore()
    const now = Date.now()
    const drafts: Array<Omit<MemoryEvent, 'deviceId'>> = []
    for (const word of normalized) {
      const prev = store[word]
      const next = applyEvent(prev, 'seen', now)
      store[word] = next
      drafts.push(this.buildMemoryEventDraft(word, 'seen', prev, next, now))
    }
    await this.setWordMemoryStore(store)
    await this.maybeEnqueueMemoryEvents(drafts)
    return { updated: normalized.length }
  }

  /** Apply an explicit feedback event to a word's memory. */
  private async applyWordMemoryEvent(word: string, eventType: WordMemoryEventType): Promise<WordMemory> {
    const store = await this.getWordMemoryStore()
    const now = Date.now()
    const prev = store[word]
    const next = applyEvent(prev, eventType, now)
    store[word] = next
    await this.setWordMemoryStore(store)

    // Mirror the explicit feedback into the memory-sync queue (reset is local-only, never sent).
    const syncType = this.wordMemoryEventToSyncType(eventType)
    if (syncType) {
      await this.maybeEnqueueMemoryEvents([this.buildMemoryEventDraft(word, syncType, prev, next, now)])
    }
    return next
  }

  private mapLearningEventToMemory(eventType: VocabLearningEvent['eventType'] | undefined): WordMemoryEventType {
    switch (this.normalizeLearningEventType(eventType)) {
      case 'known':
        return 'known'
      case 'skip':
        return 'skip'
      case 'unknown':
        return 'unknown'
      case 'addToVocab':
        return 'addToVocab'
      case 'reset':
        return 'reset'
      case 'reveal':
        return 'reveal'
      case 'seen':
      default:
        return 'seen'
    }
  }

  // ── Memory sync (T1-B: anonymized event queue + backend-agnostic client stub) ──
  // Source of truth stays the local WordMemory store above. This layer mirrors interactions
  // into an offline queue and (opt-in, when an endpoint is set) uploads them / caches the
  // server's recall. Contract: docs/vocab-server-memory-model-design.md.

  /** Build the upload payload for one interaction, deriving HLR-style features from memory. */
  private buildMemoryEventDraft(lemma: string, type: MemoryEventType, prev: WordMemory | undefined, next: WordMemory, now: number): Omit<MemoryEvent, 'deviceId'> {
    return {
      eventId: `${now}_${Math.random().toString(36).slice(2, 10)}`,
      lemma,
      type,
      ts: now,
      deltaDays: prev ? Math.max(0, (now - prev.lastSeenAt) / DAY_MS) : 0,
      seenCount: next.seenCount,
      localRecall: prev ? recallProbability(prev, now) : 1,
    }
  }

  /** Map a local memory event type to its upload type; `reset` is local-only (returns null). */
  private wordMemoryEventToSyncType(eventType: WordMemoryEventType): MemoryEventType | null {
    return eventType === 'reset' ? null : eventType
  }

  /**
   * Append drafts to the offline queue — only when the user has opted in. Stamps the anonymous
   * deviceId, bounds the queue (oldest drop first), and records the pending count. No network.
   */
  private async maybeEnqueueMemoryEvents(drafts: Array<Omit<MemoryEvent, 'deviceId'>>): Promise<void> {
    if (drafts.length === 0) return
    const config = await this.getVocabConfig()
    if (!config.memorySyncEnabled) return

    const identity = await this.getSyncIdentity()
    const events: MemoryEvent[] = drafts.map(draft => ({ ...draft, deviceId: identity.deviceId }))
    const queue = await this.getMemoryEventQueue()
    const combined = queue.concat(events)
    const trimmed = combined.length > MAX_QUEUED_MEMORY_EVENTS ? combined.slice(combined.length - MAX_QUEUED_MEMORY_EVENTS) : combined
    await this.setMemoryEventQueue(trimmed)
    await this.setMemorySyncState({ pendingCount: trimmed.length })
  }

  private async getMemoryEventQueue(): Promise<MemoryEvent[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabMemoryEventQueue)
    const raw = result[STORAGE_KEYS.vocabMemoryEventQueue] as MemoryEvent[] | undefined
    return Array.isArray(raw) ? raw : []
  }

  private async setMemoryEventQueue(queue: MemoryEvent[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabMemoryEventQueue]: queue })
  }

  private async getRecallCache(): Promise<RecallStateCache> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabRecallCache)
    const raw = result[STORAGE_KEYS.vocabRecallCache] as RecallStateCache | undefined
    return raw ?? {}
  }

  private async setRecallCache(cache: RecallStateCache): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabRecallCache]: cache })
  }

  /** Recall-derived star from a cached server state, decayed to `now`. null = stale → use local. */
  private recallStarFromState(state: RecallState, now: number): number | null {
    if (now - state.computedAt > RECALL_CACHE_TTL_MS) return null
    let recall = state.recall
    const stability = state.dsr?.stability
    if (typeof stability === 'number' && stability > 0) {
      const elapsedDays = Math.max(0, (now - state.computedAt) / DAY_MS)
      recall = recall * Math.pow(2, -elapsedDays / stability)
    }
    return recallToStar(Math.min(1, Math.max(0, recall)))
  }

  private generateDeviceId(): string {
    const cryptoApi = (globalThis as any).crypto
    if (cryptoApi?.randomUUID) return `anon-${cryptoApi.randomUUID()}`
    return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }

  /** Lazily create + persist an anonymous device id (no PII; design §4). */
  private async getSyncIdentity(): Promise<VocabSyncIdentity> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabSyncIdentity)
    const stored = result[STORAGE_KEYS.vocabSyncIdentity] as VocabSyncIdentity | undefined
    if (stored?.deviceId) return stored
    const identity: VocabSyncIdentity = { deviceId: this.generateDeviceId() }
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabSyncIdentity]: identity })
    await this.setMemorySyncState({ deviceId: identity.deviceId })
    return identity
  }

  async getMemorySyncState(): Promise<VocabMemorySyncState> {
    const result = await chrome.storage.local.get([STORAGE_KEYS.vocabMemorySyncState, STORAGE_KEYS.vocabMemoryEventQueue, STORAGE_KEYS.vocabSyncIdentity])
    const stored = result[STORAGE_KEYS.vocabMemorySyncState] as VocabMemorySyncState | undefined
    const queue = (result[STORAGE_KEYS.vocabMemoryEventQueue] as MemoryEvent[] | undefined) ?? []
    const identity = result[STORAGE_KEYS.vocabSyncIdentity] as VocabSyncIdentity | undefined
    return {
      pendingCount: queue.length,
      lastSyncAt: stored?.lastSyncAt ?? 0,
      lastStatus: stored?.lastStatus ?? 'idle',
      lastError: stored?.lastError,
      deviceId: identity?.deviceId ?? stored?.deviceId,
    }
  }

  private async setMemorySyncState(partial: Partial<VocabMemorySyncState>): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabMemorySyncState)
    const current = (result[STORAGE_KEYS.vocabMemorySyncState] as VocabMemorySyncState | undefined) ?? {
      pendingCount: 0,
      lastSyncAt: 0,
      lastStatus: 'idle' as const,
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabMemorySyncState]: { ...current, ...partial } })
  }

  /**
   * Flush queued events to the server in idempotent batches. No-op (skipped) unless opt-in and
   * an endpoint is configured. On per-batch success the sent eventIds are pruned and progress is
   * persisted; failures keep the remaining queue for the next attempt (never throws).
   */
  async flushMemoryEvents(): Promise<{ accepted: number; duplicates: number; pendingCount: number; skipped?: boolean }> {
    const config = await this.getVocabConfig()
    const queue = await this.getMemoryEventQueue()

    if (!config.memorySyncEnabled || !config.memorySyncEndpoint.trim()) {
      await this.setMemorySyncState({ pendingCount: queue.length, lastStatus: 'idle' })
      return { accepted: 0, duplicates: 0, pendingCount: queue.length, skipped: true }
    }
    if (queue.length === 0) {
      await this.setMemorySyncState({ pendingCount: 0, lastStatus: 'ok', lastSyncAt: Date.now(), lastError: undefined })
      return { accepted: 0, duplicates: 0, pendingCount: 0 }
    }

    const identity = await this.getSyncIdentity()
    const client = new MemorySyncClient({
      endpoint: config.memorySyncEndpoint,
      deviceId: identity.deviceId,
      authToken: identity.accountId,
    })

    let remaining = [...queue]
    let accepted = 0
    let duplicates = 0
    try {
      while (remaining.length > 0) {
        const batch = remaining.slice(0, MEMORY_EVENT_BATCH_LIMIT)
        const res = await client.flushEvents(batch)
        accepted += res.accepted
        duplicates += res.duplicates
        const sentIds = new Set(batch.map(event => event.eventId))
        remaining = remaining.filter(event => !sentIds.has(event.eventId))
        // Persist incrementally so a mid-loop failure keeps prior progress.
        await this.setMemoryEventQueue(remaining)
        await this.setMemorySyncState({ pendingCount: remaining.length })
      }
      await this.setMemorySyncState({ pendingCount: 0, lastStatus: 'ok', lastSyncAt: Date.now(), lastError: undefined })
      return { accepted, duplicates, pendingCount: 0 }
    } catch (error) {
      await this.setMemoryEventQueue(remaining)
      await this.setMemorySyncState({
        pendingCount: remaining.length,
        lastStatus: 'error',
        lastSyncAt: Date.now(),
        lastError: error instanceof Error ? error.message : String(error),
      })
      Logger.warn('[VocabularyService] Memory event flush failed', error)
      return { accepted, duplicates, pendingCount: remaining.length }
    }
  }

  /** Fetch + cache server recall for the given lemmas (opt-in). Swallows errors. */
  private async refreshRecallStates(lemmas: string[]): Promise<void> {
    const unique = Array.from(new Set(lemmas.map(normalizeWord).filter(Boolean)))
    if (unique.length === 0) return
    const config = await this.getVocabConfig()
    if (!config.memorySyncEnabled || !config.memorySyncEndpoint.trim()) return

    const identity = await this.getSyncIdentity()
    const client = new MemorySyncClient({
      endpoint: config.memorySyncEndpoint,
      deviceId: identity.deviceId,
      authToken: identity.accountId,
    })
    try {
      const { states } = await client.fetchRecall(unique)
      if (states.length === 0) return
      const cache = await this.getRecallCache()
      for (const state of states) cache[state.lemma] = state
      await this.setRecallCache(cache)
    } catch (error) {
      Logger.warn('[VocabularyService] Recall fetch failed', error)
    }
  }

  /** GDPR-friendly local clear: empty the offline queue without touching the WordMemory model. */
  async clearMemoryQueue(): Promise<{ pendingCount: number }> {
    await this.setMemoryEventQueue([])
    await this.setMemorySyncState({ pendingCount: 0, lastStatus: 'idle' })
    return { pendingCount: 0 }
  }

  private async getLearningCategoryId(): Promise<string> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabLearningCategoryId)
    const categoryId = result[STORAGE_KEYS.vocabLearningCategoryId] as string | undefined
    return categoryId?.trim() ?? ''
  }

  private async getMasteredCategoryId(): Promise<string> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabMasteredCategoryId)
    const categoryId = result[STORAGE_KEYS.vocabMasteredCategoryId] as string | undefined
    return categoryId?.trim() ?? ''
  }

  private async dispatchEudicLearningEvent(event: VocabLearningPendingEvent, categoryId: string): Promise<void> {
    const language = event.language ?? 'en'
    const eventType = this.normalizeLearningEventType(event.eventType)

    Logger.info('[VocabularyService] dispatchEudicLearningEvent', {
      word: event.word,
      eventType,
      star: event.star,
      categoryId,
      language,
    })

    if (eventType === 'skip') {
      const masteredCategory = await this.ensureMasteredCategory({ language })
      await this.addEudicWord(event.word, {
        language,
        star: 5,
        contextLine: event.sentence,
        categoryIds: [masteredCategory.categoryId],
      })

      if (masteredCategory.categoryId !== categoryId) {
        try {
          await this.deleteEudicWords(categoryId, [event.word], language)
        } catch (error) {
          Logger.warn('[VocabularyService] Failed to delete skipped word from learning category', error)
        }
      }
      return
    }

    await this.addEudicWord(event.word, {
      language,
      star: event.star,
      contextLine: event.sentence,
      categoryIds: [categoryId],
    })
  }

  private async getConfiguredDefaultCategoryId(): Promise<string> {
    const config = await this.getVocabConfig()
    return config.eudicCategoryIds[0]?.trim() ?? ''
  }

  private async getPendingLearningEvents(): Promise<VocabLearningPendingEvent[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabLearningPendingEvents)
    const pending = result[STORAGE_KEYS.vocabLearningPendingEvents] as VocabLearningPendingEvent[] | undefined
    return Array.isArray(pending) ? pending : []
  }

  private async overlayPendingLearningEvents(entries: Record<string, VocabEntry>): Promise<void> {
    const pending = await this.getPendingLearningEvents()
    for (const event of pending) {
      const eventType = this.normalizeLearningEventType(event.eventType)
      if (eventType === 'unknown' || eventType === 'reveal') continue
      entries[event.word] = {
        ...entries[event.word],
        proficiency: this.normalizeStar(event.star),
        star: this.normalizeStar(event.star),
      }
    }
  }

  private async updateLearningSyncState(partial: Partial<VocabSyncState>): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabSyncState)
    const current = (result[STORAGE_KEYS.vocabSyncState] as VocabSyncState | undefined) ?? {
      lastSyncAt: 0,
      lastSyncStatus: 'ok',
    }
    const nextState: VocabSyncState = {
      ...current,
      ...partial,
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabSyncState]: nextState })
  }

  private normalizeStar(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 1
    }
    return Math.min(5, Math.max(1, Math.round(value)))
  }

  private normalizeLearningEventType(eventType: VocabLearningEvent['eventType'] | undefined): VocabLearningEvent['eventType'] {
    if (eventType === 'suppress') return 'skip'
    return eventType ?? 'seen'
  }

  private resolveTargetStar(event: VocabLearningEvent, currentStar: number): number {
    if (typeof event.targetStar === 'number') {
      return this.normalizeStar(event.targetStar)
    }

    switch (this.normalizeLearningEventType(event.eventType)) {
      case 'known':
        return 5
      case 'unknown':
      case 'reveal':
        return this.normalizeStar(currentStar)
      case 'suppress':
      case 'skip':
        return 5
      case 'addToVocab':
        return 1
      case 'reset':
        return 1
      case 'seen':
      default:
        return this.normalizeStar(currentStar)
    }
  }

  private async getCurrentWordStar(word: string): Promise<number> {
    const snapshot = await this.getSnapshot([word])
    const entry = snapshot?.entries[word]
    if (typeof entry?.star === 'number') {
      return this.normalizeStar(entry.star)
    }
    if (typeof entry?.proficiency === 'number') {
      return this.normalizeStar(entry.proficiency)
    }
    return 1
  }

  private async upsertWordLearningState(word: string, star: number): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.vocabSnapshot)
    const snapshot = (result[STORAGE_KEYS.vocabSnapshot] as VocabSnapshot | undefined) ?? {
      version: '1.0',
      updatedAt: Date.now(),
      entries: {},
    }
    snapshot.entries[word] = {
      ...snapshot.entries[word],
      proficiency: star,
      star,
    }
    snapshot.updatedAt = Date.now()
    await chrome.storage.local.set({ [STORAGE_KEYS.vocabSnapshot]: snapshot })
  }

  private async getEudicToken(): Promise<string> {
    const config = await this.getVocabConfig()
    const token = config.eudicToken?.trim()
    if (!token) {
      throw new Error('Eudic token not configured')
    }
    return token
  }

  async cleanup(): Promise<void> {
    await chrome.alarms.clear(ALARM_NAME)
    await chrome.alarms.clear(MEMORY_SYNC_ALARM_NAME)
    if (this.alarmListener) {
      chrome.alarms.onAlarm.removeListener(this.alarmListener)
      this.alarmListener = null
    }
    this.initialized = false
    Logger.info('[VocabularyService] Cleaned up successfully')
  }
}
