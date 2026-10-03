import { describe, expect, it } from 'vitest'
import { REVIEW_QUESTIONS, DAILY_LIMIT_DEFAULT, sessionCap, buildDailyQueue, dailyQueueOrder } from '../review'
import { ENABLED_FRAGMENT_KINDS } from '../types'
import { makeFragment, NOW } from './helpers'

describe('REVIEW_QUESTIONS (review.md §4 / desktop.md §5.2)', () => {
  it('covers every enabled kind plus the registered media-clip', () => {
    for (const kind of ENABLED_FRAGMENT_KINDS) {
      expect(REVIEW_QUESTIONS[kind], kind).toBeDefined()
      expect(REVIEW_QUESTIONS[kind]!.hints).toHaveLength(4)
    }
    expect(REVIEW_QUESTIONS['media-clip']).toBeDefined()
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
