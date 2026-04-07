import { Logger } from '../../../utils/logger'
import { IService } from '../../service-manager'
import { ResponseMessage } from '../../../types/messages'
import {
    VocabConfig, defaultVocabConfig,
    LlmConfig, resolveDefaultLlmConfig,
    LlmConfigPublic,
    LlmApiKeySource,
    VocabConfigPublic,
    resolveDefaultVocabConfig,
    VocabSnapshot, VocabSyncState, VocabEntry,
    GlossResult, GlossCacheEntry,
    normalizeDomainRuleList,
    normalizeWord,
} from '../../../types/vocabulary'
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
} as const

const ALARM_NAME = 'vocab-sync'
const GLOSS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

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

            if (config.enabled && config.eudicToken && config.eudicCategoryIds.length > 0) {
                // Non-blocking initial sync
                this.syncFromEudic().catch(err => {
                    Logger.error('[VocabularyService] Initial sync failed:', err)
                })
            }

            // Set up periodic sync alarm
            if (config.enabled && config.syncPeriodMinutes > 0) {
                await this.setupAlarm(config.syncPeriodMinutes)
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

        if (!stored.eudicCategoryIds || stored.eudicCategoryIds.length === 0) {
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
                (merged as any)[k] = v
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
                (merged as any)[key] = value
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
        // NOTE: OpenAPI `studylist/words` pagination is zero-based in practice.
        const page = options.page ?? 0
        const pageSize = options.pageSize ?? 200
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

        if (!config.eudicToken || config.eudicCategoryIds.length === 0) {
            throw new Error('Eudic token or category IDs not configured')
        }

        Logger.info('[VocabularyService] Starting Eudic sync...')

        try {
            const words = await fetchAllWords(config.eudicToken, config.eudicCategoryIds)

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

            const snapshot: VocabSnapshot = {
                version: '1.0',
                updatedAt: Date.now(),
                entries,
            }

            await chrome.storage.local.set({ [STORAGE_KEYS.vocabSnapshot]: snapshot })

            const syncState: VocabSyncState = {
                lastSyncAt: Date.now(),
                lastSyncStatus: 'ok',
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
        const llmConfig = await this.getLlmConfig()
        if (!llmConfig.baseUrl || !llmConfig.apiKey || !llmConfig.model) {
            return { gloss: '', source: 'llm' }
        }

        try {
            const client: ILlmClient = createLlmClient(llmConfig)
            const systemPrompt = llmConfig.systemPrompt ||
                '你是一位精通英语与中文的翻译专家，擅长根据上下文语境提供准确、简洁的词义。'

            const gloss = await client.completeChat({
                system: systemPrompt,
                user: `源句子：\n"""\n${sentence}\n"""\n\n` +
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

    private hashSentence(sentence: string): string {
        let hash = 0
        const str = sentence.toLowerCase().trim()
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash |= 0 // Convert to 32bit int
        }
        return hash.toString(36)
    }

    private async getGlossCache(): Promise<Record<string, GlossCacheEntry>> {
        const result = await chrome.storage.local.get(STORAGE_KEYS.glossCache)
        const raw = result[STORAGE_KEYS.glossCache] as Record<string, GlossCacheEntry> | undefined
        return raw ?? {}
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
        if (this.alarmListener) {
            chrome.alarms.onAlarm.removeListener(this.alarmListener)
            this.alarmListener = null
        }
        this.initialized = false
        Logger.info('[VocabularyService] Cleaned up successfully')
    }
}
