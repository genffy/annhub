import { describe, expect, it } from 'vitest'
import { computeCropSource, CropError, intersectRects } from '../crop'

describe('computeCropSource', () => {
  it('scales CSS selection by dpr into image coordinates', () => {
    const source = computeCropSource({ x: 100, y: 50, width: 200, height: 100 }, 2, 2000, 1500)
    expect(source).toEqual({ sx: 200, sy: 100, sw: 400, sh: 200 })
  })

  it('clamps to image bounds', () => {
    const source = computeCropSource({ x: 900, y: 700, width: 400, height: 400 }, 1, 1000, 800)
    expect(source).toEqual({ sx: 900, sy: 700, sw: 100, sh: 100 })
  })

  it('normalizes inverted drag directions (drag up-left)', () => {
    const source = computeCropSource({ x: 300, y: 200, width: -100, height: -80 }, 1, 1000, 800)
    expect(source).toEqual({ sx: 200, sy: 120, sw: 100, sh: 80 })
  })

  it('throws on degenerate selection after clamping', () => {
    expect(() => computeCropSource({ x: 0, y: 0, width: 0, height: 100 }, 1, 1000, 800)).toThrow(CropError)
    expect(() => computeCropSource({ x: 2000, y: 0, width: 100, height: 100 }, 1, 1000, 800)).toThrow(CropError)
  })

  it('treats non-positive dpr as 1', () => {
    const source = computeCropSource({ x: 10, y: 10, width: 20, height: 20 }, 0, 1000, 800)
    expect(source).toEqual({ sx: 10, sy: 10, sw: 20, sh: 20 })
  })
})

describe('intersectRects', () => {
  it('returns the overlap', () => {
    expect(intersectRects({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 50, width: 100, height: 100 })).toEqual({
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    })
  })

  it('returns null when disjoint or touching edges only', () => {
    expect(intersectRects({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 10, height: 10 })).toBeNull()
    expect(intersectRects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBeNull()
  })
})
