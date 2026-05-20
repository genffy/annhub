// ── Vocabulary Config ──

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface VocabConfig {
    enabled: boolean
    adaptiveLearningEnabled: boolean
    annotationAggressiveness: 'review-light' | 'balanced' | 'aggressive'
    eudicToken: string
    eudicCategoryIds: string[]
    masteryThreshold: number
    syncPeriodMinutes: number
    maxAnnotationsPerPage: number
    cefrLevel: CEFRLevel
    domainWhitelist: {
        enabled: boolean
        domains: string[]
    }
}

export const defaultVocabConfig: VocabConfig = {
    enabled: false,
    adaptiveLearningEnabled: true,
    annotationAggressiveness: 'balanced',
    eudicToken: '',
    eudicCategoryIds: [],
    masteryThreshold: 3,
    syncPeriodMinutes: 60,
    maxAnnotationsPerPage: 200,
    cefrLevel: 'B1',
    domainWhitelist: {
        enabled: false,
        domains: [],
    },
}

export function resolveDefaultVocabConfig(): VocabConfig {
    const env = (import.meta as any).env as Record<string, string | undefined>
    const rawCategoryIds = env?.WXT_EUDIC_CATEGORY_IDS ?? ''
    const categoryIds = rawCategoryIds
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)

    return {
        ...defaultVocabConfig,
        // Do not read Eudic token from build-time env.
        // Tokens must be configured by user at runtime and stored locally.
        eudicToken: '',
        eudicCategoryIds: categoryIds,
    }
}

// ── LLM Config ──

export type LlmApiMode = 'openai-compatible' | 'anthropic-messages'

export interface LlmConfig {
    provider: 'openai-compatible'
    apiMode?: LlmApiMode
    providerPresetId?: string
    providerEndpointId?: string
    customProviderName?: string
    baseUrl: string
    apiKey: string
    model: string
    modelsEndpoint?: string
    omitTemperature?: boolean
    requestTimeoutMs?: number
    maxTokens?: number
    systemPrompt?: string
}

export const defaultLlmConfig: LlmConfig = {
    provider: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
}

export function resolveDefaultLlmConfig(): LlmConfig {
    return {
        provider: 'openai-compatible',
        // Do not read endpoint/key from build-time env.
        // LLM connection info must come from runtime user settings.
        baseUrl: '',
        apiKey: '',
        model: 'glm-4-flash',
    }
}

export type LlmApiKeySource = 'env' | 'storage' | 'none'

export type LlmConfigPublic = Omit<LlmConfig, 'apiKey'> & {
    hasApiKey: boolean
    apiKeySource: LlmApiKeySource
}

export interface LlmModelOption {
    id: string
    name?: string
    description?: string
}

export interface LlmProviderPreset {
    id: string
    name: string
    region?: string
    description?: string
    apiMode?: LlmApiMode
    baseUrl: string
    apiKeyUrl?: string
    docsUrl?: string
    defaultModel: string
    modelFetchStrategy: 'openai-models' | 'none'
    modelsEndpoint?: string
    omitTemperature?: boolean
    models: LlmModelOption[]
    endpointVariants?: LlmEndpointVariant[]
}

export interface LlmEndpointVariant {
    id: string
    name: string
    region?: string
    description?: string
    apiMode?: LlmApiMode
    baseUrl: string
    defaultModel?: string
    modelFetchStrategy?: 'openai-models' | 'none'
    modelsEndpoint?: string
    omitTemperature?: boolean
    models?: LlmModelOption[]
}

export interface LlmConnectionTestResult {
    ok: boolean
    endpoint: string
    model: string
    responsePreview?: string
    availableModels?: LlmModelOption[]
}

export type VocabConfigPublic = Omit<VocabConfig, 'eudicToken'> & {
    hasEudicToken: boolean
}

// ── Vocab Snapshot (stored in chrome.storage.local) ──

export interface VocabEntry {
    proficiency: number
    exp?: string
    star?: number
}

export interface VocabSnapshot {
    version: string
    updatedAt: number
    entries: Record<string, VocabEntry>
}

export interface VocabSyncState {
    lastSyncAt: number
    lastSyncStatus: 'ok' | 'error'
    lastError?: string
    learningCategoryId?: string
    masteredCategoryId?: string
    learningLastSyncAt?: number
    learningLastSyncStatus?: 'ok' | 'error'
    learningLastError?: string
    learningPendingCount?: number
}

export type VocabLearningEventType =
    | 'seen'
    | 'reveal'
    | 'known'
    | 'unknown'
    | 'suppress'
    | 'skip'
    | 'addToVocab'
    | 'reset'

export interface VocabLearningEvent {
    word: string
    eventType: VocabLearningEventType
    sentence?: string
    targetStar?: number
    language?: string
    timestamp?: number
}

export interface VocabLearningPendingEvent {
    id: string
    word: string
    star: number
    eventType?: VocabLearningEventType
    sentence?: string
    language: string
    createdAt: number
    updatedAt: number
    attempts: number
    lastError?: string
}

// ── Gloss Cache ──

export interface GlossResult {
    gloss: string
    source: 'exp' | 'llm' | 'cache'
}

export interface GlossCacheEntry {
    gloss: string
    updatedAt: number
}

// ── Helpers ──

const DOMAIN_INPUT_SEPARATOR = /[\n,;]+/

export function normalizeDomainRule(rule: string): string {
    const trimmed = rule.trim().toLowerCase()
    if (!trimmed) return ''

    const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    const hostWithOptionalPath = withoutScheme.split(/[/?#]/, 1)[0] ?? ''
    const hostWithoutPort = hostWithOptionalPath.replace(/:\d+$/, '')

    return hostWithoutPort.replace(/^\.+|\.+$/g, '')
}

export function normalizeDomainRuleList(domains: string[]): string[] {
    const unique = new Set<string>()
    for (const domain of domains) {
        const normalized = normalizeDomainRule(domain)
        if (normalized) {
            unique.add(normalized)
        }
    }
    return Array.from(unique)
}

export function parseDomainWhitelistInput(input: string): string[] {
    return normalizeDomainRuleList(input.split(DOMAIN_INPUT_SEPARATOR))
}

export function normalizeWord(word: string): string {
    return word.toLowerCase().replace(/[^\w\s'-]/g, '').trim()
}
