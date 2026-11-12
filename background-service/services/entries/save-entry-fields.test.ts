import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The save and query handlers keep "the field is absent" and "the field is undefined" apart
 * (RV-TEST-17): a draft that does not carry context, note, an id or new definitions stores an
 * entry without those keys, and a full draft stores all of them. The attribution fields ride
 * the same conditional, and the property list carries usage only when it was asked for.
 */

let stored: Record<string, unknown>

const pageSender = { id: 'annhub-test', url: 'chrome-extension://annhub-test/library.html' } as chrome.runtime.MessageSender
const tabSender = { id: 'annhub-test', url: 'https://page.example/a', tab: { id: 941 }, frameId: 0 } as chrome.runtime.MessageSender

beforeEach(() => {
  stored = {}
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), writable: true, configurable: true })
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'annhub-test',
      getURL: (path: string) => `chrome-extension://annhub-test/${path}`,
      // the capture metric rides a fire-and-forget message; catch it here
      sendMessage: vi.fn(async () => ({ type: 'RESPONSE', success: true })),
    },
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

async function service() {
  vi.resetModules()
  const { EntryService } = await import('./index')
  return EntryService.getInstance().getMessageHandlers()
}

describe('SAVE_CLIP carries exactly the fields the draft names (RV-TEST-17)', () => {
  it('stores a minimal draft without absent keys, and attribution stays out', async () => {
    const handlers = await service()
    const response = await handlers.SAVE_CLIP!(
      { type: 'SAVE_CLIP', draft: { content: 'Minimal body.', sourceUrl: 'https://page.example/a', properties: { title: 'Minimal' }, via: 'menu' } },
      tabSender,
    )
    expect(response.success, JSON.stringify(response.error)).toBe(true)
    const entry = response.data!.entry as unknown as Record<string, unknown>
    expect('context' in entry, 'no context key for a draft without one').toBe(false)
    expect('note' in entry, 'no note key for a draft without one').toBe(false)
    expect('highlights' in entry).toBe(false)
  })

  it('stores every field a full draft names, and the new definition lands in the registry', async () => {
    const handlers = await service()
    const response = await handlers.SAVE_CLIP!(
      {
        type: 'SAVE_CLIP',
        draft: {
          id: 'ent_full_fields',
          content: 'a sentence of substance.',
          context: 'a sentence of substance sits in the paragraph.',
          note: 'check later',
          sourceUrl: 'https://page.example/a',
          properties: { title: 'Full', project: 'payments' },
          newDefinitions: [{ name: 'project', type: 'text', builtin: false, presets: [] }],
          via: 'block',
          blockKind: 'section',
          levelChanged: true,
          truncated: true,
          startedAt: Date.now() - 40,
        },
      },
      tabSender,
    )
    expect(response.success, JSON.stringify(response.error)).toBe(true)
    const entry = response.data!.entry as unknown as Record<string, unknown>
    expect(entry.id).toBe('ent_full_fields')
    expect(entry.context).toBe('a sentence of substance sits in the paragraph.')
    expect(entry.note).toBe('check later')
    const { initializedEntryStore } = await import('../../store-instance')
    const definitions = await (await initializedEntryStore()).listPropertyDefinitions()
    expect(
      definitions.some(definition => definition.name === 'project'),
      'the new definition was written in the same transaction',
    ).toBe(true)
  })
})

describe('QUERY_ENTRIES pages with and without a limit (RV-TEST-17)', () => {
  it('returns one page of one with a limit, and everything without one', async () => {
    const handlers = await service()
    for (const index of [0, 1]) {
      await handlers.SAVE_CLIP!(
        { type: 'SAVE_CLIP', draft: { content: `Body ${index} of the pair.`, sourceUrl: `https://page.example/${index}`, properties: { title: `T${index}` }, via: 'menu' } },
        tabSender,
      )
    }
    const limited = await handlers.QUERY_ENTRIES!({ type: 'QUERY_ENTRIES', query: { limit: 1 } }, pageSender)
    expect(limited.success).toBe(true)
    expect((limited as { data: { result: { items: unknown[]; total: number } } }).data.result.items).toHaveLength(1)
    expect((limited as { data: { result: { total: number } } }).data.result.total).toBe(2)
    const whole = await handlers.QUERY_ENTRIES!({ type: 'QUERY_ENTRIES', query: {} }, pageSender)
    expect((whole as { data: { result: { items: unknown[] } } }).data.result.items).toHaveLength(2)
  })
})

describe('LIST_PROPERTIES answers usage only when it was asked for (RV-TEST-17)', () => {
  it('carries usage for a true includeUsage and leaves the key out otherwise', async () => {
    const handlers = await service()
    const withUsage = await handlers.LIST_PROPERTIES!({ type: 'LIST_PROPERTIES', includeUsage: true }, pageSender)
    expect(withUsage.success).toBe(true)
    expect('usage' in (withUsage.data as Record<string, unknown>)).toBe(true)
    const withoutUsage = await handlers.LIST_PROPERTIES!({ type: 'LIST_PROPERTIES' }, pageSender)
    expect(withoutUsage.success).toBe(true)
    expect('usage' in (withoutUsage.data as Record<string, unknown>)).toBe(false)
  })
})
