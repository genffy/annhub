/**
 * Entry store — IndexedDB persistence for entries (with their embedded
 * highlights), image assets and the property registry.
 * Target contract: docs/v2/storage.md.
 *
 * Environment-neutral (runs in the extension service worker and in tests
 * via fake-indexeddb). Every write validates first and commits the entity
 * plus everything that must change with it inside ONE transaction
 * (storage.md §5). There is no user data to migrate (roadmap §1): the store
 * creates the current contract's object stores only.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { newAssetId, newEntryId, sha256Hex, MAX_IMAGE_BYTES } from './assets'
import { BUILTIN_PROPERTY_DEFINITIONS, propertyStorageKey, validatePropertyDefinition } from './properties'
import { EntryValidationError, type EntryRecord, type ImageAsset, type PropertyDefinition } from './types'
import { validateEntry } from './validate'

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
  /** New property definitions this entry introduces, written in the same transaction. */
  newDefinitions?: PropertyDefinition[]
  /** For screenshots: the processed PNG bytes + dimensions. */
  asset?: { bytes: Blob; width: number; height: number }
  now?: number
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

  // ── Registry ──────────────────────────────────────────────────────────

  async listPropertyDefinitions(): Promise<PropertyDefinition[]> {
    return this.requireDb().getAll('properties')
  }

  async upsertPropertyDefinition(def: PropertyDefinition): Promise<void> {
    validatePropertyDefinition(def)
    const db = this.requireDb()
    const key = propertyStorageKey(def.name)
    const existing = await db.get('properties', key)
    if (existing && !existing.builtin && existing.type !== def.type) {
      throw new EntryValidationError('PROPERTY_TYPE_MISMATCH', `property ${def.name} is already ${existing.type}`)
    }
    if (existing?.builtin) return // built-ins are immutable
    await db.put('properties', def, key)
  }

  /** Usage count = number of entries carrying a value for the property (entry.md §5.3.4). */
  async propertyUsageCount(name: string): Promise<number> {
    const key = propertyStorageKey(name)
    let count = 0
    for await (const cursor of this.requireDb().transaction('entries').store) {
      if (cursor.value.properties[name] !== undefined) count++
    }
    return count
  }

  async deletePropertyDefinition(name: string): Promise<void> {
    const db = this.requireDb()
    const key = propertyStorageKey(name)
    const def = await db.get('properties', key)
    if (def?.builtin) throw new EntryValidationError('PROPERTY_IN_USE', 'built-in properties cannot be deleted')
    const usage = await this.propertyUsageCount(name)
    if (usage > 0) throw new EntryValidationError('PROPERTY_IN_USE', `property ${name} is used by ${usage} entries`)
    await db.delete('properties', key)
  }

  /** Delete every unused custom definition in one transaction; returns their names. */
  async deleteUnusedPropertyDefinitions(): Promise<string[]> {
    const db = this.requireDb()
    const defs = await db.getAll('properties')
    const usage = new Map<string, number>()
    for await (const cursor of db.transaction('entries').store) {
      for (const name of Object.keys(cursor.value.properties)) {
        const key = propertyStorageKey(name)
        usage.set(key, (usage.get(key) ?? 0) + 1)
      }
    }
    const doomed = defs.filter(def => !def.builtin && (usage.get(propertyStorageKey(def.name)) ?? 0) === 0)
    if (doomed.length === 0) return []
    const tx = db.transaction('properties', 'readwrite')
    for (const def of doomed) await tx.store.delete(propertyStorageKey(def.name))
    await tx.done
    return doomed.map(def => def.name)
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

  /** Create an entry; its new property definitions join the same transaction. */
  async saveEntry(input: SaveEntryInput): Promise<EntryRecord> {
    const db = this.requireDb()
    const now = input.now ?? Date.now()
    const registry = await this.listPropertyDefinitions()
    const mergedRegistry = [...registry, ...(input.newDefinitions ?? [])]

    const entry: EntryRecord = {
      id: newEntryId(),
      type: input.type,
      content: input.content,
      context: input.context,
      note: input.note,
      highlights: input.highlights,
      assetId: undefined,
      sourceUrl: input.sourceUrl,
      sourceHost: '',
      properties: input.properties,
      createdAt: now,
      updatedAt: now,
    }
    entry.sourceHost = new URL(input.sourceUrl).hostname.toLowerCase().replace(/^www\./, '')

    if (input.type === 'screenshot' && input.asset) {
      if (input.asset.bytes.size > MAX_IMAGE_BYTES) {
        throw new EntryValidationError('ENTRY_ASSET_MISSING', 'image exceeds the per-image ceiling')
      }
      await this.checkQuota(input.asset.bytes.size)
      const id = newAssetId()
      const bytes = new Uint8Array(await input.asset.bytes.arrayBuffer())
      const metadata: ImageAsset = {
        id,
        mimeType: 'image/png',
        byteLength: input.asset.bytes.size,
        sha256: await sha256Hex(bytes),
        width: input.asset.width,
        height: input.asset.height,
        createdAt: now,
      }
      validateEntry({ ...entry, assetId: id }, mergedRegistry)

      const tx = db.transaction(['entries', 'assets', 'properties'], 'readwrite')
      await tx.objectStore('assets').put({ metadata, bytes: input.asset.bytes }, id)
      await tx.objectStore('entries').put({ ...entry, assetId: id })
      for (const def of input.newDefinitions ?? []) await tx.objectStore('properties').put(def, propertyStorageKey(def.name))
      await tx.done
      return { ...entry, assetId: id }
    }

    validateEntry(entry, mergedRegistry)
    const tx = db.transaction(['entries', 'properties'], 'readwrite')
    await tx.objectStore('entries').put(entry)
    for (const def of input.newDefinitions ?? []) await tx.objectStore('properties').put(def, propertyStorageKey(def.name))
    await tx.done
    return entry
  }

  /** Field-level update; content is locked while highlights exist (entry.md §4.7). */
  async updateEntry(
    id: string,
    patch: Partial<Pick<EntryRecord, 'content' | 'context' | 'note' | 'properties' | 'highlights'>> & { newDefinitions?: PropertyDefinition[] },
  ): Promise<EntryRecord> {
    const db = this.requireDb()
    const registry = await this.listPropertyDefinitions()
    const mergedRegistry = [...registry, ...(patch.newDefinitions ?? [])]

    const tx = db.transaction(['entries', 'properties'], 'readwrite')
    const existing = await tx.objectStore('entries').get(id)
    if (!existing) throw new EntryValidationError('ENTRY_CONTENT_INVALID', `no entry ${id}`)
    if (patch.content !== undefined && patch.content !== existing.content && (existing.highlights?.length ?? 0) > 0) {
      throw new EntryValidationError('ENTRY_CONTENT_LOCKED', 'content is read-only while highlights exist')
    }
    const next: EntryRecord = {
      ...existing,
      ...('content' in patch ? { content: patch.content } : {}),
      ...('context' in patch ? { context: patch.context } : {}),
      ...('note' in patch ? { note: patch.note } : {}),
      ...('properties' in patch ? { properties: patch.properties } : {}),
      ...('highlights' in patch ? { highlights: patch.highlights } : {}),
      updatedAt: Date.now(),
    }
    validateEntry(next, mergedRegistry)
    await tx.objectStore('entries').put(next)
    for (const def of patch.newDefinitions ?? []) await tx.objectStore('properties').put(def, propertyStorageKey(def.name))
    await tx.done
    return next
  }

  /** Delete an entry; a screenshot's asset dies in the same transaction (storage.md §5). */
  async deleteEntry(id: string): Promise<void> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'assets'], 'readwrite')
    const existing = await tx.objectStore('entries').get(id)
    if (!existing) return
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
      entriesWithMissingAssets: entries
        .filter(entry => entry.assetId && !assetIds.has(entry.assetId))
        .map(entry => ({ id: entry.id, assetId: entry.assetId! })),
    }
  }
}
