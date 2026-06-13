import { describe, it, expect } from 'vitest'
import { applyEvent, createWordMemory, memoryFromStar, memoryToStar, recallProbability, recallToStar, type WordMemory, __testing } from '../word-memory'

const { DAY_MS, INITIAL_STABILITY_DAYS, MAX_STABILITY_DAYS, KNOWN_STABILITY_DAYS } = __testing
const NOW = 1_700_000_000_000

describe('word-memory — recall-probability model', () => {
  describe('recallProbability', () => {
    it('is ~1 immediately after being seen', () => {
      const mem = applyEvent(undefined, 'seen', NOW)
      expect(recallProbability(mem, NOW)).toBeCloseTo(1, 5)
    })

    it('is 0.5 after exactly one half-life elapses', () => {
      const mem: WordMemory = { seenCount: 1, lastSeenAt: NOW, stability: 10 }
      const recall = recallProbability(mem, NOW + 10 * DAY_MS)
      expect(recall).toBeCloseTo(0.5, 5)
    })

    it('decays toward 0 as time passes well beyond the half-life', () => {
      const mem: WordMemory = { seenCount: 1, lastSeenAt: NOW, stability: 1 }
      const recall = recallProbability(mem, NOW + 30 * DAY_MS)
      expect(recall).toBeLessThan(0.01)
    })

    it('never returns values outside [0,1]', () => {
      const mem: WordMemory = { seenCount: 1, lastSeenAt: NOW, stability: 5 }
      expect(recallProbability(mem, NOW - 999 * DAY_MS)).toBeLessThanOrEqual(1)
      expect(recallProbability(mem, NOW + 1e9 * DAY_MS)).toBeGreaterThanOrEqual(0)
    })
  })

  describe('applyEvent — spacing effect', () => {
    it('grows stability with each passive exposure', () => {
      let mem = applyEvent(undefined, 'seen', NOW)
      const s1 = mem.stability
      mem = applyEvent(mem, 'seen', NOW)
      const s2 = mem.stability
      mem = applyEvent(mem, 'seen', NOW)
      const s3 = mem.stability
      expect(s2).toBeGreaterThan(s1)
      expect(s3).toBeGreaterThan(s2)
    })

    it('increments seenCount on every event', () => {
      let mem = applyEvent(undefined, 'seen', NOW)
      expect(mem.seenCount).toBe(1)
      mem = applyEvent(mem, 'seen', NOW)
      expect(mem.seenCount).toBe(2)
    })

    it('repeatedly-seen word eventually reads as "known" (high star)', () => {
      let mem = applyEvent(undefined, 'seen', NOW)
      for (let i = 0; i < 12; i++) {
        mem = applyEvent(mem, 'seen', NOW)
      }
      // Same-day repeated exposures push stability high enough to be effectively known.
      expect(memoryToStar(mem, NOW)).toBeGreaterThanOrEqual(4)
    })
  })

  describe('applyEvent — explicit feedback', () => {
    it('"known" jumps stability to long-term', () => {
      const mem = applyEvent(undefined, 'known', NOW)
      expect(mem.stability).toBeGreaterThanOrEqual(KNOWN_STABILITY_DAYS)
      expect(memoryToStar(mem, NOW)).toBe(5)
    })

    it('"skip" maxes out stability (never show again)', () => {
      const mem = applyEvent(undefined, 'skip', NOW)
      expect(mem.stability).toBe(MAX_STABILITY_DAYS)
    })

    it('"unknown" shrinks stability so the word keeps surfacing', () => {
      const seen = applyEvent(applyEvent(applyEvent(undefined, 'seen', NOW), 'seen', NOW), 'seen', NOW)
      const unknown = applyEvent(seen, 'unknown', NOW)
      expect(unknown.stability).toBeLessThan(seen.stability)
      // Within a day the short stability already drops recall to "unknown" (star 1).
      expect(memoryToStar(unknown, NOW + DAY_MS)).toBe(1)
    })

    it('"addToVocab" keeps the word short-term (low star)', () => {
      const mem = applyEvent(undefined, 'addToVocab', NOW)
      expect(memoryToStar(mem, NOW + 2 * DAY_MS)).toBeLessThanOrEqual(2)
    })

    it('"reset" returns a fresh memory', () => {
      const known = applyEvent(undefined, 'known', NOW)
      const reset = applyEvent(known, 'reset', NOW + DAY_MS)
      expect(reset.seenCount).toBe(0)
      expect(reset.stability).toBe(INITIAL_STABILITY_DAYS)
    })

    it('does not mutate the input memory', () => {
      const mem = createWordMemory(NOW)
      const before = { ...mem }
      applyEvent(mem, 'seen', NOW + DAY_MS)
      expect(mem).toEqual(before)
    })
  })

  describe('recallToStar', () => {
    it('maps recall thresholds to 1..5 monotonically', () => {
      expect(recallToStar(1)).toBe(5)
      expect(recallToStar(0.85)).toBe(4)
      expect(recallToStar(0.65)).toBe(3)
      expect(recallToStar(0.4)).toBe(2)
      expect(recallToStar(0.1)).toBe(1)
    })
  })

  describe('memoryFromStar', () => {
    it('seeds higher stability for higher star', () => {
      const s1 = memoryFromStar(1, NOW)
      const s5 = memoryFromStar(5, NOW)
      expect(s5.stability).toBeGreaterThan(s1.stability)
      expect(s5.star).toBe(5)
    })

    it('a star-5 seed reads as known immediately', () => {
      const mem = memoryFromStar(5, NOW)
      expect(memoryToStar(mem, NOW)).toBe(5)
    })
  })
})
