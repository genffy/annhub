import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DIRECT_CONNECT, MAX_SERVER_FAILURES, flushPendingDeliveries, type DeliveryDeps } from '../direct-connect'
import type { FragmentRecord, OutboxEvent, OutboxRejection } from '../../../../learning-core/types'
import { makeFragment } from '../../../../learning-core/__tests__/helpers'
import { fragmentWireHash } from '../../../../learning-core/wire'

/**
 * Delivery semantics (storage.md §8): a pending task is deleted only when Desktop
 * confirms it stored the item; anything Desktop refuses stays queued, parked and
 * visible; one item that keeps failing must not block the items behind it.
 */

const config = { ...DEFAULT_DIRECT_CONNECT, token: 'tok' }

interface Harness {
  events: OutboxEvent[]
  fragments: Map<string, FragmentRecord>
  assets: Map<string, { metadata: { mimeType: string; sha256: string; byteLength: number }; bytes: Blob }>
  deps: DeliveryDeps
  requests: string[]
}

function harness(): Harness {
  const events: OutboxEvent[] = []
  const fragments = new Map<string, FragmentRecord>()
  const assets: Harness['assets'] = new Map()
  const find = (id: string) => events.find(event => event.eventId === id)
  const deps: DeliveryDeps = {
    deviceId: 'dev_1',
    getEvents: async () => events.map(event => ({ ...event })),
    getFragment: async id => fragments.get(id),
    getAsset: async id => assets.get(id) as never,
    prune: async ids => {
      for (const id of ids)
        events.splice(
          events.findIndex(event => event.eventId === id),
          1,
        )
    },
    markAttempt: async id => {
      const event = find(id)
      if (event) event.attempts++
    },
    markFailure: async id => {
      const event = find(id)
      if (!event) return 0
      event.failures = (event.failures ?? 0) + 1
      return event.failures
    },
    reject: async (id, rejection: OutboxRejection) => {
      const event = find(id)
      if (event) event.rejection = rejection
    },
  }
  return { events, fragments, assets, deps, requests: [] }
}

let sequence = 0
function addFragment(h: Harness, id: string): string {
  h.fragments.set(id, makeFragment({ id }))
  const eventId = `evt_${++sequence}`
  h.events.push({ eventId, deviceId: 'dev_1', type: 'fragment.created', payload: { fragmentId: id, revision: 1 }, createdAt: sequence, attempts: 0 })
  return eventId
}

function addAsset(h: Harness, id: string): string {
  h.assets.set(id, { metadata: { mimeType: 'image/png', sha256: 'abc', byteLength: 3 }, bytes: new Blob(['png']) })
  const eventId = `evt_${++sequence}`
  h.events.push({ eventId, deviceId: 'dev_1', type: 'asset.created', payload: { assetId: id }, createdAt: sequence, attempts: 0 })
  return eventId
}

/** A hub that answers per URL id; "network" simulates Desktop not running. */
function hub(h: Harness, answers: Record<string, number | 'network'>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    h.requests.push(url)
    const id = decodeURIComponent(url.split('/').pop()!)
    const answer = answers[id] ?? 201
    if (answer === 'network') throw new TypeError('Failed to fetch')
    return new Response('{}', { status: answer })
  }) as unknown as typeof fetch
}

const flush = (h: Harness, answers: Record<string, number | 'network'> = {}) => flushPendingDeliveries(config, h.deps, hub(h, answers))
const queued = (h: Harness) => h.events.map(event => event.eventId)

describe('what removes a pending task', () => {
  it.each([200, 201])('Desktop confirming with %i removes it', async status => {
    const h = harness()
    addFragment(h, 'f1')
    const result = await flush(h, { f1: status })
    expect(result).toMatchObject({ deliveredFragments: 1, pruned: 1, rejected: 0, errors: [] })
    expect(h.events).toEqual([])
  })

  it.each([
    [409, 'CONFLICT'],
    [410, 'DESKTOP_DELETED'],
    [413, 'TOO_LARGE'],
    [422, 'INVALID'],
    [400, 'REJECTED'],
    [404, 'REJECTED'],
  ] as const)('Desktop refusing with %i keeps the task, parked as %s, and says so', async (status, code) => {
    const h = harness()
    const eventId = addFragment(h, 'f1')
    const result = await flush(h, { f1: status })

    expect(queued(h)).toEqual([eventId])
    expect(h.events[0]!.rejection).toMatchObject({ code, status })
    expect(result).toMatchObject({ deliveredFragments: 0, pruned: 0, rejected: 1 })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('f1')
  })

  it('parks an image refusal the same way, naming the image', async () => {
    const h = harness()
    const eventId = addAsset(h, 'asset_big')
    const result = await flush(h, { asset_big: 413 })
    expect(queued(h)).toEqual([eventId])
    expect(h.events[0]!.rejection).toMatchObject({ code: 'TOO_LARGE', status: 413 })
    expect(result.errors[0]).toContain('asset_big')
  })

  it('a parked task is not retried automatically, and does not count as waiting', async () => {
    const h = harness()
    addFragment(h, 'f1')
    await flush(h, { f1: 409 })
    h.requests.length = 0

    const again = await flush(h, { f1: 201 })
    expect(h.requests).toEqual([])
    expect(again).toMatchObject({ deliveredFragments: 0, rejected: 0 })
    expect(h.events).toHaveLength(1)
  })

  it('a local record that no longer exists drops its task without a request', async () => {
    const h = harness()
    addFragment(h, 'gone')
    h.fragments.delete('gone')
    addAsset(h, 'asset_gone')
    h.assets.delete('asset_gone')
    const result = await flush(h)
    expect(h.requests).toEqual([])
    expect(result.pruned).toBe(2)
    expect(h.events).toEqual([])
  })
})

describe('one bad item does not block the queue', () => {
  it('delivers the items behind a refused one', async () => {
    const h = harness()
    const refused = addFragment(h, 'f1')
    addFragment(h, 'f2')
    addFragment(h, 'f3')
    const result = await flush(h, { f1: 409 })
    expect(result).toMatchObject({ deliveredFragments: 2, rejected: 1 })
    expect(queued(h)).toEqual([refused])
  })

  it('moves on from a 5xx item, keeps it queued and counts the failure', async () => {
    const h = harness()
    const poison = addFragment(h, 'f1')
    addFragment(h, 'f2')
    addFragment(h, 'f3')
    const result = await flush(h, { f1: 500 })

    expect(result).toMatchObject({ deliveredFragments: 2, rejected: 0, unreachable: false })
    expect(queued(h)).toEqual([poison])
    expect(h.events[0]).toMatchObject({ failures: 1 })
    expect(h.events[0]!.rejection).toBeUndefined()
    expect(result.errors[0]).toContain('HTTP 500')
  })

  it('parks an item after repeated server errors so it stops being retried', async () => {
    const h = harness()
    addFragment(h, 'f1')
    for (let run = 1; run < MAX_SERVER_FAILURES; run++) {
      await flush(h, { f1: 500 })
      expect(h.events[0]!.rejection).toBeUndefined()
    }
    const last = await flush(h, { f1: 503 })
    expect(h.events[0]!.rejection).toMatchObject({ code: 'DESKTOP_ERROR', status: 503 })
    expect(last.rejected).toBe(1)
    expect(last.errors[0]).toContain('已暂停自动重试')
  })

  it('stops the run when Desktop keeps failing across items, without parking them', async () => {
    const h = harness()
    for (const id of ['f1', 'f2', 'f3', 'f4']) addFragment(h, id)
    const result = await flush(h, { f1: 500, f2: 500, f3: 500 })

    expect(h.requests).toHaveLength(3) // f4 was not even tried
    expect(result.deliveredFragments).toBe(0)
    expect(h.events.every(event => !event.rejection)).toBe(true)
    expect(h.events.map(event => event.failures ?? 0)).toEqual([1, 1, 1, 0])
  })

  it('a success in between resets the run of server errors', async () => {
    const h = harness()
    for (const id of ['f1', 'f2', 'f3', 'f4']) addFragment(h, id)
    const result = await flush(h, { f1: 500, f3: 500, f4: 500 })
    expect(h.requests).toHaveLength(4)
    expect(result.deliveredFragments).toBe(1)
  })
})

describe('Desktop-level failures leave everything queued', () => {
  it('stops on a network error without touching any task', async () => {
    const h = harness()
    addFragment(h, 'f1')
    addFragment(h, 'f2')
    const result = await flush(h, { f1: 'network' })
    expect(result).toMatchObject({ unreachable: true, deliveredFragments: 0, pruned: 0, rejected: 0 })
    expect(h.requests).toHaveLength(1)
    expect(h.events).toHaveLength(2)
    expect(h.events.every(event => !event.rejection && !event.failures)).toBe(true)
  })

  it.each([401, 403])('stops on %i, keeps every task and reports it as an auth failure', async status => {
    const h = harness()
    addFragment(h, 'f1')
    addFragment(h, 'f2')
    const result = await flush(h, { f1: status })
    expect(result.authFailed).toBe(true)
    expect(h.requests).toHaveLength(1)
    expect(h.events).toHaveLength(2)
    expect(h.events.every(event => !event.rejection)).toBe(true)
  })

  it('refuses to start without a pairing code', async () => {
    const h = harness()
    addFragment(h, 'f1')
    const fetchMock = hub(h, {})
    const result = await flushPendingDeliveries({ ...config, token: '' }, h.deps, fetchMock)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.errors).toHaveLength(1)
    expect(h.events).toHaveLength(1)
  })
})

describe('order', () => {
  it('sends fragments before the images they reference (storage.md §8)', async () => {
    const h = harness()
    addAsset(h, 'asset_1')
    addFragment(h, 'f1')
    await flush(h)
    expect(h.requests.map(url => url.split('/v1/')[1]!.split('/')[0])).toEqual(['fragments', 'assets'])
  })
})

describe('records that do not serialize', () => {
  it('delivers a fragment saved without the optional understanding, hashing what is sent', async () => {
    const h = harness()
    addFragment(h, 'f1')
    // After the IndexedDB round trip an omitted optional field is an explicit `undefined`.
    ;(h.fragments.get('f1')!.processing as { guess?: string }).guess = undefined

    let sent: { hash: string; body: { fragment: unknown } } | undefined
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      sent = { hash: (init!.headers as Record<string, string>)['X-AnnHub-Sha256']!, body: JSON.parse(String(init!.body)) }
      return new Response('{}', { status: 201 })
    }) as unknown as typeof fetch
    const result = await flushPendingDeliveries(config, h.deps, fetchMock)

    expect(result).toMatchObject({ deliveredFragments: 1, rejected: 0, errors: [] })
    expect(h.events).toEqual([])
    expect('guess' in (sent!.body.fragment as { processing: object }).processing).toBe(false)
    expect(sent!.hash).toBe(await fragmentWireHash(sent!.body.fragment as never))
  })

  it('parks a record that cannot be turned into a request and still delivers the rest', async () => {
    const h = harness()
    const broken = addFragment(h, 'broken')
    addFragment(h, 'fine')
    // A function member is not JSON; nothing can hash it.
    ;(h.fragments.get('broken')!.processing as unknown as { use: unknown }).use = () => 'nope'

    const result = await flush(h)
    expect(result).toMatchObject({ deliveredFragments: 1, rejected: 1 })
    expect(queued(h)).toEqual([broken])
    expect(h.events[0]!.rejection).toMatchObject({ code: 'LOCAL_INVALID', status: 0 })
    expect(h.requests).toHaveLength(1)
  })
})
