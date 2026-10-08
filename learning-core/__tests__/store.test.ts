import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { IDBPDatabase } from 'idb'
import { EntryStore, QuotaError } from '../store'
import { EntryValidationError } from '../types'
import { makeClip, pngBlob } from './helpers'

let store: EntryStore

beforeEach(async () => {
  indexedDB = new IDBFactory()
  store = new EntryStore(`annhub-test-${Math.random().toString(36).slice(2)}`)
  await store.initialize()
})

describe('registry bootstrap (storage.md §3)', () => {
  it('seeds the five built-in definitions exactly once', async () => {
    const defs = await store.listPropertyDefinitions()
    expect(defs.map(def => def.name).sort()).toEqual(['author', 'description', 'published', 'tags', 'title'])
  })
})

describe('saveEntry transactions (storage.md §5)', () => {
  it('saves a clip with its new property definitions in one transaction', async () => {
    const entry = await store.saveEntry({
      type: 'clip',
      content: 'Body text',
      context: 'Around Body text around',
      sourceUrl: 'https://example.com/a',
      properties: { title: 'T', tags: ['x'], project: 'p' },
      newDefinitions: [{ name: 'project', type: 'text', builtin: false, presets: [] }],
    })
    expect(entry.id).toMatch(/^ent_/)
    expect(await store.countEntries()).toBe(1)
    const defs = await store.listPropertyDefinitions()
    expect(defs.some(def => def.name === 'project')).toBe(true)
  })

  it('saves a screenshot entry, metadata and Blob in the same transaction', async () => {
    const entry = await store.saveEntry({
      type: 'screenshot',
      content: '',
      sourceUrl: 'https://example.com/shot',
      properties: { title: 'Shot' },
      asset: { bytes: pngBlob(16), width: 100, height: 50 },
    })
    expect(entry.assetId).toMatch(/^asset_/)
    const asset = await store.getAsset(entry.assetId!)
    expect(asset?.metadata.width).toBe(100)
    expect(asset?.metadata.mimeType).toBe('image/png')
    expect(asset?.metadata.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects invalid entries without writing anything', async () => {
    await expect(
      store.saveEntry({ type: 'clip', content: '', sourceUrl: 'https://example.com/a', properties: { title: 'T' } }),
    ).rejects.toThrow(EntryValidationError)
    expect(await store.countEntries()).toBe(0)
  })

  it('rejects images above the per-image ceiling', async () => {
    await expect(
      store.saveEntry({
        type: 'screenshot',
        content: '',
        sourceUrl: 'https://example.com/a',
        properties: { title: 'T' },
        asset: { bytes: pngBlob(11 * 1024 * 1024), width: 1, height: 1 },
      }),
    ).rejects.toThrow()
  })
})

describe('updateEntry (entry.md §4.7, §6)', () => {
  it('locks content while highlights exist and unlocks after they are gone', async () => {
    const entry = await store.saveEntry({ type: 'clip', content: 'abcdef', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    await store.updateEntry(entry.id, {
      highlights: [{ id: 'hl_1', start: 0, end: 3, quote: 'abc', color: 'yellow', createdAt: Date.now() }],
    })
    await expect(store.updateEntry(entry.id, { content: 'changed' })).rejects.toThrowError(
      expect.objectContaining({ code: 'ENTRY_CONTENT_LOCKED' }),
    )
    await store.updateEntry(entry.id, { highlights: [] })
    const updated = await store.updateEntry(entry.id, { content: 'changed' })
    expect(updated.content).toBe('changed')
  })

  it('bumps updatedAt and validates the patch', async () => {
    const entry = await store.saveEntry({ type: 'clip', content: 'body', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    const updated = await store.updateEntry(entry.id, { note: 'my note' })
    expect(updated.note).toBe('my note')
    expect(updated.updatedAt).toBeGreaterThanOrEqual(entry.createdAt)
    await expect(store.updateEntry(entry.id, { properties: { nosuch: 1 } })).rejects.toThrow(EntryValidationError)
  })
})

describe('deleteEntry (storage.md §5, §7)', () => {
  it('deletes a screenshot asset in the same transaction', async () => {
    const entry = await store.saveEntry({
      type: 'screenshot',
      content: '',
      sourceUrl: 'https://example.com/a',
      properties: { title: 'T' },
      asset: { bytes: pngBlob(), width: 4, height: 4 },
    })
    await store.deleteEntry(entry.id)
    expect(await store.getEntry(entry.id)).toBeUndefined()
    expect(await store.getAsset(entry.assetId!)).toBeUndefined()
  })

  it('clip deletion removes highlights with it (they are embedded)', async () => {
    const entry = await store.saveEntry({ type: 'clip', content: 'body', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    await store.updateEntry(entry.id, { highlights: [{ id: 'hl_x', start: 0, end: 4, quote: 'body', color: 'green', createdAt: Date.now() }] })
    await store.deleteEntry(entry.id)
    expect(await store.getEntry(entry.id)).toBeUndefined()
  })
})

describe('property lifecycle (entry.md §5.3)', () => {
  it('usage counts and PROPERTY_IN_USE guard', async () => {
    await store.upsertPropertyDefinition({ name: 'project', type: 'text', builtin: false, presets: [] })
    expect(await store.propertyUsageCount('project')).toBe(0)
    await store.saveEntry({ type: 'clip', content: 'b', sourceUrl: 'https://example.com/a', properties: { title: 'T', project: 'x' } })
    expect(await store.propertyUsageCount('project')).toBe(1)
    await expect(store.deletePropertyDefinition('project')).rejects.toThrowError(expect.objectContaining({ code: 'PROPERTY_IN_USE' }))
    await expect(store.deletePropertyDefinition('title')).rejects.toThrow() // built-in
  })

  it('same name cannot switch type once registered', async () => {
    await store.upsertPropertyDefinition({ name: 'project', type: 'text', builtin: false, presets: [] })
    await expect(store.upsertPropertyDefinition({ name: 'project', type: 'number', builtin: false, presets: [] })).rejects.toThrowError(
      expect.objectContaining({ code: 'PROPERTY_TYPE_MISMATCH' }),
    )
  })

  it('deleteUnusedPropertyDefinitions removes only unused custom defs', async () => {
    await store.upsertPropertyDefinition({ name: 'unused', type: 'text', builtin: false, presets: [] })
    await store.upsertPropertyDefinition({ name: 'used', type: 'text', builtin: false, presets: [] })
    await store.saveEntry({ type: 'clip', content: 'b', sourceUrl: 'https://example.com/a', properties: { title: 'T', used: 'v' } })
    const removed = await store.deleteUnusedPropertyDefinitions()
    expect(removed).toEqual(['unused'])
    const defs = await store.listPropertyDefinitions()
    expect(defs.some(def => def.name === 'unused')).toBe(false)
    expect(defs.some(def => def.name === 'used')).toBe(true)
  })
})

describe('orphan report (storage.md §7)', () => {
  it('reports unreferenced assets and entries pointing at missing assets, without deleting', async () => {
    const shot = await store.saveEntry({
      type: 'screenshot',
      content: '',
      sourceUrl: 'https://example.com/a',
      properties: { title: 'T' },
      asset: { bytes: pngBlob(), width: 4, height: 4 },
    })
    const extra = await store.saveEntry({
      type: 'screenshot',
      content: '',
      sourceUrl: 'https://example.com/b',
      properties: { title: 'T2' },
      asset: { bytes: pngBlob(), width: 4, height: 4 },
    })
    await store.deleteEntry(extra.id) // normal path removes the asset with it
    const report = await store.orphanReport()
    expect(report.unreferencedAssets).toEqual([])
    expect(report.entriesWithMissingAssets).toEqual([])

    // break an entry on purpose: delete its asset row only
    const raw = (store as unknown as { db: IDBPDatabase }).db
    await raw.delete('assets', shot.assetId!)
    const broken = await store.orphanReport()
    expect(broken.entriesWithMissingAssets.map(item => item.id)).toEqual([shot.id])
    expect(await store.getEntry(shot.id)).toBeDefined() // entry survives, UI shows 图片缺失
  })
})

describe('quota (storage.md §3)', () => {
  it('throws QuotaError when the estimate says no room', async () => {
    const original = navigator.storage?.estimate?.bind(navigator.storage)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ usage: 100, quota: 101 }) },
    })
    try {
      await expect(store.checkQuota(10)).rejects.toThrow(QuotaError)
    } finally {
      if (original) Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: original } })
      else delete (navigator as { storage?: unknown }).storage
    }
  })
})
