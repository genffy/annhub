import { describe, expect, it } from 'vitest'
import { applyDesktopChanges, type DesktopChange } from '../sync'
import { makeFragment, NOW } from './helpers'

const f1 = makeFragment({ id: 'f1', tags: ['fed'] })
const localState = { fragments: [f1], localDeletions: new Set<string>(), now: NOW }

describe('field-domain merge (storage.md §9)', () => {
  it('review.rated updates ONLY the review domain — capture fields untouched', () => {
    const review = { ...f1.review, state: 'review' as const, repetitions: 3, intervalDays: 12, lastReviewedAt: NOW, nextReviewAt: NOW + 12 * 86_400_000 }
    const change: DesktopChange = {
      type: 'review.rated',
      fragmentId: 'f1',
      review,
      log: {
        id: 'log_1',
        target: { type: 'fragment', fragmentId: 'f1' },
        rating: 'good',
        reviewedAt: NOW,
        previousIntervalDays: 6,
        nextIntervalDays: 12,
        usedHint: false,
        schedulerVersion: 'four-tier-v1',
      },
    }
    const result = applyDesktopChanges([change], localState)
    expect(result.fragments).toHaveLength(1)
    const merged = result.fragments[0]!
    expect(merged.review.repetitions).toBe(3)
    expect(merged.content).toBe(f1.content)
    expect(merged.context).toEqual(f1.context)
    expect(merged.processing).toEqual(f1.processing)
    expect(merged.tags).toEqual(f1.tags)
    expect(result.reviewLogs).toHaveLength(1)
  })

  it('local deletion markers block revival; desktop deletes never propagate', () => {
    const rated: DesktopChange = {
      type: 'review.rated',
      fragmentId: 'f1',
      review: f1.review,
      log: {
        id: 'log_2',
        target: { type: 'fragment', fragmentId: 'f1' },
        rating: 'good',
        reviewedAt: NOW,
        previousIntervalDays: 0,
        nextIntervalDays: 1,
        usedHint: false,
        schedulerVersion: 'four-tier-v1',
      },
    }
    const result = applyDesktopChanges([rated], { ...localState, localDeletions: new Set(['f1']) })
    expect(result.fragments).toHaveLength(0)
    expect(result.reviewLogs).toHaveLength(0)
    expect(result.reports.filter(r => r.reason === 'LOCAL_DELETED')).toHaveLength(1)

    const desktopDeleted = applyDesktopChanges([{ type: 'fragment.deleted', fragmentId: 'f1' }], localState)
    expect(desktopDeleted.fragments).toHaveLength(0) // extension keeps its own copy
  })

  it('reviews for fragments this extension never had are reported, not applied', () => {
    const change: DesktopChange = {
      type: 'review.rated',
      fragmentId: 'unknown',
      review: f1.review,
      log: {
        id: 'log_u',
        target: { type: 'fragment', fragmentId: 'unknown' },
        rating: 'good',
        reviewedAt: NOW,
        previousIntervalDays: 0,
        nextIntervalDays: 1,
        usedHint: false,
        schedulerVersion: 'four-tier-v1',
      },
    }
    const result = applyDesktopChanges([change], localState)
    expect(result.fragments).toHaveLength(0)
    expect(result.reviewLogs).toHaveLength(0)
    expect(result.reports.map(r => r.reason)).toEqual(['UNKNOWN_FRAGMENT'])
  })

  it('desktop deletes are informational and surface in the visible report', () => {
    const result = applyDesktopChanges([{ type: 'fragment.deleted', fragmentId: 'f1' }], localState)
    expect(result.reports.map(r => r.reason)).toEqual(['DESKTOP_DELETED'])
  })

  it('stale reviews keep the newer local state but still append the log', () => {
    const newerLocal = { ...f1, review: { ...f1.review, lastReviewedAt: NOW + 10_000, repetitions: 5 } }
    const change: DesktopChange = {
      type: 'review.rated',
      fragmentId: 'f1',
      review: { ...f1.review, repetitions: 1 },
      log: {
        id: 'log_3',
        target: { type: 'fragment', fragmentId: 'f1' },
        rating: 'good',
        reviewedAt: NOW,
        previousIntervalDays: 0,
        nextIntervalDays: 1,
        usedHint: false,
        schedulerVersion: 'four-tier-v1',
      },
    }
    const result = applyDesktopChanges([change], { ...localState, fragments: [newerLocal] })
    expect(result.fragments).toHaveLength(0) // no state update
    expect(result.reviewLogs).toHaveLength(1)
    expect(result.reports).toHaveLength(1)
    expect(result.reports[0]!.reason).toBe('STALE_REVIEW')
  })
})
