/**
 * R3 bidirectional convergence domain — docs/v2/storage.md §9.
 *
 * Field-domain merge: capture fields belong to the extension, review fields
 * belong to the Desktop. A change never overwrites the other domain, and no
 * whole-record LWW happens. Local deletion markers block old ids from
 * reviving on either end; deletes never propagate.
 *
 * The Desktop serves a cursor feed (`GET /v1/changes`) of its review
 * mutations; the extension applies batches through `applyDesktopChanges`,
 * producing a visible sync report for anything skipped.
 */
import type { FragmentRecord, ReviewLog, ReviewState } from './types'

// ── change feed shapes (Desktop → extension) ────────────────────────────

export interface ReviewRatedChange {
  type: 'review.rated'
  fragmentId: string
  /** Review state AFTER the rating (review domain, Desktop-owned). */
  review: ReviewState
  log: ReviewLog
}

export interface FragmentDeletedChange {
  /** Informational only: Desktop removed its local copy; the extension keeps its own. */
  type: 'fragment.deleted'
  fragmentId: string
}

export type DesktopChange = ReviewRatedChange | FragmentDeletedChange

export type SeqChange = DesktopChange & {
  /** Monotonic feed position — the cursor the extension persists. */
  seq: number
}

export interface ChangesPage {
  changes: SeqChange[]
  /** Cursor for the next call (last seq of the page); absent when drained. */
  nextCursor?: string
}

// ── extension → Desktop event batch (/v1/events, idempotent) ────────────

export interface EventBatch {
  deviceId: string
  events: Array<{ eventId: string; type: string; payload: unknown; createdAt: number }>
}

// ── apply + merge ────────────────────────────────────────────────────────

export type SyncSkipReason =
  | 'LOCAL_DELETED' // extension tombstone blocks revival (§9)
  | 'DESKTOP_DELETED'
  | 'UNKNOWN_FRAGMENT' // e.g. review for a fragment this extension never had
  | 'STALE_REVIEW' // rating based on an older captureRevision than local

export interface SyncReportEntry {
  changeIndex: number
  type: DesktopChange['type']
  fragmentId?: string
  reason: SyncSkipReason | `CONFLICT:${string}`
  detail?: string
  at: number
}

export interface ApplyResult {
  fragments: FragmentRecord[]
  fragmentIds: string[]
  reviewLogs: ReviewLog[]
  reports: SyncReportEntry[]
}

export interface ApplyLocalState {
  fragments: FragmentRecord[]
  localDeletions: Set<string>
  now?: number
}

/**
 * Pure merge of one batch. The caller persists everything in a single
 * transaction; review updates only touch `review` + logs, never capture
 * fields.
 */
export function applyDesktopChanges(changes: DesktopChange[], local: ApplyLocalState): ApplyResult {
  const now = local.now ?? Date.now()
  const byId = new Map(local.fragments.map(f => [f.id, f]))
  const result: ApplyResult = { fragments: [], fragmentIds: [], reviewLogs: [], reports: [] }

  changes.forEach((change, index) => {
    switch (change.type) {
      case 'review.rated': {
        const existing = byId.get(change.fragmentId)
        if (local.localDeletions.has(change.fragmentId)) {
          result.reports.push({ changeIndex: index, type: change.type, fragmentId: change.fragmentId, reason: 'LOCAL_DELETED', at: now })
          break
        }
        if (!existing) {
          result.reports.push({ changeIndex: index, type: change.type, fragmentId: change.fragmentId, reason: 'UNKNOWN_FRAGMENT', at: now })
          break
        }
        // A rating is stale when it predates the newest local rating we already
        // applied — keep the newer ReviewState (log still appends, idempotent by id)
        // and surface the same-domain conflict in the visible report (§9).
        const isNewer = !existing.review.lastReviewedAt || change.log.reviewedAt >= existing.review.lastReviewedAt
        if (isNewer) {
          byId.set(change.fragmentId, { ...existing, review: change.review, updatedAt: now })
          result.fragments.push({ ...existing, review: change.review, updatedAt: now })
          result.fragmentIds.push(change.fragmentId)
        } else {
          result.reports.push({
            changeIndex: index,
            type: change.type,
            fragmentId: change.fragmentId,
            reason: 'STALE_REVIEW',
            detail: `评分时间早于本地最新评分（${new Date(change.log.reviewedAt).toISOString()} < ${new Date(existing.review.lastReviewedAt!).toISOString()}），已保留较新状态`,
            at: now,
          })
        }
        result.reviewLogs.push(change.log)
        break
      }
      case 'fragment.deleted': {
        // Desktop removed its copy — informational; the extension keeps its own.
        result.reports.push({ changeIndex: index, type: change.type, fragmentId: change.fragmentId, reason: 'DESKTOP_DELETED', at: now })
        break
      }
    }
  })

  return result
}
