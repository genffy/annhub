import type { ILlmClient, ChatInput } from './types'
import type { LlmConfig, LlmModelOption } from '../../../types/llm'
import { Logger } from '../../../utils/logger'

const COMPLETIONS_PATH_RE = /\/chat\/completions\/?$/
const MODELS_PATH_RE = /\/models\/?$/
const OPENAI_COMPAT_BASE_RE = /\/(?:v\d+(?:beta)?|openai|compatible-mode)\/?$/
const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30000

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`LLM request timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function buildChatCompletionsEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  if (COMPLETIONS_PATH_RE.test(base)) {
    return base
  }
  if (OPENAI_COMPAT_BASE_RE.test(base)) {
    return `${base}/chat/completions`
  }
  return `${base}/v1/chat/completions`
}

export function buildModelsEndpoint(baseUrl: string, explicitEndpoint?: string): string {
  if (explicitEndpoint?.trim()) return explicitEndpoint.trim()

  const base = baseUrl.replace(/\/+$/, '')
  if (MODELS_PATH_RE.test(base)) {
    return base
  }
  if (COMPLETIONS_PATH_RE.test(base)) {
    return base.replace(COMPLETIONS_PATH_RE, '/models')
  }
  if (OPENAI_COMPAT_BASE_RE.test(base)) {
    return `${base}/models`
  }
  return `${base}/v1/models`
}

function normalizeRemoteModels(data: unknown): LlmModelOption[] {
  const root = data as { data?: unknown[] }
  if (!Array.isArray(root.data)) return []

  return root.data
    .map((item): LlmModelOption | null => {
      if (typeof item === 'string') return { id: item, name: item }
      const model = item as { id?: unknown; name?: unknown; owned_by?: unknown; description?: unknown }
      const id = typeof model.id === 'string' ? model.id.trim() : ''
      if (!id) return null
      return {
        id,
        name: typeof model.name === 'string' && model.name.trim() ? model.name.trim() : id,
        description: typeof model.description === 'string' ? model.description : typeof model.owned_by === 'string' ? model.owned_by : undefined,
      }
    })
    .filter((item): item is LlmModelOption => item !== null)
}

export class OpenAICompatibleLlmService implements ILlmClient {
  private config: LlmConfig

  constructor(config: LlmConfig) {
    this.config = config
  }

  async completeChat(input: ChatInput): Promise<string> {
    const { baseUrl, apiKey, model } = this.config

    if (!baseUrl || !apiKey || !model) {
      throw new Error('LLM config incomplete: baseUrl, apiKey, and model are required')
    }

    const messages: Array<{ role: string; content: string }> = []
    if (input.system) {
      messages.push({ role: 'system', content: input.system })
    }
    messages.push({ role: 'user', content: input.user })

    const endpoint = buildChatCompletionsEndpoint(baseUrl)

    const body: Record<string, unknown> = {
      model,
      messages,
    }
    if (!this.config.omitTemperature && input.temperature !== undefined) body.temperature = input.temperature
    if (input.maxTokens !== undefined) {
      body.max_tokens = input.maxTokens
    } else if (this.config.maxTokens) {
      body.max_tokens = this.config.maxTokens
    }

    Logger.info(`[LLM] POST ${endpoint} model=${model}`)

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      input.timeoutMs ?? this.config.requestTimeoutMs ?? DEFAULT_LLM_REQUEST_TIMEOUT_MS,
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`LLM request failed: ${response.status} ${text}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
    }

    const choice = data.choices?.[0]
    const content = choice?.message?.content?.trim()
    if (!content) {
      // A reasoning model can burn the entire token budget on hidden reasoning and return
      // empty content with finish_reason="length". Report that distinctly so callers (and the
      // settings "test connection") point at max_tokens rather than a generic empty response.
      if (choice?.finish_reason === 'length') {
        throw new Error('LLM response truncated before any content was produced (max_tokens too low for this model)')
      }
      throw new Error('LLM response missing content')
    }

    return content
  }

  async listModels(): Promise<LlmModelOption[]> {
    const { baseUrl, apiKey, modelsEndpoint } = this.config

    if (!baseUrl || !apiKey) {
      throw new Error('LLM config incomplete: baseUrl and apiKey are required')
    }

    const endpoint = buildModelsEndpoint(baseUrl, modelsEndpoint)
    Logger.info(`[LLM] GET ${endpoint}`)

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      this.config.requestTimeoutMs ?? DEFAULT_LLM_REQUEST_TIMEOUT_MS,
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`LLM models request failed: ${response.status} ${text}`)
    }

    return normalizeRemoteModels(await response.json())
  }
}
