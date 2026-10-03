/**
 * R3 bidirectional convergence domain — docs/v2/storage.md §9.
 *
 * Field-domain merge: capture fields belong to the extension, review /
 * output / relation fields belong to the Desktop. A change never overwrites
 * the other domain, and no whole-record LWW happens. Local deletion markers
 * block old ids from reviving on either end; deletes never propagate.
 *
 * The Desktop serves a cursor feed (`GET /v1/changes`) of its own mutations
 * plus Desktop-created fragments (question drafts from output feedback);
 * the extension applies batches through `applyDesktopChanges`, producing a
 * visible sync report for anything skipped.
 */
import type { FragmentRecord, FragmentRelation, RelationSuppression, ReviewLog, ReviewState, WritingTaskRecord, RelationType } from './types'
import { canonicalRelationEndpoints } from './validate'

// ── change feed shapes (Desktop → extension) ────────────────────────────

export interface ReviewRatedChange {
  type: 'review.rated'
  fragmentId: string
  /** Review state AFTER the rating (review domain, Desktop-owned). */
  review: ReviewState
  log: ReviewLog
}

export interface WritingChangedChange {
  type: 'writing.created' | 'writing.submitted'
  task: WritingTaskRecord
}

export interface RelationChangedChange {
  type: 'relation.created' | 'relation.updated'
  /** Confirmed relations only — suggested candidates never travel (§9). */
  relation: FragmentRelation
}

export interface RelationDeletedChange {
  type: 'relation.deleted'
  relationId: string
}

export interface SuppressionSyncChange {
  type: 'suppression.sync'
  suppression: RelationSuppression
}

export interface FragmentCreatedChange {
  /** Desktop-created fragment (question drafts from feedback, annhub://writing-task source). */
  type: 'fragment.created'
  fragment: FragmentRecord
}

export interface FragmentDeletedChange {
  /** Informational only: Desktop removed its local copy; the extension keeps its own. */
  type: 'fragment.deleted'
  fragmentId: string
}

export type DesktopChange = ReviewRatedChange | WritingChangedChange | RelationChangedChange | RelationDeletedChange | SuppressionSyncChange | FragmentCreatedChange | FragmentDeletedChange

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
  writingTasks: WritingTaskRecord[]
  relations: FragmentRelation[]
  deletedRelationIds: string[]
  suppressions: RelationSuppression[]
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
 * fields. Suggested relations are dropped defensively — only confirmed
 * travel on the feed.
 */
export function applyDesktopChanges(changes: DesktopChange[], local: ApplyLocalState): ApplyResult {
  const now = local.now ?? Date.now()
  const byId = new Map(local.fragments.map(f => [f.id, f]))
  const result: ApplyResult = {
    fragments: [],
    fragmentIds: [],
    reviewLogs: [],
    writingTasks: [],
    relations: [],
    deletedRelationIds: [],
    suppressions: [],
    reports: [],
  }

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
      case 'writing.created':
      case 'writing.submitted': {
        result.writingTasks.push(change.task)
        break
      }
      case 'relation.created':
      case 'relation.updated': {
        if (change.relation.status !== 'confirmed') break // suggested never applies (§9)
        const [from, to] = canonicalRelationEndpoints(change.relation.fromFragmentId, change.relation.toFragmentId, change.relation.type)
        const canonical = { ...change.relation, fromFragmentId: from, toFragmentId: to }
        if (!byId.has(from) && !byId.has(to)) {
          // Neither endpoint synced yet — keep the relation but surface it.
          result.reports.push({ changeIndex: index, type: change.type, reason: 'UNKNOWN_FRAGMENT', fragmentId: from, detail: `端点 ${from}/${to} 尚未同步到本地`, at: now })
        }
        result.relations.push(canonical)
        break
      }
      case 'relation.deleted': {
        result.deletedRelationIds.push(change.relationId)
        break
      }
      case 'suppression.sync': {
        const [from, to] = canonicalRelationEndpoints(change.suppression.fromFragmentId, change.suppression.toFragmentId, change.suppression.suggestedType)
        result.suppressions.push({ ...change.suppression, fromFragmentId: from, toFragmentId: to })
        break
      }
      case 'fragment.created': {
        if (local.localDeletions.has(change.fragment.id)) {
          result.reports.push({ changeIndex: index, type: change.type, fragmentId: change.fragment.id, reason: 'LOCAL_DELETED', at: now })
          break
        }
        if (byId.has(change.fragment.id)) break // idempotent
        byId.set(change.fragment.id, change.fragment)
        result.fragments.push(change.fragment)
        result.fragmentIds.push(change.fragment.id)
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

/** Suggested-relationship rule engine output (R2.2): never confirmed, always with a reason. */
export interface RelationSuggestion {
  fromFragmentId: string
  toFragmentId: string
  suggestedType: RelationType
  confidence: number
  reason: string
}

/** Shared-tag/kind/host overlap rules — cheap, local, deterministic. */
export function suggestRelations(
  fragments: FragmentRecord[],
  options: { suppressions?: RelationSuppression[]; existing?: FragmentRelation[]; limit?: number } = {},
): RelationSuggestion[] {
  const suppressed = new Set((options.suppressions ?? []).map(keyOfSuppression))
  const existingKeys = new Set((options.existing ?? []).map(r => `${r.fromFragmentId} ${r.toFragmentId} ${r.type}`))
  const suggestions: RelationSuggestion[] = []
  for (let i = 0; i < fragments.length; i++) {
    for (let j = i + 1; j < fragments.length; j++) {
      const a = fragments[i]!
      const b = fragments[j]!
      const sharedTags = a.tags.filter(t => b.tags.includes(t))
      const sameKind = a.kind === b.kind
      const sameHost = a.context.sourceHost === b.context.sourceHost
      if (!sharedTags.length && !sameHost) continue
      const type: RelationType = sharedTags.length >= 2 || (sameKind && sharedTags.length === 1) ? 'similarity' : 'reference'
      const [from, to] = canonicalRelationEndpoints(a.id, b.id, type)
      const key = `${from} ${to} ${type}`
      const skey = `${from} ${to} ${type}`
      if (existingKeys.has(key) || suppressed.has(skey)) continue
      const confidence = Math.min(0.9, 0.3 + sharedTags.length * 0.2 + (sameHost ? 0.1 : 0) + (sameKind ? 0.1 : 0))
      const reason = sameHost
        ? `同来源 ${a.context.sourceHost}${sharedTags.length ? `，共享标签 ${sharedTags.join('、')}` : ''}`
        : `共享标签 ${sharedTags.join('、')}`
      suggestions.push({ fromFragmentId: from, toFragmentId: to, suggestedType: type, confidence, reason })
    }
  }
  return suggestions.sort((x, y) => y.confidence - x.confidence).slice(0, options.limit ?? 20)
}

export function keyOfSuppression(s: Pick<RelationSuppression, 'fromFragmentId' | 'toFragmentId' | 'suggestedType'>): string {
  const [from, to] = canonicalRelationEndpoints(s.fromFragmentId, s.toFragmentId, s.suggestedType)
  return `${from} ${to} ${s.suggestedType}`
}
