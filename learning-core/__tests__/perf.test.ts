/**
 * Query performance benchmark (roadmap R1.4): 10k synthetic fragments through
 * the shared in-memory query path. The 200ms target in docs/v2/search.md is
 * for Desktop's first screen; this guards the extension's worst case — a
 * full in-memory scan — with a generous CI-safe bound and logs the timing.
 */
import { describe, expect, it } from 'vitest'
import { runFragmentQuery } from '../query'
import { createFragment } from '../factory'
import { VERIFIED } from './helpers'

const NOW = 1_769_000_000_000

function synth(count: number): ReturnType<typeof createFragment>[] {
  const fragments = []
  for (let i = 0; i < count; i++) {
    fragments.push(
      createFragment({
        kind: 'concept',
        content: `concept ${i} about markets`,
        context: {
          excerpt: `context sentence number ${i} mentioning concept ${i} about markets and rates.`,
          sourceUrl: `https://host${i % 50}.example.com/a/${i}`,
          sourceHost: `host${i % 50}.example.com`,
          locator: { type: 'none' },
        },
        processing: { verified: { ...VERIFIED }, use: `用于复盘 ${i}。` },
        detail: {},
        tags: [`t${i % 20}`, 'bench'],
        now: NOW - i * 1000,
      }),
    )
  }
  return fragments
}

describe('10k fragment query benchmark', () => {
  const pool = synth(10_000)

  it('plain filter query stays fast', () => {
    const started = performance.now()
    const result = runFragmentQuery(pool, { kinds: ['concept'], limit: 50 })
    const elapsed = performance.now() - started
    console.log(`[bench] 10k plain filter: ${elapsed.toFixed(1)}ms (${result.total} hits)`)
    expect(result.items).toHaveLength(50)
    expect(elapsed).toBeLessThan(400)
  })

  it('weighted search stays fast', () => {
    const started = performance.now()
    const result = runFragmentQuery(pool, { search: 'concept markets', tags: ['bench'], limit: 50 })
    const elapsed = performance.now() - started
    console.log(`[bench] 10k weighted search+filter: ${elapsed.toFixed(1)}ms (${result.total} hits)`)
    expect(result.total).toBeGreaterThan(100)
    expect(elapsed).toBeLessThan(600)
  })

  it('deep pagination stays stable', () => {
    const started = performance.now()
    let cursor: string | undefined
    let pages = 0
    let total = 0
    do {
      const page = runFragmentQuery(pool, { limit: 50, cursor })
      total += page.items.length
      cursor = page.nextCursor
      pages++
    } while (cursor && pages < 250)
    const elapsed = performance.now() - started
    console.log(`[bench] 10k full pagination (${pages} pages): ${elapsed.toFixed(1)}ms`)
    expect(total).toBe(10_000)
    expect(elapsed).toBeLessThan(1_500)
  })
})
