import { describe, expect, it } from 'vitest'
import { queryEntries } from '../query'
import { BUILTIN_PROPERTY_DEFINITIONS } from '../properties'
import type { EntryRecord } from '../types'

/**
 * search.md §6: with 10,000 entries, a common query's first screen (50
 * items) answers within 200ms on the second run after cold start. The
 * in-memory scan is the fallback semantics; an index may accelerate it but
 * must not change results.
 */

const WORDS = ['retry', 'backoff', 'jitter', 'saturation', 'idempotency', 'budget', 'latency', 'queue', 'circuit', 'breaker']

function entry(index: number): EntryRecord {
  const word = WORDS[index % WORDS.length]!
  const other = WORDS[(index + 3) % WORDS.length]!
  const createdAt = Date.parse('2026-01-01') + index * 60_000
  return {
    id: `ent_${index.toString().padStart(5, '0')}`,
    type: index % 5 === 0 ? 'screenshot' : 'clip',
    content: `${word} guidance with ${other} details and enough body text to look real. ${other} again for scoring noise.`,
    context: `Around the ${word} sentence.`,
    sourceUrl: `https://host-${index % 40}.example.com/posts/${index}`,
    sourceHost: `host-${index % 40}.example.com`,
    properties: {
      title: `${word} notes ${index}`,
      tags: [word, other],
      ...(index % 3 === 0 ? { rating: index % 5 } : {}),
      ...(index % 4 === 0 ? { reviewed: index % 2 === 0 } : {}),
    },
    createdAt,
    updatedAt: createdAt,
  }
}

describe('search performance (search.md §6)', () => {
  const registry = [
    ...BUILTIN_PROPERTY_DEFINITIONS,
    { name: 'rating', type: 'number' as const, builtin: false, presets: [] },
    { name: 'reviewed', type: 'checkbox' as const, builtin: false, presets: [] },
  ]
  const corpus = Array.from({ length: 10_000 }, (_, i) => entry(i))

  it('answers the first screen of a common query within 200ms on the second run', () => {
    const query = {
      search: 'jitter',
      tags: ['jitter'],
      conditions: [{ name: 'rating', op: 'gt' as const, value: 1 }],
    }
    // cold start (jit + first full scan), then the measured run
    queryEntries(corpus, registry, { ...query, limit: 50 })
    const started = performance.now()
    const result = queryEntries(corpus, registry, { ...query, limit: 50 })
    const elapsed = performance.now() - started

    expect(result.items).toHaveLength(50)
    expect(result.total).toBeGreaterThan(50)
    expect(elapsed, `second run took ${elapsed.toFixed(1)}ms`).toBeLessThan(200)
  })

  it('keeps the no-term listing fast as well', () => {
    queryEntries(corpus, registry, { limit: 50 })
    const started = performance.now()
    const result = queryEntries(corpus, registry, { limit: 50 })
    const elapsed = performance.now() - started

    expect(result.items).toHaveLength(50)
    expect(elapsed, `second run took ${elapsed.toFixed(1)}ms`).toBeLessThan(200)
  })
})
