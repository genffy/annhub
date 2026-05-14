import type { LlmModelOption } from '../../../types/vocabulary'

export interface ChatInput {
    system?: string
    user: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
}

export interface ILlmClient {
    completeChat(input: ChatInput): Promise<string>
    listModels?(): Promise<LlmModelOption[]>
    glossBatch?(input: { sentence: string; words: string[]; targetLanguage: string }): Promise<Record<string, string>>
}
