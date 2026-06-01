import { getCEFRLevel, type CEFRLevel } from './cefr-data'
import { getWordFrequencyBand } from './frequency-band-data'

export type { CEFRLevel } from './cefr-data'

const CEFR_RANK: Record<CEFRLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
}

// Highest frequency band a user of a given CEFR level is assumed to already know.
// Band 1 = most frequent (easiest) ... 6 = least frequent (hardest, still in-table).
// Words at or below the user's threshold band are treated as "known/too easy" and skipped.
// A higher-level user knows more low-frequency words, so the threshold rises with level.
const CEFR_KNOWN_BAND_THRESHOLD: Record<CEFRLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
}

/**
 * Whether a word should be filtered out (NOT annotated) for the given user level.
 *
 * Filter (skip) when the word is:
 *  - too easy: in the general-corpus frequency table at a band <= the user's known threshold, OR
 *  - long-tail: absent from the frequency table entirely (rank beyond the top-N), which is
 *    overwhelmingly proper nouns, domain jargon, or spelling noise — not learnable vocabulary.
 *
 * Annotate (do NOT filter) only the in-table words above the user's threshold band — i.e.
 * genuinely mid/low-frequency general vocabulary the user plausibly doesn't know yet.
 *
 * This inverts the previous behaviour, where out-of-table words were let through by default.
 */
export function shouldFilterByLevel(word: string, userLevel: CEFRLevel): boolean {
  if (!word) return true

  const band = getWordFrequencyBand(word)
  if (band === null) return true // long-tail: default to NOT annotating

  return band <= CEFR_KNOWN_BAND_THRESHOLD[userLevel]
}

/** Backward-compatible CEFR lookup (small Oxford/CEFR-J table). Kept as a secondary signal. */
export function shouldFilterByCEFRLevel(word: string, userLevel: CEFRLevel): boolean {
  const wordLevel = getCEFRLevel(word)
  if (!wordLevel) return false
  return CEFR_RANK[wordLevel] <= CEFR_RANK[userLevel]
}

/** Backward-compatible: returns true for A1/A2 words (used as fallback). */
export function isHighFrequencyWord(word: string): boolean {
  const level = getCEFRLevel(word)
  return level === 'A1' || level === 'A2'
}

export { getCEFRLevel, getWordFrequencyBand }
