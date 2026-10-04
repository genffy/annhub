import { Logger } from '../../../utils/logger'
import type { IService } from '../../service-manager'
import type { LlmConfig, LlmConfigPublic, LlmConnectionTestResult, LlmModelOption } from '../../../types/llm'
import { createLlmClient } from './factory'
import { messageHandlers } from './message-handles'

const LLM_CONFIG_KEY = 'llmConfig'

/** No endpoint, key or model until the user configures one: nothing is sent anywhere by default (ai.md §5). */
const EMPTY_LLM_CONFIG: LlmConfig = { provider: 'openai-compatible', baseUrl: '', apiKey: '', model: '' }

/**
 * Optional model Provider (docs/v2/ai.md §8): stores the user's endpoint and key and tests the
 * connection. The key never leaves the service worker.
 */
export class LlmService implements IService {
  readonly name = 'llm' as const
  private static instance: LlmService | null = null
  private initialized = false

  private constructor() {}

  static getInstance(): LlmService {
    if (!LlmService.instance) LlmService.instance = new LlmService()
    return LlmService.instance
  }

  async initialize(): Promise<void> {
    this.initialized = true
  }

  getMessageHandlers() {
    return messageHandlers
  }

  isInitialized(): boolean {
    return this.initialized
  }

  async cleanup(): Promise<void> {
    this.initialized = false
  }

  private async readStored(): Promise<Partial<LlmConfig> | undefined> {
    const result = await chrome.storage.local.get(LLM_CONFIG_KEY)
    return result[LLM_CONFIG_KEY] as Partial<LlmConfig> | undefined
  }

  /** Stored values over the empty defaults; an empty stored value is the same as none. */
  async getLlmConfig(): Promise<LlmConfig> {
    const merged: LlmConfig = { ...EMPTY_LLM_CONFIG }
    for (const [key, value] of Object.entries((await this.readStored()) ?? {})) {
      if (value !== undefined && value !== '') (merged as unknown as Record<string, unknown>)[key] = value
    }
    return merged
  }

  async setLlmConfig(config: Partial<LlmConfig>): Promise<void> {
    const merged: Partial<LlmConfig> = { ...((await this.readStored()) ?? {}) }
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value
    }
    await chrome.storage.local.set({ [LLM_CONFIG_KEY]: merged })
  }

  async getLlmConfigPublic(): Promise<LlmConfigPublic> {
    const { apiKey, ...publicConfig } = await this.getLlmConfig()
    return { ...publicConfig, hasApiKey: apiKey.trim().length > 0 }
  }

  /** What a request would use: the form's values over the stored ones, with the stored key unless a new one is typed. */
  private async runtimeConfig(override?: Partial<LlmConfig>): Promise<LlmConfig> {
    const stored = await this.getLlmConfig()
    const merged: LlmConfig = { ...stored, ...(override ?? {}) }
    if (!override?.apiKey) merged.apiKey = stored.apiKey
    return merged
  }

  async testLlmConnection(configOverride?: Partial<LlmConfig>): Promise<LlmConnectionTestResult> {
    const config = await this.runtimeConfig(configOverride)
    if (!config.baseUrl || !config.apiKey || !config.model) {
      throw new Error('LLM config incomplete: Base URL, API key, and model are required')
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
      availableModels = await client.listModels?.()
    } catch (error) {
      Logger.warn('[LlmService] Could not list models:', error instanceof Error ? error.message : error)
    }

    return { ok: true, endpoint: config.baseUrl, model: config.model, responsePreview: response.slice(0, 80), availableModels }
  }
}
