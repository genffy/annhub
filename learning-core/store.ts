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
import { quoteFromMarkdownRange } from './markdown'
import {
  hasSearchTerms,
  indexedSummary,
  indexedText,
  parseEntryCursor,
  queryEntries,
  queryHighlights,
  SEARCH_INDEX_VERSION,
  type EntryQuery,
  type EntryQueryResult,
  type HighlightQuery,
  type HighlightQueryResult,
  type IndexedSummary,
  type IndexedText,
  type NormalizedField,
} from './query'

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
  /** Derived: every entry without its long text (lists, filters, facets, highlights read this). */
  search: {
    key: string
    value: IndexedSummary
  }
  /** Derived: every entry's normalized search fields (read only when a query has search words). */
  searchText: {
    key: string
    value: IndexedText
  }
}

export interface SaveEntryInput {
  id?: string
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

export interface LibraryFacets {
  counts: { all: number; clips: number; screenshots: number; highlights: number }
  hosts: string[]
  tags: string[]
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
  private indexReady: Promise<void> | null = null
  /** id → the entry without its long text: the one structure list, filter, facet and highlight queries read. */
  private summaries: Map<string, EntryRecord> | null = null
  /** id → normalized weighted fields: loaded only once a query has search words. */
  private textFields: Map<string, NormalizedField[]> | null = null

  constructor(dbName = 'annhub') {
    this.dbName = dbName
  }

  async initialize(): Promise<void> {
    if (this.db) return
    this.db = await openDB<AnnHubDB>(this.dbName, 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const entries = db.createObjectStore('entries', { keyPath: 'id' })
          entries.createIndex('by-type', 'type')
          entries.createIndex('by-host', 'sourceHost')
          // One index entry per tag (storage.md §3).
          entries.createIndex('by-tag', 'properties.tags', { multiEntry: true })
          entries.createIndex('by-created', 'createdAt')
          db.createObjectStore('assets')
          db.createObjectStore('properties')
        }
        if (oldVersion < 3) {
          // derived documents are never migrated: dropped here, rebuilt from the entries on first use
          if (db.objectStoreNames.contains('search')) db.deleteObjectStore('search')
          db.createObjectStore('search', { keyPath: 'id' })
          db.createObjectStore('searchText', { keyPath: 'id' })
        }
      },
    })
    await this.ensureBuiltins()
  }

  async close(): Promise<void> {
    await this.db?.close()
    this.db = null
    this.indexReady = null
    this.summaries = null
    this.textFields = null
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

  /**
   * The derived documents mirror the entries and are written in the same transaction as every change,
   * so they need rebuilding only when they cannot be trusted: a library that predates them (the counts
   * differ) or documents written by a build with another shape (the version differs). Checking costs
   * three counts and one read — not a pass over every entry, which is what a worker restart would
   * otherwise pay before its first filtered query.
   */
  private async ensureIndex(): Promise<void> {
    if (this.indexReady) return this.indexReady
    this.indexReady = (async () => {
      const db = this.requireDb()
      const [entries, summaries, texts] = await Promise.all([db.count('entries'), db.count('search'), db.count('searchText')])
      const [first] = summaries > 0 ? await db.getAll('search', undefined, 1) : []
      if (entries === summaries && entries === texts && (!first || first.version === SEARCH_INDEX_VERSION)) return
      await this.rebuildIndex()
    })().catch(error => {
      this.indexReady = null
      throw error
    })
    return this.indexReady
  }

  /** Rewrites both derived stores from the entries in one transaction — long, but it runs once per upgrade. */
  private async rebuildIndex(): Promise<void> {
    const db = this.requireDb()
    const registry = await this.listPropertyDefinitions()
    const tx = db.transaction(['entries', 'search', 'searchText'], 'readwrite')
    try {
      await tx.objectStore('search').clear()
      await tx.objectStore('searchText').clear()
      let cursor = await tx.objectStore('entries').openCursor()
      while (cursor) {
        await Promise.all([tx.objectStore('search').put(indexedSummary(cursor.value)), tx.objectStore('searchText').put(indexedText(cursor.value, registry))])
        cursor = await cursor.continue()
      }
      await tx.done
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
    this.summaries = null
    this.textFields = null
  }

  private async cachedSummaries(): Promise<Map<string, EntryRecord>> {
    await this.ensureIndex()
    if (!this.summaries) {
      const documents = await this.requireDb().getAll('search')
      this.summaries ??= new Map(documents.map(document => [document.id, document.summary]))
    }
    return this.summaries
  }

  private async cachedFields(): Promise<Map<string, NormalizedField[]>> {
    await this.ensureIndex()
    if (!this.textFields) {
      const documents = await this.requireDb().getAll('searchText')
      this.textFields ??= new Map(documents.map(document => [document.id, document.fields]))
    }
    return this.textFields
  }

  /** Keeps the loaded caches in step with a committed write (the stores were written in that same transaction). */
  private noteIndexed(summary: IndexedSummary, text: IndexedText): void {
    this.summaries?.set(summary.id, summary.summary)
    this.textFields?.set(text.id, text.fields)
  }

  private noteRemoved(id: string): void {
    this.summaries?.delete(id)
    this.textFields?.delete(id)
  }

  async indexedQuery(query: EntryQuery): Promise<EntryQueryResult> {
    const db = this.requireDb()
    const [summaries, registry] = await Promise.all([this.cachedSummaries(), this.listPropertyDefinitions()])
    // only a query with search words pays for the text documents
    const fields = hasSearchTerms(query) ? await this.cachedFields() : undefined
    const result = queryEntries([...summaries.values()], registry, query, fields)
    const items = await Promise.all(result.items.map(item => db.get('entries', item.id)))
    return { ...result, items: items.filter((entry): entry is EntryRecord => Boolean(entry)) }
  }

  async indexedHighlights(query: HighlightQuery): Promise<HighlightQueryResult> {
    const [summaries, registry] = await Promise.all([this.cachedSummaries(), this.listPropertyDefinitions()])
    return queryHighlights([...summaries.values()], registry, query)
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

  /** A bounded response for library navigation, computed from the summaries — never from the long texts. */
  async libraryFacets(): Promise<LibraryFacets> {
    const counts = { all: 0, clips: 0, screenshots: 0, highlights: 0 }
    const hosts = new Set<string>()
    const tags = new Set<string>()
    for (const entry of (await this.cachedSummaries()).values()) {
      counts.all++
      if (entry.type === 'clip') counts.clips++
      else counts.screenshots++
      counts.highlights += entry.highlights?.length ?? 0
      hosts.add(entry.sourceHost)
      const entryTags = entry.properties['tags']
      if (Array.isArray(entryTags)) for (const tag of entryTags) tags.add(tag)
    }
    return { counts, hosts: [...hosts].sort(), tags: [...tags].sort() }
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
    return countPropertyUsage([...(await this.cachedSummaries()).values()], name)
  }

  /** Usage counts for a set of definitions in one pass over the summaries (case-insensitive keys). */
  async propertyUsageCounts(names: string[]): Promise<Record<string, number>> {
    const entries = [...(await this.cachedSummaries()).values()]
    const counts: Record<string, number> = {}
    for (const name of names) counts[name] = countPropertyUsage(entries, name)
    return counts
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
    if (input.id !== undefined && !/^ent_[A-Za-z0-9_-]{1,60}$/.test(input.id)) throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'invalid entry id')

    // non-IndexedDB async work first: the transaction cannot span it
    let asset: { id: string; bytes: Blob; metadata: ImageAsset } | null = null
    if (input.type === 'screenshot') {
      if (!input.asset) throw new EntryValidationError('ENTRY_ASSET_MISSING', 'a screenshot save requires image bytes')
      if (input.asset.bytes.size > MAX_IMAGE_BYTES) {
        throw new EntryValidationError('ENTRY_ASSET_TOO_LARGE', 'image exceeds the per-image ceiling')
      }
      if (!input.id || !(await db.get('entries', input.id))) await this.checkQuota(input.asset.bytes.size)
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

    const tx = db.transaction(['entries', 'assets', 'properties', 'search', 'searchText'], 'readwrite')
    try {
      if (input.id) {
        const existing = await tx.objectStore('entries').get(input.id)
        if (existing) {
          const sameAsset = existing.type !== 'screenshot' || (await tx.objectStore('assets').get(existing.assetId!))?.metadata.sha256 === asset?.metadata.sha256
          if (existing.type !== input.type || existing.content !== input.content || existing.sourceUrl !== input.sourceUrl || !sameAsset) {
            throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'entry ID already belongs to another capture')
          }
          await tx.done
          return existing
        }
      }
      const registry = await tx.objectStore('properties').getAll()
      const { merged, toWrite } = mergeNewDefinitions(registry, input.newDefinitions ?? [])

      if (!isHttpUrl(input.sourceUrl)) {
        throw new EntryValidationError('ENTRY_SOURCE_INVALID', `sourceUrl is not an absolute http(s) link: ${input.sourceUrl}`)
      }
      const entry: EntryRecord = {
        id: input.id ?? newEntryId(),
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

      const summary = indexedSummary(entry)
      const text = indexedText(entry, merged)
      if (asset) await tx.objectStore('assets').put({ metadata: asset.metadata, bytes: asset.bytes }, asset.id)
      await tx.objectStore('entries').put(entry)
      await tx.objectStore('search').put(summary)
      await tx.objectStore('searchText').put(text)
      for (const def of toWrite) await tx.objectStore('properties').put(def, propertyStorageKey(def.name))
      await tx.done
      this.noteIndexed(summary, text)
      return entry
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  /** Field-level update; `null` clears, `properties.set/unset` patches values; content stays locked while highlights exist (entry.md §4.7). */
  async updateEntry(id: string, patch: EntryPatch): Promise<EntryRecord> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'properties', 'search', 'searchText'], 'readwrite')
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
      const summary = indexedSummary(next)
      const text = indexedText(next, merged)
      await tx.objectStore('entries').put(next)
      await tx.objectStore('search').put(summary)
      await tx.objectStore('searchText').put(text)
      for (const def of toWrite) await tx.objectStore('properties').put(def, propertyStorageKey(def.name))
      await tx.done
      this.noteIndexed(summary, text)
      return next
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  // ── Highlight operations (storage.md §5: one transaction per op) ──────

  /** Adds a highlight, folding overlaps per entry.md §4.6 in the same transaction. */
  async addHighlight(id: string, addition: Highlight): Promise<EntryRecord> {
    return this.mutateHighlights(id, (highlights, content) => mergeHighlightInto(highlights, addition, content))
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

  private async mutateHighlights(id: string, mutate: (highlights: Highlight[], content: string) => Highlight[]): Promise<EntryRecord> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'properties', 'search', 'searchText'], 'readwrite')
    try {
      const existing = await tx.objectStore('entries').get(id)
      if (!existing) throw new EntryValidationError('ENTRY_CONTENT_INVALID', `no entry ${id}`)
      const registry = await tx.objectStore('properties').getAll()
      const next: EntryRecord = { ...existing, highlights: mutate([...(existing.highlights ?? [])], existing.content), updatedAt: Date.now() }
      validateEntry(next, registry)
      const summary = indexedSummary(next)
      const text = indexedText(next, registry)
      await tx.objectStore('entries').put(next)
      await tx.objectStore('search').put(summary)
      await tx.objectStore('searchText').put(text)
      await tx.done
      this.noteIndexed(summary, text)
      return next
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }

  /** Delete an entry; a screenshot's asset dies in the same transaction (storage.md §5). */
  async deleteEntry(id: string): Promise<void> {
    const db = this.requireDb()
    const tx = db.transaction(['entries', 'assets', 'search', 'searchText'], 'readwrite')
    const existing = await tx.objectStore('entries').get(id)
    if (!existing) {
      await tx.done
      return
    }
    if (existing.type === 'screenshot' && existing.assetId) {
      await tx.objectStore('assets').delete(existing.assetId)
    }
    await tx.objectStore('entries').delete(id)
    await tx.objectStore('search').delete(id)
    await tx.objectStore('searchText').delete(id)
    await tx.done
    this.noteRemoved(id)
  }

  // ── Reads ─────────────────────────────────────────────────────────────

  async getEntry(id: string): Promise<EntryRecord | undefined> {
    return this.requireDb().get('entries', id)
  }

  async listEntries(): Promise<EntryRecord[]> {
    return this.requireDb().getAll('entries')
  }

  /** Key-only index scan for the unfiltered list; fetches only the next page's bodies. */
  async recentCandidates(limit: number, after?: string): Promise<{ items: EntryRecord[]; total: number }> {
    const tx = this.requireDb().transaction('entries', 'readonly')
    const total = await tx.store.count()
    const cursorKey = after ? parseEntryCursor(after) : null
    const range = cursorKey ? IDBKeyRange.upperBound(cursorKey[1]) : undefined
    const index = tx.store.index('by-created')
    let cursor = await index.openKeyCursor(range, 'prev')
    const ids: string[] = []
    while (cursor && ids.length <= limit) {
      const createdAt = Number(cursor.key)
      const sameTime: string[] = []
      while (cursor && Number(cursor.key) === createdAt) {
        sameTime.push(String(cursor.primaryKey))
        cursor = await cursor.continue()
      }
      sameTime.sort()
      for (const id of sameTime) {
        if (cursorKey && (createdAt > cursorKey[1] || (createdAt === cursorKey[1] && id <= cursorKey[2]))) continue
        ids.push(id)
        if (ids.length > limit) break
      }
    }
    const items: EntryRecord[] = []
    for (const id of ids) {
      const entry = await tx.store.get(id)
      if (entry) items.push(entry)
    }
    await tx.done
    return { items, total }
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

  /** Rechecks references in the delete transaction so a newly attached asset survives. */
  async deleteOrphanAssets(assetIds: string[]): Promise<string[]> {
    const tx = this.requireDb().transaction(['entries', 'assets'], 'readwrite')
    try {
      const referenced = new Set((await tx.objectStore('entries').getAll()).map(entry => entry.assetId).filter(Boolean))
      const removed: string[] = []
      for (const id of [...new Set(assetIds)]) {
        if (referenced.has(id) || !(await tx.objectStore('assets').getKey(id))) continue
        await tx.objectStore('assets').delete(id)
        removed.push(id)
      }
      await tx.done
      return removed
    } catch (error) {
      await EntryStore.rollback(tx)
      throw error
    }
  }
}

// ── Highlight merge (entry.md §4.6) — the single implementation ─────────

/**
 * Overlap merge: union range, earliest identity/color, notes joined with a
 * blank line. The quote comes from the union's visible Markdown text.
 */
function mergeHighlightInto(existing: Highlight[], addition: Highlight, content: string): Highlight[] {
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
    const start = Math.min(item.start, merged.start)
    const end = Math.max(item.end, merged.end)
    const quote = quoteFromMarkdownRange(content, { start, end }, HIGHLIGHT_QUOTE_MAX_CHARS + 1)
    if (!quote || quote.length > HIGHLIGHT_QUOTE_MAX_CHARS) {
      throw new EntryValidationError('HIGHLIGHT_INVALID', 'merged quote empty or too long')
    }
    merged = {
      id: item.createdAt <= merged.createdAt ? item.id : merged.id,
      color: item.createdAt <= merged.createdAt ? item.color : merged.color,
      start,
      end,
      quote,
      note: joined || undefined,
      createdAt: Math.min(item.createdAt, merged.createdAt),
    }
  }
  return [...kept, merged]
}
