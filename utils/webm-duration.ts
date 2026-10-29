/**
 * WebM duration repair — annotate.md §2.2 (格式：常见播放器能打开并拖动进度条).
 *
 * A MediaRecorder WebM carries no usable Segment duration: the muxer never
 * goes back to write the Info > Duration element it reserved, so players
 * cannot show a length or seek. The recording knows its exact length, so the
 * fix is to write it into the file. When the Duration element already exists
 * as a 4- or 8-byte float, the value is patched in place — the byte length of
 * every element after it is untouched, and the SeekHead's absolute offsets,
 * which point at the Cues, stay valid. When it is missing or has another
 * size, the header is rebuilt without the SeekHead (players find the Cues by
 * scanning the top level anyway).
 *
 * Pure byte surgery, no dependencies: the unit tests build minimal EBML
 * fixtures by hand and read the result back the same way.
 */

/**
 * EBML element: the id in its encoded form (an EBML id IS a vint — its marker
 * bits are part of the id as written, so ids are compared as bytes, never
 * decoded to numbers) plus its payload's place in the source buffer.
 */
interface EbmlElement {
  id: Uint8Array
  /** Offset of the payload in the source buffer. */
  dataOffset: number
  /** Payload length in bytes. */
  dataLength: number
  /** Offset of the whole element (id byte included). */
  elementOffset: number
  /** Total bytes: id + size vint + payload. */
  totalLength: number
}

const idsEqual = (a: Uint8Array, b: readonly number[]): boolean => a.length === b.length && b.every((byte, index) => a[index] === byte)

/** Reads an EBML variable-length integer; returns the value and its byte length. */
function readVint(buffer: Uint8Array, offset: number): { value: number; length: number } | null {
  if (offset >= buffer.length) return null
  const first = buffer[offset]!
  if (first === 0) return null
  let length = 1
  let mask = 0x80
  while (length <= 8 && !(first & mask)) {
    mask >>= 1
    length++
  }
  if (length > 8 || offset + length > buffer.length) return null
  let value = first & (mask - 1)
  let allOnes = value === mask - 1
  for (let index = 1; index < length; index++) {
    const byte = buffer[offset + index]!
    value = value * 256 + byte
    allOnes = allOnes && byte === 0xff
  }
  // the all-ones marker means "unknown size"
  return { value: allOnes ? Number.MAX_SAFE_INTEGER : value, length }
}

/** Reads the children of a master element until the buffer ends. Tolerant: stops at the first bad vint. */
function readChildren(buffer: Uint8Array, start: number, end: number): EbmlElement[] {
  const children: EbmlElement[] = []
  let offset = start
  while (offset < end) {
    const id = readVint(buffer, offset)
    if (!id) break
    const size = readVint(buffer, offset + id.length)
    if (!size) break
    const dataOffset = offset + id.length + size.length
    const dataLength = size.value === Number.MAX_SAFE_INTEGER ? end - dataOffset : size.value
    if (dataOffset + dataLength > end) break
    children.push({ id: buffer.subarray(offset, offset + id.length), dataOffset, dataLength, elementOffset: offset, totalLength: dataOffset + dataLength - offset })
    offset = dataOffset + dataLength
  }
  return children
}

const ID_SEGMENT = [0x18, 0x53, 0x80, 0x67]
const ID_INFO = [0x15, 0x49, 0xa9, 0x66]
const ID_TIMECODE_SCALE = [0x2a, 0xd7, 0xb1]
const ID_DURATION = [0x44, 0x89]

function findUint(buffer: Uint8Array, element: EbmlElement): number {
  let value = 0
  for (let index = 0; index < element.dataLength; index++) value = value * 256 + buffer[element.dataOffset + index]!
  return value
}

/** Writes a big-endian uint into a fresh buffer. */
function uintBytes(value: number, length: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let index = length - 1; index >= 0; index--) {
    out[index] = value % 256
    value = Math.floor(value / 256)
  }
  return out
}

/** Writes a big-endian float32 or float64. */
function floatBytes(value: number, length: 4 | 8): Uint8Array {
  const view = new DataView(new ArrayBuffer(length))
  if (length === 4) view.setFloat32(0, value)
  else view.setFloat64(0, value)
  return new Uint8Array(view.buffer)
}

/** A vint size marker for `length` payload bytes, shortest form. */
function sizeVint(length: number): Uint8Array {
  let bits = 1
  let marker = 0x80
  while (bits < 8 && length >= 2 ** (7 * bits)) {
    bits++
    marker >>= 1
  }
  const bytes = uintBytes(length, bits)
  bytes[0] = (bytes[0]! | marker) & 0xff
  return bytes
}

function elementBytes(id: readonly number[], payload: Uint8Array): Uint8Array {
  const head = Uint8Array.from(id)
  const size = sizeVint(payload.length)
  const out = new Uint8Array(head.length + size.length + payload.length)
  out.set(head, 0)
  out.set(size, head.length)
  out.set(payload, head.length + size.length)
  return out
}

/** Concatenates byte arrays. */
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** An Info element rebuilt from its children with Duration forced in. */
function rebuildInfo(children: EbmlElement[], buffer: Uint8Array, durationTicks: number): Uint8Array {
  const parts: Uint8Array[] = []
  let durationWritten = false
  for (const child of children) {
    if (idsEqual(child.id, ID_DURATION)) continue
    if (!durationWritten && !idsEqual(child.id, ID_TIMECODE_SCALE)) {
      parts.push(elementBytes(ID_DURATION, floatBytes(durationTicks, 8)))
      durationWritten = true
    }
    parts.push(buffer.subarray(child.elementOffset, child.elementOffset + child.totalLength))
  }
  if (!durationWritten) parts.push(elementBytes(ID_DURATION, floatBytes(durationTicks, 8)))
  return elementBytes(ID_INFO, concat(parts))
}

/**
 * Writes `durationMs` into the WebM's Segment > Info > Duration. Returns the
 * repaired bytes, or the input untouched when the buffer is not a WebM this
 * understands — a recording that cannot be patched still downloads.
 */
export function fixWebmDuration(input: Uint8Array, durationMs: number): Uint8Array {
  if (input.length < 4 || input[0] !== 0x1a || input[1] !== 0x45 || input[2] !== 0xdf || input[3] !== 0xa3) return input
  const topLevel = readChildren(input, 0, input.length)
  const segment = topLevel.find(element => idsEqual(element.id, ID_SEGMENT))
  if (!segment) return input

  const segmentChildren = readChildren(input, segment.dataOffset, segment.dataOffset + segment.dataLength)
  const info = segmentChildren.find(element => idsEqual(element.id, ID_INFO))
  if (!info) return input

  const infoChildren = readChildren(input, info.dataOffset, info.dataOffset + info.dataLength)
  const scaleElement = infoChildren.find(element => idsEqual(element.id, ID_TIMECODE_SCALE))
  const timecodeScale = scaleElement ? findUint(input, scaleElement) : 1_000_000
  const durationTicks = Math.max(0, Math.round((durationMs * 1_000_000) / timecodeScale))

  const duration = infoChildren.find(element => idsEqual(element.id, ID_DURATION))
  if (duration && (duration.dataLength === 4 || duration.dataLength === 8)) {
    // in place: same byte length, so every offset after — the SeekHead's — stays true
    const valueBytes = floatBytes(durationTicks, duration.dataLength as 4 | 8)
    const out = input.slice()
    out.set(valueBytes, duration.dataOffset)
    return out
  }
  if (duration && duration.dataLength === 0) {
    // a zero-length Duration is a placeholder; widen it to a float64 and shift what follows
    const newInfo = rebuildInfo(infoChildren, input, durationTicks)
    const before = input.subarray(0, info.elementOffset)
    const after = input.subarray(info.elementOffset + info.totalLength)
    return concat([before, newInfo, after])
  }
  if (!duration) {
    const newInfo = rebuildInfo(infoChildren, input, durationTicks)
    const before = input.subarray(0, info.elementOffset)
    const after = input.subarray(info.elementOffset + info.totalLength)
    return concat([before, newInfo, after])
  }
  return input
}
