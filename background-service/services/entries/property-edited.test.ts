import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `entry.property_edited` is recorded where UPDATE_ENTRY writes (metrics.md §9), so a tag typed into the
 * quick-edit bubble right after a clip counts for M-20 just like an edit in the drawer, and only once.
 */

let stored: Record<string, unknown>

const contentSender = { id: 'annhub-test', url: 'https://page.example/a', tab: { id: 941 }, frameId: 0 } as chrome.runtime.MessageSender
const pageSender = { id: 'annhub-test', url: 'chrome-extension://annhub-test/library.html' } as chrome.runtime.MessageSender
const reviewers = { name: 'reviewers', type: 'list' as const, builtin: false, presets: [] }

beforeEach(() => {
  stored = {}
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), writable: true, configurable: true })
  vi.stubGlobal('chrome', {
    runtime: { id: 'annhub-test', getURL: (path: string) => `chrome-extension://annhub-test/${path}` },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: structuredClone(stored[key]) }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(stored, structuredClone(items))
        },
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A fresh module graph: the store connection, the recent captures and the metrics recorder are all module state. */
async function service() {
  vi.resetModules()
  const { EntryService } = await import('./index')
  const { rememberCapture } = await import('../../sender')
  const { initializedEntryStore } = await import('../../store-instance')
  const { metricsSnapshot } = await import('../metrics/record')
  const store = await initializedEntryStore()
  const entry = await store.saveEntry({ type: 'clip', content: 'Retry with backoff.', sourceUrl: 'https://page.example/a', properties: { title: 'Backoff' } })
  await rememberCapture(contentSender, entry.id)
  return {
    store,
    id: entry.id,
    update: (patch: unknown, sender = pageSender, id = entry.id) => EntryService.getInstance().getMessageHandlers().UPDATE_ENTRY!({ type: 'UPDATE_ENTRY', id, patch }, sender),
    edits: async () => (await metricsSnapshot())['entry.property_edited']?.byProps ?? {},
  }
}

describe('entry.property_edited (metrics.md §9, M-20)', () => {
  it('counts the tags and title the quick-edit bubble saves, one event per property', async () => {
    const { update, edits } = await service()
    const response = await update({ properties: { set: { title: 'Retry notes', tags: ['retry', 'backoff'] } }, note: 'check later' }, contentSender)
    expect(response.success).toBe(true)
    expect(await edits()).toEqual({ 'property_type=list|scope=builtin': 1, 'property_type=text|scope=builtin': 1 })
  })

  it('takes scope and type from the registry, also for a property the same write registers', async () => {
    const { update, edits } = await service()
    expect((await update({ properties: { set: { reviewers: ['ada'] }, newDefinitions: [reviewers] } })).success).toBe(true)
    expect((await update({ properties: { unset: ['reviewers'] } })).success).toBe(true)
    expect(await edits()).toEqual({ 'property_type=list|scope=custom': 2 })
  })

  it('counts nothing for the note, the context or a definition registered without a value', async () => {
    const { update, edits } = await service()
    expect((await update({ note: 'only a note' }, contentSender)).success).toBe(true)
    expect((await update({ context: 'Retry with backoff. Then wait.' })).success).toBe(true)
    expect((await update({ properties: { newDefinitions: [reviewers] } })).success).toBe(true)
    expect(await edits()).toEqual({})
  })

  it('counts nothing for a refused or failed write', async () => {
    const { update, edits } = await service()
    expect((await update({ properties: { set: { tags: ['retry'] } } }, contentSender, 'ent_someone_else')).success).toBe(false)
    expect((await update({ properties: { set: { tags: ['retry'] } } }, pageSender, 'ent_missing')).success).toBe(false)
    expect(await edits()).toEqual({})
  })

  it('still reports the saved write when the registry cannot be read for the metric', async () => {
    const { store, update, edits } = await service()
    vi.spyOn(store, 'listPropertyDefinitions').mockRejectedValue(new Error('registry unreadable'))
    const response = await update({ properties: { set: { tags: ['retry'] } } }, contentSender)
    expect(response.success).toBe(true)
    expect(response.data.entry.properties.tags).toEqual(['retry'])
    expect(await edits()).toEqual({})
  })
})
