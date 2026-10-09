import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { IDBPDatabase } from 'idb'
import { EntryStore, QuotaError } from '../store'
import { EntryValidationError, type Highlight } from '../types'
import { pngBlob } from './helpers'

let store: EntryStore

beforeEach(async () => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), writable: true, configurable: true })
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
    await expect(store.saveEntry({ type: 'clip', content: '', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })).rejects.toThrow(EntryValidationError)
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
    await store.addHighlight(entry.id, { id: 'hl_1', start: 0, end: 3, quote: 'abc', color: 'yellow', createdAt: Date.now() })
    await expect(store.updateEntry(entry.id, { content: 'changed' })).rejects.toThrowError(expect.objectContaining({ code: 'ENTRY_CONTENT_LOCKED' }))
    await store.removeHighlight(entry.id, 'hl_1')
    const updated = await store.updateEntry(entry.id, { content: 'changed' })
    expect(updated.content).toBe('changed')
  })

  it('bumps updatedAt and validates the patch', async () => {
    const entry = await store.saveEntry({ type: 'clip', content: 'body', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    const updated = await store.updateEntry(entry.id, { note: 'my note' })
    expect(updated.note).toBe('my note')
    expect(updated.updatedAt).toBeGreaterThanOrEqual(entry.createdAt)
    await expect(store.updateEntry(entry.id, { properties: { set: { nosuch: 1 } } })).rejects.toThrow(EntryValidationError)
  })

  it('clears note and context on null and patches properties field by field (RV-BG-03)', async () => {
    const entry = await store.saveEntry({
      type: 'clip',
      content: 'body text',
      context: 'before body text after',
      sourceUrl: 'https://example.com/a',
      properties: { title: 'T', tags: ['x'] },
    })
    await store.upsertPropertyDefinition({ name: 'project', type: 'text', builtin: false, presets: [] })
    const noted = await store.updateEntry(entry.id, { note: 'keep' })
    expect(noted.note).toBe('keep')
    const cleared = await store.updateEntry(entry.id, { note: null, context: null })
    expect(cleared.note).toBeUndefined()
    expect(cleared.context).toBeUndefined()

    const patched = await store.updateEntry(entry.id, { properties: { set: { project: 'alpha' } } })
    expect(patched.properties).toMatchObject({ title: 'T', tags: ['x'], project: 'alpha' })
    const unset = await store.updateEntry(entry.id, { properties: { unset: ['tags', 'project'] } })
    expect(unset.properties).toEqual({ title: 'T' })
    // untouched properties survive a partial patch
    expect(unset.sourceUrl).toBe(entry.sourceUrl)
  })

  it('refuses newDefinitions that change an existing property type (RV-CORE-02)', async () => {
    const entry = await store.saveEntry({ type: 'clip', content: 'body', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    await expect(
      store.updateEntry(entry.id, { properties: { set: { rating: 5 }, newDefinitions: [{ name: 'rating', type: 'text', builtin: false, presets: [] }] } }),
    ).rejects.toThrow(EntryValidationError)
  })

  it('canonicalizes case-differing keys to the registry spelling (RV-CORE-02)', async () => {
    await store.upsertPropertyDefinition({ name: 'Project', type: 'text', builtin: false, presets: [] })
    const entry = await store.saveEntry({ type: 'clip', content: 'body', sourceUrl: 'https://example.com/a', properties: { title: 'T', PROJECT: 'x' } })
    expect(entry.properties).toEqual({ title: 'T', Project: 'x' })
    expect(await store.propertyUsageCount('project')).toBe(1)
    await expect(store.deletePropertyDefinition('project')).rejects.toThrowError(expect.objectContaining({ code: 'PROPERTY_IN_USE' }))
  })

  it('rejects an unparseable sourceUrl with ENTRY_SOURCE_INVALID, not a raw TypeError (RV-CORE-03)', async () => {
    await expect(store.saveEntry({ type: 'clip', content: 'body', sourceUrl: 'not a url', properties: { title: 'T' } })).rejects.toThrowError(
      expect.objectContaining({ code: 'ENTRY_SOURCE_INVALID' }),
    )
    await expect(store.saveEntry({ type: 'clip', content: 'body', sourceUrl: '', properties: { title: 'T' } })).rejects.toThrowError(
      expect.objectContaining({ code: 'ENTRY_SOURCE_INVALID' }),
    )
  })

  it('upserts built-in presets while keeping name and type fixed (RV-CORE-02)', async () => {
    await store.upsertPropertyDefinition({ name: 'author', type: 'list', builtin: true, presets: ['clip', 'screenshot'] })
    const defs = await store.listPropertyDefinitions()
    const author = defs.find(def => def.name === 'author')!
    expect(author.presets).toEqual(['clip', 'screenshot'])
    await expect(store.upsertPropertyDefinition({ name: 'author', type: 'text', builtin: true, presets: ['clip'] })).rejects.toThrowError(
      expect.objectContaining({ code: 'PROPERTY_TYPE_MISMATCH' }),
    )
    // a custom definition cannot smuggle itself into the built-in set
    await store.upsertPropertyDefinition({ name: 'mine', type: 'text', builtin: true, presets: [] })
    const mine = (await store.listPropertyDefinitions()).find(def => def.name === 'mine')!
    expect(mine.builtin).toBe(false)
  })
})

describe('highlight operations (storage.md §5, entry.md §4.6)', () => {
  it('addHighlight merges overlaps: union range, stitched quote, joined notes', async () => {
    const entry = await store.saveEntry({ type: 'clip', content: 'Exponential backoff', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    await store.addHighlight(entry.id, { id: 'hl_1', start: 0, end: 11, quote: 'Exponential', color: 'yellow', createdAt: 1 } satisfies Highlight)
    const merged = await store.addHighlight(entry.id, { id: 'hl_2', start: 5, end: 19, quote: 'ential backoff', color: 'green', note: 'second', createdAt: 2 } satisfies Highlight)
    expect(merged.highlights).toHaveLength(1)
    const [highlight] = merged.highlights!
    expect(highlight).toMatchObject({ id: 'hl_1', color: 'yellow', start: 0, end: 19 })
    expect(highlight!.quote).toBe('Exponential backoff')
    expect(highlight!.note).toBe('second')
  })

  it('updateHighlight recolors and writes or clears a note', async () => {
    const entry = await store.saveEntry({ type: 'clip', content: 'abcdef', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    await store.addHighlight(entry.id, { id: 'hl_1', start: 0, end: 3, quote: 'abc', color: 'yellow', createdAt: 1 })
    const recolored = await store.updateHighlight(entry.id, 'hl_1', { color: 'blue' })
    expect(recolored.highlights![0]!.color).toBe('blue')
    const noted = await store.updateHighlight(entry.id, 'hl_1', { note: 'n' })
    expect(noted.highlights![0]!.note).toBe('n')
    const cleared = await store.updateHighlight(entry.id, 'hl_1', { note: null })
    expect(cleared.highlights![0]!.note).toBeUndefined()
    await expect(store.updateHighlight(entry.id, 'nosuch', { color: 'blue' })).rejects.toThrow(EntryValidationError)
  })

  it('removeHighlight and restoreHighlight round-trip an undo', async () => {
    const entry = await store.saveEntry({ type: 'clip', content: 'abcdef', sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    const highlight: Highlight = { id: 'hl_1', start: 0, end: 3, quote: 'abc', color: 'yellow', createdAt: 1 }
    await store.addHighlight(entry.id, highlight)
    const removed = await store.removeHighlight(entry.id, 'hl_1')
    expect(removed.highlights).toHaveLength(0)
    const restored = await store.restoreHighlight(entry.id, highlight)
    expect(restored.highlights).toHaveLength(1)
  })
})

describe('concurrent writes stay consistent (storage.md §5, RV-CORE-01)', () => {
  it('two concurrent addHighlights both land', async () => {
    const body = '0123456789'.repeat(4)
    const entry = await store.saveEntry({ type: 'clip', content: body, sourceUrl: 'https://example.com/a', properties: { title: 'T' } })
    const rounds = 5
    for (let round = 0; round < rounds; round++) {
      const first = round * 4
      const second = 20 + round * 4
      const [a, b] = await Promise.allSettled([
        store.addHighlight(entry.id, { id: `a${round}`, start: first, end: first + 2, quote: body.slice(first, first + 2), color: 'yellow', createdAt: round }),
        store.addHighlight(entry.id, { id: `b${round}`, start: second, end: second + 2, quote: body.slice(second, second + 2), color: 'green', createdAt: round }),
      ])
      expect(a.status).toBe('fulfilled')
      expect(b.status).toBe('fulfilled')
      const current = (await store.getEntry(entry.id))!
      expect(current.highlights).toHaveLength(2 * (round + 1))
    }
  })

  it('delete-unused racing a save never leaves an entry with an undefined property', async () => {
    for (let round = 0; round < 20; round++) {
      const [, save] = await Promise.allSettled([
        store.deleteUnusedPropertyDefinitions(),
        store.saveEntry({
          type: 'clip',
          content: `round ${round}`,
          sourceUrl: 'https://example.com/a',
          properties: { title: 'T', racing: `v${round}` },
          newDefinitions: [{ name: 'racing', type: 'text', builtin: false, presets: [] }],
        }),
      ])
      const defs = await store.listPropertyDefinitions()
      const hasDef = defs.some(def => def.name === 'racing')
      if (save.status === 'fulfilled') {
        // the definition must still exist — or the save must have been refused
        expect(hasDef).toBe(true)
      }
      const entries = await store.listEntries()
      for (const entry of entries) {
        if ('racing' in entry.properties) expect(hasDef).toBe(true)
      }
      // clean slate for the next round
      for (const entry of entries) await store.deleteEntry(entry.id)
      if (hasDef) await store.deletePropertyDefinition('racing')
    }
  })

  it('PROPERTY_IN_USE survives a racing save (single-transaction usage check)', async () => {
    await store.upsertPropertyDefinition({ name: 'hot', type: 'text', builtin: false, presets: [] })
    await store.saveEntry({ type: 'clip', content: 'seed', sourceUrl: 'https://example.com/a', properties: { title: 'T', hot: 'v' } })
    for (let round = 0; round < 10; round++) {
      const [deletion, save] = await Promise.allSettled([
        store.deletePropertyDefinition('hot'),
        store.saveEntry({ type: 'clip', content: `r${round}`, sourceUrl: 'https://example.com/a', properties: { title: 'T', hot: 'v' } }),
      ])
      const defs = await store.listPropertyDefinitions()
      const entries = await store.listEntries()
      const usedSomewhere = entries.some(entry => 'hot' in entry.properties)
      if (deletion.status === 'fulfilled') expect(usedSomewhere).toBe(false)
      else expect(deletion.reason).toBeInstanceOf(EntryValidationError)
      if (save.status === 'fulfilled') expect(defs.some(def => def.name === 'hot')).toBe(true)
      // restore the seed state for the next round
      if (!defs.some(def => def.name === 'hot')) {
        if (save.status === 'fulfilled') await store.deleteEntry(save.value.id)
        await store.upsertPropertyDefinition({ name: 'hot', type: 'text', builtin: false, presets: [] })
        await store.saveEntry({ type: 'clip', content: 'seed', sourceUrl: 'https://example.com/a', properties: { title: 'T', hot: 'v' } })
      }
    }
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
    await store.addHighlight(entry.id, { id: 'hl_x', start: 0, end: 4, quote: 'body', color: 'green', createdAt: Date.now() })
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
