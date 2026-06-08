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
  selectAndGloss?(input: LlmSelectAndGlossInput): Promise<Record<string, LlmWordVerdict>>
}

/** A candidate word in its sentence context, for LLM word selection. */
export interface LlmSelectCandidate {
  word: string
  sentence: string
}

export interface LlmSelectAndGlossInput {
  candidates: LlmSelectCandidate[]
  targetLanguage: string
  /** The reader's CEFR level (A1..C2), so the LLM judges difficulty relative to them. */
  cefrLevel?: string
}

/** Per-word verdict: whether it is genuinely unfamiliar to the user, plus a gloss. */
export interface LlmWordVerdict {
  unfamiliar: boolean
  gloss: string
}
