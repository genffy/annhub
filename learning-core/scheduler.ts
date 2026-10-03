/**
 * Four-tier daily scheduler — transitional implementation towards FSRS.
 * Contract: docs/v2/review.md. Semantics:
 *   - Review targets are knowledge fragments.
 *   - The Extension captures data; the Desktop client runs review sessions.
 *   - `schedulerVersion` on every ReviewLog is what makes log-replay migration
 *     to FSRS possible; never omit it.
 */
import type { FragmentRecord, ReviewLog, ReviewState } from './types'
import { SCHEDULER_VERSION, newId } from './factory'

export type ReviewRating = ReviewLog['rating']

const DAY_MS = 24 * 60 * 60 * 1000

export function scheduleReview(review: ReviewState, rating: ReviewRating, now: number = Date.now()): ReviewState {
  let intervalDays = review.intervalDays
  let easeFactor = review.easeFactor
  let repetitions = review.repetitions
  let lapses = review.lapses

  switch (rating) {
    case 'again':
      intervalDays = 1
      repetitions = 0
      lapses += 1
      easeFactor = Math.max(1.3, easeFactor - 0.2)
      break
    case 'hard':
      intervalDays = Math.max(1, Math.round(Math.max(1, intervalDays) * 1.2))
      easeFactor = Math.max(1.3, easeFactor - 0.15)
      break
    case 'good':
      repetitions += 1
      intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(intervalDays * easeFactor))
      break
    case 'easy':
      repetitions += 1
      intervalDays = repetitions === 1 ? 4 : Math.max(2, Math.round(intervalDays * easeFactor * 1.3))
      easeFactor += 0.15
      break
  }

  return {
    state: rating === 'again' ? 'relearning' : 'review',
    repetitions,
    lapses,
    intervalDays,
    easeFactor,
    lastReviewedAt: now,
    nextReviewAt: now + intervalDays * DAY_MS,
  }
}

/**
 * Pure rating step: returns the next ReviewState plus the ReviewLog to append.
 * Callers must persist both in the SAME transaction (storage §2.6).
 */
export function rateFragment(fragment: FragmentRecord, rating: ReviewRating, options: { usedHint?: boolean; now?: number } = {}): { fragment: FragmentRecord; log: ReviewLog } {
  const now = options.now ?? Date.now()
  const next = scheduleReview(fragment.review, rating, now)
  const log: ReviewLog = {
    id: newId(),
    target: { type: 'fragment', fragmentId: fragment.id },
    rating,
    reviewedAt: now,
    previousIntervalDays: fragment.review.intervalDays,
    nextIntervalDays: next.intervalDays,
    usedHint: options.usedHint ?? false,
    schedulerVersion: SCHEDULER_VERSION,
  }
  return { fragment: { ...fragment, review: next, updatedAt: now }, log }
}

/** Human-readable interval preview for the four rating buttons. */
export function previewInterval(review: ReviewState, rating: ReviewRating, now: number = Date.now()): number {
  return scheduleReview(review, rating, now).intervalDays
}
