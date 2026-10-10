/**
 * Minimal store-only (uncompressed) ZIP writer — the Markdown export format
 * (docs/v2/storage.md §6) needs no compression and no dependency. Produces
 * spec-conformant local headers + central directory + EOCD so Obsidian & co
 * can read the archive. Environment-neutral: consumes/produces bytes only.
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

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function crc32Blob(blob: Blob): Promise<number> {
  let crc = 0xffffffff
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    const chunk = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer())
    for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array | Blob
}

const ZIP32_MAX = 0xffffffff
const ZIP16_MAX = 0xffff

function assertZip32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value > ZIP32_MAX) throw new Error(`ZIP32 limit exceeded: ${label}`)
}

interface CentralRecord {
  nameBytes: Uint8Array
  crc: number
  size: number
  offset: number
  dosTime: number
  dosDate: number
}

function dosDateTime(epochMs: number): { time: number; date: number } {
  const d = new Date(epochMs)
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

function localHeader(rec: CentralRecord): Uint8Array {
  const bytes = new Uint8Array(30 + rec.nameBytes.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true) // version needed
  view.setUint16(6, 0x0800, true) // UTF-8 filenames
  view.setUint16(8, 0, true) // store method
  view.setUint16(10, rec.dosTime, true)
  view.setUint16(12, rec.dosDate, true)
  view.setUint32(14, rec.crc, true)
  view.setUint32(18, rec.size, true)
  view.setUint32(22, rec.size, true)
  view.setUint16(26, rec.nameBytes.length, true)
  view.setUint16(28, 0, true)
  bytes.set(rec.nameBytes, 30)
  return bytes
}

function centralHeader(rec: CentralRecord): Uint8Array {
  const bytes = new Uint8Array(46 + rec.nameBytes.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true) // version made by
  view.setUint16(6, 20, true) // version needed
  view.setUint16(8, 0x0800, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, rec.dosTime, true)
  view.setUint16(14, rec.dosDate, true)
  view.setUint32(16, rec.crc, true)
  view.setUint32(20, rec.size, true)
  view.setUint32(24, rec.size, true)
  view.setUint16(28, rec.nameBytes.length, true)
  view.setUint16(30, 0, true) // extra len
  view.setUint16(32, 0, true) // comment len
  view.setUint16(34, 0, true) // disk number
  view.setUint16(36, 0, true) // internal attrs
  view.setUint32(38, 0, true) // external attrs
  view.setUint32(42, rec.offset, true)
  bytes.set(rec.nameBytes, 46)
  return bytes
}

export async function buildZip(entries: ZipEntry[], exportedAt = Date.now()): Promise<Blob> {
  if (entries.length > ZIP16_MAX) throw new Error('ZIP32 limit exceeded: entry count')
  const parts: BlobPart[] = []
  const records: CentralRecord[] = []
  let offset = 0
  const { time, date } = dosDateTime(exportedAt)

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name)
    if (nameBytes.length > ZIP16_MAX) throw new Error('ZIP32 limit exceeded: file name')
    const size = entry.data instanceof Blob ? entry.data.size : entry.data.length
    assertZip32(size, 'file size')
    assertZip32(offset + 30 + nameBytes.length + size, 'local data offset')
    const crc = entry.data instanceof Blob ? await crc32Blob(entry.data) : crc32(entry.data)
    const rec: CentralRecord = { nameBytes, crc, size, offset, dosTime: time, dosDate: date }
    parts.push(localHeader(rec) as BlobPart, entry.data as BlobPart)
    records.push(rec)
    offset += 30 + nameBytes.length + size
  }

  const centralStart = offset
  for (const rec of records) {
    const header = centralHeader(rec)
    assertZip32(offset + header.length, 'central directory offset')
    parts.push(header as BlobPart)
    offset += header.length
  }

  assertZip32(offset - centralStart, 'central directory size')
  assertZip32(offset + 22, 'archive size')

  const eocd = new Uint8Array(22)
  const view = new DataView(eocd.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, records.length, true)
  view.setUint16(10, records.length, true)
  view.setUint32(12, offset - centralStart, true)
  view.setUint32(16, centralStart, true)
  parts.push(eocd as BlobPart)

  return new Blob(parts, { type: 'application/zip' })
}
