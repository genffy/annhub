import { describe, expect, it } from 'vitest'
import { STITCH_CAPS, bytesPerPixelFromSegment, canvasOffsets, estimateEntryBytes, expectedSegmentCount, stitchStopCondition, stitchedHeightPx } from '../stitch'

/**
 * screenshot.md §1.5's numbers: how many screens a page takes, where each
 * segment lands on the canvas (whole device pixels, so a fractional dpr
 * never blurs a seam), and which stop condition fires first — bottom, 30
 * screens, the ~40 MP area cap (D-49), the browser's 65535-pixel edge
 * (market.md §4.7) or the library's 10 MB (Q-03), estimated from the first
 * segment's real PNG weight.
 */

describe('expectedSegmentCount', () => {
  it('counts the screens a page takes at the step size', () => {
    // 5000 CSS px of page below the first screen, step = 720 - 40 = 680
    expect(expectedSegmentCount(5000, 680)).toBe(8)
    expect(expectedSegmentCount(1, 680)).toBe(1)
    expect(expectedSegmentCount(0, 680)).toBe(1)
  })
})

describe('canvasOffsets', () => {
  it('places each segment at its distance from the first screen, in device pixels', () => {
    const offsets = canvasOffsets([1000, 1620, 2240], 1000, 2)
    expect(offsets).toEqual([0, 1240, 2480])
  })

  it('rounds whole device pixels at a fractional ratio, so seams stay sharp', () => {
    // dpr 1.25: a scroll of 680.5 CSS px is 850.625 device px — one rounded value, no drift
    const offsets = canvasOffsets([0, 680.5, 1361], 0, 1.25)
    expect(offsets).toEqual([0, 851, 1701])
    // each offset is rounded from the exact scroll position, not accumulated
    expect(offsets[2]).toBe(Math.round(1361 * 1.25))
  })

  it('is exact at dpr 1', () => {
    expect(canvasOffsets([0, 300, 600], 0, 1)).toEqual([0, 300, 600])
  })
})

describe('stitchedHeightPx', () => {
  it('is the deepest segment end', () => {
    expect(stitchedHeightPx([0, 680, 1360], [720, 720, 500])).toBe(1860)
  })

  it('keeps the height when the last scroll went less far than the step', () => {
    expect(stitchedHeightPx([0, 680], [720, 300])).toBe(980)
  })
})

describe('stitchStopCondition', () => {
  const base = { atBottom: false, segmentCount: 1, widthPx: 1600, stitchedHeightPx: 900, estimatedEntryBytes: 1000 }

  it('stops at the page bottom first', () => {
    expect(stitchStopCondition({ ...base, atBottom: true })).toBe('bottom')
  })

  it('stops at 30 screens', () => {
    expect(stitchStopCondition({ ...base, segmentCount: STITCH_CAPS.maxSegments })).toBe('segments')
    expect(stitchStopCondition({ ...base, segmentCount: STITCH_CAPS.maxSegments - 1 })).toBeNull()
  })

  it('stops at the pixel area cap (D-49: about 40 MP)', () => {
    expect(stitchStopCondition({ ...base, widthPx: 1600, stitchedHeightPx: 25_000 })).toBe('area')
    expect(stitchStopCondition({ ...base, widthPx: 1600, stitchedHeightPx: 24_000 })).toBeNull()
  })

  it('stops at the browser canvas edge of 65535 device px (market.md §4.7)', () => {
    // a narrow canvas: the area cap must not fire before the height edge
    expect(stitchStopCondition({ ...base, widthPx: 600, stitchedHeightPx: STITCH_CAPS.maxHeightPx })).toBe('height')
  })

  it('stops when the projected entry size reaches the library cap (Q-03)', () => {
    expect(stitchStopCondition({ ...base, estimatedEntryBytes: STITCH_CAPS.maxEntryBytes })).toBe('entry')
    expect(stitchStopCondition({ ...base, estimatedEntryBytes: STITCH_CAPS.maxEntryBytes - 1 })).toBeNull()
  })
})

describe('bytesPerPixelFromSegment / estimateEntryBytes', () => {
  it('weighs a segment by its own pixels', () => {
    expect(bytesPerPixelFromSegment(900_000, 1600, 900)).toBeCloseTo(0.625)
    expect(bytesPerPixelFromSegment(0, 0, 0)).toBeGreaterThan(0)
  })

  it('projects the stitched picture from the first segment weight', () => {
    expect(estimateEntryBytes(0.5, 1600, 720)).toBe(576_000)
  })
})
