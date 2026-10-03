/**
 * fragment-store — IndexedDB v4 persistence for the learning core.
 * Target contract: docs/v2/storage.md.
 *
 * Environment-neutral (runs in the extension service worker and in a plain
 * web page). Every learning-core write follows the local-write discipline:
 *   validate -> write entity -> append delivery event -> commit
 * with entity + outbox event inside ONE transaction (storage.md §4).
 *
 * DB v4 purges chunk-era (schema v3) rows on upgrade — there is no user data
 * to migrate (roadmap R1.1: old records are not migrated).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  FragmentRecord,
  ImageAsset,
  LocalDeletion,
  OutboxEvent,
  RelationSuppression,
  ReviewLog,
  ScreenshotRecord,
  SyncEventType,
  WritingTaskRecord,
  FragmentRelation,
} from './types'
import { assertValid, canonicalRelationKey, normalizeRelation, validateRelation } from './validate'
import { createFragment, newId, type CreateFragmentInput } from './factory'
import { rateFragment, type ReviewRating } from './scheduler'
import { dedupeKeyOf, normalizeContent } from './normalize'
import { newAssetId, newScreenshotId, type AssetDeliveryPayload, type FragmentDeliveryPayload } from './wire'
import { applyDesktopChanges, type ApplyResult, type DesktopChange, type SyncReportEntry } from './sync'

type StoredReviewLog = ReviewLog & { targetKey: string }
type StoredRelation = FragmentRelation & { fromKey: string; toKey: string }

interface FragmentDB extends DBSchema {
  fragments: {
    key: string
    value: FragmentRecord
    indexes: {
      'by-kind': string
      'by-host': string
      'by-tag': string
      'by-review-date': number
      'by-created': number
      'by-normalized': string
    }
  }
  reviewLogs: {
    key: string
    value: StoredReviewLog
    indexes: { 'by-target': string; 'by-reviewed': number }
  }
  writingTasks: { key: string; value: WritingTaskRecord }
  relations: {
    key: string
    value: StoredRelation
    indexes: { 'by-from': string; 'by-to': string; 'by-status': string }
  }
  assets: {
    key: string
    value: { metadata: ImageAsset; bytes: Blob }
  }
  screenshots: {
    key: string
    value: ScreenshotRecord
  }
  relationSuppressions: { key: string; value: RelationSuppression }
  outboxEvents: {
    key: string
    value: OutboxEvent
    indexes: { 'by-created': number }
  }
  localDeletions: { key: string; value: LocalDeletion }
  syncMeta: { key: string; value: string }
  syncReports: { key: string; value: SyncReportEntry & { id: string } }
}

const withTargetKey = (log: ReviewLog): StoredReviewLog => ({ ...log, targetKey: log.target.fragmentId })
const withRelationKeys = (rel: FragmentRelation): StoredRelation => ({
  ...rel,
  fromKey: rel.fromFragmentId,
  toKey: rel.toFragmentId,
})

const eventFragmentId = (event: OutboxEvent): string | null => {
  const payload = event.payload as Partial<FragmentDeliveryPayload & AssetDeliveryPayload> | null
  if (payload && typeof payload === 'object' && typeof payload.fragmentId === 'string') return payload.fragmentId
  return null
}
const eventAssetId = (event: OutboxEvent): string | null => {
  const payload = event.payload as Partial<AssetDeliveryPayload> | null
  if (payload && typeof payload === 'object' && typeof payload.assetId === 'string') return payload.assetId
  return null
}

export interface FragmentSaveOutcome {
  success: boolean
  fragment?: FragmentRecord
  /** Existing fragment with the same dedupeKey, when duplicate && !force. */
  duplicateOf?: FragmentRecord
  error?: string
}

/** Capture-field patch; every accepted edit bumps captureRevision (fragments.md §7). */
export interface FragmentPatch {
  content?: string
  excerpt?: string
  sourceUrl?: string
  sourceTitle?: string
  kind?: FragmentRecord['kind']
  detail?: unknown
  tags?: string[]
  guess?: string
  use?: string
  verified?: FragmentRecord['processing']['verified']
}

export class FragmentStore {
  private db: IDBPDatabase<FragmentDB> | null = null
  private readonly dbName: string
  private readonly dbVersion = 5
  /** Host assigns a stable device identity; (deviceId, eventId) is the sync idempotency key. */
  deviceId = 'local'

  constructor(dbName = 'fragment-store') {
    this.dbName = dbName
  }

  async initialize(): Promise<void> {
    if (this.db) return
    this.db = await openDB<FragmentDB>(this.dbName, this.dbVersion, {
      upgrade(db, oldVersion) {
        // v3 → v4: chunk-era rows (schema v3, EntityRef relations) are not
        // migrated — the v4 contract starts clean (roadmap R1.1).
        if (oldVersion > 0 && oldVersion < 4) {
          const legacy = ['fragments', 'reviewLogs', 'writingTasks', 'relations', 'outboxEvents'] as Array<
            'fragments' | 'reviewLogs' | 'writingTasks' | 'relations' | 'outboxEvents'
          >
          for (const name of legacy) {
            if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name)
          }
        }

        const fragments = db.createObjectStore('fragments', { keyPath: 'id' })
        fragments.createIndex('by-kind', 'kind')
        fragments.createIndex('by-host', 'context.sourceHost')
        fragments.createIndex('by-tag', 'tags', { multiEntry: true })
        fragments.createIndex('by-review-date', 'review.nextReviewAt')
        fragments.createIndex('by-created', 'createdAt')
        fragments.createIndex('by-normalized', 'normalizedContent')

        const logs = db.createObjectStore('reviewLogs', { keyPath: 'id' })
        logs.createIndex('by-target', 'targetKey')
        logs.createIndex('by-reviewed', 'reviewedAt')

        db.createObjectStore('writingTasks', { keyPath: 'id' })

        const relations = db.createObjectStore('relations', { keyPath: 'id' })
        relations.createIndex('by-from', 'fromKey')
        relations.createIndex('by-to', 'toKey')
        relations.createIndex('by-status', 'status')

        db.createObjectStore('assets', { keyPath: 'metadata.id' })
        db.createObjectStore('screenshots', { keyPath: 'id' })
        db.createObjectStore('relationSuppressions')

        const outbox = db.createObjectStore('outboxEvents', { keyPath: 'eventId' })
        outbox.createIndex('by-created', 'createdAt')

        db.createObjectStore('localDeletions', { keyPath: 'fragmentId' })
        // v5 additive: R3 sync cursor + visible conflict reports (storage.md §9).
        if (!db.objectStoreNames.contains('syncMeta')) db.createObjectStore('syncMeta')
        if (!db.objectStoreNames.contains('syncReports')) db.createObjectStore('syncReports', { keyPath: 'id' })
      },
    })
  }

  private async db_(): Promise<IDBPDatabase<FragmentDB>> {
    if (!this.db) await this.initialize()
    return this.db!
  }

  private enqueueEvent(type: SyncEventType, payload: unknown): OutboxEvent {
    return {
      eventId: newId(),
      deviceId: this.deviceId,
      type,
      payload,
      createdAt: Date.now(),
      attempts: 0,
    }
  }

  // ── fragments ────────────────────────────────────────────────────────

  async findDuplicate(input: { content: string; excerpt: string; sourceUrl: string }): Promise<FragmentRecord | null> {
    const db = await this.db_()
    const targetKey = dedupeKeyOf(input.content, input.sourceUrl, input.excerpt)
    const all = await db.getAll('fragments')
    return all.find(f => dedupeKeyOf(f.content, f.context.sourceUrl, f.context.excerpt) === targetKey) ?? null
  }

  /**
   * Create + persist a fragment. Duplicate dedupeKey + !force returns the
   * existing record for the "save as new context anyway" prompt. For `visual`
   * fragments every referenced asset must already exist; the same transaction
   * appends the fragment event and the assets' delivery tasks (storage.md §4).
   */
  async saveFragment<K extends Parameters<typeof createFragment>[0]['kind']>(
    input: CreateFragmentInput<K>,
    options: { force?: boolean } = {},
  ): Promise<FragmentSaveOutcome> {
    const db = await this.db_()
    const duplicateOf = await this.findDuplicate({
      content: input.content,
      excerpt: input.context.excerpt,
      sourceUrl: input.context.sourceUrl,
    })
    if (duplicateOf && !options.force) {
      return { success: false, duplicateOf }
    }
    const record = createFragment(input)
    const event = this.enqueueEvent('fragment.created', { fragmentId: record.id, revision: record.captureRevision } satisfies FragmentDeliveryPayload)

    if (record.kind === 'visual') {
      const attachmentIds = (record.detail as { attachmentIds: string[] }).attachmentIds
      const locatorAssetId = record.context.locator.type === 'image' ? record.context.locator.assetId : null
      const requiredAssets = new Set(attachmentIds)
      if (locatorAssetId) requiredAssets.add(locatorAssetId)
      const tx = db.transaction(['fragments', 'assets', 'outboxEvents'], 'readwrite')
      for (const assetId of requiredAssets) {
        const asset = await tx.objectStore('assets').get(assetId)
        if (!asset) {
          await tx.done
          return { success: false, error: `ASSET_MISSING:${assetId}` }
        }
      }
      await tx.objectStore('fragments').put(record)
      await tx.objectStore('outboxEvents').put(event)
      for (const assetId of attachmentIds) {
        await tx.objectStore('outboxEvents').put(this.enqueueEvent('asset.created', { assetId } satisfies AssetDeliveryPayload))
      }
      await tx.done
      return { success: true, fragment: record }
    }

    const tx = db.transaction(['fragments', 'outboxEvents'], 'readwrite')
    await tx.objectStore('fragments').put(record)
    await tx.objectStore('outboxEvents').put(event)
    await tx.done
    return { success: true, fragment: record }
  }

  /** Applies a capture-field patch: bumps captureRevision, revalidates, emits fragment.updated. */
  async editFragment(id: string, patch: FragmentPatch): Promise<FragmentSaveOutcome> {
    const db = await this.db_()
    const existing = await db.get('fragments', id)
    if (!existing) return { success: false, error: 'NOT_FOUND' }
    const merged: FragmentRecord = {
      ...existing,
      content: patch.content ?? existing.content,
      kind: (patch.kind ?? existing.kind) as FragmentRecord['kind'],
      detail: (patch.detail ?? existing.detail) as FragmentRecord['detail'],
      tags: patch.tags ?? existing.tags,
      context: {
        ...existing.context,
        excerpt: patch.excerpt ?? existing.context.excerpt,
        sourceUrl: patch.sourceUrl ?? existing.context.sourceUrl,
        sourceTitle: patch.sourceTitle !== undefined ? patch.sourceTitle : existing.context.sourceTitle,
      },
      processing: {
        guess: patch.guess !== undefined ? patch.guess : existing.processing.guess,
        verified: patch.verified ?? existing.processing.verified,
        use: patch.use ?? existing.processing.use,
      },
      normalizedContent: '',
      captureRevision: existing.captureRevision + 1,
      updatedAt: Date.now(),
    }
    merged.normalizedContent = normalizeContent(merged.content)
    try {
      assertValid(merged)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'VALIDATION_FAILED' }
    }
    const event = this.enqueueEvent('fragment.updated', { fragmentId: merged.id, revision: merged.captureRevision } satisfies FragmentDeliveryPayload)
    const tx = db.transaction(['fragments', 'outboxEvents'], 'readwrite')
    await tx.objectStore('fragments').put(merged)
    await tx.objectStore('outboxEvents').put(event)
    await tx.done
    return { success: true, fragment: merged }
  }

  /**
   * Extension-local delete (storage.md §10): removes the record, its
   * relations and ITS pending delivery tasks in one transaction, and writes
   * a local-only deletion marker. No delete event is ever sent.
   */
  async deleteFragment(id: string): Promise<void> {
    const db = await this.db_()
    const tx = db.transaction(['fragments', 'relations', 'outboxEvents', 'localDeletions'], 'readwrite')
    const relations = await tx.objectStore('relations').getAll()
    for (const rel of relations) {
      if (rel.fromFragmentId === id || rel.toFragmentId === id) await tx.objectStore('relations').delete(rel.id)
    }
    const events = await tx.objectStore('outboxEvents').getAll()
    for (const event of events) {
      if (eventFragmentId(event) === id) await tx.objectStore('outboxEvents').delete(event.eventId)
    }
    await tx.objectStore('fragments').delete(id)
    await tx.objectStore('localDeletions').put({ fragmentId: id, deletedAt: Date.now() })
    await tx.done
  }

  async isLocallyDeleted(id: string): Promise<boolean> {
    const db = await this.db_()
    return (await db.get('localDeletions', id)) !== undefined
  }

  async getFragment(id: string): Promise<FragmentRecord | undefined> {
    const db = await this.db_()
    return db.get('fragments', id)
  }

  async getAllFragments(): Promise<FragmentRecord[]> {
    const db = await this.db_()
    return db.getAll('fragments')
  }

  // ── review (App side; the extension does not review in R1) ───────────

  /** ReviewLog + ReviewState are written in the SAME transaction (storage.md §3.1). */
  async recordReview(fragmentId: string, rating: ReviewRating, options: { usedHint?: boolean; now?: number } = {}): Promise<{ fragment: FragmentRecord; log: ReviewLog } | null> {
    const db = await this.db_()
    const tx = db.transaction(['fragments', 'reviewLogs', 'outboxEvents'], 'readwrite')
    const existing = await tx.objectStore('fragments').get(fragmentId)
    if (!existing) {
      await tx.done
      return null
    }
    const { fragment, log } = rateFragment(existing, rating, options)
    await tx.objectStore('fragments').put(fragment)
    await tx.objectStore('reviewLogs').put(withTargetKey(log))
    await tx.objectStore('outboxEvents').put(this.enqueueEvent('review.rated', log))
    await tx.done
    return { fragment, log }
  }

  async getReviewLogs(fragmentId?: string): Promise<ReviewLog[]> {
    const db = await this.db_()
    const all = await db.getAll('reviewLogs')
    const logs = all.map(({ targetKey: _targetKey, ...log }) => log)
    return fragmentId ? logs.filter(l => l.target.fragmentId === fragmentId) : logs
  }

  // ── writing tasks (records land with R2; store is contract-complete) ──

  async saveWritingTask(task: WritingTaskRecord): Promise<WritingTaskRecord> {
    const db = await this.db_()
    const saved: WritingTaskRecord = { ...task, updatedAt: Date.now() }
    const tx = db.transaction(['writingTasks', 'outboxEvents'], 'readwrite')
    await tx.objectStore('writingTasks').put(saved)
    const hadSubmissions = task.submissions.length > 0
    await tx.objectStore('outboxEvents').put(this.enqueueEvent(hadSubmissions ? 'writing.submitted' : 'writing.created', { taskId: task.id }))
    await tx.done
    return saved
  }

  async getWritingTask(id: string): Promise<WritingTaskRecord | undefined> {
    const db = await this.db_()
    return db.get('writingTasks', id)
  }

  async getAllWritingTasks(): Promise<WritingTaskRecord[]> {
    const db = await this.db_()
    const tasks = await db.getAll('writingTasks')
    return tasks.sort((a, b) => b.createdAt - a.createdAt)
  }

  // ── relations (R2 UI; storage contract lives here) ───────────────────

  async saveRelation(relation: FragmentRelation): Promise<void> {
    const normalized = normalizeRelation(relation)
    const check = validateRelation(normalized)
    if (!check.ok) throw new Error(`RELATION_INVALID:${check.code}`)
    const db = await this.db_()
    const tx = db.transaction(['relations', 'relationSuppressions', 'outboxEvents'], 'readwrite')
    await tx.objectStore('relations').put(withRelationKeys(normalized))
    // Re-establishing a previously rejected suggestion clears its suppression (storage.md §3.3).
    await tx.objectStore('relationSuppressions').delete(canonicalRelationKey(normalized.fromFragmentId, normalized.toFragmentId, normalized.type))
    await tx.objectStore('outboxEvents').put(this.enqueueEvent('relation.created', { relationId: normalized.id }))
    await tx.done
  }

  async deleteRelation(id: string): Promise<void> {
    const db = await this.db_()
    const tx = db.transaction(['relations', 'outboxEvents'], 'readwrite')
    const existing = await tx.objectStore('relations').get(id)
    await tx.objectStore('relations').delete(id)
    if (existing) {
      await tx.objectStore('outboxEvents').put(this.enqueueEvent('relation.deleted', { relationId: id }))
    }
    await tx.done
  }

  async getAllRelations(): Promise<FragmentRelation[]> {
    const db = await this.db_()
    const all = await db.getAll('relations')
    return all.map(({ fromKey: _fromKey, toKey: _toKey, ...rel }) => rel)
  }

  async saveSuppression(suppression: RelationSuppression): Promise<void> {
    const db = await this.db_()
    const key = canonicalRelationKey(suppression.fromFragmentId, suppression.toFragmentId, suppression.suggestedType)
    await db.put('relationSuppressions', suppression, key)
  }

  async getSuppressions(): Promise<RelationSuppression[]> {
    const db = await this.db_()
    return db.getAll('relationSuppressions')
  }

  // ── image assets & screenshot library (storage.md §3.5) ──────────────

  /** Screenshot metadata and the processed image bytes commit in ONE transaction. */
  async saveScreenshotWithAsset(input: {
    bytes: Blob
    mimeType: ImageAsset['mimeType']
    sha256: string
    width: number
    height: number
    sourceUrl: string
    sourceTitle?: string
    capturedAt?: number
  }): Promise<{ screenshot: ScreenshotRecord; asset: ImageAsset }> {
    const db = await this.db_()
    const now = Date.now()
    const assetId = newAssetId()
    const metadata: ImageAsset = {
      id: assetId,
      mimeType: input.mimeType,
      byteLength: input.bytes.size,
      sha256: input.sha256,
      width: input.width,
      height: input.height,
      createdAt: now,
    }
    const screenshot: ScreenshotRecord = {
      id: newScreenshotId(),
      assetId,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      capturedAt: input.capturedAt ?? now,
    }
    const tx = db.transaction(['assets', 'screenshots'], 'readwrite')
    await tx.objectStore('assets').put({ metadata, bytes: input.bytes })
    await tx.objectStore('screenshots').put(screenshot)
    await tx.done
    return { screenshot, asset: metadata }
  }

  async getAsset(assetId: string): Promise<{ metadata: ImageAsset; bytes: Blob } | undefined> {
    const db = await this.db_()
    return db.get('assets', assetId)
  }

  async listScreenshots(): Promise<Array<ScreenshotRecord & { asset: ImageAsset }>> {
    const db = await this.db_()
    const [screenshots, assets] = await Promise.all([db.getAll('screenshots'), db.getAll('assets')])
    const byId = new Map(assets.map(a => [a.metadata.id, a.metadata]))
    return screenshots
      .map(s => ({ ...s, asset: byId.get(s.assetId)! }))
      .filter(s => s.asset !== undefined)
      .sort((a, b) => b.capturedAt - a.capturedAt)
  }

  /**
   * Deletes the screenshot-library record; the asset blob survives while any
   * fragment (or another screenshot) still references it or a delivery task
   * is pending (storage.md §10).
   */
  async deleteScreenshot(id: string): Promise<void> {
    const db = await this.db_()
    const tx = db.transaction(['screenshots', 'fragments', 'assets', 'outboxEvents'], 'readwrite')
    const screenshot = await tx.objectStore('screenshots').get(id)
    if (!screenshot) {
      await tx.done
      return
    }
    await tx.objectStore('screenshots').delete(id)
    const assetId = screenshot.assetId
    const stillReferenced = await this.assetReferencedInTx(tx, assetId)
    if (stillReferenced) {
      await tx.done
      return
    }
    const events = await tx.objectStore('outboxEvents').getAll()
    const pendingDelivery = events.some(e => eventAssetId(e) === assetId)
    if (!pendingDelivery) await tx.objectStore('assets').delete(assetId)
    await tx.done
  }

  private async assetReferencedInTx(tx: ReturnType<IDBPDatabase<FragmentDB>['transaction']>, assetId: string): Promise<boolean> {
    const screenshots = await tx.objectStore('screenshots').getAll()
    if (screenshots.some(s => s.assetId === assetId)) return true
    const fragments = await tx.objectStore('fragments').getAll()
    return fragments.some(f => {
      if (f.kind === 'visual') return (f.detail as { attachmentIds: string[] }).attachmentIds.includes(assetId)
      return f.context.locator.type === 'image' && f.context.locator.assetId === assetId
    })
  }

  async assetReferenceCount(assetId: string): Promise<number> {
    const db = await this.db_()
    const [screenshots, fragments] = await Promise.all([db.getAll('screenshots'), db.getAll('fragments')])
    let count = screenshots.filter(s => s.assetId === assetId).length
    for (const f of fragments) {
      if (f.kind === 'visual' && (f.detail as { attachmentIds: string[] }).attachmentIds.includes(assetId)) count++
      else if (f.context.locator.type === 'image' && f.context.locator.assetId === assetId) count++
    }
    return count
  }

  // ── outbox (extension → Desktop delivery queue) ──────────────────────

  async getOutboxEvents(): Promise<OutboxEvent[]> {
    const db = await this.db_()
    const events = await db.getAll('outboxEvents')
    return events.sort((a, b) => a.createdAt - b.createdAt)
  }

  /** Records a delivery attempt (attempts + lastAttemptAt) for backoff decisions. */
  async markEventAttempt(eventId: string, now = Date.now()): Promise<void> {
    const db = await this.db_()
    const event = await db.get('outboxEvents', eventId)
    if (!event) return
    await db.put('outboxEvents', { ...event, attempts: event.attempts + 1, lastAttemptAt: now })
  }

  /** Prunes events after the hub confirmed persistence (storage.md §3.4). */
  async pruneEvents(eventIds: string[]): Promise<void> {
    const db = await this.db_()
    const tx = db.transaction('outboxEvents', 'readwrite')
    for (const id of eventIds) await tx.objectStore('outboxEvents').delete(id)
    await tx.done
  }

  async getDeliveryStats(): Promise<{ pendingFragments: number; pendingAssets: number }> {
    const events = await this.getOutboxEvents()
    return {
      pendingFragments: events.filter(e => e.type === 'fragment.created' || e.type === 'fragment.updated').length,
      pendingAssets: events.filter(e => e.type === 'asset.created').length,
    }
  }

  /**
   * Orphan assets: zero screenshot-library references, zero fragment
   * references, and no pending delivery task (storage.md §10).
   */
  async findOrphanAssets(): Promise<ImageAsset[]> {
    const db = await this.db_()
    const [assets, screenshots, fragments, events] = await Promise.all([
      db.getAll('assets'),
      db.getAll('screenshots'),
      db.getAll('fragments'),
      db.getAll('outboxEvents'),
    ])
    const pendingAssetIds = new Set(events.filter(e => e.type === 'asset.created').map(e => (e.payload as { assetId?: string } | null)?.assetId ?? ''))
    return assets
      .map(a => a.metadata)
      .filter(
        meta =>
          !pendingAssetIds.has(meta.id) &&
          !screenshots.some(shot => shot.assetId === meta.id) &&
          !fragments.some(
            f =>
              (f.kind === 'visual' && (f.detail as { attachmentIds: string[] }).attachmentIds.includes(meta.id)) ||
              (f.context.locator.type === 'image' && f.context.locator.assetId === meta.id),
          ),
      )
  }

  /** Deletes the reported orphans; returns how many were removed. */
  async cleanupOrphanAssets(): Promise<number> {
    const db = await this.db_()
    const orphans = await this.findOrphanAssets()
    const tx = db.transaction('assets', 'readwrite')
    for (const meta of orphans) await tx.objectStore('assets').delete(meta.id)
    await tx.done
    return orphans.length
  }

  async getStats(now: number = Date.now()): Promise<{ total: number; newThisWeek: number; due: number }> {
    const fragments = await this.getAllFragments()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    return {
      total: fragments.length,
      newThisWeek: fragments.filter(f => f.createdAt >= weekAgo).length,
      due: fragments.filter(f => f.review.nextReviewAt <= now).length,
    }
  }

  // ── R3 sync: apply Desktop-originated changes (storage.md §9) ────────

  /**
   * Applies one batch of Desktop changes in a SINGLE transaction:
   * review-domain updates never touch capture fields; locally-deleted ids
   * stay deleted; every skip lands in the visible sync report.
   */
  async applyDesktopChanges(changes: DesktopChange[]): Promise<ApplyResult> {
    const db = await this.db_()
    const [fragments, deletions] = await Promise.all([db.getAll('fragments'), db.getAll('localDeletions')])
    const result = applyDesktopChanges(changes, {
      fragments,
      localDeletions: new Set(deletions.map(d => d.fragmentId)),
      now: Date.now(),
    })

    const stores = ['fragments', 'reviewLogs', 'writingTasks', 'relations', 'relationSuppressions', 'syncReports'] as const
    const tx = db.transaction([...stores], 'readwrite')
    const fragmentStore = tx.objectStore('fragments')
    for (const fragment of result.fragments) await fragmentStore.put(fragment)
    const logStore = tx.objectStore('reviewLogs')
    for (const log of result.reviewLogs) await logStore.put(withTargetKey(log))
    const taskStore = tx.objectStore('writingTasks')
    for (const task of result.writingTasks) await taskStore.put(task)
    const relationStore = tx.objectStore('relations')
    for (const relation of result.relations) await relationStore.put(withRelationKeys(relation))
    for (const id of result.deletedRelationIds) await relationStore.delete(id)
    const suppressionStore = tx.objectStore('relationSuppressions')
    for (const suppression of result.suppressions) {
      const [from, to] = [suppression.fromFragmentId, suppression.toFragmentId]
      await suppressionStore.put(suppression, `${from} ${to} ${suppression.suggestedType}`)
    }
    const reportStore = tx.objectStore('syncReports')
    for (const report of result.reports) await reportStore.put({ ...report, id: newId() })
    await tx.done
    return result
  }

  async getSyncCursor(): Promise<string | undefined> {
    const db = await this.db_()
    return (await db.get('syncMeta', 'changesCursor')) as string | undefined
  }

  async setSyncCursor(cursor: string): Promise<void> {
    const db = await this.db_()
    await db.put('syncMeta', cursor, 'changesCursor')
  }

  /** Recent sync skips/conflicts for the settings surface (newest first). */
  async getSyncReports(limit = 50): Promise<Array<SyncReportEntry & { id: string }>> {
    const db = await this.db_()
    const all = await db.getAll('syncReports')
    return all.sort((a, b) => b.at - a.at).slice(0, limit)
  }

  async clearSyncReports(): Promise<void> {
    const db = await this.db_()
    await db.clear('syncReports')
  }
}
