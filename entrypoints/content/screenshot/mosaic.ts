/**
 * Pixelate ("mosaic") masking over raw pixel buffers — docs/v2/screenshot.md.
 * Operates on an ImageData-like structure so it is testable in
 * jsdom without a canvas 2D context; the UI layer only provides
 * getImageData/putImageData.
 */

export interface PixelBuffer {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * Pixelate one region of `buffer` in place by block-averaging RGB (alpha is
 * preserved). Region is clamped to the buffer; partial blocks at the edges
 * average only the covered pixels. blockSize <= 1 is a no-op.
 */
export function pixelateRegion(buffer: PixelBuffer, region: { x: number; y: number; width: number; height: number }, blockSize: number): void {
  const size = Math.max(1, Math.round(blockSize))
  if (size <= 1) return
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.min(buffer.width, Math.ceil(region.x + region.width))
  const y1 = Math.min(buffer.height, Math.ceil(region.y + region.height))

  for (let by = y0; by < y1; by += size) {
    for (let bx = x0; bx < x1; bx += size) {
      const ex = Math.min(bx + size, x1)
      const ey = Math.min(by + size, y1)
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * buffer.width + x) * 4
          r += buffer.data[i]
          g += buffer.data[i + 1]
          b += buffer.data[i + 2]
          count++
        }
      }
      if (count === 0) continue
      r = Math.round(r / count)
      g = Math.round(g / count)
      b = Math.round(b / count)
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * buffer.width + x) * 4
          buffer.data[i] = r
          buffer.data[i + 1] = g
          buffer.data[i + 2] = b
        }
      }
    }
  }
}

/** Block size in device pixels for a ~10 CSS px mosaic at the given dpr. */
export function mosaicBlockSize(devicePixelRatio: number): number {
  return Math.max(4, Math.round(10 * (devicePixelRatio > 0 ? devicePixelRatio : 1)))
}
