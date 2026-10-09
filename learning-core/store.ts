/**
 * Entry store — IndexedDB persistence for entries (with their embedded
 * highlights), image assets and the property registry.
 * Target contract: docs/v2/storage.md.
 *
 * Environment-neutral (runs in the extension service worker and in tests
 * via fake-indexeddb). Every write reads what it depends on, validates and
 * commits inside ONE transaction (storage.md §5): registry reads and usage
 * counts share the write transaction, so a concurrent writer cannot slip a
 * change between the check and the commit. Non-IndexedDB async work (hashes,
 * quota estimates) happens before the transaction opens — IndexedDB
 * transactions cannot survive foreign awaits. There is no user data to
 * migrate (roadmap §1): the store creates the current contract's stores only.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { newAssetId, newEntryId, sha256Hex, MAX_IMAGE_BYTES } from './assets'
import {
  BUILTIN_PROPERTY_DEFINITIONS,
  builtinDefinition,
  canonicalizeProperties,
  countPropertyUsage,
  mergeNewDefinitions,
  propertyStorageKey,
  removePropertyValue,
  validatePropertyDefinition,
} from './properties'
import { EntryValidationError, type EntryRecord, type Highlight, type ImageAsset, type PropertyDefinition, type PropertyValue } from './types'
import { validateEntry, HIGHLIGHT_NOTE_MAX_CHARS, HIGHLIGHT_QUOTE_MAX_CHARS } from './validate'
import { normalizeHost } from './normalize'
import { isHttpUrl } from './url'

interface AnnHubDB extends DBSchema {
  entries: {
    key: string
    value: EntryRecord
    indexes: { 'by-type': string; 'by-host': string; 'by-tag': string; 'by-created': number }
  }
  assets: {
    key: string
    value: { metadata: ImageAsset; bytes: Blob }
  }
  properties: {
    key: string
    value: PropertyDefinition
  }
}

export interface SaveEntryInput {
  type: 'clip' | 'screenshot'
  content: string
  context?: string
  note?: string
  highlights?: EntryRecord['highlights']
  sourceUrl: string
  properties: Record<string, string | string[] | number | boolean>
  /** New property definitions this entry introduces, validated and written in the same transaction. */
  newDefinitions?: PropertyDefinition[]
  /** For screenshots: the processed PNG bytes + dimensions. */
  asset?: { bytes: Blob; width: number; height: number }
  now?: number
}

/** Field-level entry patch; `null` clears a field (undefined keys cannot survive JSON transport). */
export interface EntryPatch {
  content?: string
  context?: string | null
  note?: string | null
  properties?: {
    set?: Record<string, PropertyValue>
    unset?: string[]
    newDefinitions?: PropertyDefinition[]
  }
}

export interface OrphanReport {
  unreferencedAssets: string[]
  entriesWithMissingAssets: { id: string; assetId: string }[]
}

export class QuotaError extends Error {
  constructor(public readonly estimate: { usage: number; quota: number; incomingBytes: number }) {
    super('storage quota would be exceeded')
    this.name = 'QuotaError'
  }
}

export class EntryStore {
  private db: IDBPDatabase<AnnHubDB> | null = null
  private readonly dbName: string

  constructor(dbName = 'annhub') {
    this.dbName = dbName
  }

  async initialize(): Promise<void> {
    if (this.db) return
    this.db = await openDB<AnnHubDB>(this.dbName, 1, {
      upgrade(db) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' })
        entries.createIndex('by-type', 'type')
        entries.createIndex('by-host', 'sourceHost')
        // One index entry per tag (storage.md §3).
        entries.createIndex('by-tag', 'properties.tags', { multiEntry: true })
        entries.createIndex('by-created', 'createdAt')
        db.createObjectStore('assets')
        db.createObjectStore('properties')
      },
    })
    await this.ensureBuiltins()
  }

  async close(): Promise<void> {
    await this.db?.close()
    this.db = null
  }

  private async ensureBuiltins(): Promise<void> {
    const db = this.requireDb()
    const existing = await db.getAll('properties')
    const known = new Set(existing.map(def => propertyStorageKey(def.name)))
    const missing = BUILTIN_PROPERTY_DEFINITIONS.filter(def => !known.has(propertyStorageKey(def.name)))
    if (missing.length === 0) return
    const tx = db.transaction('properties', 'readwrite')
    for (const def of missing) await tx.store.put(def, propertyStorageKey(def.name))
    await tx.done
  }

  private requireDb(): IDBPDatabase<AnnHubDB> {
    if (!this.db) throw new Error('EntryStore.initialize() must be awaited first')
    return this.db
  }

  /** Rolls an in-flight transaction back on the error path (idb would otherwise commit already-issued puts). */
  private static async rollback(tx: { abort(): void; done: Promise<void> }): Promise<void> {
    try {
      tx.abort()
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => undefined)
  }

  // ── Registry ──────────────────────────────────────────────────────────

  async listPropertyDefinitions(): Promise<PropertyDefinition[]> {
    return this.requireDb().getAll('properties')
  }

  async upsertPropertyDefinition(def: PropertyDefinition): Promise<void> {
    const db = this.requireDb()
    const tx = db.transaction('properties', 'readwrite')
    try {
      const key = propertyStorageKey(def.name)
      const builtin = builtinDefinition(def.name)
      if (builtin) {
        // built-ins: name and type are fixed; presets and defaultValue may change
        validatePropertyDefinition(def)
        const next: PropertyDefinition = { ...builtin, presets: def.presets }
        if (def.defaultValue !== undefined) next.defaultValue = def.defaultValue
        else delete next.defaultValue
        await tx.store.put(next, key)
      } else {
        validatePropertyDefinition({ ...def, builtin: false })
        const existing = await tx.store.get(key)
        if (existing && existing.type !== def.type) {
          throw new EntryValidationError('PROPERTY_TYPE_MISMATCH', `property ${existing.name} is already ${existing.type}`)
        }
        await tx.store.put({ ...def, builtin: false }, key)
      }
      await tx.done
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  async propertyUsageCount(name: string): Promise<number> {
    return countPropertyUsage(await this.listEntries(), name)
  }

  async deletePropertyDefinition(name: string): Promise<void> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'properties'], 'readwrite')
    try {
      const key = propertyStorageKey(name)
      const def = await tx.objectStore('properties').get(key)
      if (def?.builtin || builtinDefinition(name)) throw new EntryValidationError('PROPERTY_IN_USE', 'built-in properties cannot be deleted')
      const usage = countPropertyUsage(await tx.objectStore('entries').getAll(), name)
      if (usage > 0) throw new EntryValidationError('PROPERTY_IN_USE', `property ${name} is used by ${usage} entries`)
      await tx.objectStore('properties').delete(key)
      await tx.done
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  /** Delete every unused custom definition; the usage scan shares the delete transaction. */
  async deleteUnusedPropertyDefinitions(): Promise<string[]> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'properties'], 'readwrite')
    try {
      const defs = await tx.objectStore('properties').getAll()
      const entries = await tx.objectStore('entries').getAll()
      const usage = new Map<string, number>()
      for (const entry of entries) {
        for (const name of Object.keys(entry.properties)) {
          const key = propertyStorageKey(name)
          usage.set(key, (usage.get(key) ?? 0) + 1)
        }
      }
      const doomed = defs.filter(def => !def.builtin && (usage.get(propertyStorageKey(def.name)) ?? 0) === 0)
      for (const def of doomed) await tx.objectStore('properties').delete(propertyStorageKey(def.name))
      await tx.done
      return doomed.map(def => def.name)
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  // ── Quota (storage.md §3) ─────────────────────────────────────────────

  async checkQuota(incomingBytes: number): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    if (quota > 0 && usage + incomingBytes > quota) {
      throw new QuotaError({ usage, quota, incomingBytes })
    }
  }

  // ── Writes (storage.md §5) ────────────────────────────────────────────

  /** Create an entry; registry read, validation, entry, asset and new definitions commit in one transaction. */
  async saveEntry(input: SaveEntryInput): Promise<EntryRecord> {
    const db = this.requireDb()
    const now = input.now ?? Date.now()

    // non-IndexedDB async work first: the transaction cannot span it
    let asset: { id: string; bytes: Blob; metadata: ImageAsset } | null = null
    if (input.type === 'screenshot') {
      if (!input.asset) throw new EntryValidationError('ENTRY_ASSET_MISSING', 'a screenshot save requires image bytes')
      if (input.asset.bytes.size > MAX_IMAGE_BYTES) {
        throw new EntryValidationError('ENTRY_ASSET_MISSING', 'image exceeds the per-image ceiling')
      }
      await this.checkQuota(input.asset.bytes.size)
      const digest = await sha256Hex(new Uint8Array(await input.asset.bytes.arrayBuffer()))
      const id = newAssetId()
      asset = {
        id,
        bytes: input.asset.bytes,
        metadata: {
          id,
          mimeType: 'image/png',
          byteLength: input.asset.bytes.size,
          sha256: digest,
          width: input.asset.width,
          height: input.asset.height,
          createdAt: now,
        },
      }
    }

    const tx = db.transaction(['entries', 'assets', 'properties'], 'readwrite')
    try {
      const registry = await tx.objectStore('properties').getAll()
      const { merged, toWrite } = mergeNewDefinitions(registry, input.newDefinitions ?? [])

      if (!isHttpUrl(input.sourceUrl)) {
        throw new EntryValidationError('ENTRY_SOURCE_INVALID', `sourceUrl is not an absolute http(s) link: ${input.sourceUrl}`)
      }
      const entry: EntryRecord = {
        id: newEntryId(),
        type: input.type,
        content: input.content,
        context: input.context,
        note: input.note,
        highlights: input.highlights,
        assetId: asset?.id,
        sourceUrl: input.sourceUrl,
        sourceHost: normalizeHost(input.sourceUrl),
        properties: canonicalizeProperties(input.properties, merged),
        createdAt: now,
        updatedAt: now,
      }
      validateEntry(entry, merged)

      if (asset) await tx.objectStore('assets').put({ metadata: asset.metadata, bytes: asset.bytes }, asset.id)
      await tx.objectStore('entries').put(entry)
      for (const def of toWrite) await tx.objectStore('properties').put(def, propertyStorageKey(def.name))
      await tx.done
      return entry
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  /** Field-level update; `null` clears, `properties.set/unset` patches values; content stays locked while highlights exist (entry.md §4.7). */
  async updateEntry(id: string, patch: EntryPatch): Promise<EntryRecord> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'properties'], 'readwrite')
    try {
      const existing = await tx.objectStore('entries').get(id)
      if (!existing) throw new EntryValidationError('ENTRY_CONTENT_INVALID', `no entry ${id}`)
      const registry = await tx.objectStore('properties').getAll()
      const { merged, toWrite } = mergeNewDefinitions(registry, patch.properties?.newDefinitions ?? [])

      if (patch.content !== undefined && patch.content !== existing.content && (existing.highlights?.length ?? 0) > 0) {
        throw new EntryValidationError('ENTRY_CONTENT_LOCKED', 'content is read-only while highlights exist')
      }

      const properties = { ...existing.properties }
      for (const name of patch.properties?.unset ?? []) removePropertyValue(properties, name)
      if (patch.properties?.set) Object.assign(properties, canonicalizeProperties(patch.properties.set, merged))

      const next: EntryRecord = {
        ...existing,
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...('context' in patch ? { context: patch.context ?? undefined } : {}),
        ...('note' in patch ? { note: patch.note ?? undefined } : {}),
        properties: canonicalizeProperties(properties, merged),
        updatedAt: Date.now(),
      }
      validateEntry(next, merged)
      await tx.objectStore('entries').put(next)
      for (const def of toWrite) await tx.objectStore('properties').put(def, propertyStorageKey(def.name))
      await tx.done
      return next
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  // ── Highlight operations (storage.md §5: one transaction per op) ──────

  /** Adds a highlight, folding overlaps per entry.md §4.6 in the same transaction. */
  async addHighlight(id: string, addition: Highlight): Promise<EntryRecord> {
    return this.mutateHighlights(id, highlights => mergeHighlightInto(highlights, addition))
  }

  async updateHighlight(id: string, highlightId: string, patch: { color?: Highlight['color']; note?: string | null }): Promise<EntryRecord> {
    return this.mutateHighlights(id, highlights => {
      let found = false
      const next = highlights.map(highlight => {
        if (highlight.id !== highlightId) return highlight
        found = true
        return {
          ...highlight,
          ...(patch.color ? { color: patch.color } : {}),
          ...('note' in patch ? { note: patch.note ?? undefined } : {}),
        }
      })
      if (!found) throw new EntryValidationError('HIGHLIGHT_INVALID', `no highlight ${highlightId} on entry ${id}`)
      return next
    })
  }

  async removeHighlight(id: string, highlightId: string): Promise<EntryRecord> {
    return this.mutateHighlights(id, highlights => highlights.filter(highlight => highlight.id !== highlightId))
  }

  /** Undo path: puts the exact highlight back, dropping whatever now overlaps it. */
  async restoreHighlight(id: string, highlight: Highlight): Promise<EntryRecord> {
    return this.mutateHighlights(id, highlights => [...highlights.filter(item => !(highlight.start < item.end && item.start < highlight.end)), highlight])
  }

  private async mutateHighlights(id: string, mutate: (highlights: Highlight[]) => Highlight[]): Promise<EntryRecord> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'properties'], 'readwrite')
    try {
      const existing = await tx.objectStore('entries').get(id)
      if (!existing) throw new EntryValidationError('ENTRY_CONTENT_INVALID', `no entry ${id}`)
      const registry = await tx.objectStore('properties').getAll()
      const next: EntryRecord = { ...existing, highlights: mutate([...(existing.highlights ?? [])]), updatedAt: Date.now() }
      validateEntry(next, registry)
      await tx.objectStore('entries').put(next)
      await tx.done
      return next
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  /** Delete an entry; a screenshot's asset dies in the same transaction (storage.md §5). */
  async deleteEntry(id: string): Promise<void> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'assets'], 'readwrite')
    const existing = await tx.objectStore('entries').get(id)
    if (!existing) {
      await tx.done
      return
    }
    if (existing.type === 'screenshot' && existing.assetId) {
      await tx.objectStore('assets').delete(existing.assetId)
    }
    await tx.objectStore('entries').delete(id)
    await tx.done
  }

  // ── Reads ─────────────────────────────────────────────────────────────

  async getEntry(id: string): Promise<EntryRecord | undefined> {
    return this.requireDb().get('entries', id)
  }

  async listEntries(): Promise<EntryRecord[]> {
    return this.requireDb().getAll('entries')
  }

  async countEntries(): Promise<number> {
    return this.requireDb().count('entries')
  }

  async getAsset(assetId: string): Promise<{ metadata: ImageAsset; bytes: Blob } | undefined> {
    return this.requireDb().get('assets', assetId)
  }

  /** Storage usage shown in the library nav (extension.md §2.2). */
  async usageEstimate(): Promise<{ usage: number; quota: number }> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { usage: 0, quota: 0 }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  }

  /**
   * Cleanup report for abnormal leftovers only (storage.md §7): assets no
   * entry references, and entries whose asset is missing. Reports, never
   * deletes on its own.
   */
  async orphanReport(): Promise<OrphanReport> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'assets'])
    const entries = await tx.objectStore('entries').getAll()
    const assetIds = new Set(await tx.objectStore('assets').getAllKeys())
    const referenced = new Set(entries.filter(entry => entry.assetId).map(entry => entry.assetId!))
    return {
      unreferencedAssets: [...assetIds].filter(id => !referenced.has(id)),
      entriesWithMissingAssets: entries.filter(entry => entry.assetId && !assetIds.has(entry.assetId)).map(entry => ({ id: entry.id, assetId: entry.assetId! })),
    }
  }
}

// ── Highlight merge (entry.md §4.6) — the single implementation ─────────

/**
 * Overlap merge: union range, earliest identity/color, notes joined with a
 * blank line. The quote is stitched from the two rendered-text quotes (the
 * shared suffix/prefix is the overlap's text) instead of picking one side,
 * so the merged quote matches the union range.
 */
function mergeHighlightInto(existing: Highlight[], addition: Highlight): Highlight[] {
  let merged = addition
  const kept: Highlight[] = []
  for (const item of existing) {
    if (!(merged.start < item.end && item.start < merged.end)) {
      kept.push(item)
      continue
    }
    const notes = [item.note, merged.note].filter((note): note is string => Boolean(note?.trim()))
    const joined = notes.join('\n\n')
    if (joined.length > HIGHLIGHT_NOTE_MAX_CHARS) {
      throw new EntryValidationError('HIGHLIGHT_INVALID', 'merged note over limit')
    }
    const earlier = item.start <= merged.start ? item : merged
    const later = item.start <= merged.start ? merged : item
    const quote = stitchQuotes(earlier.quote, later.quote)
    if (!quote || quote.length > HIGHLIGHT_QUOTE_MAX_CHARS) {
      throw new EntryValidationError('HIGHLIGHT_INVALID', 'merged quote empty or too long')
    }
    merged = {
      id: item.createdAt <= merged.createdAt ? item.id : merged.id,
      color: item.createdAt <= merged.createdAt ? item.color : merged.color,
      start: Math.min(item.start, merged.start),
      end: Math.max(item.end, merged.end),
      quote,
      note: joined || undefined,
      createdAt: Math.min(item.createdAt, merged.createdAt),
    }
  }
  return [...kept, merged]
}

/** Joins two quotes of overlapping ranges, dropping the shared text once. */
function stitchQuotes(first: string, second: string): string {
  const max = Math.min(first.length, second.length)
  for (let length = max; length > 0; length--) {
    if (first.endsWith(second.slice(0, length))) return first + second.slice(length)
  }
  return first + second
}
