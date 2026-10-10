import { describe, expect, it } from 'vitest'
import {
  applyBeautifyChange,
  backgroundCss,
  BEAUTIFY_BACKGROUND_IDS,
  BEAUTIFY_BACKGROUNDS,
  composeGeometry,
  constrainToRatio,
  decodeWatermarkImage,
  DEFAULT_BEAUTIFY,
  downloadExtension,
  downloadMime,
  gradientLine,
  matteOnWhite,
  paintBackground,
  paintBeautified,
  paintWatermark,
  PADDING_PX,
  placePanel,
  placeSizeLabel,
  previewBox,
  PREVIEW_RESERVE,
  SIZE_LABEL_ROOM,
  ratioOf,
  watermarkBox,
  watermarkLayout,
  type BeautifySettings,
  type Rect,
  type WatermarkImage,
  type WatermarkPosition,
} from '../output'

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

/** A canvas context that writes every call and every assignment down, in order. */
function recordingContext() {
  const log: string[] = []
  const state: Record<string, unknown> = {}
  const show = (value: unknown): string => (typeof value === 'number' ? String(Math.round(value * 100) / 100) : typeof value === 'object' ? '<gradient>' : String(value))
  const ctx = new Proxy(
    {},
    {
      get(_target, key: string) {
        if (key in state) return state[key]
        return (...args: unknown[]) => {
          log.push(`${key}(${args.map(show).join(', ')})`)
          return key === 'createLinearGradient' ? { addColorStop: (offset: number, color: string) => log.push(`stop(${offset}, ${color})`) } : undefined
        }
      },
      set(_target, key: string, value: unknown) {
        state[key] = value
        log.push(`${key} = ${show(value)}`)
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, log, state }
}

describe('beautify backgrounds (screenshot.md §4.4)', () => {
  it('are eight: none, two solids, five gradients — and only the dark one wants light ink', () => {
    expect(BEAUTIFY_BACKGROUND_IDS).toHaveLength(8)
    expect(BEAUTIFY_BACKGROUND_IDS.map(id => BEAUTIFY_BACKGROUNDS[id].paint.kind)).toEqual(['none', 'solid', 'solid', 'gradient', 'gradient', 'gradient', 'gradient', 'gradient'])
    expect(BEAUTIFY_BACKGROUND_IDS.filter(id => !BEAUTIFY_BACKGROUNDS[id].light)).toEqual(['grad-slate'])
  })

  it('are described as CSS for the swatches', () => {
    expect(backgroundCss('none')).toBe('transparent')
    expect(backgroundCss('solid-ivory')).toBe('#f6f1e7')
    expect(backgroundCss('grad-blue')).toBe('linear-gradient(135deg, #e3edfa, #c6d9f2)')
  })

  it('run a gradient from corner to corner at 135°, through the centre, at any aspect', () => {
    expect(gradientLine(100, 100, 135)).toEqual({ x0: expect.closeTo(0, 6), y0: expect.closeTo(0, 6), x1: expect.closeTo(100, 6), y1: expect.closeTo(100, 6) })
    const wide = gradientLine(200, 100, 135)
    expect([wide.x0, wide.y0, wide.x1, wide.y1].map(Math.round)).toEqual([25, -25, 175, 125])
    // the corners take the first and last colour: the top-left corner sits on the line's start, the bottom-right on its end
    const along = (x: number, y: number) => ((x - wide.x0) * (wide.x1 - wide.x0) + (y - wide.y0) * (wide.y1 - wide.y0)) / ((wide.x1 - wide.x0) ** 2 + (wide.y1 - wide.y0) ** 2)
    expect(along(0, 0)).toBeCloseTo(0, 6)
    expect(along(200, 100)).toBeCloseTo(1, 6)
    expect(gradientLine(300, 120, 90)).toEqual({ x0: expect.closeTo(0, 6), y0: expect.closeTo(60, 6), x1: expect.closeTo(300, 6), y1: expect.closeTo(60, 6) })
  })

  it('leave a transparent canvas alone', () => {
    const { ctx, log } = recordingContext()
    paintBackground(ctx, 400, 300, 'none')
    expect(log).toEqual([])
  })

  it('fill a solid over the whole canvas', () => {
    const { ctx, log } = recordingContext()
    paintBackground(ctx, 400, 300, 'solid-ivory')
    expect(log).toEqual(['fillStyle = #f6f1e7', 'fillRect(0, 0, 400, 300)'])
  })

  it('build a gradient out of its stops: a canvas ignores a CSS gradient string and would paint black', () => {
    const { ctx, log } = recordingContext()
    paintBackground(ctx, 400, 400, 'grad-purple')
    expect(log[0]).toMatch(/^createLinearGradient\(0, 0, 400, 400\)$/)
    expect(log.slice(1)).toEqual(['stop(0, #efe9fa)', 'stop(1, #d7c9f5)', 'fillStyle = <gradient>', 'fillRect(0, 0, 400, 400)'])
    for (const id of BEAUTIFY_BACKGROUND_IDS) {
      const painted = recordingContext()
      paintBackground(painted.ctx, 100, 100, id)
      expect(
        painted.log.filter(line => line.startsWith('fillStyle = ') && /gradient\(|#|rgb/.test(line) && line.includes('gradient(')),
        `${id} hands a CSS string to fillStyle`,
      ).toEqual([])
    }
  })
})

describe('the beautified picture (screenshot.md §4.4)', () => {
  const content = { width: 800, height: 400 }
  const settings: BeautifySettings = { enabled: true, background: 'solid-white', padding: 'medium', radius: 12, shadow: true }
  const image = {} as CanvasImageSource

  function paint(overrides: Partial<BeautifySettings> = {}, scale = 1) {
    const style = { ...settings, ...overrides }
    const geometry = composeGeometry(content, style, scale)
    const recorded = recordingContext()
    paintBeautified(recorded.ctx, image, geometry, style, scale)
    return { ...recorded, geometry }
  }

  it('draws the background, then the shadow, then the content clipped to its rounded rectangle', () => {
    const { log, geometry } = paint()
    const at = (prefix: string) => log.findIndex(line => line.startsWith(prefix))
    expect(geometry.content).toEqual({ x: 40, y: 40, width: 800, height: 400 })
    expect(at('fillRect(')).toBeLessThan(at('shadowColor'))
    expect(at('shadowColor')).toBeLessThan(at('clip('))
    expect(at('clip(')).toBeLessThan(at('drawImage('))
    expect(log.filter(line => line.startsWith('drawImage('))).toEqual(['drawImage(<gradient>, 40, 40)'])
    // the corners are rounded by the radius: the path begins one radius in from the content's left edge
    expect(log.filter(line => line.startsWith('moveTo(')).pop()).toBe('moveTo(52, 40)')
  })

  it('casts the shadow from a shape drawn out of sight, so nothing opaque is left under a transparent content', () => {
    const { log, state, geometry } = paint()
    const [startX] = log
      .filter(line => line.startsWith('moveTo('))[0]!
      .match(/-?\d+/g)!
      .map(Number)
    const left = startX! - 12 // the path starts one radius in from the shape's left edge
    // drawn left of the canvas, its right edge short of zero, and thrown back onto the content by the offset
    expect(left + geometry.content.width).toBeLessThanOrEqual(0)
    expect(left + (state['shadowOffsetX'] as number)).toBe(geometry.content.x)
    expect(state['shadowOffsetY']).toBeGreaterThan(0)
    expect(state['shadowBlur']).toBeGreaterThan(0)
  })

  it('has no shadow when it is off', () => {
    const { log } = paint({ shadow: false })
    expect(log.some(line => line.startsWith('shadow'))).toBe(false)
    expect(log.some(line => line.startsWith('fill('))).toBe(false)
    expect(log.filter(line => line.startsWith('drawImage('))).toHaveLength(1)
  })

  it('keeps the shadow inside the padding, whatever the padding', () => {
    for (const padding of ['small', 'medium', 'large'] as const) {
      const { state } = paint({ padding })
      // the blur fades out within its own radius; the lift pushes it down by its offset
      const reach = (state['shadowBlur'] as number) + (state['shadowOffsetY'] as number)
      expect(reach, padding).toBeLessThanOrEqual(PADDING_PX[padding])
    }
  })

  it('takes radius, blur and offset in CSS pixels: they grow with the device pixel ratio', () => {
    const one = paint({}, 1)
    const two = paint({}, 2)
    expect(two.geometry.content.x).toBe(one.geometry.content.x * 2)
    expect(two.log.filter(line => line.startsWith('moveTo(')).pop()).toBe('moveTo(104, 80)') // x 80 + radius 24
    expect(two.state['shadowBlur']).toBe((one.state['shadowBlur'] as number) * 2)
    expect(two.state['shadowOffsetY']).toBe((one.state['shadowOffsetY'] as number) * 2)
  })

  it('a radius of 0 clips to a plain rectangle', () => {
    const { log } = paint({ radius: 0, shadow: false })
    expect(log.filter(line => line.startsWith('moveTo('))).toEqual(['moveTo(40, 40)'])
  })

  it('paints nothing behind a transparent background, but the content and its shadow are still there', () => {
    const { log } = paint({ background: 'none' })
    expect(log.some(line => line.startsWith('fillRect('))).toBe(false)
    expect(log.some(line => line.startsWith('drawImage('))).toBe(true)
  })
})

describe('the watermark ink (screenshot.md §4.3)', () => {
  const settings = { enabled: true, text: '@annhub', position: 'bottom-right', size: 'medium', opacity: 0.7 } as const

  it('writes the text in its corner and puts the alpha back', () => {
    const { ctx, log } = recordingContext()
    paintWatermark(ctx, { width: 1200, height: 600 }, settings, false)
    expect(log).toEqual([
      'globalAlpha = 0.7',
      'fillStyle = #20252b',
      'font = 24px -apple-system, system-ui, sans-serif',
      'textAlign = right',
      'textBaseline = bottom',
      'fillText(@annhub, 1188, 588)',
      'globalAlpha = 1',
    ])
  })

  it('turns light on a dark background, where the dark ink would vanish', () => {
    const { ctx, log } = recordingContext()
    paintWatermark(ctx, { width: 1200, height: 600 }, { ...settings, position: 'top-left' }, true)
    expect(log).toContain('fillStyle = #f4f5f7')
    expect(log).toContain('textAlign = left')
    expect(log).toContain('textBaseline = top')
  })

  it('has nothing to write without text', () => {
    const { ctx, log } = recordingContext()
    paintWatermark(ctx, { width: 1200, height: 600 }, { ...settings, text: '' }, false)
    expect(log).toEqual([])
  })
})

describe('the watermark picture (screenshot.md §4.3, §5)', () => {
  // 1200 × 600: the short edge is 600, so the margin is 12 px and the three text sizes are 17, 24 and 34 px
  const canvas = { width: 1200, height: 600 }
  /** a 2:1 picture, the way the session hands it over once it is decoded */
  const picture: WatermarkImage = { source: {} as CanvasImageSource, width: 64, height: 32 }
  const settings = { enabled: true, text: '@annhub', position: 'bottom-right', size: 'medium', opacity: 0.6 } as const

  describe('layout', () => {
    it('puts a picture alone against its corner, a margin in from both edges', () => {
      const corner = (position: WatermarkPosition) => watermarkLayout(canvas, { position, size: 'medium' }, { image: picture, textWidth: null })
      expect(corner('top-left')).toEqual({ image: { x: 12, y: 12, width: 72, height: 36 }, text: null })
      expect(corner('top-right').image).toEqual({ x: 1116, y: 12, width: 72, height: 36 })
      expect(corner('bottom-left').image).toEqual({ x: 12, y: 552, width: 72, height: 36 })
      expect(corner('bottom-right').image).toEqual({ x: 1116, y: 552, width: 72, height: 36 })
    })

    it('sizes the picture by the same three tiers as the text, keeping its shape', () => {
      const sized = (['small', 'medium', 'large'] as const).map(size => watermarkLayout(canvas, { position: 'bottom-right', size }, { image: picture, textWidth: null }).image!)
      // a picture is one and a half text sizes tall, and the text is 17, 24 and 34 px
      expect(sized.map(rect => rect.height)).toEqual([26, 36, 51])
      expect(sized.map(rect => rect.width)).toEqual([52, 72, 102])
    })

    it('scales with the picture it is drawn on: the same tier is bigger on a bigger canvas', () => {
      const big = watermarkLayout({ width: 2400, height: 1200 }, { position: 'bottom-right', size: 'medium' }, { image: picture, textWidth: null }).image
      expect(big).toEqual({ x: 2232, y: 1104, width: 144, height: 72 })
    })

    it('sets the text after the picture, centred on it, when both share a left corner', () => {
      const layout = watermarkLayout(canvas, { position: 'top-left', size: 'medium' }, { image: picture, textWidth: 100 })
      expect(layout.image).toEqual({ x: 12, y: 12, width: 72, height: 36 })
      // 72 px of picture and half a text size of room, then the text, level with the middle of the picture
      expect(layout.text).toEqual({ x: 96, y: 30, align: 'left', baseline: 'middle' })
    })

    it('anchors the strip on a right corner by its far end: the text ends a margin from the edge, the picture comes before it', () => {
      const layout = watermarkLayout(canvas, { position: 'bottom-right', size: 'medium' }, { image: picture, textWidth: 100 })
      // 72 picture + 12 room + 100 text = 184 px, ending 12 px in from the right edge
      expect(layout.image).toEqual({ x: 1004, y: 552, width: 72, height: 36 })
      expect(layout.text).toEqual({ x: 1088, y: 570, align: 'left', baseline: 'middle' })
      expect(layout.text!.x + 100).toBe(1188)
      expect(layout.image!.x + layout.image!.width, 'the picture comes first').toBeLessThan(layout.text!.x)
    })

    it('leaves the text where it has always been when there is no picture', () => {
      expect(watermarkLayout(canvas, { position: 'bottom-right', size: 'medium' }, { image: null, textWidth: 100 })).toEqual({
        image: null,
        text: { x: 1188, y: 588, align: 'right', baseline: 'bottom' },
      })
      expect(watermarkLayout(canvas, { position: 'top-left', size: 'medium' }, { image: null, textWidth: 100 })).toEqual({
        image: null,
        text: { x: 12, y: 12, align: 'left', baseline: 'top' },
      })
    })

    it('has nothing to place without text and without a picture', () => {
      expect(watermarkLayout(canvas, { position: 'top-left', size: 'small' }, { image: null, textWidth: null })).toEqual({ image: null, text: null })
    })

    it('does not let a very wide picture run across the canvas: it narrows, keeping its shape', () => {
      const banner = watermarkLayout(canvas, { position: 'bottom-right', size: 'medium' }, { image: { width: 4000, height: 100 }, textWidth: null }).image!
      expect(banner.width).toBe(480) // two fifths of the canvas
      expect(banner.height).toBe(12) // 480 × 100 / 4000
      expect(banner.x + banner.width).toBe(1188)
    })

    it('centres a picture and the text on each other even when the text is the taller of the two', () => {
      const layout = watermarkLayout(canvas, { position: 'bottom-right', size: 'medium' }, { image: { width: 4000, height: 100 }, textWidth: 100 })
      // 480 × 12 picture beside 24 px text: the strip is as tall as the text, the picture sits in the middle of it
      expect(layout.image).toEqual({ x: 596, y: 570, width: 480, height: 12 })
      expect(layout.text).toEqual({ x: 1088, y: 576, align: 'left', baseline: 'middle' })
      expect(layout.image!.y + layout.image!.height / 2).toBe(layout.text!.y)
    })

    it('ignores a picture that has no size', () => {
      expect(watermarkLayout(canvas, { position: 'bottom-right', size: 'medium' }, { image: { width: 0, height: 0 }, textWidth: 100 })).toEqual({
        image: null,
        text: { x: 1188, y: 588, align: 'right', baseline: 'bottom' },
      })
    })
  })

  describe('painting', () => {
    /** A canvas context that remembers what was drawn and the state it was drawn in; the text measures `charWidth` px per character. */
    function drawingContext(charWidth = 10) {
      const state = { globalAlpha: 1, fillStyle: '#000000', font: '10px serif', textAlign: 'start', textBaseline: 'alphabetic' }
      const draws: Array<
        | { kind: 'picture'; source: unknown; x: number; y: number; width: number; height: number; alpha: number }
        | { kind: 'text'; text: string; x: number; y: number; alpha: number; ink: string; font: string; align: string; baseline: string }
      > = []
      const ctx = Object.assign(state, {
        measureText: (text: string) => ({ width: text.length * charWidth }),
        drawImage: (source: unknown, x: number, y: number, width: number, height: number) => draws.push({ kind: 'picture', source, x, y, width, height, alpha: state.globalAlpha }),
        fillText: (text: string, x: number, y: number) =>
          draws.push({ kind: 'text', text, x, y, alpha: state.globalAlpha, ink: state.fillStyle, font: state.font, align: state.textAlign, baseline: state.textBaseline }),
      })
      return { ctx: ctx as unknown as CanvasRenderingContext2D, state, draws }
    }

    it('draws the picture and then the text after it, both at the watermark opacity, and gives the alpha back', () => {
      const { ctx, state, draws } = drawingContext()
      paintWatermark(ctx, canvas, settings, false, picture)
      expect(draws.map(draw => draw.kind)).toEqual(['picture', 'text'])
      // the text measures 70 px: 72 + 12 + 70 = 154 px of strip, ending 12 px in from the right edge
      expect(draws[0]).toEqual({ kind: 'picture', source: picture.source, x: 1034, y: 552, width: 72, height: 36, alpha: 0.6 })
      expect(draws[1]).toEqual({
        kind: 'text',
        text: '@annhub',
        x: 1118,
        y: 570,
        alpha: 0.6,
        ink: '#20252b',
        font: '24px -apple-system, system-ui, sans-serif',
        align: 'left',
        baseline: 'middle',
      })
      expect(state.globalAlpha, 'the next thing drawn on this canvas is not faded').toBe(1)
    })

    it('draws a picture alone when there is no text', () => {
      const { ctx, state, draws } = drawingContext()
      paintWatermark(ctx, canvas, { ...settings, text: '' }, false, picture)
      expect(draws).toEqual([{ kind: 'picture', source: picture.source, x: 1116, y: 552, width: 72, height: 36, alpha: 0.6 }])
      expect(state.globalAlpha).toBe(1)
    })

    it('skips a picture that could not be read, and the text goes where text alone puts it', () => {
      const { ctx, draws } = drawingContext()
      paintWatermark(ctx, canvas, settings, false, null)
      expect(draws).toEqual([
        { kind: 'text', text: '@annhub', x: 1188, y: 588, alpha: 0.6, ink: '#20252b', font: '24px -apple-system, system-ui, sans-serif', align: 'right', baseline: 'bottom' },
      ])
      // not passing one at all is the same thing
      const without = drawingContext()
      paintWatermark(without.ctx, canvas, settings, false)
      expect(without.draws).toEqual(draws)
    })

    it('draws nothing when there is neither text nor a picture', () => {
      const { ctx, state, draws } = drawingContext()
      paintWatermark(ctx, canvas, { ...settings, text: '' }, false, null)
      expect(draws).toEqual([])
      expect(state.globalAlpha).toBe(1)
    })

    it('takes the text ink from the background but never recolours the picture', () => {
      const light = drawingContext()
      const dark = drawingContext()
      paintWatermark(light.ctx, canvas, settings, false, picture)
      paintWatermark(dark.ctx, canvas, settings, true, picture)
      const [lightPicture, lightText] = light.draws
      const [darkPicture, darkText] = dark.draws
      expect(lightText).toMatchObject({ ink: '#20252b' })
      expect(darkText).toMatchObject({ ink: '#f4f5f7' })
      expect(darkPicture, 'the picture is drawn as it is on a dark background').toEqual(lightPicture)
    })

    it('reaches the picture with every opacity the settings allow', () => {
      for (const opacity of [0.2, 0.7, 1]) {
        const { ctx, state, draws } = drawingContext()
        paintWatermark(ctx, canvas, { ...settings, opacity }, false, picture)
        expect(draws.map(draw => draw.alpha)).toEqual([opacity, opacity])
        expect(state.globalAlpha).toBe(1)
      }
    })

    it('anchors the picture and the text on each of the four corners, a margin in from the edges', () => {
      for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
        const { ctx, draws } = drawingContext()
        paintWatermark(ctx, canvas, { ...settings, position }, false, picture)
        const [shown, text] = draws as [Extract<(typeof draws)[number], { kind: 'picture' }>, Extract<(typeof draws)[number], { kind: 'text' }>]
        const textEnd = text.x + 70
        if (position.endsWith('left')) expect(shown.x, `${position}: the picture starts at the margin`).toBe(12)
        else expect(textEnd, `${position}: the text ends at the margin`).toBe(1200 - 12)
        if (position.startsWith('top')) expect(shown.y, `${position}: the picture is a margin down`).toBe(12)
        else expect(shown.y + shown.height, `${position}: the picture is a margin up`).toBe(600 - 12)
        expect(shown.x + shown.width, `${position}: the picture comes first`).toBeLessThan(text.x)
      }
    })
  })

  describe('decoding', () => {
    type Outcome = 'decodes' | 'fails' | 'decodes to no size'

    /** An image the way the browser's behaves: `decode()` settles once the data URL is set, and refuses what it cannot decode. */
    class FakeImage {
      naturalWidth = 0
      naturalHeight = 0
      requested = ''
      constructor(private readonly outcome: Outcome) {}
      set src(value: string) {
        this.requested = value
      }
      decode(): Promise<void> {
        if (this.outcome === 'fails') return Promise.reject(new DOMException('The source image cannot be decoded.', 'EncodingError'))
        if (this.outcome === 'decodes') {
          this.naturalWidth = 64
          this.naturalHeight = 32
        }
        return Promise.resolve()
      }
    }

    function documentWhere(outcome: Outcome) {
      const images: FakeImage[] = []
      const doc = {
        createElement: (tag: string) => {
          expect(tag).toBe('img')
          const image = new FakeImage(outcome)
          images.push(image)
          return image
        },
      } as unknown as Document
      return { doc, images }
    }

    it('hands back the decoded picture with its natural size, ready to draw', async () => {
      const { doc, images } = documentWhere('decodes')
      const decoded = await decodeWatermarkImage('data:image/png;base64,AAAA', doc)
      expect(decoded).toEqual({ source: images[0], width: 64, height: 32 })
      expect(images).toHaveLength(1)
      expect(images[0]!.requested).toBe('data:image/png;base64,AAAA')
    })

    it('hands back nothing for a picture the browser cannot decode, and does not throw', async () => {
      const { doc } = documentWhere('fails')
      await expect(decodeWatermarkImage('data:image/png;base64,AAAA', doc)).resolves.toBeNull()
    })

    it('hands back nothing for a picture that decoded to no size', async () => {
      const { doc } = documentWhere('decodes to no size')
      await expect(decodeWatermarkImage('data:image/png;base64,AAAA', doc)).resolves.toBeNull()
    })
  })
})

describe('the panel changes the style (screenshot.md §4.4)', () => {
  it('turns beautify on with any change but the switch itself', () => {
    expect(DEFAULT_BEAUTIFY.enabled).toBe(false)
    expect(applyBeautifyChange(DEFAULT_BEAUTIFY, { padding: 'large' })).toEqual({ ...DEFAULT_BEAUTIFY, padding: 'large', enabled: true })
    expect(applyBeautifyChange(DEFAULT_BEAUTIFY, { ratio: '16:9' })).toMatchObject({ ratio: '16:9', enabled: true })
  })

  it('lets the switch turn it off, and keeps the rest', () => {
    const on = applyBeautifyChange(DEFAULT_BEAUTIFY, { radius: 24 })
    expect(applyBeautifyChange(on, { enabled: false })).toEqual({ ...on, enabled: false })
  })

  it('goes back to a free ratio when the ratio is cleared', () => {
    const wide = applyBeautifyChange(DEFAULT_BEAUTIFY, { ratio: '16:9' })
    expect(applyBeautifyChange(wide, { ratio: undefined }).ratio).toBeUndefined()
  })

  it('does not change the style it was given', () => {
    const before = { ...DEFAULT_BEAUTIFY }
    applyBeautifyChange(DEFAULT_BEAUTIFY, { background: 'grad-slate' })
    expect(DEFAULT_BEAUTIFY).toEqual(before)
  })
})

describe('where the preview and the beautify panel sit (screenshot.md §4.4)', () => {
  const view = { width: 1280, height: 720 }

  describe('previewBox', () => {
    const selection: Rect = { x: 300, y: 200, width: 600, height: 240 }

    it('centres the picture on what was selected: it grows around the selection', () => {
      expect(previewBox(selection, { width: 680, height: 320 }, view)).toEqual({ x: 260, y: 160, width: 680, height: 320 })
    })

    it('shrinks a picture the window cannot hold, keeping its shape, and keeps it in the room left for label and toolbar', () => {
      const box = previewBox(selection, { width: 2400, height: 1800 }, view)
      expect(box.width / box.height).toBeCloseTo(2400 / 1800, 6)
      expect(box.x).toBeGreaterThanOrEqual(16)
      expect(box.x + box.width).toBeLessThanOrEqual(view.width - 16)
      expect(box.y).toBeGreaterThanOrEqual(PREVIEW_RESERVE.top)
      expect(box.y + box.height).toBeLessThanOrEqual(view.height - 90)
    })

    it('moves a picture that would hang off the window back into it', () => {
      const box = previewBox({ x: 1180, y: 600, width: 90, height: 60 }, { width: 170, height: 140 }, view)
      expect(box.x + box.width).toBeLessThanOrEqual(view.width - 16)
      expect(box.y + box.height).toBeLessThanOrEqual(view.height - 90)
      expect(previewBox({ x: 0, y: 0, width: 50, height: 50 }, { width: 130, height: 130 }, view)).toMatchObject({ x: 16, y: PREVIEW_RESERVE.top })
    })
  })

  describe('placeSizeLabel', () => {
    const label = { width: 72, height: 21 }
    const toolbarBelow = (preview: Rect): Rect => ({ x: preview.x + preview.width - 560, y: preview.y + preview.height + 8, width: 560, height: 46 })

    it('puts the label above the picture, where the window leaves room and the toolbar is not', () => {
      const preview: Rect = { x: 300, y: 200, width: 600, height: 240 }
      expect(placeSizeLabel(preview, label, toolbarBelow(preview), view)).toBe('above')
      expect(placeSizeLabel(preview, label, null, view)).toBe('above')
    })

    it('keeps room for it above a preview that previewBox moved against the top of the window', () => {
      const against = previewBox({ x: 300, y: 0, width: 400, height: 100 }, { width: 900, height: 700 }, view)
      expect(against.y).toBe(PREVIEW_RESERVE.top)
      expect(PREVIEW_RESERVE.top, 'the label and its gap fit in the reserve').toBeGreaterThanOrEqual(label.height + 6)
      expect(placeSizeLabel(against, label, toolbarBelow(against), view)).toBe('above')
      expect(SIZE_LABEL_ROOM).toBe(PREVIEW_RESERVE.top)
    })

    it('has no room above a picture at the very top, and under it is the toolbar: inside the corner it is, clear of both', () => {
      const preview: Rect = { x: 300, y: 8, width: 400, height: 124 }
      expect(placeSizeLabel(preview, label, toolbarBelow(preview), view)).toBe('inside')
      // with no toolbar to avoid, below is as good as any
      expect(placeSizeLabel(preview, label, null, view)).toBe('below')
    })

    it('goes below a picture whose toolbar sits above it, and inside when the window has no room below either', () => {
      const preview: Rect = { x: 300, y: 120, width: 400, height: 200 }
      const toolbarAbove: Rect = { x: 140, y: 66, width: 560, height: 46 }
      expect(placeSizeLabel(preview, label, toolbarAbove, view)).toBe('below')
      const atTheBottom: Rect = { x: 900, y: 560, width: 300, height: 140 }
      expect(placeSizeLabel(atTheBottom, label, { x: 640, y: 506, width: 560, height: 46 }, view)).toBe('inside')
    })

    it('never puts it where the window would cut it off', () => {
      const preview: Rect = { x: 1250, y: 300, width: 28, height: 100 }
      expect(placeSizeLabel(preview, label, null, view), 'it would run off the right edge above and below').toBe('inside')
    })
  })

  describe('placePanel', () => {
    const panel = { width: 262, height: 330 }
    const rectOf = (position: { left: number; top: number }): Rect => ({ x: position.left, y: position.top, ...panel })
    const touches = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

    it('goes right of the preview, level with its top, when the window has the room', () => {
      const preview = { x: 100, y: 80, width: 600, height: 300 }
      const toolbar = { x: 360, y: 390, width: 340, height: 46 }
      expect(placePanel(panel, { toolbar, preview }, view)).toEqual({ left: 710, top: 80 })
    })

    it('goes left when the right side is short', () => {
      const preview = { x: 500, y: 80, width: 600, height: 300 }
      const toolbar = { x: 760, y: 390, width: 340, height: 46 }
      expect(placePanel(panel, { toolbar, preview }, view)).toEqual({ left: 228, top: 80 })
    })

    it('goes under the toolbar, flush with its right edge, when neither side has room', () => {
      const preview = { x: 120, y: 40, width: 1040, height: 300 }
      const toolbar = { x: 820, y: 350, width: 340, height: 46 }
      const left = placePanel(panel, { toolbar, preview }, { width: 1280, height: 800 })
      expect(left).toEqual({ left: 898, top: 406 })
    })

    it('goes above the preview when there is no room under the toolbar either', () => {
      const preview = { x: 120, y: 360, width: 1040, height: 300 }
      const toolbar = { x: 820, y: 670, width: 340, height: 46 }
      const position = placePanel(panel, { toolbar, preview }, { width: 1280, height: 730 })
      expect(position.top + panel.height).toBeLessThanOrEqual(preview.y - 10)
    })

    it('stays inside the window and off the toolbar even when nothing else is free', () => {
      const cramped = { width: 420, height: 480 }
      const preview = { x: 16, y: 30, width: 388, height: 300 }
      const toolbar = { x: 64, y: 340, width: 340, height: 46 }
      const position = placePanel(panel, { toolbar, preview }, cramped)
      expect(position.left).toBeGreaterThanOrEqual(8)
      expect(position.top).toBeGreaterThanOrEqual(8)
      expect(position.left + panel.width).toBeLessThanOrEqual(cramped.width - 8)
      expect(position.top + panel.height).toBeLessThanOrEqual(cramped.height - 8)
      expect(touches(rectOf(position), toolbar)).toBe(false)
    })

    it('keeps the place it has while that place is still free, and leaves it when the preview grows over it', () => {
      const toolbar = { x: 360, y: 390, width: 340, height: 46 }
      const small = { x: 100, y: 80, width: 600, height: 300 }
      const first = placePanel(panel, { toolbar, preview: small }, view)
      const grown = { x: 90, y: 70, width: 610, height: 310 }
      expect(placePanel(panel, { toolbar, preview: grown }, view, first)).toEqual(first)
      const wide = { x: 60, y: 60, width: 760, height: 320 }
      const moved = placePanel(panel, { toolbar, preview: wide }, view, first)
      expect(moved).not.toEqual(first)
      expect(touches(rectOf(moved), wide)).toBe(false)
      expect(touches(rectOf(moved), toolbar)).toBe(false)
    })
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
