import { describe, expect, it } from 'vitest'
import { queryEntries, queryHighlights } from '../query'
import type { EntryRecord } from '../types'
import { makeClip, makeHighlight, makeScreenshot, TEST_REGISTRY } from './helpers'

const base = Date.parse('2026-10-01T00:00:00Z')

function clip(overrides: Partial<EntryRecord> & { content: string; title: string; tags?: string[] }): EntryRecord {
  const { properties, tags, ...rest } = overrides
  return makeClip({ ...rest, properties: { title: overrides.title, tags: tags ?? [], ...(properties as Record<string, string | string[] | number | boolean>) } })
}

const data: EntryRecord[] = [
  clip({
    content: 'Exponential backoff with jitter so clients do not retry in lockstep.',
    title: 'Retries and backpressure',
    tags: ['reliability'],
    createdAt: base,
    note: 'compare with the incident review',
    context: 'When a dependency is saturated, exponential backoff with jitter matters.',
    highlights: [makeHighlight({ start: 0, end: 11, quote: 'Exponential', note: 'why jitter', createdAt: base + 5000 })],
  }),
  clip({
    content: '幂等键应在请求首次落库时生成，重试复用同一个键。',
    title: 'Idempotency keys',
    tags: ['payments'],
    createdAt: base + 1000,
    properties: { title: 'Idempotency keys', tags: ['payments'], project: '支付重试' },
  }),
  makeScreenshot({ properties: { title: 'p99 latency curve' }, createdAt: base + 2000 }),
  clip({
    content: 'Retry budget counted server side is more robust.',
    title: 'Retry budgets',
    tags: ['reliability', 'sre'],
    createdAt: base + 3000,
    properties: { title: 'Retry budgets', tags: ['reliability', 'sre'], rating: 5, reviewed: true },
  }),
]

describe('search matching (search.md §2)', () => {
  it('every term must hit some field; terms can hit different fields', () => {
    const result = queryEntries(data, TEST_REGISTRY, { search: 'jitter lockstep' })
    expect(result.items.map(entry => entry.properties['title'])).toEqual(['Retries and backpressure'])
    expect(queryEntries(data, TEST_REGISTRY, { search: 'jitter nomatch' }).total).toBe(0)
  })

  it('matches CJK by substring without tokenization', () => {
    expect(queryEntries(data, TEST_REGISTRY, { search: '幂等键' }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { search: '首次落库' }).total).toBe(1)
  })

  it('searches notes, context, highlight quotes and property text values', () => {
    expect(queryEntries(data, TEST_REGISTRY, { search: 'incident review' }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { search: 'saturated' }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { search: 'why jitter' }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { search: '支付重试' }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { search: 'latency' }).total).toBe(1) // title of screenshot
  })

  it('ignores markdown syntax markers when searching content', () => {
    const md = clip({ content: 'See **bold** and `code` and [label](https://x.example)', title: 'md' })
    expect(queryEntries([md], TEST_REGISTRY, { search: 'bold code label' }).total).toBe(1)
  })

  it('does not search number/checkbox/date property values', () => {
    expect(queryEntries(data, TEST_REGISTRY, { search: '5' }).total).toBe(0)
  })
})

describe('scoring and sorting (search.md §4)', () => {
  it('content (5) outranks title (4); ties break by createdAt desc then id asc', () => {
    const inTitle = clip({ content: 'unrelated words here', title: 'needle in the title', createdAt: base + 5000 })
    const inContent = clip({ content: 'the needle sits in the body text', title: 'other', createdAt: base })
    const result = queryEntries([inTitle, inContent], TEST_REGISTRY, { search: 'needle' })
    expect(result.items.map(entry => entry.properties['title'])).toEqual(['other', 'needle in the title'])
  })

  it('equal scores order by createdAt desc; no terms order newest first', () => {
    const result = queryEntries(data, TEST_REGISTRY, { search: 'retry' })
    const titles = result.items.map(entry => entry.properties['title'])
    expect(titles.indexOf('Retry budgets')).toBeLessThan(titles.indexOf('Retries and backpressure')) // same top weight, newer wins

    const noTerms = queryEntries(data, TEST_REGISTRY, {})
    expect(noTerms.items[0]!.properties['title']).toBe('Retry budgets') // newest first
  })
})

describe('filters (search.md §3)', () => {
  it('type, host, tag OR within a dimension and AND across', () => {
    expect(queryEntries(data, TEST_REGISTRY, { types: ['screenshot'] }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { hosts: ['engineering.example.com'] }).total).toBe(3)
    expect(queryEntries(data, TEST_REGISTRY, { tags: ['reliability', 'payments'] }).total).toBe(3)
    expect(queryEntries(data, TEST_REGISTRY, { tags: ['reliability'], types: ['screenshot'] }).total).toBe(0)
  })

  it('time range is [start, end)', () => {
    expect(queryEntries(data, TEST_REGISTRY, { createdFrom: base + 1500 }).total).toBe(2)
    expect(queryEntries(data, TEST_REGISTRY, { createdFrom: base, createdTo: base + 2000 }).total).toBe(2)
  })

  it('property operators follow the type', () => {
    expect(queryEntries(data, TEST_REGISTRY, { conditions: [{ name: 'rating', op: 'gt', value: 3 }] }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { conditions: [{ name: 'reviewed', op: 'is', value: true }] }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { conditions: [{ name: 'project', op: 'contains', value: '支付' }] }).total).toBe(1)
    expect(queryEntries(data, TEST_REGISTRY, { conditions: [{ name: 'tags', op: 'has', value: 'sre' }] }).total).toBe(1)
    expect(
      queryEntries(data, TEST_REGISTRY, {
        conditions: [
          { name: 'rating', op: 'between', value: 4, value2: 6 },
          { name: 'reviewed', op: 'is', value: true },
        ],
      }).total,
    ).toBe(1)
  })

  it('search ANDs with filters', () => {
    expect(queryEntries(data, TEST_REGISTRY, { search: 'retry', tags: ['sre'] }).total).toBe(1)
  })
})

describe('pagination (search.md §4)', () => {
  it('pages with a stable cursor, no duplicates or gaps on shared timestamps', () => {
    const many = Array.from({ length: 120 }, (_, i) => clip({ content: `shared body ${i}`, title: `t${i}`, createdAt: base }))
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = queryEntries(many, TEST_REGISTRY, { limit: 50, cursor })
      seen.push(...page.items.map(entry => entry.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(120)
    expect(new Set(seen).size).toBe(120)
  })
})

describe('highlight view (search.md §5)', () => {
  it('groups by clip, rows sorted by position, groups by newest highlight', () => {
    const other = clip({
      content: 'Another clip with a mark inside.',
      title: 'Other',
      createdAt: base + 10,
      highlights: [makeHighlight({ start: 0, end: 7, quote: 'Another', createdAt: base + 999_999 })],
    })
    const result = queryHighlights([data[0]!, other], TEST_REGISTRY, {})
    expect(result.total).toBe(2)
    expect(result.groups[0]!.clip.properties['title']).toBe('Other') // newer highlight first
    expect(result.groups.map(group => group.rows.length)).toEqual([1, 1])
  })

  it('search hits quote/note or the owning clip title/tags/host', () => {
    expect(queryHighlights(data, TEST_REGISTRY, { search: 'why jitter' }).total).toBe(1)
    expect(queryHighlights(data, TEST_REGISTRY, { search: 'backpressure' }).total).toBe(1)
    expect(queryHighlights(data, TEST_REGISTRY, { search: 'latency' }).total).toBe(0) // screenshot has no highlights
  })

  it('color filters the highlight; host/tags filter via the clip', () => {
    const colored = makeHighlight({ start: 0, end: 11, quote: 'Exponential', color: 'blue', id: 'hl_blue' })
    const entry = makeClip({ content: 'Exponential backoff', highlights: [colored], properties: { title: 'T', tags: ['x'] } })
    expect(queryHighlights([entry], TEST_REGISTRY, { colors: ['blue'] }).total).toBe(1)
    expect(queryHighlights([entry], TEST_REGISTRY, { colors: ['yellow'] }).total).toBe(0)
    expect(queryHighlights([entry], TEST_REGISTRY, { tags: ['x'] }).total).toBe(1)
    expect(queryHighlights([entry], TEST_REGISTRY, { tags: ['y'] }).total).toBe(0)
  })
})
