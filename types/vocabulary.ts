// ── Vocabulary Config ──

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface VocabConfig {
  enabled: boolean
  adaptiveLearningEnabled: boolean
  annotationAggressiveness: 'review-light' | 'balanced' | 'aggressive'
  /** When true, the LLM also decides which candidates are genuinely unfamiliar (S4). */
  llmWordSelectionEnabled: boolean
  /**
   * T1-B: opt-in cross-device memory sync. When true the background queues anonymized
   * {@link MemoryEvent}s and (when {@link memorySyncEndpoint} is set) uploads them /
   * fetches server-computed recall. Default off; pure-local until the user enables it.
   */
  memorySyncEnabled: boolean
  /** Backend-agnostic memory-sync endpoint base (e.g. `https://api.example.com`). Blank = queue only, never send. */
  memorySyncEndpoint: string
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
  llmWordSelectionEnabled: false,
  memorySyncEnabled: false,
  memorySyncEndpoint: '',
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

export type VocabLearningEventType = 'seen' | 'reveal' | 'known' | 'unknown' | 'suppress' | 'skip' | 'addToVocab' | 'reset'

/**
 * Per-word memory state for the local recall-probability model (see
 * entrypoints/content/annotation-core/word-memory.ts). Persisted in chrome.storage.local
 * keyed by normalized word. Decouples "user vocabulary modeling" from the Eudic-derived
 * snapshot so passive exposure (annotated-but-not-clicked) can decay knowledge over time.
 */
export interface WordMemoryRecord {
  seenCount: number
  lastSeenAt: number
  stability: number
  star?: number
}

export type WordMemoryStore = Record<string, WordMemoryRecord>

// ── Memory sync (T1: server-side personalization, backend-agnostic) ──
// Contract frozen in docs/vocab-server-memory-model-design.md §2. The local model
// (WordMemoryStore above) stays the offline source of truth; these types describe the
// anonymized event stream uploaded to / the recall states fetched from an optional server.

/** Interaction types eligible for upload. `reset` is a local-only op and is never sent. */
export type MemoryEventType = 'seen' | 'reveal' | 'known' | 'unknown' | 'skip' | 'addToVocab'

/**
 * One anonymized "user interacted with a word" event (design §2.1). Carries only a
 * normalized lemma + interaction type + time + counts — never the sentence, URL, or page
 * content — so it cannot reconstruct what the user read.
 */
export interface MemoryEvent {
  /** Client-generated idempotency id (`${ts}_${rand}`) for server-side dedup. */
  eventId: string
  /** Normalized (lowercased) lemma, identical to the local store key. */
  lemma: string
  type: MemoryEventType
  /** Event time (ms epoch, client clock). */
  ts: number
  /** Days since the previous interaction with this lemma (HLR `delta`). */
  deltaDays?: number
  /** Cumulative exposure count for this lemma at send time (HLR `history_seen`). */
  seenCount?: number
  /** Local recall estimate (0..1) at send time, for weak supervision / reconciliation. */
  localRecall?: number
  /** Coarse domain/topic label (optional, L2 product). */
  domain?: string
  /** Anonymous device id (design §4); links cross-device events without PII. */
  deviceId: string
}

/**
 * Server model output for one lemma (design §2.2). Cached locally and preferred over the
 * local estimate while fresh; the client decays it to `now` via `dsr.stability`.
 */
export interface RecallState {
  lemma: string
  /** Server-computed recall probability (0..1); folded into star via recallToStar. */
  recall: number
  /** Optional FSRS DSR triple so the client can extrapolate decay between syncs. */
  dsr?: { difficulty: number; stability: number; retrievability: number }
  /** When this recall was computed (ms). */
  computedAt: number
  /** Model version, for gradual rollout / rollback. */
  modelVersion: string
}

/** Local cache of server recall states, keyed by normalized lemma (storage `vocabRecallCache`). */
export type RecallStateCache = Record<string, RecallState>

/** Anonymous sync identity (storage `vocabSyncIdentity`). `accountId` is set once signed in. */
export interface VocabSyncIdentity {
  deviceId: string
  accountId?: string
}

/** Runtime bookkeeping for memory sync (storage `vocabMemorySyncState`); mirrors VocabSyncState. */
export interface VocabMemorySyncState {
  /** Pending (not-yet-accepted) events in the local queue. */
  pendingCount: number
  /** Last successful/attempted flush time (ms, 0 = never). */
  lastSyncAt: number
  lastStatus: 'ok' | 'error' | 'idle'
  lastError?: string
  /** Anonymous device id, surfaced for the settings/privacy UI. */
  deviceId?: string
}

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
  return word
    .toLowerCase()
    .replace(/[^\w\s'-]/g, '')
    .trim()
}
