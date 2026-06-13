import { describe, it, expect } from 'vitest'
import { createDomainTermStats, isLikelyDomainTerm, pageCount, recordPageToken, __testing } from '../domain-filter'

const { DEFAULT_REPEAT_THRESHOLD } = __testing

function statsFrom(tokens: string[]) {
  const stats = createDomainTermStats()
  for (const t of tokens) recordPageToken(stats, t)
  return stats
}

describe('domain-filter — local Weirdness domain-term detection', () => {
  describe('page stats', () => {
    it('accrues counts and total tokens', () => {
      const stats = statsFrom(['kubernetes', 'kubernetes', 'pod'])
      expect(pageCount(stats, 'kubernetes')).toBe(2)
      expect(pageCount(stats, 'pod')).toBe(1)
      expect(stats.totalTokens).toBe(3)
    })

    it('ignores empty tokens', () => {
      const stats = createDomainTermStats()
      recordPageToken(stats, '')
      expect(stats.totalTokens).toBe(0)
    })
  })

  describe('isLikelyDomainTerm', () => {
    it('skips acronyms regardless of page frequency', () => {
      const stats = createDomainTermStats()
      expect(isLikelyDomainTerm('nasa', 'NASA', stats)).toBe(true)
      expect(isLikelyDomainTerm('gpu', 'GPU', stats)).toBe(true)
    })

    it('skips CamelCase product-like tokens', () => {
      const stats = createDomainTermStats()
      expect(isLikelyDomainTerm('kubeconfig', 'KubeConfig', stats)).toBe(true)
    })

    it('skips a long-tail word that recurs across the page (domain keyword)', () => {
      // "kubernetes" appears many times in a DevOps article → topic vocabulary, not a
      // one-off unknown.
      const stats = statsFrom(Array(DEFAULT_REPEAT_THRESHOLD).fill('kubernetes'))
      expect(isLikelyDomainTerm('kubernetes', 'Kubernetes', stats)).toBe(true)
    })

    it('ALLOWS a one-off rare general word (the core long-tail-miss fix)', () => {
      // "perfunctory" appears once → genuine learnable unknown → must NOT be skipped.
      const stats = statsFrom(['perfunctory'])
      expect(isLikelyDomainTerm('perfunctory', 'perfunctory', stats)).toBe(false)
    })

    it('allows a rare word appearing just below the repeat threshold', () => {
      const stats = statsFrom(Array(DEFAULT_REPEAT_THRESHOLD - 1).fill('epistemic'))
      expect(isLikelyDomainTerm('epistemic', 'epistemic', stats)).toBe(false)
    })

    it('respects a custom repeat threshold', () => {
      const stats = statsFrom(['mitochondria', 'mitochondria'])
      expect(isLikelyDomainTerm('mitochondria', 'mitochondria', stats, { repeatThreshold: 2 })).toBe(true)
      expect(isLikelyDomainTerm('mitochondria', 'mitochondria', stats, { repeatThreshold: 5 })).toBe(false)
    })

    it('filters empty lemma', () => {
      expect(isLikelyDomainTerm('', '', createDomainTermStats())).toBe(true)
    })
  })
})
