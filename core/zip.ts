/**
 * Minimal store-only (uncompressed) ZIP writer — the Markdown export format
 * (docs/product/storage.md §6) needs no compression and no dependency. Produces
 * spec-conformant local headers + central directory + EOCD so Obsidian & co
 * can read the archive. ZIP64 structures are written only when a limit of
 * ZIP32 is reached (RV-CORE-10, D-95): the entry count reaching 65,535, a size
 * or an offset reaching 4 GB, or the central directory's size or offset
 * leaving 32 bits — an archive inside the limits is byte-identical to the
 * plain ZIP32 writer. The layout (every entry's offset and ZIP64 need) is a
 * pure function over names and sizes, so tests can fake 5 GB files without
 * faking bytes. Environment-neutral: consumes/produces bytes only.
 *
 * Field rules follow the PKWARE APPNOTE (4.3.14, 4.3.15, 4.5.3): a field that
 * no longer fits — a value equal to the limit counts as not fitting, because
 * 0xFFFFFFFF (0xFFFF for counts) read from a 32-bit field means "see ZIP64" —
 * carries that marker, the real value lives in the 0x0001 extra field, and an
 * entry touched by ZIP64 needs version 45.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function crc32Blob(blob: Blob): Promise<number> {
  let crc = 0xffffffff
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    const chunk = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer())
    for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array | Blob
}

export const ZIP32_MAX = 0xffffffff
export const ZIP16_MAX = 0xffff

interface CentralRecord {
  nameBytes: Uint8Array
  crc: number
  size: number
  offset: number
  dosTime: number
  dosDate: number
  zip64: boolean
}

function dosDateTime(epochMs: number): { time: number; date: number } {
  const d = new Date(epochMs)
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

// ── The layout: offsets and ZIP64 needs, before any byte moves (RV-CORE-10) ──

/** One entry's place in the archive, as the planner computed it. */
export interface ZipLayoutEntry {
  nameBytes: Uint8Array
  size: number
  offset: number
  /** The entry's size or its own offset left ZIP32 behind: extra fields carry the real values. */
  zip64: boolean
}

export interface ZipLayout {
  entries: ZipLayoutEntry[]
  centralStart: number
  centralSize: number
  archiveSize: number
  /** The ZIP64 EOCD + locator join the tail when the count or any offset leaves ZIP32. */
  zip64Eocd: boolean
}

const LOCAL_EXTRA_SIZE = 4 + 16 // 0x0001 header + uncompressed(8) + compressed(8)
const ZIP64_EOCD_SIZE = 56
const ZIP64_LOCATOR_SIZE = 20
const EOCD_SIZE = 22

/** The central header's 0x0001 extra holds only the fields whose 32-bit place reads 0xFFFFFFFF, in APPNOTE 4.5.3's order: the two sizes, then the offset. */
function centralExtraSize(entry: { size: number; offset: number }): number {
  const sizes = entry.size >= ZIP32_MAX ? 16 : 0
  const offsetField = entry.offset >= ZIP32_MAX ? 8 : 0
  return sizes + offsetField > 0 ? 4 + sizes + offsetField : 0
}

/** The pure layout pass: every entry's offset, ZIP64 need, and the archive's sizes. Throws past what ZIP64 cannot express. */
export function planZipLayout(items: { nameBytes: Uint8Array; size: number }[]): ZipLayout {
  const entries: ZipLayoutEntry[] = []
  let offset = 0
  let anyZip64 = items.length >= ZIP16_MAX
  for (const item of items) {
    if (!Number.isSafeInteger(item.size) || item.size < 0) throw new Error('ZIP64 limit exceeded: file size')
    const zip64 = item.size >= ZIP32_MAX || offset >= ZIP32_MAX
    anyZip64 ||= zip64
    entries.push({ nameBytes: item.nameBytes, size: item.size, offset, zip64 })
    offset += 30 + item.nameBytes.length + (item.size >= ZIP32_MAX ? LOCAL_EXTRA_SIZE : 0) + item.size
    if (!Number.isSafeInteger(offset)) throw new Error('ZIP64 limit exceeded: archive size')
  }
  const centralStart = offset
  for (const entry of entries) {
    offset += 46 + entry.nameBytes.length + centralExtraSize(entry)
    if (!Number.isSafeInteger(offset)) throw new Error('ZIP64 limit exceeded: archive size')
  }
  const centralSize = offset - centralStart
  // the plain EOCD overflows on its own too: the entry count, or the central directory's size or offset
  const zip64Eocd = anyZip64 || centralSize >= ZIP32_MAX || centralStart >= ZIP32_MAX
  if (zip64Eocd) offset += ZIP64_EOCD_SIZE + ZIP64_LOCATOR_SIZE
  return { entries, centralStart, centralSize, archiveSize: offset + EOCD_SIZE, zip64Eocd }
}

// ── The writers: pure bytes from a layout record ─────────────────────────────

export function localHeader(entry: { nameBytes: Uint8Array; size: number; offset: number; zip64: boolean }, crc: number, time: number, date: number): Uint8Array {
  const sizes64 = entry.size >= ZIP32_MAX
  const bytes = new Uint8Array(30 + entry.nameBytes.length + (sizes64 ? LOCAL_EXTRA_SIZE : 0))
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, entry.zip64 ? 45 : 20, true) // version needed
  view.setUint16(6, 0x0800, true) // UTF-8 filenames
  view.setUint16(8, 0, true) // store method
  view.setUint16(10, time, true)
  view.setUint16(12, date, true)
  view.setUint32(14, crc, true)
  view.setUint32(18, sizes64 ? ZIP32_MAX : entry.size, true)
  view.setUint32(22, sizes64 ? ZIP32_MAX : entry.size, true)
  view.setUint16(26, entry.nameBytes.length, true)
  view.setUint16(28, sizes64 ? LOCAL_EXTRA_SIZE : 0, true)
  bytes.set(entry.nameBytes, 30)
  if (sizes64) {
    const extra = new DataView(bytes.buffer, 30 + entry.nameBytes.length, LOCAL_EXTRA_SIZE)
    extra.setUint16(0, 0x0001, true)
    extra.setUint16(2, 16, true)
    extra.setBigUint64(4, BigInt(entry.size), true)
    extra.setBigUint64(12, BigInt(entry.size), true)
  }
  return bytes
}

export function centralHeader(entry: { nameBytes: Uint8Array; size: number; offset: number; zip64: boolean }, crc: number, time: number, date: number): Uint8Array {
  const sizes64 = entry.size >= ZIP32_MAX
  const offset64 = entry.offset >= ZIP32_MAX
  const extraSize = centralExtraSize(entry)
  const bytes = new Uint8Array(46 + entry.nameBytes.length + extraSize)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true) // version made by
  view.setUint16(6, entry.zip64 ? 45 : 20, true) // version needed
  view.setUint16(8, 0x0800, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, time, true)
  view.setUint16(14, date, true)
  view.setUint32(16, crc, true)
  view.setUint32(20, sizes64 ? ZIP32_MAX : entry.size, true)
  view.setUint32(24, sizes64 ? ZIP32_MAX : entry.size, true)
  view.setUint16(28, entry.nameBytes.length, true)
  view.setUint16(30, extraSize, true) // extra len
  view.setUint16(32, 0, true) // comment len
  view.setUint16(34, 0, true) // disk number
  view.setUint16(36, 0, true) // internal attrs
  view.setUint32(38, 0, true) // external attrs
  view.setUint32(42, offset64 ? ZIP32_MAX : entry.offset, true)
  bytes.set(entry.nameBytes, 46)
  if (extraSize > 0) {
    // only the fields that read 0xFFFFFFFF go into the extra, in APPNOTE 4.5.3's order:
    // the two sizes, then the offset — a reader walks the same list, one 8-byte field per 0xFFFFFFFF it met
    const extra = new DataView(bytes.buffer, 46 + entry.nameBytes.length, extraSize)
    extra.setUint16(0, 0x0001, true)
    extra.setUint16(2, extraSize - 4, true)
    let at = 4
    if (sizes64) {
      extra.setBigUint64(at, BigInt(entry.size), true)
      extra.setBigUint64(at + 8, BigInt(entry.size), true)
      at += 16
    }
    if (offset64) extra.setBigUint64(at, BigInt(entry.offset), true)
  }
  return bytes
}

export function zip64EndOfCentral(layout: ZipLayout): Uint8Array {
  const bytes = new Uint8Array(ZIP64_EOCD_SIZE)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x06064b50, true)
  view.setBigUint64(4, BigInt(ZIP64_EOCD_SIZE - 12), true) // size of the remainder of this record
  view.setUint16(12, 45, true) // version made by
  view.setUint16(14, 45, true) // version needed
  view.setUint32(16, 0, true) // this disk
  view.setUint32(20, 0, true) // disk with the central directory
  view.setBigUint64(24, BigInt(layout.entries.length), true)
  view.setBigUint64(32, BigInt(layout.entries.length), true)
  view.setBigUint64(40, BigInt(layout.centralSize), true)
  view.setBigUint64(48, BigInt(layout.centralStart), true)
  return bytes
}

export function zip64Locator(layout: ZipLayout): Uint8Array {
  const bytes = new Uint8Array(ZIP64_LOCATOR_SIZE)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x07064b50, true)
  view.setUint32(4, 0, true) // disk with the ZIP64 EOCD
  view.setBigUint64(8, BigInt(layout.centralStart + layout.centralSize), true) // the ZIP64 EOCD's own offset
  view.setUint32(16, 1, true) // total disks
  return bytes
}

export function endOfCentral(layout: ZipLayout): Uint8Array {
  const count64 = layout.entries.length >= ZIP16_MAX
  const bytes = new Uint8Array(EOCD_SIZE)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, count64 ? ZIP16_MAX : layout.entries.length, true)
  view.setUint16(10, count64 ? ZIP16_MAX : layout.entries.length, true)
  view.setUint32(12, layout.centralSize >= ZIP32_MAX ? ZIP32_MAX : layout.centralSize, true)
  view.setUint32(16, layout.centralStart >= ZIP32_MAX ? ZIP32_MAX : layout.centralStart, true)
  return bytes
}

export async function buildZip(entries: ZipEntry[], exportedAt = Date.now()): Promise<Blob> {
  const { time, date } = dosDateTime(exportedAt)
  // the layout is computed from names and sizes alone, before any byte of data moves
  const layout = planZipLayout(
    entries.map(entry => {
      const nameBytes = new TextEncoder().encode(entry.name)
      if (nameBytes.length > ZIP16_MAX) throw new Error('ZIP name limit exceeded: file name')
      const size = entry.data instanceof Blob ? entry.data.size : entry.data.length
      return { nameBytes, size }
    }),
  )
  const records: CentralRecord[] = []
  const parts: BlobPart[] = []
  for (const [index, entry] of entries.entries()) {
    const placed = layout.entries[index]!
    const crc = entry.data instanceof Blob ? await crc32Blob(entry.data) : crc32(entry.data)
    parts.push(localHeader(placed, crc, time, date) as BlobPart, entry.data as BlobPart)
    records.push({ nameBytes: placed.nameBytes, crc, size: placed.size, offset: placed.offset, dosTime: time, dosDate: date, zip64: placed.zip64 })
  }
  for (const record of records) parts.push(centralHeader(record, record.crc, time, date) as BlobPart)
  if (layout.zip64Eocd) {
    parts.push(zip64EndOfCentral(layout) as BlobPart, zip64Locator(layout) as BlobPart)
  }
  parts.push(endOfCentral(layout) as BlobPart)
  return new Blob(parts, { type: 'application/zip' })
}
