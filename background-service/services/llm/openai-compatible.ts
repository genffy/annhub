import { ILlmClient, ChatInput } from './types'
import { LlmConfig } from '../../../types/vocabulary'
import { Logger } from '../../../utils/logger'

const VERSIONED_PATH_RE = /\/v\d+\/?$/

function buildEndpoint(baseUrl: string): string {
    const base = baseUrl.replace(/\/+$/, '')
    if (VERSIONED_PATH_RE.test(base)) {
        return `${base}/chat/completions`
    }
    return `${base}/v1/chat/completions`
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

        const endpoint = buildEndpoint(baseUrl)

        const body: Record<string, unknown> = {
            model,
            messages,
        }
        if (input.temperature !== undefined) body.temperature = input.temperature
        if (input.maxTokens !== undefined) {
            body.max_tokens = input.maxTokens
        } else if (this.config.maxTokens) {
            body.max_tokens = this.config.maxTokens
        }

        Logger.info(`[LLM] POST ${endpoint} model=${model}`)

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        })

        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`LLM request failed: ${response.status} ${text}`)
        }

        const data = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>
        }

        const content = data.choices?.[0]?.message?.content
        if (!content) {
            throw new Error('LLM response missing content')
        }

        return content.trim()
    }

    async glossBatch(input: { sentence: string; words: string[]; targetLanguage: string }): Promise<Record<string, string>> {
        const systemPrompt = this.config.systemPrompt ||
            '你是一位精通英语与目标语言的翻译专家，擅长根据上下文提供准确、简洁的词义解释。'

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
            maxTokens: input.words.length * 30,
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
}
