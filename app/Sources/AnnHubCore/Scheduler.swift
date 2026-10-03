// Four-tier daily scheduler — mirrors learning-core/scheduler.ts.
// Contract: docs/v2/review.md. The extension captures fragments; the Desktop
// client runs review sessions.
//   - `schedulerVersion` on every ReviewLog is what makes log-replay migration
//     to FSRS possible; never omit it.

import Foundation

public let dayMs = 24 * 60 * 60 * 1000

public func scheduleReview(_ review: ReviewState, rating: ReviewRating, now: Int) -> ReviewState {
    var intervalDays = review.intervalDays
    var easeFactor = review.easeFactor
    var repetitions = review.repetitions
    var lapses = review.lapses

    switch rating {
    case .again:
        intervalDays = 1
        repetitions = 0
        lapses += 1
        easeFactor = max(1.3, easeFactor - 0.2)
    case .hard:
        intervalDays = max(1, Int((Double(max(1, intervalDays)) * 1.2).rounded()))
        easeFactor = max(1.3, easeFactor - 0.15)
    case .good:
        repetitions += 1
        if repetitions == 1 {
            intervalDays = 1
        } else if repetitions == 2 {
            intervalDays = 6
        } else {
            intervalDays = max(1, Int((Double(intervalDays) * easeFactor).rounded()))
        }
    case .easy:
        repetitions += 1
        if repetitions == 1 {
            intervalDays = 4
        } else {
            intervalDays = max(2, Int((Double(intervalDays) * easeFactor * 1.3).rounded()))
        }
        easeFactor += 0.15
    }

    return ReviewState(
        state: rating == .again ? .relearning : .review,
        repetitions: repetitions,
        lapses: lapses,
        intervalDays: intervalDays,
        easeFactor: easeFactor,
        lastReviewedAt: now,
        nextReviewAt: now + intervalDays * dayMs
    )
}

public struct RatedFragment {
    public var fragment: FragmentRecord
    public var log: ReviewLog
}

/// Pure rating step: returns the next ReviewState plus the ReviewLog to append.
/// Callers must persist both in the SAME transaction (storage.md §3.1).
public func rateFragment(
    _ fragment: FragmentRecord,
    rating: ReviewRating,
    usedHint: Bool = false,
    now: Int? = nil
) -> RatedFragment {
    let now = now ?? Int(Date().timeIntervalSince1970 * 1000)
    let next = scheduleReview(fragment.review, rating: rating, now: now)
    var updated = fragment
    updated.review = next
    updated.updatedAt = now
    let log = ReviewLog(
        id: newId(),
        target: ReviewTarget(fragmentId: fragment.id),
        rating: rating,
        reviewedAt: now,
        previousIntervalDays: fragment.review.intervalDays,
        nextIntervalDays: next.intervalDays,
        usedHint: usedHint,
        schedulerVersion: schedulerVersion
    )
    return RatedFragment(fragment: updated, log: log)
}

/// Human-readable interval preview for the four rating buttons.
public func previewInterval(_ review: ReviewState, rating: ReviewRating, now: Int? = nil) -> Int {
    let now = now ?? Int(Date().timeIntervalSince1970 * 1000)
    return scheduleReview(review, rating: rating, now: now).intervalDays
}
