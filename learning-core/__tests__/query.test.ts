import { describe, expect, it } from 'vitest'
import { runFragmentQuery, collectHosts, collectTags, collectKinds } from '../query'
import type { FragmentRecord } from '../types'
import { makeFragment, makeFragmentOf, NOW } from './helpers'

describe('search matching (search.md §2)', () => {
  it('requires every word to hit some field, words may hit different fields', () => {
    const f = makeFragment() // content: hawkish pivot, use: 在下周的宏观复盘里…
    const result = runFragmentQuery([f], { search: 'hawkish 宏观' })
    expect(result.total).toBe(1)
    const missing = runFragmentQuery([f], { search: 'hawkish dovish' })
    expect(missing.total).toBe(0)
  })

  it('scores content hits above guess/use hits above tags (search.md §3)', () => {
    const contentHit = makeFragment({ id: 'aaa', content: 'the fed statement', normalizedContent: 'the fed statement', tags: [] })
    const tagHit = makeFragment({ id: 'bbb', content: 'other', normalizedContent: 'other', tags: ['fed'], context: { ...makeFragment().context, excerpt: 'other macro context' } })
    const result = runFragmentQuery([tagHit, contentHit], { search: 'fed' })
    expect(result.items[0]!.id).toBe('aaa')
  })

  it('empty query returns filter-only results with score 0 ordering by createdAt desc, id asc', () => {
    const older = makeFragment({ id: 'zzz', createdAt: NOW - 5000, updatedAt: NOW - 5000 })
    const newer = makeFragment({ id: 'aaa', createdAt: NOW, updatedAt: NOW })
    const result = runFragmentQuery([older, newer], {})
    expect(result.items.map(f => f.id)).toEqual(['aaa', 'zzz'])
  })
})

describe('filters (search.md §2)', () => {
  const pool: FragmentRecord[] = [
    makeFragmentOf('concept', { sourceUrl: 'https://wsj.com/a', sourceHost: 'wsj.com' }),
    { ...makeFragmentOf('claim', { sourceUrl: 'https://ft.com/b', sourceHost: 'ft.com' }), tags: ['macro'] },
    makeFragmentOf('inspiration', { sourceUrl: 'annhub://manual/f1', sourceHost: 'manual' }),
  ]

  it('same dimension OR, cross dimension AND', () => {
    expect(runFragmentQuery(pool, { kinds: ['concept', 'claim'] }).total).toBe(2)
    expect(runFragmentQuery(pool, { kinds: ['concept', 'claim'], hosts: ['ft.com'] }).total).toBe(1)
    expect(runFragmentQuery(pool, { tags: ['macro'] }).total).toBe(1)
  })

  it('capturedAt range is [start, end)', () => {
    const captured = pool[0]!.context.capturedAt
    expect(runFragmentQuery(pool, { capturedFrom: captured, capturedTo: captured + 1 }).total).toBeGreaterThanOrEqual(1)
    expect(runFragmentQuery(pool, { capturedTo: captured }).total).toBe(0)
  })
})

describe('pagination (search.md §3)', () => {
  it('pages with a stable cursor without duplicates or losses', () => {
    const pool: FragmentRecord[] = Array.from({ length: 7 }, (_, i) => makeFragment({ id: `f${i}`, createdAt: NOW - i * 1000, updatedAt: NOW - i * 1000 }))
    const page1 = runFragmentQuery(pool, { limit: 3 })
    expect(page1.items.length).toBe(3)
    expect(page1.total).toBe(7)
    const page2 = runFragmentQuery(pool, { limit: 3, cursor: page1.nextCursor })
    const page3 = runFragmentQuery(pool, { limit: 3, cursor: page2.nextCursor })
    const all = [...page1.items, ...page2.items, ...page3.items]
    expect(all.map(f => f.id)).toEqual(pool.map(f => f.id))
    expect(new Set(all.map(f => f.id)).size).toBe(7)
    expect(page3.nextCursor).toBeUndefined()
  })
})

describe('filter chip sources', () => {
  it('collects hosts, tags and kinds frequency-first', () => {
    const a = makeFragmentOf('concept', { sourceUrl: 'https://a.com/1', sourceHost: 'a.com' })
    const b = makeFragmentOf('claim', { sourceUrl: 'https://a.com/2', sourceHost: 'a.com' })
    expect(collectHosts([a, b])).toEqual(['a.com'])
    expect(
      collectTags([
        { ...a, tags: ['x', 'y'] },
        { ...b, tags: ['x'] },
      ]),
    ).toEqual(['x', 'y'])
    expect(collectKinds([a, b]).sort()).toEqual(['claim', 'concept'])
  })
})
