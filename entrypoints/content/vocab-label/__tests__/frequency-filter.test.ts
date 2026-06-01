import { describe, it, expect } from 'vitest'
import { shouldFilterByLevel, shouldFilterByCEFRLevel, isHighFrequencyWord, getCEFRLevel, getWordFrequencyBand, type CEFRLevel } from '../frequency-filter'

const ALL_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

describe('frequency-filter — frequency-band difficulty gate', () => {
  describe('getWordFrequencyBand', () => {
    it('returns a low band for very common words', () => {
      expect(getWordFrequencyBand('the')).toBe(1)
      expect(getWordFrequencyBand('about')).toBe(1)
    })

    it('returns a higher band for mid/low-frequency words', () => {
      expect(getWordFrequencyBand('robust')).toBeGreaterThan(3)
      expect(getWordFrequencyBand('infrastructure')).toBeGreaterThan(3)
    })

    it('returns null for long-tail words absent from the general corpus', () => {
      // Proper nouns / domain jargon never appear in the general subtitle corpus.
      expect(getWordFrequencyBand('kubernetes')).toBeNull()
      expect(getWordFrequencyBand('mitochondria')).toBeNull()
      expect(getWordFrequencyBand('asdfgh')).toBeNull()
    })
  })

  describe('shouldFilterByLevel', () => {
    it('always filters (skips) the most common words for every user level', () => {
      for (const level of ALL_LEVELS) {
        expect(shouldFilterByLevel('the', level)).toBe(true)
      }
    })

    it('an A1 user only skips the very highest-frequency band', () => {
      expect(shouldFilterByLevel('the', 'A1')).toBe(true) // band 1
      expect(shouldFilterByLevel('government', 'A1')).toBe(false) // band 2 -> annotate
      expect(shouldFilterByLevel('robust', 'A1')).toBe(false) // band 5 -> annotate
    })

    it('a higher-level user skips more bands (knows more low-frequency words)', () => {
      // government is band 2: skipped at A2+, annotated at A1
      expect(shouldFilterByLevel('government', 'A1')).toBe(false)
      expect(shouldFilterByLevel('government', 'A2')).toBe(true)
      expect(shouldFilterByLevel('government', 'C2')).toBe(true)
    })

    it('FILTERS long-tail words by default (inverted behaviour)', () => {
      // Out-of-corpus words are overwhelmingly proper nouns / jargon / noise.
      for (const level of ALL_LEVELS) {
        expect(shouldFilterByLevel('kubernetes', level)).toBe(true)
        expect(shouldFilterByLevel('mitochondria', level)).toBe(true)
      }
    })

    it('annotates genuine low-frequency vocabulary that is still in the corpus', () => {
      // "ubiquitous" is rare but a real general-vocabulary word (high band, in-table).
      for (const level of ALL_LEVELS) {
        expect(shouldFilterByLevel('ubiquitous', level)).toBe(false)
      }
    })

    it('annotates genuine mid/low-frequency vocabulary above the user threshold', () => {
      expect(shouldFilterByLevel('robust', 'B1')).toBe(false) // band 5 > B1 threshold
      expect(shouldFilterByLevel('infrastructure', 'B1')).toBe(false)
    })

    it('filters empty string', () => {
      expect(shouldFilterByLevel('', 'B1')).toBe(true)
    })
  })

  describe('shouldFilterByCEFRLevel (legacy small-table signal)', () => {
    it('filters A1 words for all user levels', () => {
      for (const level of ALL_LEVELS) {
        expect(shouldFilterByCEFRLevel('the', level)).toBe(true)
      }
    })

    it('does not filter words absent from the small CEFR table', () => {
      for (const level of ALL_LEVELS) {
        expect(shouldFilterByCEFRLevel('ubiquitous', level)).toBe(false)
      }
    })
  })

  describe('getCEFRLevel (legacy)', () => {
    it('returns level for known words and null otherwise', () => {
      expect(getCEFRLevel('the')).toBe('A1')
      expect(getCEFRLevel('ubiquitous')).toBeNull()
    })
  })

  describe('isHighFrequencyWord (backward compat)', () => {
    it('returns true for A1/A2 words', () => {
      expect(isHighFrequencyWord('the')).toBe(true)
      expect(isHighFrequencyWord('abroad')).toBe(true)
    })

    it('returns false for B1+ and unknown words', () => {
      expect(isHighFrequencyWord('abandon')).toBe(false)
      expect(isHighFrequencyWord('ubiquitous')).toBe(false)
    })
  })
})
