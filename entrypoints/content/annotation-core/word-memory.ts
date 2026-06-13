/**
 * Local user-vocabulary memory model.
 *
 * Upgrades the 5-level `star` enum into a continuous recall-probability model so the
 * annotator can answer "does the user *still* know this word right now?" instead of
 * relying purely on a static state flag or an explicit right-click.
 *
 * Design (FSRS / Half-Life-Regression inspired, intentionally lightweight):
 *  - Each word accumulates exposure (`seenCount`) and explicit feedback.
 *  - A `stability` (half-life, in days) grows with repeated exposure and with
 *    explicit "known"/"skip" feedback, and shrinks on "unknown"/"addToVocab".
 *  - `recall = 2 ^ (-elapsedDays / stability)` — exponential forgetting curve.
 *
 * This module is pure (no storage, no Date.now): callers pass `now` in. That keeps it
 * trivially unit-testable and lets the background service own persistence.
 *
 * Backward compatibility: WordMemory carries an optional `star` mirror so existing
 * Eudic sync / snapshot code paths keep working unchanged. recall<->star conversion
 * is provided so the annotator can keep its star-based scoring without a rewrite.
 */

export type WordMemoryEventType = 'seen' | 'reveal' | 'known' | 'unknown' | 'skip' | 'addToVocab' | 'reset'

export interface WordMemory {
  /** Total number of times the word was exposed (annotated/shown) to the user. */
  seenCount: number
  /** Timestamp (ms) of the most recent exposure or feedback. */
  lastSeenAt: number
  /** Memory half-life in days. Higher = more durable knowledge. */
  stability: number
  /** Optional mirror of the legacy 1..5 Eudic star, kept for sync compatibility. */
  star?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

// Stability (half-life in days) anchors.
const INITIAL_STABILITY_DAYS = 1 // a freshly seen word is forgotten quickly
const MIN_STABILITY_DAYS = 0.25
const MAX_STABILITY_DAYS = 365 * 2
// Each additional exposure multiplies stability by this factor (spacing effect).
const SEEN_STABILITY_GROWTH = 1.6
// Explicit feedback jumps.
const KNOWN_STABILITY_DAYS = 180 // "I know this" → treat as long-term known
const SKIP_STABILITY_DAYS = MAX_STABILITY_DAYS // "never show again" → effectively permanent
const UNKNOWN_STABILITY_DAYS = 0.5 // "I don't know this" → reset toward short-term

/** Clamp a stability value into the supported range. */
function clampStability(days: number): number {
  if (!Number.isFinite(days)) return INITIAL_STABILITY_DAYS
  return Math.min(MAX_STABILITY_DAYS, Math.max(MIN_STABILITY_DAYS, days))
}

/** A brand-new memory for a word the user has never interacted with. */
export function createWordMemory(now: number): WordMemory {
  return {
    seenCount: 0,
    lastSeenAt: now,
    stability: INITIAL_STABILITY_DAYS,
  }
}

/**
 * Recall probability in [0, 1] for a word given how long ago it was last seen.
 * recall = 2 ^ (-elapsedDays / stability). At elapsed == stability, recall == 0.5.
 */
export function recallProbability(memory: WordMemory, now: number): number {
  const elapsedDays = Math.max(0, (now - memory.lastSeenAt) / DAY_MS)
  const stability = clampStability(memory.stability)
  const recall = Math.pow(2, -elapsedDays / stability)
  if (!Number.isFinite(recall)) return 0
  return Math.min(1, Math.max(0, recall))
}

/**
 * Apply a learning event to a memory, returning the updated memory.
 * Pure: does not mutate the input.
 */
export function applyEvent(prev: WordMemory | undefined, eventType: WordMemoryEventType, now: number): WordMemory {
  const base = prev ?? createWordMemory(now)
  const seenCount = base.seenCount + 1

  let stability = clampStability(base.stability)

  switch (eventType) {
    case 'seen':
    case 'reveal':
      // Passive exposure: spacing effect grows stability, but more if enough time passed
      // (reviewing right after seeing barely helps — but we keep it simple and monotonic).
      stability = clampStability(stability * SEEN_STABILITY_GROWTH)
      break
    case 'known':
      stability = clampStability(Math.max(stability, KNOWN_STABILITY_DAYS))
      break
    case 'skip':
      stability = SKIP_STABILITY_DAYS
      break
    case 'unknown':
    case 'addToVocab':
      // User explicitly doesn't know it / wants to learn it → make it short-term again
      // so it keeps surfacing until genuinely learned.
      stability = clampStability(Math.min(stability, UNKNOWN_STABILITY_DAYS))
      break
    case 'reset':
      return createWordMemory(now)
  }

  return {
    seenCount,
    lastSeenAt: now,
    stability,
    star: base.star,
  }
}

/**
 * Map a recall probability back to the legacy 1..5 star scale so existing
 * star-based scoring/skip thresholds keep working.
 *  recall >= 0.95 → 5 (effectively mastered / known)
 *  recall >= 0.80 → 4
 *  recall >= 0.60 → 3
 *  recall >= 0.35 → 2
 *  else           → 1 (likely forgotten / unknown → annotate)
 */
export function recallToStar(recall: number): number {
  if (recall >= 0.95) return 5
  if (recall >= 0.8) return 4
  if (recall >= 0.6) return 3
  if (recall >= 0.35) return 2
  return 1
}

/** Convenience: recall-derived star for a memory at `now`. */
export function memoryToStar(memory: WordMemory, now: number): number {
  return recallToStar(recallProbability(memory, now))
}

/**
 * Seed a memory from a legacy star value (e.g. from an Eudic snapshot entry that has
 * no memory history yet). Higher star → higher initial stability.
 */
export function memoryFromStar(star: number, now: number): WordMemory {
  const normalized = Math.min(5, Math.max(1, Math.round(star)))
  const stabilityByStar: Record<number, number> = {
    1: INITIAL_STABILITY_DAYS,
    2: 3,
    3: 14,
    4: 60,
    5: KNOWN_STABILITY_DAYS,
  }
  return {
    seenCount: 0,
    lastSeenAt: now,
    stability: clampStability(stabilityByStar[normalized] ?? INITIAL_STABILITY_DAYS),
    star: normalized,
  }
}

export const __testing = {
  DAY_MS,
  INITIAL_STABILITY_DAYS,
  MAX_STABILITY_DAYS,
  SEEN_STABILITY_GROWTH,
  KNOWN_STABILITY_DAYS,
}
