import {
  ILlmClient,
  ChatInput,
  LlmSelectAndGlossInput,
  LlmWordVerdict,
  LlmGlossChunkInput,
  LlmChunkGloss,
  LlmSimplifyInput,
  LlmToddlerSimplification,
} from './types'
import { LlmConfig, LlmModelOption } from '../../../types/vocabulary'
import { Logger } from '../../../utils/logger'

const COMPLETIONS_PATH_RE = /\/chat\/completions\/?$/
const MODELS_PATH_RE = /\/models\/?$/
const OPENAI_COMPAT_BASE_RE = /\/(?:v\d+(?:beta)?|openai|compatible-mode)\/?$/
const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30000

// Reasoning models (e.g. GLM-5/Z1, DeepSeek-R1, OpenAI o-series) spend hidden reasoning
// tokens out of the SAME completion budget before emitting any visible `content`. A tight
// `max_tokens` (e.g. words×30) is exhausted by that reasoning, so the response returns
// finish_reason="length" with an EMPTY content field — which would otherwise look like a
// failed/empty answer. For our structured JSON calls (glossBatch / selectAndGloss) we budget
// generous headroom on top of the answer-size estimate, capped to a sane ceiling.
const REASONING_TOKEN_HEADROOM = 1024
const MAX_STRUCTURED_COMPLETION_TOKENS = 4096

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

  async glossBatch(input: { sentence: string; words: string[]; targetLanguage: string }): Promise<Record<string, string>> {
    const systemPrompt = this.config.systemPrompt || '你是一位精通英语与目标语言的翻译专家，擅长根据上下文提供准确、简洁的词义解释。'

    const wordList = input.words.map(w => `"${w}"`).join(', ')
    const userPrompt =
      `源句子：\n"""\n${input.sentence}\n"""\n\n` +
      `请根据上述句子的语境，为以下单词各提供一个简短的${input.targetLanguage}释义：${wordList}\n\n` +
      `要求：\n` +
      `1. 忠实于源句子的语境，给出该词在此处的含义，而非通用释义。\n` +
      `2. 每个释义不超过8个字。\n` +
      `3. 仅输出 JSON 对象，格式为 {"word": "释义"}，不要输出任何其他内容。`

    const raw = await this.completeChat({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.3,
      maxTokens: Math.min(MAX_STRUCTURED_COMPLETION_TOKENS, REASONING_TOKEN_HEADROOM + input.words.length * 96),
    })

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON object found in LLM response')
      return JSON.parse(jsonMatch[0]) as Record<string, string>
    } catch (_e) {
      Logger.error('[LLM] Failed to parse glossBatch response:', raw)
      const result: Record<string, string> = {}
      for (const w of input.words) {
        result[w] = ''
      }
      return result
    }
  }

  /**
   * Ask the LLM to BOTH pick which candidates are genuinely unfamiliar to a reader at
   * `cefrLevel` AND gloss them — folding word selection into the gloss round-trip (S4).
   * Candidates may come from different sentences; each is judged in its own context.
   * Returns word → {unfamiliar, gloss}. On parse failure we KEEP the local gate's selection
   * (every word → unfamiliar:true, empty gloss) so a malformed response degrades to plain
   * local annotation rather than blanking the page — matching the LLM-unavailable path and
   * the "never blanks a page" guarantee. (A successfully-parsed response that simply omits a
   * word still treats it as not-unfamiliar.)
   */
  async selectAndGloss(input: LlmSelectAndGlossInput): Promise<Record<string, LlmWordVerdict>> {
    const systemPrompt = this.config.systemPrompt || '你是一位精通英语与目标语言的语言学习助教，擅长根据读者水平和上下文判断哪些词对其陌生，并给出准确简洁的释义。'

    const level = input.cefrLevel || 'B1'
    const items = input.candidates.map((c, i) => `${i + 1}. 词："${c.word}"  语境："""${c.sentence}"""`).join('\n')

    const userPrompt =
      `读者的英语水平约为 CEFR ${level}。下面是若干候选词及其所在句子。\n\n` +
      `${items}\n\n` +
      `请判断每个词在其语境中对该 ${level} 读者是否为"真正陌生、需要标注"的词，并给出${input.targetLanguage}释义。\n\n` +
      `规则：\n` +
      `1. 对 ${level} 读者已掌握的常见词、专有名词/人名/品牌、以及能从上下文轻松推断的词，标记为不陌生。\n` +
      `2. 释义忠实于该词在此句中的含义（非通用释义），不超过8个字。\n` +
      `3. 仅输出 JSON 对象，键为原词，值为 {"unfamiliar": true/false, "gloss": "释义"}。不要输出任何其他内容。`

    const raw = await this.completeChat({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.2,
      maxTokens: Math.min(MAX_STRUCTURED_COMPLETION_TOKENS, REASONING_TOKEN_HEADROOM + input.candidates.length * 160),
    })

    // A malformed/garbage response must not silently drop the whole page's candidates: keep
    // the local gate's selection (unfamiliar:true), glossed later via the normal path. Mirrors
    // the LLM-unavailable fallback and the "never blanks a page" guarantee.
    const fallback = (): Record<string, LlmWordVerdict> => {
      const result: Record<string, LlmWordVerdict> = {}
      for (const c of input.candidates) {
        result[c.word] = { unfamiliar: true, gloss: '' }
      }
      return result
    }

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON object found in LLM response')
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      const result: Record<string, LlmWordVerdict> = {}
      for (const c of input.candidates) {
        const v = parsed[c.word] as { unfamiliar?: unknown; gloss?: unknown } | undefined
        result[c.word] = {
          unfamiliar: v?.unfamiliar === true,
          gloss: typeof v?.gloss === 'string' ? v.gloss.trim() : '',
        }
      }
      return result
    } catch (_e) {
      Logger.error('[LLM] Failed to parse selectAndGloss response:', raw)
      return fallback()
    }
  }

  /**
   * Gloss a captured multi-word chunk in its sentence context (L2 Verify step).
   * Unlike the word-selection paths, there is no local fallback gloss — on parse
   * failure we throw so the capture modal degrades to dictionary/manual entry
   * with an explicit source label, never writing raw LLM text into business fields.
   */
  async glossChunk(input: LlmGlossChunkInput): Promise<LlmChunkGloss> {
    const systemPrompt = this.config.systemPrompt || '你是一位精通英语与目标语言的语言学习助教，擅长解释英语语块（搭配、短语、习语）在真实语境中的含义。'

    const target = input.targetLanguage || '中文'
    const userPrompt =
      `语块："${input.chunk}"\n所在句子：\n"""\n${input.sentence}\n"""\n\n` +
      `请解释该语块在上述语境中的含义。要求：\n` +
      `1. 英文释义（meaningEn）不超过 300 字符，忠实于语境。\n` +
      `2. ${target}释义（meaningCn）不超过 300 字符。\n` +
      `3. examples：最多 3 条英文例句，每条不超过 300 字符。\n` +
      `4. collocations：最多 5 条常见搭配，每条不超过 100 字符。\n` +
      `5. 仅输出 JSON 对象，格式为 {"meaningEn": "...", "meaningCn": "...", "examples": ["..."], "collocations": ["..."]}。不要输出任何其他内容。`

    const raw = await this.completeChat({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.3,
      maxTokens: Math.min(MAX_STRUCTURED_COMPLETION_TOKENS, REASONING_TOKEN_HEADROOM + 600),
    })

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      Logger.error('[LLM] Failed to parse glossChunk response:', raw)
      throw new Error('LLM gloss response could not be parsed')
    }
    const parsed = JSON.parse(jsonMatch[0]) as Partial<LlmChunkGloss>
    const strArray = (v: unknown, cap: number): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, cap) : []
    const gloss: LlmChunkGloss = {
      meaningEn: typeof parsed.meaningEn === 'string' ? parsed.meaningEn.trim().slice(0, 300) : '',
      meaningCn: typeof parsed.meaningCn === 'string' ? parsed.meaningCn.trim().slice(0, 300) : '',
      examples: strArray(parsed.examples, 3),
      collocations: strArray(parsed.collocations, 5),
    }
    if (!gloss.meaningEn && !gloss.meaningCn) {
      throw new Error('LLM gloss response contained no usable meaning')
    }
    return gloss
  }

  /**
   * Family Mode (extension-prd §3.5.1): rewrite a chunk as an expression a
   * ~1.5-year-old can understand, plus an action the parent can act out.
   * Light, display-only result — the full family script lives in the App.
   */
  async simplifyForToddler(input: LlmSimplifyInput): Promise<LlmToddlerSimplification> {
    const systemPrompt =
      this.config.systemPrompt || '你是一位幼儿英语启蒙老师，擅长把成人语言转化为幼儿能理解的超简表达，并设计家长可以带做的动作。'
    const context = input.sentence ? `\n原句："""\n${input.sentence}\n"""` : ''
    const userPrompt =
      `语块："${input.chunk}"${context}\n\n` +
      `请把它转化为 1.5 岁幼儿能理解的英文表达和一个动作提示。要求：\n` +
      `1. expression：不超过 8 个英文词，词汇限于幼儿先掌握的名词/动词/拟声词。\n` +
      `2. actionHint：一句话中文动作提示，家长可以带孩子边说边做。\n` +
      `3. 仅输出 JSON 对象，格式为 {"expression": "...", "actionHint": "..."}。不要输出任何其他内容。`

    const raw = await this.completeChat({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.5,
      maxTokens: Math.min(MAX_STRUCTURED_COMPLETION_TOKENS, REASONING_TOKEN_HEADROOM + 300),
    })

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      Logger.error('[LLM] Failed to parse simplifyForToddler response:', raw)
      throw new Error('LLM toddler simplification could not be parsed')
    }
    const parsed = JSON.parse(jsonMatch[0]) as Partial<LlmToddlerSimplification>
    const result: LlmToddlerSimplification = {
      expression: typeof parsed.expression === 'string' ? parsed.expression.trim().slice(0, 120) : '',
      actionHint: typeof parsed.actionHint === 'string' ? parsed.actionHint.trim().slice(0, 200) : '',
    }
    if (!result.expression) {
      throw new Error('LLM toddler simplification contained no expression')
    }
    return result
  }
}
