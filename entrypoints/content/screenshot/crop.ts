/**
 * Crop math for the screenshot chain (docs/v2/screenshot.md).
 * Selection rects come from a fixed-position overlay, so they are already in
 * viewport CSS coordinates; the captured PNG's pixels are device pixels.
 */

export interface ViewportRect {
  x: number
  y: number
  width: number
  height: number
}

/** A rect clamped to the source image, in image (device) pixels. */
export interface CropSource {
  sx: number
  sy: number
  sw: number
  sh: number
}

export class CropError extends Error {}

/**
 * Convert a viewport-CSS selection rect to source-image coordinates.
 * Clamps to the image bounds; throws on degenerate (zero-area) selections
 * after clamping.
 */
export function computeCropSource(selection: ViewportRect, devicePixelRatio: number, imageWidth: number, imageHeight: number): CropSource {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
  const x0 = Math.max(0, Math.round(Math.min(selection.x, selection.x + selection.width) * dpr))
  const y0 = Math.max(0, Math.round(Math.min(selection.y, selection.y + selection.height) * dpr))
  const x1 = Math.min(imageWidth, Math.round(Math.max(selection.x, selection.x + selection.width) * dpr))
  const y1 = Math.min(imageHeight, Math.round(Math.max(selection.y, selection.y + selection.height) * dpr))
  const sw = x1 - x0
  const sh = y1 - y0
  if (sw <= 0 || sh <= 0) {
    throw new CropError('选区为空或完全在屏幕外')
  }
  return { sx: x0, sy: y0, sw, sh }
}

/** Intersect two rects; returns null when they do not overlap. */
export function intersectRects(a: ViewportRect, b: ViewportRect): ViewportRect | null {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.width, b.x + b.width)
  const y1 = Math.min(a.y + a.height, b.y + b.height)
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
