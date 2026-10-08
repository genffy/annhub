import { describe, expect, it } from 'vitest'
import { isBlankText, normalizeHost, normalizeText, normalizedContains } from '../normalize'
import { cleanSourceUrl, isHttpUrl } from '../url'
import { normalizeTags, presetProperties, validatePropertyDefinition, validatePropertyName, validatePropertyValue } from '../properties'
import { EntryValidationError } from '../types'
import { makeClip, makeHighlight, makeScreenshot, TEST_REGISTRY } from './helpers'
import { mergeHighlight, validateEntry } from '../validate'

describe('normalizeText (entry.md §6)', () => {
  it('applies NFKC, lowercase, quote/dash unification, whitespace collapse, edge trim in order', () => {
    expect(normalizeText('  Ｆｕｌｌ—Width “quoted” text…  ')).toBe('full-width "quoted" text')
    expect(normalizeText('a\u00A0\u3000b\tc')).toBe('a b c')
    expect(normalizeText('„x”')).toBe('x') // „ ” are edge punctuation, trimmed
    expect(normalizeText('...trim, punct!')).toBe('trim, punct')
  })
  it('isBlankText detects whitespace-only strings', () => {
    expect(isBlankText(' \t\n\u00A0')).toBe(true)
    expect(isBlankText(' x ')).toBe(false)
  })
  it('normalizeHost lowercases and strips only www.', () => {
    expect(normalizeHost('https://WWW.Example.com/a')).toBe('example.com')
    expect(normalizeHost('https://mobile.example.com/a')).toBe('mobile.example.com')
  })
  it('normalizedContains compares through the shared normalization', () => {
    expect(normalizedContains('The TEAM applied it.', 'team applied')).toBe(true)
    expect(normalizedContains('another world', 'team')).toBe(false)
    expect(normalizedContains('anything', '')).toBe(true)
  })
})

describe('cleanSourceUrl (capture.md §5)', () => {
  it('strips token params from the query and keeps the rest', () => {
    expect(cleanSourceUrl('https://example.com/a?token=abc&x=1')).toBe('https://example.com/a?x=1')
    expect(cleanSourceUrl('https://example.com/a?code=42&utm_source=rss')).toBe('https://example.com/a?utm_source=rss')
  })
  it('matches names case-insensitively', () => {
    expect(cleanSourceUrl('https://example.com/a?Access_Token=z')).toBe('https://example.com/a')
  })
  it('cleans query-shaped parts inside the hash and keeps anchors', () => {
    expect(cleanSourceUrl('https://example.com/docs#/section?token=1&lang=en')).toBe('https://example.com/docs#/section?lang=en')
    expect(cleanSourceUrl('https://example.com/docs#installation')).toBe('https://example.com/docs#installation')
    expect(cleanSourceUrl('https://example.com/l#token=abc')).toBe('https://example.com/l')
  })
  it('drops emptied ? and #', () => {
    expect(cleanSourceUrl('https://example.com/a?token=1')).toBe('https://example.com/a')
    expect(cleanSourceUrl('https://example.com/a#/p?token=1')).toBe('https://example.com/a#/p')
  })
  it('leaves untouched URLs alone and survives garbage', () => {
    expect(cleanSourceUrl('https://example.com/a?b=1#x')).toBe('https://example.com/a?b=1#x')
    expect(cleanSourceUrl('not a url')).toBe('not a url')
  })
  it('isHttpUrl accepts only absolute http(s)', () => {
    expect(isHttpUrl('https://a.b/c')).toBe(true)
    expect(isHttpUrl('http://a.b/c')).toBe(true)
    expect(isHttpUrl('ftp://a.b/c')).toBe(false)
    expect(isHttpUrl('/relative')).toBe(false)
  })
})

describe('property registry rules (entry.md §5)', () => {
  it('rejects bad names: empty, >64 chars, newline, reserved, annhub_ prefix', () => {
    const expectInvalid = (name: string) => expect(() => validatePropertyName(name)).toThrow(EntryValidationError)
    expectInvalid('')
    expectInvalid('x'.repeat(65))
    expectInvalid('a\nb')
    expectInvalid('source')
    expectInvalid('annhub_id')
  })
  it('validates values per type with their limits', () => {
    expect(() => validatePropertyValue('text', 'x'.repeat(1001))).toThrow(EntryValidationError)
    expect(() => validatePropertyValue('list', ['a', 'a'])).toThrow(EntryValidationError) // dedup enforced
    expect(() =>
      validatePropertyValue(
        'list',
        new Array(51).fill(0).map((_, i) => `t${i}`),
      ),
    ).toThrow(EntryValidationError)
    expect(() => validatePropertyValue('number', Number.NaN)).toThrow(EntryValidationError)
    expect(() => validatePropertyValue('checkbox', 'yes')).toThrow(EntryValidationError)
    expect(() => validatePropertyValue('date', '2026-02-30')).toThrow(EntryValidationError) // must be a real date
    expect(() => validatePropertyValue('date', '2026-13-01')).toThrow(EntryValidationError)
    expect(() => validatePropertyValue('datetime', '2026-10-08T09:30:00+08:00')).toThrow(EntryValidationError) // no offset
    expect(() => validatePropertyValue('date', '2026-02-28')).not.toThrow()
  })
  it('locks built-ins to their definition', () => {
    expect(() => validatePropertyDefinition({ name: 'tags', type: 'text', builtin: true, presets: [] })).toThrow(EntryValidationError)
    expect(() => validatePropertyDefinition({ name: 'tags', type: 'list', builtin: false, presets: [] })).toThrow(EntryValidationError)
    expect(() => validatePropertyDefinition({ name: 'tags', type: 'list', builtin: true, presets: ['clip', 'screenshot'] })).not.toThrow()
  })
  it('normalizes tags: case-dedup, 1-32 chars, at most 20', () => {
    expect(normalizeTags(['Retry', 'retry', 'x'.repeat(33), ' ', 'ok'])).toEqual(['Retry', 'ok'])
    expect(normalizeTags(Array.from({ length: 25 }, (_, i) => `t${i}`))).toHaveLength(20)
  })
  it('presetProperties applies extraction → default → unset', () => {
    const registry = [
      ...TEST_REGISTRY.filter(def => def.name !== 'project'),
      { name: 'project', type: 'text' as const, builtin: false, presets: ['clip' as const], defaultValue: '支付重试' },
    ]
    const extracted = presetProperties('clip', registry, { title: 'From page', author: undefined })
    expect(extracted).toEqual({ title: 'From page', tags: undefined, project: '支付重试' })
    expect('tags' in extracted).toBe(false) // unset values are not stored
    expect(presetProperties('screenshot', registry, {})).toEqual({})
  })
})

describe('validateEntry (entry.md §6)', () => {
  it('accepts a well-formed clip with highlights and properties', () => {
    const clip = makeClip({
      highlights: [makeHighlight({ start: 0, end: 11, quote: 'Exponential' })],
      properties: { title: 'T', tags: ['a'], project: 'x', reviewed: true, rating: 5 },
    })
    expect(() => validateEntry(clip, TEST_REGISTRY)).not.toThrow()
  })
  it('rejects unknown types and bad content per type', () => {
    expect(() => validateEntry({ ...makeClip(), type: 'note' as never }, TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'ENTRY_TYPE_UNKNOWN' }))
    expect(() => validateEntry(makeClip({ content: '   ' }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'ENTRY_CONTENT_INVALID' }))
    expect(() => validateEntry(makeScreenshot({ content: 'nope' }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'ENTRY_CONTENT_INVALID' }))
  })
  it('checks context length and containment', () => {
    expect(() => validateEntry(makeClip({ context: 'x'.repeat(2001) }), TEST_REGISTRY)).toThrow()
    expect(() => validateEntry(makeClip({ context: 'nothing like the content' }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'ENTRY_CONTENT_INVALID' }))
  })
  it('checks asset presence per type', () => {
    expect(() => validateEntry(makeScreenshot({ assetId: undefined }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'ENTRY_ASSET_MISSING' }))
    expect(() => validateEntry(makeClip({ assetId: 'asset_x' }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'ENTRY_ASSET_MISSING' }))
  })
  it('checks source url/host consistency', () => {
    expect(() => validateEntry(makeClip({ sourceUrl: 'about:blank' }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'ENTRY_SOURCE_INVALID' }))
    expect(() => validateEntry(makeClip({ sourceHost: 'other.example.com' }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'ENTRY_SOURCE_INVALID' }))
  })
  it('validates highlight ranges, overlap, count and screenshot highlights', () => {
    expect(() => validateEntry(makeClip({ highlights: [makeHighlight({ start: 5, end: 3 })] }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'HIGHLIGHT_INVALID' }))
    expect(() =>
      validateEntry(
        makeClip({
          highlights: [makeHighlight({ start: 0, end: 10 }), makeHighlight({ id: makeHighlight({}).id, start: 5, end: 15 })],
        }),
        TEST_REGISTRY,
      ),
    ).toThrowError(expect.objectContaining({ code: 'HIGHLIGHT_INVALID' }))
    expect(() => validateEntry(makeClip({ highlights: Array.from({ length: 201 }, () => makeHighlight({ start: 0, end: 1 })) }), TEST_REGISTRY)).toThrowError(
      expect.objectContaining({ code: 'HIGHLIGHT_LIMIT_EXCEEDED' }),
    )
    expect(() => validateEntry(makeScreenshot({ highlights: [makeHighlight()] }) as never, TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'HIGHLIGHT_INVALID' }))
  })
  it('validates properties against the registry', () => {
    expect(() => validateEntry(makeClip({ properties: { nosuch: 'x' } }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'PROPERTY_NAME_INVALID' }))
    expect(() => validateEntry(makeClip({ properties: { project: ['a'] } }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'PROPERTY_VALUE_INVALID' }))
    expect(() => validateEntry(makeClip({ properties: { tags: new Array(21).fill(0).map((_, i) => `t${i}`) } }), TEST_REGISTRY)).toThrowError(
      expect.objectContaining({ code: 'PROPERTY_VALUE_INVALID' }),
    )
    expect(() => validateEntry(makeClip({ properties: { source: 'x' } as never }), TEST_REGISTRY)).toThrowError(expect.objectContaining({ code: 'PROPERTY_NAME_INVALID' }))
  })
})

describe('mergeHighlight (entry.md §4.6)', () => {
  it('unions ranges, keeps the earliest identity and joins notes with a blank line', () => {
    const early = makeHighlight({ start: 0, end: 10, note: 'first', createdAt: 1 })
    const late = makeHighlight({ start: 5, end: 20, note: 'second', createdAt: 2 })
    const [merged] = mergeHighlight([early], late)
    expect(merged).toMatchObject({ id: early.id, start: 0, end: 20, note: 'first\n\nsecond', createdAt: 1 })
  })
  it('appends non-overlapping additions', () => {
    const a = makeHighlight({ start: 0, end: 5 })
    const b = makeHighlight({ start: 10, end: 15 })
    expect(mergeHighlight([a], b)).toHaveLength(2)
  })
})
