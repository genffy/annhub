import { describe, expect, it } from 'vitest'
import {
  clampStep,
  HIGHLIGHTER_ALPHA,
  isLineTool,
  LINE_WIDTHS,
  lineWidth,
  nextStepNumber,
  relativeLuminance,
  renderScreenshot,
  snapLine,
  stepAt,
  stepInk,
  stepNumbers,
  stepRadius,
  type Annotation,
  type LineTool,
  type LineWidth,
  type Point,
  type StepAnnotation,
} from '../editor'
import { ANNOTATION_COLORS } from '../toolbar'

/**
 * The step badges of the screenshot editor (screenshot.md §1.1): how they are numbered, which one a press lands on,
 * how they stay inside the picture, the ink their number is written in, and what drawing one leaves on the canvas.
 * And the lines of the pen, the straight line and the highlighter: their widths, the highlighter's translucency and
 * where a line drawn with Shift held ends.
 */

const RED = '#e5484d'
const step = (x: number, y: number, sequence = 0, color = RED): StepAnnotation => ({ tool: 'step', at: { x, y }, color, sequence })
const rectangle: Annotation = { tool: 'rectangle', start: { x: 0, y: 0 }, end: { x: 30, y: 20 }, points: [], color: RED }
const numbersOf = (annotations: Annotation[]): number[] => {
  const numbers = stepNumbers(annotations)
  return annotations.flatMap(annotation => (annotation.tool === 'step' ? [numbers.get(annotation)!] : []))
}

describe('a badge’s number is its place in its sequence (screenshot.md §1.1)', () => {
  it('counts 1, 2, 3 in the order they were put down; the other annotations do not count', () => {
    const annotations: Annotation[] = [step(10, 10), rectangle, step(50, 10), step(90, 10)]
    expect(numbersOf(annotations)).toEqual([1, 2, 3])
    expect(nextStepNumber(annotations, 0)).toBe(4)
    expect(nextStepNumber([rectangle], 0), 'no badge yet').toBe(1)
  })

  it('closes the gap when one is deleted: the badges after it move up one', () => {
    const [first, second, third] = [step(10, 10), step(50, 10), step(90, 10)]
    const deleted = [first!, second!, third!].filter(badge => badge !== second)
    expect(numbersOf(deleted)).toEqual([1, 2])
    expect(stepNumbers(deleted).get(third!), 'the third is the second now').toBe(2)
    expect(nextStepNumber(deleted, 0)).toBe(3)
  })

  it('keeps a badge’s number when it is dragged: the moved badge takes its place in the order', () => {
    const badges = [step(10, 10), step(50, 10), step(90, 10)]
    const moved = { ...badges[0]!, at: { x: 200, y: 120 } }
    const dragged = badges.map(badge => (badge === badges[0] ? moved : badge))
    expect(stepNumbers(dragged).get(moved)).toBe(1)
    expect(numbersOf(dragged)).toEqual([1, 2, 3])
  })

  it('starts again at 1 after a reset, and the badges already down keep their numbers', () => {
    const before = [step(10, 10, 0), step(50, 10, 0), step(90, 10, 0)]
    expect(nextStepNumber(before, 1), 'a fresh sequence').toBe(1)
    const after = [...before, step(10, 60, 1), step(50, 60, 1)]
    expect(numbersOf(after)).toEqual([1, 2, 3, 1, 2])
    expect(nextStepNumber(after, 1)).toBe(3)
  })

  it('closes a gap inside its own sequence only', () => {
    const [a1, a2, a3, b1, b2] = [step(10, 10, 0), step(50, 10, 0), step(90, 10, 0), step(10, 60, 1), step(50, 60, 1)]
    const deleted = [a1!, a2!, a3!, b1!, b2!].filter(badge => badge !== a1)
    expect(numbersOf(deleted)).toEqual([1, 2, 1, 2])
    expect(nextStepNumber(deleted, 1), 'the current sequence goes on from where it was').toBe(3)
  })
})

describe('the badge a press lands on', () => {
  it('is the one whose disc holds the point', () => {
    const badge = step(100, 50)
    const annotations: Annotation[] = [rectangle, badge]
    expect(stepAt(annotations, { x: 100, y: 50 }, 1)).toBe(badge)
    expect(stepAt(annotations, { x: 113, y: 50 }, 1), 'inside the 14px radius').toBe(badge)
    expect(stepAt(annotations, { x: 110, y: 60 }, 1), 'a corner of its box is outside the disc').toBeNull()
    expect(stepAt(annotations, { x: 15, y: 10 }, 1), 'a rectangle is not a badge').toBeNull()
  })

  it('is the one drawn on top where two overlap', () => {
    const under = step(100, 50)
    const over = step(110, 50)
    expect(stepAt([under, over], { x: 105, y: 50 }, 1)).toBe(over)
    expect(stepAt([under, over], { x: 89, y: 50 }, 1), 'only the lower one is there').toBe(under)
  })

  it('has a disc that grows with the capture’s pixel ratio', () => {
    const badge = step(100, 50)
    expect(stepAt([badge], { x: 125, y: 50 }, 1)).toBeNull()
    expect(stepAt([badge], { x: 125, y: 50 }, 2)).toBe(badge)
    expect(stepRadius(1)).toBe(14)
    expect(stepRadius(2)).toBe(28)
    expect(stepRadius(0.5), 'a zoomed-out page does not shrink it below 28 pixels across').toBe(14)
  })
})

describe('a badge stays whole inside the picture', () => {
  const size = { width: 300, height: 200 }

  it('stays where it was put down when it fits', () => {
    expect(clampStep({ x: 120, y: 80 }, size, 1)).toEqual({ x: 120, y: 80 })
  })

  it('stops at the edge it was put down or dragged against', () => {
    expect(clampStep({ x: 3, y: -40 }, size, 1)).toEqual({ x: 14, y: 14 })
    expect(clampStep({ x: 299, y: 260 }, size, 1)).toEqual({ x: 286, y: 186 })
    expect(clampStep({ x: 3, y: 3 }, size, 2), 'a bigger badge on a 2x capture').toEqual({ x: 28, y: 28 })
  })

  it('sits in the middle of a picture smaller than itself', () => {
    expect(clampStep({ x: 2, y: 100 }, { width: 20, height: 200 }, 1)).toEqual({ x: 10, y: 100 })
  })
})

describe('the ink of the number and the rim', () => {
  const contrast = (a: string, b: string): number => {
    const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number]
    return (light + 0.05) / (dark + 0.05)
  }

  it('is white on red, teal and black, and dark on yellow and white', () => {
    expect(Object.fromEntries(ANNOTATION_COLORS.map(({ name, value }) => [name, stepInk(value)]))).toEqual({
      red: '#ffffff',
      yellow: '#20252b',
      teal: '#ffffff',
      white: '#20252b',
      black: '#ffffff',
    })
  })

  it('stands out from every annotation colour by at least 3:1, so the rim sets the badge off from any background', () => {
    for (const { name, value } of ANNOTATION_COLORS) {
      expect(contrast(value, stepInk(value)), name).toBeGreaterThanOrEqual(3)
    }
  })

  it('is measured as WCAG relative luminance', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3)
  })
})

/** A 2D context that writes down what is drawn, with the state each call ran under; save and restore work. */
function recordingCanvas(width = 300, height = 200) {
  const calls: string[] = []
  const texts: Array<{ text: string; x: number; y: number; font: string; fillStyle: string; textAlign: string; textBaseline: string }> = []
  const fresh = () => ({
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
  })
  const saved: Array<ReturnType<typeof fresh>> = []
  const fontSize = (font: string): number => Number(/([\d.]+)px/.exec(font)![1])
  const ctx = {
    ...fresh(),
    save: () => saved.push({ ...pick() }),
    restore: () => Object.assign(ctx, saved.pop()),
    clearRect: () => calls.push('clearRect'),
    drawImage: () => calls.push('drawImage'),
    beginPath: () => {},
    moveTo: (x: number, y: number) => calls.push(`moveTo ${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo ${x},${y}`),
    ellipse: () => {},
    strokeRect: () => calls.push(`strokeRect ${ctx.strokeStyle} w${ctx.lineWidth}`),
    arc: (x: number, y: number, radius: number) => calls.push(`arc ${x},${y} r${radius}`),
    fill: () => calls.push(`fill ${ctx.fillStyle}`),
    stroke: () => calls.push(`stroke ${ctx.strokeStyle} w${ctx.lineWidth}${ctx.globalAlpha === 1 ? '' : ` a${ctx.globalAlpha}`}`),
    // digits are 0.6em wide and 0.7em tall, standing on the baseline
    measureText: (text: string) => ({ width: text.length * fontSize(ctx.font) * 0.6, actualBoundingBoxAscent: fontSize(ctx.font) * 0.7, actualBoundingBoxDescent: 0 }),
    fillText: (text: string, x: number, y: number) => {
      calls.push(`fillText ${text}`)
      texts.push({ text, x, y, font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline })
    },
  }
  function pick() {
    const { fillStyle, strokeStyle, globalAlpha, lineWidth, font, textAlign, textBaseline, lineCap, lineJoin } = ctx
    return { fillStyle, strokeStyle, globalAlpha, lineWidth, font, textAlign, textBaseline, lineCap, lineJoin }
  }
  const target = { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement
  return { target, calls, texts, fontSize }
}

describe('drawing a badge', () => {
  const source = {} as HTMLCanvasElement

  it('fills a disc in its colour, rings it and writes its number in the ink, centred on the digits', () => {
    const { target, calls, texts } = recordingCanvas()
    renderScreenshot(target, source, [], [step(60, 40)], 1)
    expect(calls).toEqual(['clearRect', 'drawImage', 'arc 60,40 r13', `fill ${RED}`, 'stroke #ffffff w2', 'fillText 1'])
    // 15px digits are 10.5px tall: their middle is on the centre
    expect(texts[0]).toEqual({ text: '1', x: 60, y: 45.25, font: '700 15px sans-serif', fillStyle: '#ffffff', textAlign: 'center', textBaseline: 'alphabetic' })
  })

  it('writes on a light badge in the dark ink', () => {
    const { target, calls, texts } = recordingCanvas()
    renderScreenshot(target, source, [], [step(60, 40, 0, '#f6c453')], 1)
    expect(calls).toContain('stroke #20252b w2')
    expect(texts[0]!.fillStyle).toBe('#20252b')
  })

  it('numbers them as they come, and again after one is deleted', () => {
    const badges = [step(20, 20), step(60, 20), step(100, 20)]
    const all = recordingCanvas()
    renderScreenshot(all.target, source, [], badges, 1)
    expect(all.texts.map(text => text.text)).toEqual(['1', '2', '3'])
    const after = recordingCanvas()
    renderScreenshot(after.target, source, [], [badges[0]!, badges[2]!], 1)
    expect(after.texts.map(text => [text.text, text.x])).toEqual([
      ['1', 20],
      ['2', 100],
    ])
  })

  it('sets three digits smaller, so that they stay inside the disc', () => {
    const { target, texts, fontSize } = recordingCanvas()
    const many = Array.from({ length: 100 }, (_, index) => step(20 + (index % 10) * 28, 20 + Math.floor(index / 10) * 18))
    renderScreenshot(target, source, [], many, 1)
    const [ninetyNine, hundred] = [texts[98]!, texts[99]!]
    expect(ninetyNine.font, 'two digits fit at full size').toBe('700 15px sans-serif')
    expect(hundred.text).toBe('100')
    const size = fontSize(hundred.font)
    expect(size).toBeLessThan(15)
    // the room inside the rim is 24px; the digits take no more than four fifths of it
    expect(hundred.text.length * size * 0.6).toBeLessThanOrEqual(19.2 + 1e-9)
  })

  it('grows with the capture: a 2x capture gets a badge twice the size', () => {
    const { target, calls, texts } = recordingCanvas()
    renderScreenshot(target, source, [], [step(80, 60)], 2)
    expect(calls).toContain('arc 80,60 r26')
    expect(calls).toContain('stroke #ffffff w4')
    expect(texts[0]!.font).toBe('700 30px sans-serif')
  })

  it('leaves the context as it found it: text written after a badge still starts at its left edge', () => {
    const { target, texts } = recordingCanvas()
    renderScreenshot(target, source, [], [step(60, 40), { tool: 'text', start: { x: 10, y: 80 }, text: 'Retries', color: RED }], 1)
    expect(texts[1]).toMatchObject({ text: 'Retries', x: 10, textAlign: 'start', fillStyle: RED })
  })
})

const line = (tool: LineTool, points: Point[], width: LineWidth = 'medium', color = RED): Extract<Annotation, { tool: LineTool }> => ({
  tool,
  start: points[0]!,
  end: points[points.length - 1]!,
  points,
  color,
  width,
})
const strokes = (calls: string[]) => calls.filter(call => call.startsWith('stroke'))

describe('line widths (screenshot.md §1.1)', () => {
  it('are thin, medium and thick, for the pen, the line and the highlighter only', () => {
    expect(LINE_WIDTHS).toEqual(['thin', 'medium', 'thick'])
    expect((['pen', 'line', 'highlighter'] as const).every(isLineTool)).toBe(true)
    expect((['rectangle', 'ellipse', 'arrow', 'mosaic', 'text', 'step', null] as const).some(isLineTool), 'the shapes keep their width').toBe(false)
  })

  it('are 2, 3 and 6 CSS pixels for the pen and the line: the middle one is the shapes’ width', () => {
    for (const tool of ['pen', 'line'] as const) expect(LINE_WIDTHS.map(width => lineWidth(tool, width, 1))).toEqual([2, 3, 6])
    const pen = [
      { x: 10, y: 10 },
      { x: 60, y: 30 },
    ]
    const { target, calls } = recordingCanvas()
    renderScreenshot(target, {} as HTMLCanvasElement, [], [rectangle, line('pen', pen)], 1)
    expect(strokes(calls), 'the rectangle and the pen drawn at their middle width').toEqual([`strokeRect ${RED} w3`, `stroke ${RED} w3`])
  })

  it('are 12, 20 and 32 CSS pixels for the highlighter, wide enough to lay over a line of text', () => {
    expect(LINE_WIDTHS.map(width => lineWidth('highlighter', width, 1))).toEqual([12, 20, 32])
  })

  it('grow with the capture’s pixel ratio, as the other annotations do, and none goes under 2 pixels', () => {
    expect(LINE_WIDTHS.map(width => lineWidth('pen', width, 2))).toEqual([4, 6, 12])
    expect(LINE_WIDTHS.map(width => lineWidth('highlighter', width, 2))).toEqual([24, 40, 64])
    expect(lineWidth('line', 'thin', 0.5), 'a page zoomed out').toBe(2)
    expect(lineWidth('highlighter', 'thin', 0.5)).toBe(6)
  })
})

describe('drawing a line', () => {
  const source = {} as HTMLCanvasElement

  it('goes straight from where it was pressed to where it was let go, at its width', () => {
    const { target, calls } = recordingCanvas()
    // a line keeps only its press in `points`: its ends are `start` and `end`
    renderScreenshot(target, source, [], [{ ...line('line', [{ x: 10, y: 20 }], 'thick'), end: { x: 110, y: 70 } }], 1)
    expect(calls).toEqual(['clearRect', 'drawImage', 'moveTo 10,20', 'lineTo 110,70', `stroke ${RED} w6`])
  })

  it('ends, with Shift held, on the nearest horizontal, vertical or 45° diagonal through its start', () => {
    const start = { x: 100, y: 100 }
    const to = (dx: number, dy: number) => snapLine(start, { x: 100 + dx, y: 100 + dy })
    expect(to(100, 12), 'nearly level').toEqual({ x: 200, y: 100 })
    expect(to(-100, -30), 'leftwards').toEqual({ x: 0, y: 100 })
    expect(to(10, -100), 'nearly upright').toEqual({ x: 100, y: 0 })
    expect(to(-20, 100)).toEqual({ x: 100, y: 200 })
    // on a diagonal the end is where the pointer is along it: half of across plus down
    expect(to(100, 80)).toEqual({ x: 190, y: 190 })
    expect(to(100, -80)).toEqual({ x: 190, y: 10 })
    expect(to(-60, 100)).toEqual({ x: 20, y: 180 })
    expect(to(-80, -100)).toEqual({ x: 10, y: 10 })
    // 22.5° is the turn between level and diagonal
    expect(to(100, 41)).toEqual({ x: 200, y: 100 })
    expect(to(100, 42)).toEqual({ x: 171, y: 171 })
    expect(to(0, 0), 'not moved').toEqual(start)
  })
})

describe('drawing with the highlighter', () => {
  const source = {} as HTMLCanvasElement
  const scribble = [
    { x: 10, y: 50 },
    { x: 200, y: 50 },
    { x: 20, y: 52 },
    { x: 120, y: 10 },
    { x: 120, y: 90 },
  ]

  it('lays its colour over the picture at 40%, in one stroke: where it runs over itself it is no deeper', () => {
    const { target, calls } = recordingCanvas()
    renderScreenshot(target, source, [], [line('highlighter', scribble, 'medium', '#f6c453')], 1)
    expect(strokes(calls)).toEqual(['stroke #f6c453 w20 a0.4'])
    expect(calls.filter(call => call.startsWith('lineTo'))).toHaveLength(scribble.length - 1)
  })

  it('keeps 60% of the difference between the text and the background under it, whatever the colour', () => {
    const over = (under: number, colour: number) => under * (1 - HIGHLIGHTER_ALPHA) + colour * HIGHLIGHTER_ALPHA
    for (const { value } of ANNOTATION_COLORS) {
      for (const offset of [1, 3, 5]) {
        const channel = parseInt(value.slice(offset, offset + 2), 16)
        expect(over(255, channel) - over(0, channel), `${value}: white paper against black text`).toBeCloseTo(255 * 0.6, 9)
      }
    }
  })

  it('leaves the context as it found it: the pen line after it is opaque', () => {
    const { target, calls } = recordingCanvas()
    renderScreenshot(target, source, [], [line('highlighter', scribble, 'thick'), line('pen', scribble, 'thin')], 2)
    expect(strokes(calls)).toEqual([`stroke ${RED} w64 a0.4`, `stroke ${RED} w4`])
  })
})
