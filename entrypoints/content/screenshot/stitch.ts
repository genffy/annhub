/**
 * Scrolling long screenshot — the plan and the seams (screenshot.md §1.5).
 *
 * The stitcher photographs the page screen by screen while it scrolls, and
 * assembles the shots at their actual scroll positions. Everything numeric
 * that a unit test wants lives here: how many screens a page should take,
 * where each segment lands on the final canvas (rounded to whole device
 * pixels, so a fractional device pixel ratio never blurs a seam), and which
 * of the stop conditions fires first — the page bottom, the 30-screen cap,
 * the ~40-megapixel area cap (D-49), the browser's 65535-pixel canvas edge
 * (market.md §4.7) or the library's 10 MB entry size (Q-03), estimated from
 * the first segment's real PNG weight.
 */

/** The caps of screenshot.md §1.5, in one place. */
export const STITCH_CAPS = {
  /** 30 screens. */
  maxSegments: 30,
  /** About 40 million pixels (D-49): normal screens reach 30 first, a Retina screen about nine. */
  maxAreaPx: 40_000_000,
  /** The browser draws nothing on a canvas side longer than this (market.md §4.7). */
  maxHeightPx: 65_535,
  /** The library takes a single image of at most 10 MB (Q-03). */
  maxEntryBytes: 10 * 1024 * 1024,
} as const

/** Each screen scrolls this much less than the viewport, leaving a band of overlap the seam hides in. */
export const STITCH_OVERLAP_CSS = 40

/** The screens a page of `scrollablePx` takes, at `stepPx` of fresh page per screen. */
export function expectedSegmentCount(scrollablePx: number, stepPx: number): number {
  if (scrollablePx <= 0 || stepPx <= 0) return 1
  return Math.max(1, Math.ceil(scrollablePx / stepPx))
}

/**
 * Where each segment lands on the final canvas, in device pixels: its
 * distance from the first screen, rounded once from the actual scroll
 * position, so no seam drifts by a fraction of a pixel at dpr 1.25 or 2.2.
 */
export function canvasOffsets(scrollPositionsCss: readonly number[], startYCss: number, dpr: number): number[] {
  return scrollPositionsCss.map(position => Math.round((position - startYCss) * dpr))
}

/** The stitched canvas's device height: the deepest segment's end. */
export function stitchedHeightPx(offsets: readonly number[], segmentHeightsPx: readonly number[]): number {
  let height = 0
  offsets.forEach((offset, index) => {
    height = Math.max(height, offset + (segmentHeightsPx[index] ?? 0))
  })
  return height
}

export type StitchStop = 'bottom' | 'segments' | 'area' | 'height' | 'entry'

/** The condition to stop on after the segment that was just captured — `null` keeps stitching. */
export function stitchStopCondition(state: { atBottom: boolean; segmentCount: number; widthPx: number; stitchedHeightPx: number; estimatedEntryBytes: number }): StitchStop | null {
  const { atBottom, segmentCount, widthPx, stitchedHeightPx, estimatedEntryBytes } = state
  if (atBottom) return 'bottom'
  if (segmentCount >= STITCH_CAPS.maxSegments) return 'segments'
  if (widthPx * stitchedHeightPx >= STITCH_CAPS.maxAreaPx) return 'area'
  if (stitchedHeightPx >= STITCH_CAPS.maxHeightPx) return 'height'
  if (estimatedEntryBytes >= STITCH_CAPS.maxEntryBytes) return 'entry'
  return null
}

/**
 * The entry size is estimated from the first segment's real PNG weight — a
 * page of photographs weighs far more per pixel than a page of text — so the
 * stitcher stops before the library would refuse the image.
 */
export function bytesPerPixelFromSegment(segmentPngBytes: number, segmentWidthPx: number, segmentHeightPx: number): number {
  const pixels = segmentWidthPx * segmentHeightPx
  if (pixels <= 0) return 0.35
  return segmentPngBytes / pixels
}

/** The projected entry size of the stitched picture so far. */
export function estimateEntryBytes(bytesPerPixel: number, widthPx: number, heightPx: number): number {
  return Math.round(bytesPerPixel * widthPx * heightPx)
}
