import { describe, expect, it } from 'vitest'
import { normalizeContent, normalizeHost, dedupeKeyOf, dedupeTags } from '../normalize'
import { makeFragment } from './helpers'

describe('normalizeContent (fragments.md §6)', () => {
  it('applies NFKC, case folding, quote/dash folding, whitespace collapse and punctuation trim in order', () => {
    expect(normalizeContent('  Hello—World!! ')).toBe('hello-world')
    expect(normalizeContent('ＦＵＬＬｗｉｄｔｈ')).toBe('fullwidth')
    expect(normalizeContent('curly ‘quotes’ and “double”')).toBe("curly 'quotes' and \"double") // trailing punctuation is trimmed
    expect(normalizeContent('a\n\t b')).toBe('a b')
  })
})

describe('normalizeHost', () => {
  it('lowercases and strips only www.', () => {
    expect(normalizeHost('https://WWW.Example.com/path')).toBe('example.com')
    expect(normalizeHost('https://mobile.twitter.com/x')).toBe('mobile.twitter.com')
  })
})

describe('dedupeKeyOf (fragments.md §6)', () => {
  it('combines normalized content, sourceUrl and normalized excerpt', () => {
    const a = dedupeKeyOf('Hawkish Pivot!', 'https://a.com/x', '…the Hawkish  pivot era…')
    const b = dedupeKeyOf('hawkish pivot', 'https://a.com/x', 'the hawkish pivot era')
    expect(a).toBe(b)
  })
})

describe('dedupeTags', () => {
  it('lowercases, trims, drops empties and caps at 20', () => {
    expect(dedupeTags(['Fed', 'fed', ' ', 'Macro'])).toEqual(['fed', 'macro'])
    expect(
      dedupeTags(
        Array(25)
          .fill(0)
          .map((_, i) => `t${i}`),
      ).length,
    ).toBe(20)
  })
})

describe('record helpers', () => {
  it('makeFragment produces a valid v4 record', () => {
    const f = makeFragment()
    expect(f.normalizedContent).toBe(normalizeContent(f.content))
    expect(dedupeKeyOf(f.content, f.context.sourceUrl, f.context.excerpt)).toContain('hawkish pivot')
  })
})
