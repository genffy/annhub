import { describe, expect, it } from 'vitest'
import { applyDesktopChanges, suggestRelations, keyOfSuppression, type DesktopChange } from '../sync'
import { makeFragment, makeFragmentOf, NOW } from './helpers'

const f1 = makeFragment({ id: 'f1', tags: ['fed'] })
const localState = { fragments: [f1], localDeletions: new Set<string>(), now: NOW }

describe('field-domain merge (storage.md §9)', () => {
  it('review.rated updates ONLY the review domain — capture fields untouched', () => {
    const review = { ...f1.review, state: 'review' as const, repetitions: 3, intervalDays: 12, lastReviewedAt: NOW, nextReviewAt: NOW + 12 * 86_400_000 }
    const change: DesktopChange = {
      type: 'review.rated',
      fragmentId: 'f1',
      review,
      log: { id: 'log_1', target: { type: 'fragment', fragmentId: 'f1' }, rating: 'good', reviewedAt: NOW, previousIntervalDays: 6, nextIntervalDays: 12, usedHint: false, schedulerVersion: 'four-tier-v1' },
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
    const rated: DesktopChange = { type: 'review.rated', fragmentId: 'f1', review: f1.review, log: { id: 'log_2', target: { type: 'fragment', fragmentId: 'f1' }, rating: 'good', reviewedAt: NOW, previousIntervalDays: 0, nextIntervalDays: 1, usedHint: false, schedulerVersion: 'four-tier-v1' } }
    const recreated: DesktopChange = { type: 'fragment.created', fragment: { ...f1, id: 'f1' } }
    const result = applyDesktopChanges([rated, recreated], { ...localState, localDeletions: new Set(['f1']) })
    expect(result.fragments).toHaveLength(0)
    expect(result.reports.filter(r => r.reason === 'LOCAL_DELETED')).toHaveLength(2)

    const desktopDeleted = applyDesktopChanges([{ type: 'fragment.deleted', fragmentId: 'f1' }], localState)
    expect(desktopDeleted.fragments).toHaveLength(0) // extension keeps its own copy
  })

  it('desktop-created fragments sync in; suggested relations never apply', () => {
    const question = makeFragmentOf('question', { sourceUrl: 'annhub://writing-task/task_1', sourceHost: 'writing-task' })
    const suggestedRel = {
      id: 'rel_s',
      fromFragmentId: 'f1',
      toFragmentId: question.id,
      type: 'similarity' as const,
      createdBy: 'auto' as const,
      confidence: 0.7,
      suggestionReason: 'rule',
      status: 'suggested' as const,
      createdAt: NOW,
      updatedAt: NOW,
    }
    const confirmedRel = { ...suggestedRel, id: 'rel_c', status: 'confirmed' as const, confirmedAt: NOW, confirmedBy: 'user' as const, createdBy: 'user' as const }
    const result = applyDesktopChanges(
      [
        { type: 'fragment.created', fragment: question },
        { type: 'relation.created', relation: suggestedRel },
        { type: 'relation.created', relation: confirmedRel },
      ],
      localState,
    )
    expect(result.fragments.map(f => f.id)).toContain(question.id)
    expect(result.relations.map(r => r.id)).toEqual(['rel_c'])
  })

  it('symmetric relations arrive canonical and suppressions sync by decision key', () => {
    const result = applyDesktopChanges(
      [
        { type: 'relation.updated', relation: { id: 'rel_r', fromFragmentId: 'zz', toFragmentId: 'aa', type: 'contrast', createdBy: 'user', status: 'confirmed', confirmedAt: NOW, confirmedBy: 'user', createdAt: NOW, updatedAt: NOW } },
        { type: 'suppression.sync', suppression: { fromFragmentId: 'zz', toFragmentId: 'aa', suggestedType: 'similarity', rejectedAt: NOW } },
      ],
      localState,
    )
    expect(result.relations[0]!.fromFragmentId).toBe('aa')
    expect(result.relations[0]!.toFragmentId).toBe('zz')
    expect(keyOfSuppression(result.suppressions[0]!)).toBe(`aa zz similarity`)
  })

  it('stale reviews keep the newer local state but still append the log', () => {
    const newerLocal = { ...f1, review: { ...f1.review, lastReviewedAt: NOW + 10_000, repetitions: 5 } }
    const change: DesktopChange = {
      type: 'review.rated',
      fragmentId: 'f1',
      review: { ...f1.review, repetitions: 1 },
      log: { id: 'log_3', target: { type: 'fragment', fragmentId: 'f1' }, rating: 'good', reviewedAt: NOW, previousIntervalDays: 0, nextIntervalDays: 1, usedHint: false, schedulerVersion: 'four-tier-v1' },
    }
    const result = applyDesktopChanges([change], { ...localState, fragments: [newerLocal] })
    expect(result.fragments).toHaveLength(0) // no state update
    expect(result.reviewLogs).toHaveLength(1)
    expect(result.reports).toHaveLength(1)
    expect(result.reports[0]!.reason).toBe('STALE_REVIEW')
  })
})

describe('relation suggestions (R2.2 — rules only, always suggested + reason)', () => {
  it('suggests by shared tags with confidence and reason, respecting suppressions and existing relations', () => {
    const a = makeFragment({ id: 'a', tags: ['fed', 'macro'] })
    const b = { ...makeFragment({ id: 'b', tags: ['fed', 'macro'] }) }
    const c = makeFragment({ id: 'c', tags: ['tech'] })
    const suggestions = suggestRelations([a, b, c], {
      suppressions: [{ fromFragmentId: 'a', toFragmentId: 'b', suggestedType: 'reference', rejectedAt: NOW }],
      existing: [],
    })
    const ab = suggestions.find(s => s.fromFragmentId === 'a' && s.toFragmentId === 'b')
    if (ab) {
      // reference between a/b is suppressed; similarity may still surface
      expect(ab.suggestedType).not.toBe('reference')
    }
    expect(suggestions.every(s => s.confidence > 0 && s.confidence <= 0.9)).toBe(true)
    expect(suggestions.every(s => s.reason.length > 0)).toBe(true)
    // a/c share only the host — surfaces as a low-confidence reference suggestion
    const ac = suggestions.find(s => (s.fromFragmentId === 'a' && s.toFragmentId === 'c') || (s.fromFragmentId === 'c' && s.toFragmentId === 'a'))
    expect(ac?.suggestedType).toBe('reference')
    expect(ac?.reason).toContain('同来源')
  })
})
