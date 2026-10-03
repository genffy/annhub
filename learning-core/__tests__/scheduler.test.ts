import { describe, it, expect } from 'vitest'
import { createFragment, createReviewState, SCHEDULER_VERSION } from '../factory'
import { scheduleReview, rateFragment, previewInterval } from '../scheduler'
import { makeFragment, NOW, VERIFIED } from './helpers'

const DAY = 24 * 60 * 60 * 1000

describe('createFragment', () => {
  it('builds a schemaVersion 4 record with initial review state', () => {
    const f = makeFragment()
    expect(f.schemaVersion).toBe(4)
    expect(f.captureRevision).toBe(1)
    expect(f.review.state).toBe('new')
    expect(f.review.easeFactor).toBe(2.5)
    expect(f.review.nextReviewAt).toBe(f.createdAt) // reviewable immediately
  })

  it('normalizes content and dedupes tags', () => {
    const f = createFragment<'concept'>({
      kind: 'concept',
      content: '  Hawkish  Pivot! ',
      context: {
        excerpt: 'a hawkish pivot happened',
        sourceUrl: 'https://www.washingtonpost.com/a',
        sourceHost: 'washingtonpost.com',
        locator: { type: 'none' },
      },
      processing: { verified: { ...VERIFIED }, use: '写进周报的宏观部分。' },
      detail: {},
      tags: ['Fed', 'fed', ''],
      now: NOW,
    })
    expect(f.content).toBe('Hawkish  Pivot!')
    expect(f.normalizedContent).toBe('hawkish pivot')
    expect(f.tags).toEqual(['fed'])
  })

  it('throws (refuses to persist) when use is missing', () => {
    expect(() =>
      createFragment<'concept'>({
        kind: 'concept',
        content: 'x',
        context: { excerpt: 'x', sourceUrl: 'https://a.com/x', sourceHost: 'a.com', locator: { type: 'none' } },
        processing: { verified: { ...VERIFIED }, use: ' ' },
        detail: {},
        now: NOW,
      }),
    ).toThrow(/validation failed/i)
  })
})

describe('scheduleReview (four-tier v1, review.md §3)', () => {
  it('again: 1d interval, reps reset, lapse counted, ease floored', () => {
    const review = { ...createReviewState(NOW), repetitions: 3, intervalDays: 30, easeFactor: 1.4 }
    const next = scheduleReview(review, 'again', NOW)
    expect(next.intervalDays).toBe(1)
    expect(next.repetitions).toBe(0)
    expect(next.lapses).toBe(1)
    expect(next.easeFactor).toBeCloseTo(1.3)
    expect(next.state).toBe('relearning')
    expect(next.nextReviewAt).toBe(NOW + DAY)
  })

  it('hard: stretches previous interval by 1.2 and floors ease', () => {
    const review = { ...createReviewState(NOW), repetitions: 2, intervalDays: 10, easeFactor: 2.5 }
    const next = scheduleReview(review, 'hard', NOW)
    expect(next.intervalDays).toBe(12)
    expect(next.easeFactor).toBeCloseTo(2.35)
    expect(next.repetitions).toBe(2)
  })

  it('good: 1d then 6d then interval × ease', () => {
    const first = scheduleReview(createReviewState(NOW), 'good', NOW)
    expect(first.intervalDays).toBe(1)
    const second = scheduleReview(first, 'good', NOW)
    expect(second.intervalDays).toBe(6)
    const third = scheduleReview(second, 'good', NOW)
    expect(third.intervalDays).toBe(Math.max(1, Math.round(6 * 2.5)))
  })

  it('easy: 4d first, then interval × ease × 1.3 and ease rises', () => {
    const first = scheduleReview(createReviewState(NOW), 'easy', NOW)
    expect(first.intervalDays).toBe(4)
    const second = scheduleReview(first, 'easy', NOW)
    expect(second.intervalDays).toBe(Math.max(2, Math.round(4 * 2.65 * 1.3)))
    expect(second.easeFactor).toBeCloseTo(2.8)
  })
})

describe('rateFragment', () => {
  it('returns updated fragment plus a replayable log', () => {
    const f = makeFragment()
    const { fragment, log } = rateFragment(f, 'good', { usedHint: true, now: NOW })
    expect(fragment.review.repetitions).toBe(1)
    expect(fragment.id).toBe(f.id)
    expect(log.target).toEqual({ type: 'fragment', fragmentId: f.id })
    expect(log.schedulerVersion).toBe(SCHEDULER_VERSION)
    expect(log.usedHint).toBe(true)
    expect(log.previousIntervalDays).toBe(0)
    expect(log.nextIntervalDays).toBe(1)
    expect(previewInterval(fragment.review, 'good', NOW)).toBe(6)
  })
})
