import { describe, it, expect } from 'vitest'
import { lemmatize, lemmaCandidates, pickLemma } from '../lemmatize'

describe('lemmatize', () => {
  describe('lemmaCandidates', () => {
    it('returns empty for words with no applicable inflection rule', () => {
      expect(lemmaCandidates('happy')).toEqual([])
      expect(lemmaCandidates('glass')).toEqual([]) // -ss not pluralized
      expect(lemmaCandidates('ab')).toEqual([]) // too short
    })

    it('handles irregular forms via dictionary', () => {
      expect(lemmaCandidates('went')).toEqual(['go'])
      expect(lemmaCandidates('mice')).toEqual(['mouse'])
      expect(lemmaCandidates('children')).toEqual(['child'])
      expect(lemmaCandidates('better')).toEqual(['good'])
    })

    it('offers ambiguous -ing candidates so a dictionary can disambiguate', () => {
      expect(lemmaCandidates('making')).toContain('make')
      expect(lemmaCandidates('reading')).toContain('read')
      expect(lemmaCandidates('running')).toContain('run')
    })

    it('offers ambiguous -ed candidates', () => {
      expect(lemmaCandidates('liked')).toContain('like')
      expect(lemmaCandidates('walked')).toContain('walk')
      expect(lemmaCandidates('stopped')).toContain('stop')
    })

    it('handles -ies/-ied and plurals', () => {
      expect(lemmaCandidates('studies')).toEqual(['study'])
      expect(lemmaCandidates('studied')).toEqual(['study'])
      expect(lemmaCandidates('cities')).toEqual(['city'])
      expect(lemmaCandidates('cats')).toEqual(['cat'])
      expect(lemmaCandidates('boxes')).toContain('box')
    })
  })

  describe('pickLemma (dictionary-resolved)', () => {
    // A tiny fake dictionary of base lemmas.
    const dict = new Set(['run', 'make', 'read', 'like', 'walk', 'stop', 'study', 'city', 'cat', 'box', 'go', 'mouse', 'child', 'good', 'algorithm', 'infrastructure'])
    const exists = (w: string) => dict.has(w)

    it('resolves inflected forms to the lemma present in the dictionary', () => {
      expect(pickLemma('running', exists)).toBe('run')
      expect(pickLemma('making', exists)).toBe('make')
      expect(pickLemma('reading', exists)).toBe('read')
      expect(pickLemma('liked', exists)).toBe('like')
      expect(pickLemma('walked', exists)).toBe('walk')
      expect(pickLemma('stopped', exists)).toBe('stop')
      expect(pickLemma('studied', exists)).toBe('study')
      expect(pickLemma('cities', exists)).toBe('city')
      expect(pickLemma('boxes', exists)).toBe('box')
      expect(pickLemma('went', exists)).toBe('go')
      expect(pickLemma('mice', exists)).toBe('mouse')
      expect(pickLemma('algorithms', exists)).toBe('algorithm')
      expect(pickLemma('infrastructures', exists)).toBe('infrastructure')
    })

    it('prefers the original word when it is already canonical', () => {
      expect(pickLemma('run', exists)).toBe('run')
    })

    it('falls back to the original word when no candidate is in the dictionary', () => {
      expect(pickLemma('kubernetes', exists)).toBe('kubernetes')
      expect(pickLemma('xyzzying', exists)).toBe('xyzzying')
    })
  })

  describe('lemmatize (single best guess)', () => {
    it('returns the first candidate or the word itself', () => {
      expect(lemmatize('went')).toBe('go')
      expect(lemmatize('happy')).toBe('happy')
      expect(lemmatize('cats')).toBe('cat')
    })
  })
})
