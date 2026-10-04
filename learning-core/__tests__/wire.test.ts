import { describe, expect, it } from 'vitest'
import { canonicalJson, sha256Hex, fragmentWireHash, toFragmentWire, MAX_IMAGE_BYTES } from '../wire'
import { makeFragment } from './helpers'

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
})

describe('toFragmentWire (storage.md §8)', () => {
  it('strips review state from the delivery payload', () => {
    const wire = toFragmentWire(makeFragment())
    expect('review' in wire).toBe(false)
    expect(wire.captureRevision).toBe(1)
    expect(wire.schemaVersion).toBe(4)
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

describe('undefined members (a fragment saved without the optional understanding)', () => {
  it('are absent from canonical JSON, like in JSON.stringify and in Swift', async () => {
    expect(canonicalJson({ b: 1, a: undefined, c: { d: undefined, e: 'x' } })).toBe('{"b":1,"c":{"e":"x"}}')
    const withUndefined = makeFragment()
    const processing = withUndefined.processing as { guess?: string }
    processing.guess = undefined
    const without = structuredClone(withUndefined)
    delete (without.processing as { guess?: string }).guess
    expect('guess' in withUndefined.processing).toBe(true)
    expect(await fragmentWireHash(toFragmentWire(withUndefined))).toBe(await fragmentWireHash(toFragmentWire(without)))
  })

  it('hash exactly what the request body carries', async () => {
    const f = makeFragment()
    ;(f.processing as { guess?: string }).guess = undefined
    const wire = toFragmentWire(f)
    const received = JSON.parse(JSON.stringify(wire)) // what Desktop parses from the PUT body
    expect(await fragmentWireHash(wire)).toBe(await fragmentWireHash(received))
  })

  it('still reject values that are not JSON at all', () => {
    expect(() => canonicalJson({ a: () => 1 })).toThrow('unsupported')
    expect(() => canonicalJson([undefined])).toThrow('unsupported')
  })
})
