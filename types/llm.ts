/**
 * Optional model Provider (docs/v2/ai.md §8): the user's own OpenAI-compatible endpoint and key.
 * Off until configured; nothing is sent anywhere by default.
 */

export interface LlmConfig {
  provider: 'openai-compatible'
  baseUrl: string
  apiKey: string
  model: string
  modelsEndpoint?: string
  omitTemperature?: boolean
  requestTimeoutMs?: number
  maxTokens?: number
}

/** What pages may see: the key itself never leaves the service worker. */
export type LlmConfigPublic = Omit<LlmConfig, 'apiKey'> & {
  hasApiKey: boolean
}

export interface LlmModelOption {
  id: string
  name?: string
  description?: string
}

export interface LlmConnectionTestResult {
  ok: boolean
  endpoint: string
  model: string
  responsePreview?: string
  availableModels?: LlmModelOption[]
}
