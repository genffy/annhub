import { describe, expect, it } from 'vitest'
import { canonicalJson, sha256Hex, fragmentWireHash, toFragmentWire, MAX_IMAGE_BYTES } from '../wire'
import { createFragment } from '../factory'
import { makeFragment, EXCERPT, NOW, VERIFIED } from './helpers'

describe('canonicalJson (wire contract, mirrored in Swift)', () => {
  it('sorts object keys and emits no whitespace', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('escapes quotes, backslashes and newlines with short escapes', () => {
    expect(canonicalJson('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"')
  })

  it('renders integers as digits and rounds non-integers to 6 decimals with trailing zeros trimmed', () => {
    expect(canonicalJson({ n: 5 })).toBe('{"n":5}')
    expect(canonicalJson({ rect: [0.5, 0.25, 0.123456789, 0.1] })).toBe('{"rect":[0.5,0.25,0.123457,0.1]}')
    expect(canonicalJson({ x: 0.5 })).toBe('{"x":0.5}')
  })

  it('preserves array order and handles nested structures', () => {
    expect(canonicalJson({ list: [{ z: 1, a: [true, null] }] })).toBe('{"list":[{"a":[true,null],"z":1}]}')
  })

  it('treats undefined like JSON.stringify: omitted from objects, null in arrays', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}')
    expect(canonicalJson({ list: [1, undefined, 3] })).toBe('{"list":[1,null,3]}')
    expect(canonicalJson({ nested: { gone: undefined } })).toBe('{"nested":{}}')
    // The canonical form is exactly what survives a trip over the wire.
    const value = { a: undefined, b: [undefined, { c: undefined, d: 'x' }] }
    expect(canonicalJson(value)).toBe(canonicalJson(JSON.parse(JSON.stringify(value))))
  })

  it('still refuses what JSON cannot carry', () => {
    expect(() => canonicalJson(undefined)).toThrow('unsupported value undefined')
    expect(() => canonicalJson(() => 1)).toThrow('unsupported value function')
  })
})

describe('toFragmentWire (storage.md §8)', () => {
  it('strips review state from the delivery payload', () => {
    const wire = toFragmentWire(makeFragment())
    expect('review' in wire).toBe(false)
    expect(wire.captureRevision).toBe(1)
    expect(wire.schemaVersion).toBe(4)
  })
})

describe('a fragment as the capture UI saves it', () => {
  // Standard mode has no 理解, and a page can lack a title: the record then carries `guess` and
  // `sourceTitle` as own properties whose value is undefined — and so does a copy read back from
  // IndexedDB (structured clone keeps them). It must still be deliverable.
  const captured = () =>
    createFragment<'concept'>({
      kind: 'concept',
      content: 'hawkish pivot',
      context: { excerpt: EXCERPT, sourceUrl: 'https://www.wsj.com/a', sourceHost: 'wsj.com', sourceTitle: undefined, locator: { type: 'none' } },
      processing: { guess: undefined, verified: { ...VERIFIED }, use: '在下周的宏观复盘里用它解释债券抛售。' },
      detail: {},
      tags: [],
      now: NOW,
    })

  it('really has undefined-valued keys (the premise of the regression)', () => {
    const record = structuredClone(captured())
    expect('guess' in record.processing).toBe(true)
    expect(record.processing.guess).toBeUndefined()
    expect('sourceTitle' in record.context).toBe(true)
  })

  it('can be wired and hashed, and hashes like the JSON the Desktop receives', async () => {
    const record = structuredClone(captured())
    const wire = toFragmentWire(record)
    const hash = await fragmentWireHash(wire)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    // The Desktop hashes the tree it decoded from the request body.
    expect(hash).toBe(await fragmentWireHash(JSON.parse(JSON.stringify(wire))))
    // And the same record with those keys absent is the same delivery.
    const bare = structuredClone(record) as typeof record
    delete (bare.processing as { guess?: string }).guess
    delete (bare.context as { sourceTitle?: string }).sourceTitle
    expect(hash).toBe(await fragmentWireHash(toFragmentWire(bare)))
  })
})

describe('sha256Hex', () => {
  it('matches the FIPS-180 test vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes canonical wire JSON deterministically', async () => {
    const f = makeFragment()
    const first = await fragmentWireHash(toFragmentWire(f))
    const second = await fragmentWireHash(toFragmentWire({ ...f, review: { ...f.review, easeFactor: 1.9 } }))
    expect(first).toBe(second) // review never affects the wire hash
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('delivery constants', () => {
  it('shares the image byte ceiling between ends', () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024)
  })
})
