import { describe, expect, it } from 'vitest'
import { mosaicBlockSize, pixelateRegion, type PixelBuffer } from '../mosaic'

function buffer(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

function pixel(buf: PixelBuffer, x: number, y: number): [number, number, number, number] {
  const i = (y * buf.width + x) * 4
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2], buf.data[i + 3]]
}

describe('pixelateRegion', () => {
  it('replaces each block with its average color', () => {
    // 4x4, left half black (0) right half white (255), block 2 → columns 0-1 black, 2-3 white
    const buf = buffer(4, 4, x => (x < 2 ? [0, 0, 0] : [255, 255, 255]))
    pixelateRegion(buf, { x: 0, y: 0, width: 4, height: 4 }, 2)
    for (let y = 0; y < 4; y++) {
      expect(pixel(buf, 0, y).slice(0, 3)).toEqual([0, 0, 0])
      expect(pixel(buf, 1, y).slice(0, 3)).toEqual([0, 0, 0])
      expect(pixel(buf, 2, y).slice(0, 3)).toEqual([255, 255, 255])
      expect(pixel(buf, 3, y).slice(0, 3)).toEqual([255, 255, 255])
    }
  })

  it('averages mixed blocks', () => {
    // block of 4 px: three 0s and one 100 → avg 25
    const buf = buffer(2, 2, (x, y) => (x === 1 && y === 1 ? [100, 100, 100] : [0, 0, 0]))
    pixelateRegion(buf, { x: 0, y: 0, width: 2, height: 2 }, 2)
    expect(pixel(buf, 0, 0).slice(0, 3)).toEqual([25, 25, 25])
    expect(pixel(buf, 1, 1).slice(0, 3)).toEqual([25, 25, 25])
  })

  it('leaves alpha untouched and pixels outside the region alone', () => {
    const buf = buffer(4, 2, x => (x < 2 ? [10, 10, 10] : [200, 200, 200]))
    buf.data[3] = 128
    pixelateRegion(buf, { x: 0, y: 0, width: 2, height: 2 }, 2)
    expect(pixel(buf, 0, 0)[3]).toBe(128)
    expect(pixel(buf, 2, 0).slice(0, 3)).toEqual([200, 200, 200])
  })

  it('handles partial edge blocks and clamps out-of-buffer regions', () => {
    // region starts past a block boundary; width not a multiple of block size
    const buf = buffer(5, 1, x => [x * 10, 0, 0])
    pixelateRegion(buf, { x: 1, y: 0, width: 3, height: 1 }, 2)
    // block A covers x=1..2 → (10+20)/2=15; block B covers x=3 only (clamped) → 30
    expect(pixel(buf, 1, 0)[0]).toBe(15)
    expect(pixel(buf, 2, 0)[0]).toBe(15)
    expect(pixel(buf, 3, 0)[0]).toBe(30)
    // x=0 and x=4 untouched
    expect(pixel(buf, 0, 0)[0]).toBe(0)
    expect(pixel(buf, 4, 0)[0]).toBe(40)
  })

  it('is a no-op for blockSize <= 1', () => {
    const buf = buffer(2, 2, x => [x, 0, 0])
    const before = new Uint8ClampedArray(buf.data)
    pixelateRegion(buf, { x: 0, y: 0, width: 2, height: 2 }, 1)
    expect([...buf.data]).toEqual([...before])
  })
})

describe('mosaicBlockSize', () => {
  it('scales ~10 css px by dpr with a floor of 4', () => {
    expect(mosaicBlockSize(1)).toBe(10)
    expect(mosaicBlockSize(2)).toBe(20)
    expect(mosaicBlockSize(0.25)).toBe(4)
    expect(mosaicBlockSize(0)).toBe(10) // invalid dpr treated as 1
  })
})
