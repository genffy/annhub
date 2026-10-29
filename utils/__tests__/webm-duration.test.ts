import { describe, expect, it } from 'vitest'
import { fixWebmDuration } from '../webm-duration'

/**
 * The recorder knows its exact length; the WebM does not (annotate.md §2.2).
 * The patcher writes the duration into Segment > Info without moving bytes
 * the SeekHead points at. The fixtures here are minimal EBML files built by
 * hand, read back through an independent tiny parser.
 */

const EBML_HEADER = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x42])

function uintPayload(value: number, length: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let index = length - 1; index >= 0; index--) {
    out[index] = value % 256
    value = Math.floor(value / 256)
  }
  return out
}

/** One EBML element: id bytes + one-byte size vint (fixtures stay under 127 payload bytes). */
function element(id: number[], payload: Uint8Array): Uint8Array {
  if (payload.length >= 128) throw new Error('fixture sizes must stay under 128 bytes')
  return new Uint8Array([...id, 0x80 | payload.length, ...payload])
}

function infoElement({ timecodeScale = 1_000_000, duration, durationSize = 8 }: { timecodeScale?: number; duration?: number; durationSize?: 4 | 8 }): Uint8Array {
  const parts: Uint8Array[] = [element([0x2a, 0xd7, 0xb1], uintPayload(timecodeScale, 3))]
  if (duration !== undefined) {
    const view = new DataView(new ArrayBuffer(durationSize))
    if (durationSize === 8) view.setFloat64(0, duration)
    else view.setFloat32(0, duration)
    parts.push(element([0x44, 0x89], new Uint8Array(view.buffer)))
  }
  return element([0x15, 0x49, 0xa9, 0x66], new Uint8Array(parts.reduce((all, part) => [...all, ...part], [] as number[])))
}

function segment(info: Uint8Array, trailer: Uint8Array = new Uint8Array(), { seekHead = false } = {}): Uint8Array {
  const payload = new Uint8Array([...info, ...trailer])
  // unknown-size Segment, what MediaRecorder writes: size vint 01 ff×7
  return new Uint8Array([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...(seekHead ? seekHeadElement() : []), ...payload])
}

/** A SeekHead element: absolute offsets that any byte shift after Info invalidates. */
function seekHeadElement(): Uint8Array {
  return element([0x11, 0x4d, 0x9b, 0xac], uintPayload(0xabcdef, 4))
}

function hasSeekHead(bytes: Uint8Array): boolean {
  for (let at = 0; at < bytes.length - 4; at++) {
    if (bytes[at] === 0x11 && bytes[at + 1] === 0x4d && bytes[at + 2] === 0x9b && bytes[at + 3] === 0xac) return true
  }
  return false
}

/** An independent reader: walks top level and Info, returns the Duration's ticks and the TimecodeScale. */
function durationOf(bytes: Uint8Array): { ticks: number; scale: number } | null {
  const readSize = (at: number): { value: number; length: number } | null => {
    const first = bytes[at]
    if (first === undefined || first === 0) return null
    let length = 1
    let mask = 0x80
    while (length <= 8 && !(first & mask)) {
      mask >>= 1
      length++
    }
    if (length > 8) return null
    let value = first & (mask - 1)
    const allOnes = value === mask - 1
    for (let index = 1; index < length; index++) {
      const byte = bytes[at + index]
      if (byte === undefined) return null
      value = value * 256 + byte
    }
    return { value: allOnes ? -1 : value, length }
  }
  const find = (start: number, end: number, id: number[]): { offset: number; size: number } | null => {
    let at = start
    while (at < end) {
      // the id's own vint sets the stride: count its leading one bits
      const first = bytes[at]
      if (first === undefined || first === 0) return null
      let idLength = 1
      let idMask = 0x80
      while (idLength <= 8 && !(first & idMask)) {
        idMask >>= 1
        idLength++
      }
      const size = readSize(at + idLength)
      if (!size) return null
      if (idLength === id.length && id.every((byte, index) => bytes[at + index] === byte)) return { offset: at + idLength + size.length, size: size.value }
      if (size.value < 0) return null // unknown-size element: nothing after it in these fixtures
      at += idLength + size.length + size.value
    }
    return null
  }
  const seg = find(0, bytes.length, [0x18, 0x53, 0x80, 0x67])
  if (!seg) return null
  const info = find(seg.offset, bytes.length, [0x15, 0x49, 0xa9, 0x66])
  if (!info) return null
  const scaleEl = find(info.offset, info.offset + info.size, [0x2a, 0xd7, 0xb1])
  const scale = scaleEl ? (bytes[scaleEl.offset]! << 16) | (bytes[scaleEl.offset + 1]! << 8) | bytes[scaleEl.offset + 2]! : 1_000_000
  const durationEl = find(info.offset, info.offset + info.size, [0x44, 0x89])
  if (!durationEl) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset + durationEl.offset, durationEl.size)
  return { ticks: durationEl.size === 8 ? view.getFloat64(0) : view.getFloat32(0), scale }
}

describe('fixWebmDuration', () => {
  it('patches a placeholder Duration in place, byte for byte elsewhere', () => {
    const trailer = new Uint8Array(40).map((_, index) => (index * 7 + 3) & 0xff)
    const original = new Uint8Array([...EBML_HEADER, ...segment(infoElement({ duration: 0 })), ...trailer])
    const fixed = fixWebmDuration(original, 65_000)
    // same length: SeekHead offsets stay valid
    expect(fixed.length).toBe(original.length)
    const read = durationOf(fixed)
    expect(read?.scale).toBe(1_000_000)
    expect(read?.ticks).toBe(65_000)
    // the bytes after the Info element — where a SeekHead would live — are untouched
    expect([...fixed.subarray(fixed.length - trailer.length)]).toEqual([...trailer])
  })

  it('patches a float32 Duration keeping its size', () => {
    const original = new Uint8Array([...EBML_HEADER, ...segment(infoElement({ duration: 0, durationSize: 4 }))])
    const fixed = fixWebmDuration(original, 90_000)
    expect(fixed.length).toBe(original.length)
    expect(durationOf(fixed)?.ticks).toBeCloseTo(90_000, 0)
  })

  it('inserts a Duration when the element is missing, after the TimecodeScale', () => {
    const original = new Uint8Array([...EBML_HEADER, ...segment(infoElement({}))])
    const fixed = fixWebmDuration(original, 120_000)
    const read = durationOf(fixed)
    expect(read?.ticks).toBe(120_000)
    expect(fixed.length).toBe(original.length + 2 + 1 + 8 /* the inserted Duration element: id, size, float64 */)
  })

  it('drops a stale SeekHead when the rebuild shifts bytes, keeps it when patching in place', () => {
    // MediaRecorder's Segment opens with a SeekHead whose offsets the insertion would invalidate
    const withSeekHead = new Uint8Array([...EBML_HEADER, ...segment(infoElement({}), new Uint8Array(), { seekHead: true })])
    const fixed = fixWebmDuration(withSeekHead, 120_000)
    expect(durationOf(fixed)?.ticks).toBe(120_000)
    expect(hasSeekHead(fixed)).toBe(false)

    // the in-place patch keeps every byte where it was, SeekHead included
    const patched = fixWebmDuration(new Uint8Array([...EBML_HEADER, ...segment(infoElement({ duration: 0 }), new Uint8Array(), { seekHead: true })]), 30_000)
    expect(hasSeekHead(patched)).toBe(true)
    expect(durationOf(patched)?.ticks).toBe(30_000)
  })

  it('respects a non-default TimecodeScale', () => {
    const original = new Uint8Array([...EBML_HEADER, ...segment(infoElement({ timecodeScale: 50_000 }))])
    const fixed = fixWebmDuration(original, 1_000)
    // 1 s = 1e9 ns / 50 000 ns per tick = 20 000 ticks
    expect(durationOf(fixed)?.ticks).toBe(20_000)
  })

  it('leaves a file alone that is not a WebM', () => {
    const notWebm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(fixWebmDuration(notWebm, 1_000)).toBe(notWebm)
  })
})
