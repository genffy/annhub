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
  glossChunk?(input: LlmGlossChunkInput): Promise<LlmChunkGloss>
  simplifyForToddler?(input: LlmSimplifyInput): Promise<LlmToddlerSimplification>
}

/** A multi-word chunk captured from a page, glossed in its sentence context (L2 Verify step). */
export interface LlmGlossChunkInput {
  chunk: string
  sentence: string
  targetLanguage?: string
}

/** Structured chunk gloss — becomes ChunkVerified with source: 'llm'. */
export interface LlmChunkGloss {
  meaningEn: string
  meaningCn: string
  examples: string[]
  collocations: string[]
}

/** Family Mode input: a chunk (optionally with its sentence) to toddler-ify (PRD §3.5.1). */
export interface LlmSimplifyInput {
  chunk: string
  sentence?: string
}

/** Toddler-friendly expression + an action cue for the parent to act out. */
export interface LlmToddlerSimplification {
  expression: string
  actionHint: string
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
