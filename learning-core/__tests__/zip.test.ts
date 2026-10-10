import { describe, expect, it } from 'vitest'
import { buildZip } from '../zip'

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

  it('rejects a file or entry count that ZIP32 cannot represent', async () => {
    const huge = new Blob()
    Object.defineProperty(huge, 'size', { value: 0x1_0000_0000 })
    await expect(buildZip([{ name: 'too-large.bin', data: huge }])).rejects.toThrow(/ZIP32/)
    await expect(buildZip(Array.from({ length: 65_536 }, (_, i) => ({ name: String(i), data: new Uint8Array() })))).rejects.toThrow(/ZIP32/)
  })
})
