import type { LlmModelOption } from '../../../types/llm'

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
}
