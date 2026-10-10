import { describe, expect, it } from 'vitest'
import { composeGeometry, constrainToRatio, downloadExtension, downloadMime, matteOnWhite, ratioOf, watermarkBox, PADDING_PX } from '../output'

const VIEW = { width: 1280, height: 800 }

describe('ratio-locked selection geometry (screenshot.md §1.3, §6)', () => {
  it('locks each preset to its ratio from the same drag', () => {
    const anchor = { x: 100, y: 100 }
    const point = { x: 500, y: 300 }
    for (const id of ['1:1', '4:5', '3:4', '4:3', '16:9', '9:16']) {
      const rect = constrainToRatio(anchor, point, id, VIEW)
      expect(Math.abs(rect.width / rect.height - ratioOf(id)!.w / ratioOf(id)!.h)).toBeLessThan(0.01)
      expect(rect.x).toBe(100)
      expect(rect.y).toBe(100)
    }
  })

  it('keeps the locked box inside the viewport when the drag leaves it', () => {
    const rect = constrainToRatio({ x: 1200, y: 700 }, { x: 1400, y: 790 }, '9:16', VIEW)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(VIEW.width)
    expect(rect.y + rect.height).toBeLessThanOrEqual(VIEW.height)
    expect(Math.abs(rect.width / rect.height - 9 / 16)).toBeLessThan(0.01)
  })

  it('supports dragging up-left from the anchor', () => {
    const rect = constrainToRatio({ x: 500, y: 500 }, { x: 300, y: 400 }, '1:1', VIEW)
    expect(rect.x).toBe(300)
    expect(rect.y).toBe(300)
    expect(rect.width).toBeCloseTo(rect.height, 5)
  })

  it('free (no preset) keeps the raw rectangle', () => {
    const rect = constrainToRatio({ x: 10, y: 10 }, { x: 300, y: 90 }, 'free', VIEW)
    expect(rect).toEqual({ x: 10, y: 10, width: 290, height: 80 })
  })
})

describe('watermark layout (screenshot.md §4.3, §6)', () => {
  const canvas = { width: 1200, height: 600 }

  it('places the four corners with a margin', () => {
    const tl = watermarkBox(canvas, { position: 'top-left', size: 'medium' })
    const br = watermarkBox(canvas, { position: 'bottom-right', size: 'medium' })
    expect(tl.x).toBe(tl.margin)
    expect(tl.y).toBe(tl.margin)
    expect(br.x).toBe(canvas.width - br.margin)
    expect(br.y).toBe(canvas.height - br.margin)
  })

  it('sizes the three tiers proportionally to the short edge', () => {
    const small = watermarkBox(canvas, { position: 'top-left', size: 'small' })
    const medium = watermarkBox(canvas, { position: 'top-left', size: 'medium' })
    const large = watermarkBox(canvas, { position: 'top-left', size: 'large' })
    expect(small.fontSize).toBe(Math.round(600 * 0.028))
    expect(medium.fontSize).toBe(Math.round(600 * 0.04))
    expect(large.fontSize).toBe(Math.round(600 * 0.056))
  })
})

describe('beautify composition (screenshot.md §4.4, §6)', () => {
  const content = { width: 800, height: 400 }

  it('free output is content plus symmetric padding', () => {
    const geo = composeGeometry(content, { enabled: true, background: 'solid-white', padding: 'medium', radius: 12, shadow: false })
    expect(geo.canvas).toEqual({ width: 800 + PADDING_PX.medium * 2, height: 400 + PADDING_PX.medium * 2 })
    expect(geo.content).toEqual({ x: PADDING_PX.medium, y: PADDING_PX.medium, width: 800, height: 400 })
  })

  it('a preset ratio pads beyond the padding without cropping the content', () => {
    const geo = composeGeometry(content, { enabled: true, background: 'grad-purple', padding: 'small', radius: 24, shadow: true, ratio: '1:1' })
    expect(Math.abs(geo.canvas.width / geo.canvas.height - 1)).toBeLessThan(0.01)
    expect(geo.canvas.height).toBeGreaterThanOrEqual(content.height + PADDING_PX.small * 2)
    expect(geo.content.width).toBe(800)
    // centered
    expect(geo.content.x).toBe((geo.canvas.width - 800) / 2)
    expect(geo.content.y).toBe((geo.canvas.height - 400) / 2)
  })

  it('the same inputs always produce the same output size', () => {
    const settings = { enabled: true, background: 'solid-ivory', padding: 'large', radius: 0, shadow: false, ratio: '16:9' } as const
    expect(composeGeometry(content, settings)).toEqual(composeGeometry(content, settings))
  })

  it('padding scales with the device pixel ratio', () => {
    const geo = composeGeometry(content, { enabled: true, background: 'none', padding: 'small', radius: 0, shadow: false }, 2)
    expect(geo.canvas).toEqual({ width: 800 + PADDING_PX.small * 4, height: 400 + PADDING_PX.small * 4 })
  })
})

describe('download formats (screenshot.md §4.2)', () => {
  it('maps formats to mime types and file extensions', () => {
    expect(downloadMime('png')).toBe('image/png')
    expect(downloadMime('jpeg')).toBe('image/jpeg')
    expect(downloadMime('webp')).toBe('image/webp')
    expect(downloadExtension('png')).toBe('png')
    expect(downloadExtension('jpeg')).toBe('jpg')
    expect(downloadExtension('webp')).toBe('webp')
  })
})

describe('JPEG matting (screenshot.md §4.2)', () => {
  function fakeDocument() {
    const calls: string[] = []
    const ctx = {
      fillStyle: '',
      fillRect: (x: number, y: number, width: number, height: number) => calls.push(`fillRect ${ctx.fillStyle} ${x},${y} ${width}x${height}`),
      drawImage: () => calls.push('drawImage'),
    }
    const created: { width: number; height: number }[] = []
    const doc = {
      createElement: () => {
        const canvas = { width: 0, height: 0, getContext: () => ctx }
        created.push(canvas)
        return canvas
      },
    } as unknown as Document
    return { doc, calls, created }
  }

  it("paints the whole canvas white before the image, at the image's size", () => {
    const { doc, calls, created } = fakeDocument()
    const out = matteOnWhite({ width: 640, height: 360 } as HTMLCanvasElement, doc)
    expect(out).toBe(created[0])
    expect(out).toMatchObject({ width: 640, height: 360 })
    // white first, the picture on top: transparent pixels end up white, opaque ones are untouched
    expect(calls).toEqual(['fillRect #ffffff 0,0 640x360', 'drawImage'])
  })
})
