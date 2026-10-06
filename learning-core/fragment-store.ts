/**
 * fragment-store — IndexedDB persistence for captured fragments, screenshots and
 * their image assets. Target contract: docs/v2/storage.md.
 *
 * Environment-neutral (runs in the extension service worker and in a plain
 * web page). Every write validates the record first and commits the entity and
 * anything that must change with it inside ONE transaction.
 *
 * There is no user data to migrate (roadmap §1): the store creates the
 * current contract's object stores only.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { FragmentRecord, ImageAsset, ScreenshotRecord } from './types'
import { assertValid } from './validate'
import { createFragment, type CreateFragmentInput } from './factory'
import { dedupeKeyOf, normalizeContent } from './normalize'
import { newAssetId, newScreenshotId } from './assets'

interface FragmentDB extends DBSchema {
  fragments: {
    key: string
    value: FragmentRecord
    indexes: {
      'by-kind': string
      'by-host': string
      'by-tag': string
      'by-created': number
      'by-normalized': string
    }
  }
  assets: {
    key: string
    value: { metadata: ImageAsset; bytes: Blob }
  }
  screenshots: {
    key: string
    value: ScreenshotRecord
  }
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

  constructor(dbName = 'fragment-store') {
    this.dbName = dbName
  }

  async initialize(): Promise<void> {
    if (this.db) return
    this.db = await openDB<FragmentDB>(this.dbName, this.dbVersion, {
      upgrade(db) {
        const fragments = db.createObjectStore('fragments', { keyPath: 'id' })
        fragments.createIndex('by-kind', 'kind')
        fragments.createIndex('by-host', 'context.sourceHost')
        fragments.createIndex('by-tag', 'tags', { multiEntry: true })
        fragments.createIndex('by-created', 'createdAt')
        fragments.createIndex('by-normalized', 'normalizedContent')

        db.createObjectStore('assets', { keyPath: 'metadata.id' })
        db.createObjectStore('screenshots', { keyPath: 'id' })
      },
    })
  }

  private async db_(): Promise<IDBPDatabase<FragmentDB>> {
    if (!this.db) await this.initialize()
    return this.db!
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
   * fragments every referenced asset must already exist, checked in the same
   * transaction that writes the record.
   */
  async saveFragment<K extends Parameters<typeof createFragment>[0]['kind']>(input: CreateFragmentInput<K>, options: { force?: boolean } = {}): Promise<FragmentSaveOutcome> {
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

    if (record.kind === 'visual') {
      const attachmentIds = (record.detail as { attachmentIds: string[] }).attachmentIds
      const locatorAssetId = record.context.locator.type === 'image' ? record.context.locator.assetId : null
      const requiredAssets = new Set(attachmentIds)
      if (locatorAssetId) requiredAssets.add(locatorAssetId)
      const tx = db.transaction(['fragments', 'assets'], 'readwrite')
      for (const assetId of requiredAssets) {
        const asset = await tx.objectStore('assets').get(assetId)
        if (!asset) {
          await tx.done
          return { success: false, error: `ASSET_MISSING:${assetId}` }
        }
      }
      await tx.objectStore('fragments').put(record)
      await tx.done
      return { success: true, fragment: record }
    }

    await db.put('fragments', record)
    return { success: true, fragment: record }
  }

  /** Applies a capture-field patch: bumps captureRevision and revalidates. */
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
    await db.put('fragments', merged)
    return { success: true, fragment: merged }
  }

  async deleteFragment(id: string): Promise<void> {
    const db = await this.db_()
    await db.delete('fragments', id)
  }

  async getFragment(id: string): Promise<FragmentRecord | undefined> {
    const db = await this.db_()
    return db.get('fragments', id)
  }

  async getAllFragments(): Promise<FragmentRecord[]> {
    const db = await this.db_()
    return db.getAll('fragments')
  }

  // ── image assets & screenshot library (storage.md §3) ──────────────

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
   * fragment (or another screenshot) still references it (storage.md §7).
   */
  async deleteScreenshot(id: string): Promise<void> {
    const db = await this.db_()
    const tx = db.transaction(['screenshots', 'fragments', 'assets'], 'readwrite')
    const screenshot = await tx.objectStore('screenshots').get(id)
    if (!screenshot) {
      await tx.done
      return
    }
    await tx.objectStore('screenshots').delete(id)
    const assetId = screenshot.assetId
    const stillReferenced = await this.assetReferencedInTx(tx, assetId)
    if (!stillReferenced) await tx.objectStore('assets').delete(assetId)
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

  /** Orphan assets: zero screenshot-library references and zero fragment references (storage.md §7). */
  async findOrphanAssets(): Promise<ImageAsset[]> {
    const db = await this.db_()
    const [assets, screenshots, fragments] = await Promise.all([db.getAll('assets'), db.getAll('screenshots'), db.getAll('fragments')])
    return assets
      .map(a => a.metadata)
      .filter(
        meta =>
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

  async getStats(now: number = Date.now()): Promise<{ total: number; newThisWeek: number }> {
    const fragments = await this.getAllFragments()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    return {
      total: fragments.length,
      newThisWeek: fragments.filter(f => f.createdAt >= weekAgo).length,
    }
  }
}
