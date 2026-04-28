import { getCEFRLevel, type CEFRLevel } from './cefr-data'

export type { CEFRLevel } from './cefr-data'

const CEFR_RANK: Record<CEFRLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
}

/** Check whether a word should be filtered based on user CEFR level. */
export function shouldFilterByLevel(word: string, userLevel: CEFRLevel): boolean {
  const wordLevel = getCEFRLevel(word)
  if (!wordLevel) return false // Unknown word — let LLM handle it
  return CEFR_RANK[wordLevel] <= CEFR_RANK[userLevel]
}

/** Backward-compatible: returns true for A1/A2 words (used as fallback). */
export function isHighFrequencyWord(word: string): boolean {
  const level = getCEFRLevel(word)
  return level === 'A1' || level === 'A2'
}

export { getCEFRLevel }
