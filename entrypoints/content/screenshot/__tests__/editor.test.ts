import { describe, expect, it } from 'vitest'
import { clampStep, nextStepNumber, relativeLuminance, renderScreenshot, stepAt, stepInk, stepNumbers, stepRadius, type Annotation, type StepAnnotation } from '../editor'
import { ANNOTATION_COLORS } from '../toolbar'

/**
 * The step badges of the screenshot editor (screenshot.md §1.1): how they are numbered, which one a press lands on,
 * how they stay inside the picture, the ink their number is written in, and what drawing one leaves on the canvas.
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
    moveTo: () => {},
    lineTo: () => {},
    ellipse: () => {},
    strokeRect: () => calls.push(`strokeRect ${ctx.strokeStyle}`),
    arc: (x: number, y: number, radius: number) => calls.push(`arc ${x},${y} r${radius}`),
    fill: () => calls.push(`fill ${ctx.fillStyle}`),
    stroke: () => calls.push(`stroke ${ctx.strokeStyle} w${ctx.lineWidth}`),
    // digits are 0.6em wide and 0.7em tall, standing on the baseline
    measureText: (text: string) => ({ width: text.length * fontSize(ctx.font) * 0.6, actualBoundingBoxAscent: fontSize(ctx.font) * 0.7, actualBoundingBoxDescent: 0 }),
    fillText: (text: string, x: number, y: number) => {
      calls.push(`fillText ${text}`)
      texts.push({ text, x, y, font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline })
    },
  }
  function pick() {
    const { fillStyle, strokeStyle, lineWidth, font, textAlign, textBaseline, lineCap, lineJoin } = ctx
    return { fillStyle, strokeStyle, lineWidth, font, textAlign, textBaseline, lineCap, lineJoin }
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
