import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemorySyncClient, MEMORY_EVENT_BATCH_LIMIT } from '../memory-sync'
import type { MemoryEvent } from '../../../../types/vocabulary'

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response
}

function event(overrides: Partial<MemoryEvent> = {}): MemoryEvent {
  return {
    eventId: overrides.eventId ?? 'evt-1',
    lemma: overrides.lemma ?? 'robust',
    type: overrides.type ?? 'seen',
    ts: overrides.ts ?? 1_700_000_000_000,
    deviceId: overrides.deviceId ?? 'anon-device',
    ...overrides,
  }
}

describe('MemorySyncClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('requires an endpoint', () => {
    expect(() => new MemorySyncClient({ endpoint: '', deviceId: 'd' })).toThrow()
  })

  it('POSTs events to /v1/memory/events with bearer auth and parses the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ accepted: 3, duplicates: 1, serverTime: 42 }))
    global.fetch = fetchMock as any

    const client = new MemorySyncClient({ endpoint: 'https://api.example.com/', deviceId: 'anon-device' })
    const result = await client.flushEvents([event(), event({ eventId: 'evt-2' })])

    expect(result).toEqual({ accepted: 3, duplicates: 1, serverTime: 42 })
    const [url, init] = fetchMock.mock.calls[0]
    // Trailing slash on the base is trimmed before joining the path.
    expect(url).toBe('https://api.example.com/v1/memory/events')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer anon-device')
    const body = JSON.parse(init.body)
    expect(body.deviceId).toBe('anon-device')
    expect(body.events).toHaveLength(2)
  })

  it('prefers an explicit auth token over the device id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ accepted: 0, duplicates: 0 }))
    global.fetch = fetchMock as any

    const client = new MemorySyncClient({ endpoint: 'https://api.example.com', deviceId: 'anon-device', authToken: 'account-token' })
    await client.flushEvents([event()])

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer account-token')
  })

  it('throws on non-2xx so the caller keeps the queue', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }) as any
    const client = new MemorySyncClient({ endpoint: 'https://api.example.com', deviceId: 'd' })
    await expect(client.flushEvents([event()])).rejects.toThrow(/HTTP 503/)
  })

  it('rejects an oversized batch before any network call', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as any
    const client = new MemorySyncClient({ endpoint: 'https://api.example.com', deviceId: 'd' })
    const tooMany = Array.from({ length: MEMORY_EVENT_BATCH_LIMIT + 1 }, (_, i) => event({ eventId: `e${i}` }))
    await expect(client.flushEvents(tooMany)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetchRecall normalizes states, clamps recall, and drops invalid entries', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okJson({
        modelVersion: 'hlr-2026.06',
        ttlSeconds: 3600,
        states: [
          { lemma: 'robust', recall: 1.4, computedAt: 100, dsr: { difficulty: 1, stability: 30, retrievability: 0.9 } },
          { lemma: '', recall: 0.5 }, // invalid lemma → dropped
          { lemma: 'phenomenon', recall: 'nope' }, // invalid recall → dropped
          { lemma: 'epistemic', recall: 0.3 }, // valid, no computedAt → defaulted
        ],
      }),
    )
    const client = new MemorySyncClient({ endpoint: 'https://api.example.com', deviceId: 'd' })
    const { states, modelVersion, ttlSeconds } = await client.fetchRecall(['robust', 'phenomenon', 'epistemic'])

    expect(modelVersion).toBe('hlr-2026.06')
    expect(ttlSeconds).toBe(3600)
    expect(states.map(s => s.lemma).sort()).toEqual(['epistemic', 'robust'])
    const robust = states.find(s => s.lemma === 'robust')!
    expect(robust.recall).toBe(1) // clamped into [0,1]
    expect(robust.dsr).toEqual({ difficulty: 1, stability: 30, retrievability: 0.9 })
    expect(robust.modelVersion).toBe('hlr-2026.06')
    const epistemic = states.find(s => s.lemma === 'epistemic')!
    expect(epistemic.computedAt).toBeGreaterThan(0) // defaulted when missing
  })

  it('fetchRecall short-circuits on empty input', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as any
    const client = new MemorySyncClient({ endpoint: 'https://api.example.com', deviceId: 'd' })
    const result = await client.fetchRecall([])
    expect(result.states).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
