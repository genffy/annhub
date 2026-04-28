import { describe, it, expect } from 'vitest'
import { shouldFilterByLevel, isHighFrequencyWord, getCEFRLevel, type CEFRLevel } from '../frequency-filter'

describe('frequency-filter — CEFR level filtering', () => {
  describe('getCEFRLevel', () => {
    it('returns level for known words', () => {
      expect(getCEFRLevel('the')).toBe('A1')
      expect(getCEFRLevel('about')).toBe('A1')
      expect(getCEFRLevel('abandon')).toBe('B1')
      expect(getCEFRLevel('robust')).toBe('C1')
    })

    it('returns null for unknown words', () => {
      expect(getCEFRLevel('ubiquitous')).toBeNull()
      expect(getCEFRLevel('xylophone')).toBeNull()
      expect(getCEFRLevel('asdfgh')).toBeNull()
    })

    it('is case-sensitive (expects lowercase input)', () => {
      // cefr-data stores lowercase words, input should be pre-normalized
      expect(getCEFRLevel('The')).toBeNull()
      expect(getCEFRLevel('ABOUT')).toBeNull()
    })
  })

  describe('shouldFilterByLevel', () => {
    it('filters A1 words for all user levels', () => {
      const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
      for (const level of levels) {
        expect(shouldFilterByLevel('the', level)).toBe(true)
      }
    })

    it('A1 user only filters A1 words', () => {
      expect(shouldFilterByLevel('the', 'A1')).toBe(true)       // A1 word
      expect(shouldFilterByLevel('abroad', 'A1')).toBe(false)    // A2 word
      expect(shouldFilterByLevel('abandon', 'A1')).toBe(false)   // B1 word
    })

    it('B1 user filters A1 + A2 + B1 words', () => {
      expect(shouldFilterByLevel('the', 'B1')).toBe(true)       // A1
      expect(shouldFilterByLevel('abroad', 'B1')).toBe(true)    // A2
      expect(shouldFilterByLevel('abandon', 'B1')).toBe(true)   // B1
      expect(shouldFilterByLevel('robust', 'B1')).toBe(false)   // C1
    })

    it('C1 user filters A1 through C1 words', () => {
      expect(shouldFilterByLevel('the', 'C1')).toBe(true)       // A1
      expect(shouldFilterByLevel('abroad', 'C1')).toBe(true)    // A2
      expect(shouldFilterByLevel('abandon', 'C1')).toBe(true)   // B1
      expect(shouldFilterByLevel('robust', 'C1')).toBe(true)    // C1
    })

    it('does not filter unknown words at any level', () => {
      const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
      for (const level of levels) {
        expect(shouldFilterByLevel('ubiquitous', level)).toBe(false)
        expect(shouldFilterByLevel('xylophone', level)).toBe(false)
      }
    })

    it('handles empty string gracefully', () => {
      expect(shouldFilterByLevel('', 'B1')).toBe(false)
    })
  })

  describe('isHighFrequencyWord (backward compat)', () => {
    it('returns true for A1 words', () => {
      expect(isHighFrequencyWord('the')).toBe(true)
      expect(isHighFrequencyWord('about')).toBe(true)
    })

    it('returns true for A2 words', () => {
      expect(isHighFrequencyWord('abroad')).toBe(true)
    })

    it('returns false for B1+ words', () => {
      expect(isHighFrequencyWord('abandon')).toBe(false)
      expect(isHighFrequencyWord('robust')).toBe(false)
    })

    it('returns false for unknown words', () => {
      expect(isHighFrequencyWord('ubiquitous')).toBe(false)
    })
  })
})
