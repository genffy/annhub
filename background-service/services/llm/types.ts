export interface ChatInput {
    system?: string
    user: string
    temperature?: number
    maxTokens?: number
}

export interface ILlmClient {
    completeChat(input: ChatInput): Promise<string>
    glossBatch?(input: { sentence: string; words: string[]; targetLanguage: string }): Promise<Record<string, string>>
}
