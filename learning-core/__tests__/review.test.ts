import { describe, expect, it } from 'vitest'
import { REVIEW_QUESTIONS, DAILY_LIMIT_DEFAULT, sessionCap, buildDailyQueue, dailyQueueOrder } from '../review'
import { ENABLED_FRAGMENT_KINDS } from '../types'
import { makeFragment, NOW } from './helpers'

describe('REVIEW_QUESTIONS (review.md §4 / desktop.md §5.2)', () => {
  it('covers every enabled kind plus the registered media-clip, in both languages', () => {
    for (const kind of ENABLED_FRAGMENT_KINDS) {
      for (const lang of ['zh', 'en'] as const) {
        const spec = REVIEW_QUESTIONS[kind]?.[lang]
        expect(spec, `${kind} ${lang}`).toBeDefined()
        expect(spec!.kind).toBe(kind)
        expect(spec!.question.trim()).not.toBe('')
        expect(spec!.hints, `${kind} ${lang}`).toHaveLength(4)
      }
    }
    expect(REVIEW_QUESTIONS['media-clip']).toBeDefined()
  })

  it('keeps the languages apart: no Chinese in the English wording', () => {
    for (const specs of Object.values(REVIEW_QUESTIONS)) {
      expect(`${specs.en.question} ${specs.en.hints.join(' ')}`).not.toMatch(/\p{Script=Han}/u)
      expect(`${specs.zh.question} ${specs.zh.hints.join(' ')}`).toMatch(/\p{Script=Han}/u)
    }
  })
})

describe('daily queue (review.md §5)', () => {
  it('caps at the daily limit default of 20', () => {
    expect(DAILY_LIMIT_DEFAULT).toBe(20)
    const pool = Array.from({ length: 30 }, (_, i) => makeFragment({ id: `f${i}` }))
    expect(buildDailyQueue(pool, NOW).length).toBe(20)
  })

  it('orders by nextReviewAt asc, lapses desc, createdAt asc, id asc', () => {
    const a = makeFragment({ id: 'a', review: { ...makeFragment().review, nextReviewAt: NOW + 100 } })
    const b = makeFragment({ id: 'b', review: { ...makeFragment().review, nextReviewAt: NOW } })
    expect(dailyQueueOrder(a, b)).toBeGreaterThan(0)
    const c = makeFragment({ id: 'c', review: { ...makeFragment().review, nextReviewAt: NOW, lapses: 2 } })
    const d = makeFragment({ id: 'd', review: { ...makeFragment().review, nextReviewAt: NOW, lapses: 0 } })
    expect(dailyQueueOrder(c, d)).toBeLessThan(0)
  })

  it('single session caps at 13 (600s / 45s)', () => {
    expect(sessionCap(DAILY_LIMIT_DEFAULT)).toBe(13)
    expect(sessionCap(5)).toBe(5)
  })
})
