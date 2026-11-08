import { describe, expect, it } from 'vitest'
import { buildZip, centralHeader, endOfCentral, localHeader, planZipLayout, ZIP32_MAX, zip64EndOfCentral, zip64Locator, type ZipLayout } from '../zip'

/** Reads one ZipLayout back out of a built archive's EOCD, so big-archive assertions do not fake 5 GB bytes. */
function layoutOf(output: Uint8Array): ZipLayout {
  const view = new DataView(output.buffer)
  const eocdAt = output.byteLength - 22
  const centralSize = view.getUint32(eocdAt + 12, true)
  const centralStart = view.getUint32(eocdAt + 16, true)
  return { entries: [], centralStart, centralSize, archiveSize: output.byteLength, zip64Eocd: view.getUint32(eocdAt - 20, true) === 0x07064b50 }
}

describe('store-only ZIP limits and Blob input (RV-BG-05)', () => {
  it('streams Blob bytes without calling arrayBuffer on the whole asset', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const blob = new Blob([bytes])
    Object.defineProperty(blob, 'arrayBuffer', {
      value: () => {
        throw new Error('whole asset read')
      },
    })
    const zip = await buildZip([{ name: 'image.png', data: blob }], 0)
    const output = new Uint8Array(await zip.arrayBuffer())
    expect(output.slice(0, 4)).toEqual(new Uint8Array([80, 75, 3, 4]))
    expect(new DataView(output.buffer).getUint32(18, true)).toBe(bytes.length)
    expect(output.includes(137)).toBe(true)
  })
})

describe('ZIP64 when a ZIP32 limit is reached (RV-CORE-10, D-95)', () => {
  it('a small archive carries no ZIP64 signature or 0x0001 extra, byte for byte the plain ZIP32 layout', async () => {
    const zip = await buildZip(
      [
        { name: 'a.md', data: new Uint8Array([1, 2, 3]) },
        { name: 'assets/b.png', data: new Uint8Array([4]) },
      ],
      0,
    )
    const output = new Uint8Array(await zip.arrayBuffer())
    // no ZIP64 EOCD or locator signature anywhere
    const hasSignature = (sig: number): boolean => {
      const marker = [sig & 0xff, (sig >>> 8) & 0xff, (sig >>> 16) & 0xff, sig >>> 24]
      return output.some((_, index) => index + 4 <= output.length && marker.every((m, offset) => output[index + offset] === m))
    }
    for (const signature of [0x06064b50, 0x07064b50]) expect(hasSignature(signature)).toBe(false)
    // every local header: no extra field
    const view = new DataView(output.buffer)
    expect(view.getUint16(26, true)).toBe(4)
    expect(view.getUint16(28, true)).toBe(0)
    // the whole archive: local headers (30 + name) + data + central headers (46 + name) + the 22-byte EOCD
    const total = 30 + 4 + 3 + 30 + 12 + 1 + 46 + 4 + 46 + 12 + 22
    expect(output.byteLength).toBe(total)
    expect(layoutOf(output).zip64Eocd).toBe(false)
  })

  it('a file past 4 GB: the size fields read 0xFFFFFFFF and the 0x0001 extra carries the real size', () => {
    const size = ZIP32_MAX + 1024
    const [entry] = planZipLayout([{ nameBytes: new TextEncoder().encode('big.bin'), size }]).entries
    const view = new DataView(localHeader(entry!, 123, 0, 0).buffer)
    // the local header: version needed 45, sizes at 0xFFFFFFFF, the extra right behind the name
    expect(view.getUint16(4, true)).toBe(45)
    expect(view.getUint32(18, true)).toBe(ZIP32_MAX)
    expect(view.getUint32(22, true)).toBe(ZIP32_MAX)
    expect(view.getUint16(28, true)).toBe(20)
    expect(view.getUint16(30 + 7, true)).toBe(0x0001)
    expect(Number(view.getBigUint64(30 + 7 + 4, true))).toBe(size)
    expect(Number(view.getBigUint64(30 + 7 + 12, true))).toBe(size)
    const central = new DataView(centralHeader(entry!, 123, 0, 0).buffer)
    expect(central.getUint16(6, true)).toBe(45)
    expect(central.getUint32(20, true)).toBe(ZIP32_MAX)
    expect(Number(central.getBigUint64(46 + 7 + 4, true))).toBe(size)
  })

  it('an entry whose offset alone crosses: the extra holds only the offset, 8 bytes (RV-CORE-10)', () => {
    const first = ZIP32_MAX + 16
    const [a, b] = planZipLayout([
      { nameBytes: new TextEncoder().encode('first.bin'), size: first },
      { nameBytes: new TextEncoder().encode('second.bin'), size: 1 },
    ]).entries
    expect(a!.zip64).toBe(true)
    expect(b!.offset).toBe(30 + 9 + 20 + first)
    // its own sizes fit: the local header carries no extra, its size fields are real
    const local = new DataView(localHeader(b!, 7, 0, 0).buffer)
    expect(local.getUint16(28, true)).toBe(0)
    expect(local.getUint32(22, true)).toBe(1)
    const central = new DataView(centralHeader(b!, 7, 0, 0).buffer)
    expect(central.getUint32(20, true)).toBe(1)
    expect(central.getUint32(42, true)).toBe(ZIP32_MAX)
    // the extra is the 0x0001 header plus exactly one 8-byte field: the real offset
    expect(central.getUint16(30, true)).toBe(4 + 8)
    expect(central.getUint16(46 + 10, true)).toBe(0x0001)
    expect(central.getUint16(46 + 10 + 2, true)).toBe(8)
    expect(Number(central.getBigUint64(46 + 10 + 4, true))).toBe(b!.offset)
  })

  it('an entry whose size and offset both cross: the extra lists the two sizes, then the offset (RV-CORE-10)', () => {
    const size = ZIP32_MAX + 5
    const [, b] = planZipLayout([
      { nameBytes: new TextEncoder().encode('first.bin'), size },
      { nameBytes: new TextEncoder().encode('second.bin'), size },
    ]).entries
    expect(b!.zip64).toBe(true)
    const central = new DataView(centralHeader(b!, 7, 0, 0).buffer)
    expect(central.getUint16(30, true)).toBe(4 + 16 + 8)
    const at = 46 + 'second.bin'.length
    expect(Number(central.getBigUint64(at + 4, true))).toBe(size)
    expect(Number(central.getBigUint64(at + 12, true))).toBe(size)
    expect(Number(central.getBigUint64(at + 20, true))).toBe(b!.offset)
  })

  it('two files under 4 GB that together cross it: the directory starts past 4 GB and the ZIP64 tail joins (RV-CORE-10)', () => {
    const layout = planZipLayout([
      { nameBytes: new TextEncoder().encode('a.bin'), size: 3 * 2 ** 30 },
      { nameBytes: new TextEncoder().encode('b.bin'), size: 2 * 2 ** 30 },
    ])
    expect(
      layout.entries.every(entry => !entry.zip64),
      'no entry alone leaves ZIP32',
    ).toBe(true)
    expect(layout.centralStart).toBeGreaterThan(ZIP32_MAX)
    expect(layout.zip64Eocd).toBe(true)
    // the plain EOCD cannot say where the directory is; the locator points at the ZIP64 EOCD right behind it
    const eocd = new DataView(endOfCentral(layout).buffer)
    expect(eocd.getUint32(16, true)).toBe(ZIP32_MAX)
    const locator = new DataView(zip64Locator(layout).buffer)
    expect(Number(locator.getBigUint64(8, true))).toBe(layout.centralStart + layout.centralSize)
  })

  it('values sitting exactly on a ZIP32 limit go ZIP64: a 0xFFFFFFFF size or offset, 65,535 entries (RV-CORE-10)', () => {
    const atSize = planZipLayout([{ nameBytes: new TextEncoder().encode('at.bin'), size: ZIP32_MAX }]).entries[0]!
    expect(atSize.zip64).toBe(true)
    const local = new DataView(localHeader(atSize, 1, 0, 0).buffer)
    expect(local.getUint32(18, true)).toBe(ZIP32_MAX)
    expect(local.getUint16(28, true)).toBe(20)
    // an entry whose local header starts exactly at 0xFFFFFFFF: the marker and the value are the same, so the field must go 64-bit
    const layout = planZipLayout([
      { nameBytes: new TextEncoder().encode('first.bin'), size: ZIP32_MAX - 30 - 'first.bin'.length },
      { nameBytes: new TextEncoder().encode('second.bin'), size: 1 },
    ])
    const second = layout.entries[1]!
    expect(second.offset).toBe(ZIP32_MAX)
    expect(second.zip64).toBe(true)
    expect(new DataView(centralHeader(second, 1, 0, 0).buffer).getUint32(42, true)).toBe(ZIP32_MAX)
    // 65,535 entries exactly: the plain EOCD's count field would read 0xFFFF, so the ZIP64 tail joins
    const many = planZipLayout(Array.from({ length: 65_535 }, (_, index) => ({ nameBytes: new TextEncoder().encode(`e/${index}`), size: 1 })))
    expect(many.zip64Eocd).toBe(true)
    expect(new DataView(endOfCentral(many).buffer).getUint16(10, true)).toBe(0xffff)
  })

  it('the ZIP64 EOCD and the locator close a big archive, in that order, ahead of the plain EOCD', () => {
    const layout = planZipLayout(Array.from({ length: 65_536 }, (_, index) => ({ nameBytes: new TextEncoder().encode(`e/${index}`), size: 1 })))
    const tail = new Uint8Array(56 + 20 + 22)
    tail.set(zip64EndOfCentral(layout), 0)
    tail.set(zip64Locator(layout), 56)
    tail.set(endOfCentral(layout), 76)
    const view = new DataView(tail.buffer)
    expect(view.getUint32(0, true)).toBe(0x06064b50)
    expect(Number(view.getBigUint64(24, true))).toBe(65_536)
    expect(Number(view.getBigUint64(32, true))).toBe(65_536)
    expect(view.getUint32(56, true)).toBe(0x07064b50)
    expect(Number(view.getBigUint64(64, true))).toBe(layout.centralStart + layout.centralSize)
    expect(view.getUint32(76, true)).toBe(0x06054b50)
    expect(view.getUint16(84, true)).toBe(0xffff)
  })

  it('the pure layout plans faked sizes and offsets without any data', async () => {
    const layout = planZipLayout([
      { nameBytes: new TextEncoder().encode('a.bin'), size: ZIP32_MAX + 1 },
      { nameBytes: new TextEncoder().encode('b.bin'), size: 1 },
    ])
    expect(layout.entries[0]!.zip64).toBe(true)
    expect(layout.entries[1]!.zip64, 'its offset sits past 4 GB behind the big file').toBe(true)
    expect(layout.entries[1]!.offset).toBe(30 + 5 + 20 + ZIP32_MAX + 1)
    expect(layout.zip64Eocd).toBe(true)
    expect(() => planZipLayout([{ nameBytes: new TextEncoder().encode('x'), size: Number.MAX_SAFE_INTEGER + 1 }])).toThrow(/ZIP64/)
    await expect(buildZip([{ name: 'x'.repeat(65_536), data: new Uint8Array() }])).rejects.toThrow(/file name/)
  })
})
