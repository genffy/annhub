import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../user-input', () => ({ isUserInput: () => true }))

import { enterAnnotationLayer, exitAnnotationLayer, getActiveAnnotationLayer } from '../layer'
import type { InkStroke } from '../ink'
import type { Point } from '../../screenshot/editor'

/**
 * The strokes of the annotation layer's drawing tools (annotate.md §1.2): a pen or highlighter
 * stroke is the samples the pointer passed — the ones a frame folded into its move included —
 * with no chord back to its start; the shapes keep [start, end]; ink started on a pinned element
 * stores viewport coordinates; one stroke at a time; Ctrl/Cmd+Z undoes a step while a drawing
 * tool is picked and belongs to the page with the pointer tool or a focused input.
 */

const CANVAS = '[data-ann-ui="annotation-canvas"]'
const LAYER = '[data-ann-ui="annotation-layer"]'

let handedOver: InkStroke[][] = []

const pointerEvent = (type: string, point: Point, init: PointerEventInit = {}): PointerEvent =>
  new PointerEvent(type, { clientX: point.x, clientY: point.y, pointerId: 1, isPrimary: true, button: 0, bubbles: true, ...init })

/** jsdom's coalesced list is empty; the layer reads the samples through pointerSamples, which this wires in. */
const withCoalesced = (event: PointerEvent, samples: Point[]): PointerEvent => {
  Object.defineProperty(event, 'getCoalescedEvents', {
    value: () => samples.map(sample => new PointerEvent('pointermove', { clientX: sample.x, clientY: sample.y, pointerId: event.pointerId })),
  })
  return event
}

const pickTool = (tool: string): void => {
  document.querySelector(`[data-ann-ui="annotation-tool-${tool}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

/** jsdom has no elementsFromPoint: the stack is stubbed, an ordinary element by default, a fixed one when pinned. */
const stackAt = (element: HTMLElement): void => {
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [element] })
}

const setScroll = (x: number, y: number): void => {
  Object.defineProperty(window, 'scrollX', { configurable: true, value: x })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
}

const drag = (tool: 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'ellipse', samples: Point[], init: PointerEventInit = {}): void => {
  pickTool(tool)
  document.querySelector<HTMLCanvasElement>(CANVAS)!.dispatchEvent(pointerEvent('pointerdown', samples[0]!, init))
  for (const sample of samples.slice(1)) document.dispatchEvent(pointerEvent('pointermove', sample, init))
  document.dispatchEvent(pointerEvent('pointerup', samples[samples.length - 1]!, init))
}

/** The strokes as the screenshot handover sees them: startScreenshot hands the ink over, restore brings the layer back. */
const inkNow = (): InkStroke[] => {
  const layer = getActiveAnnotationLayer()!
  layer.startScreenshot()
  layer.restoreAfterScreenshot()
  return handedOver[handedOver.length - 1] ?? []
}

/** The stroke just drawn — ink accumulates across one test's drags, so the latest is the one to read. */
const latestStroke = (): InkStroke => {
  const strokes = inkNow()
  return strokes[strokes.length - 1]!
}

describe('the strokes of the drawing tools (annotate.md §1.2)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    exitAnnotationLayer()
    handedOver = []
    stackAt(document.createElement('div'))
    setScroll(0, 0)
    enterAnnotationLayer({ onScreenshot: ink => handedOver.push(ink) })
  })

  afterEach(() => {
    exitAnnotationLayer()
  })

  it('keeps a V a V: the pen and the highlighter trace holds the start and the samples, no chord back to the start', () => {
    for (const tool of ['pen', 'highlighter'] as const) {
      drag(tool, [
        { x: 300, y: 200 },
        { x: 340, y: 225 },
        { x: 400, y: 330 },
        { x: 460, y: 225 },
        { x: 500, y: 200 },
      ])
      const strokes = inkNow()
      const stroke = strokes[strokes.length - 1]!
      expect(stroke.tool).toBe(tool)
      expect(stroke.points).toEqual([
        { x: 300, y: 200 },
        { x: 340, y: 225 },
        { x: 400, y: 330 },
        { x: 460, y: 225 },
        { x: 500, y: 200 },
      ])
    }
  })

  it('takes the samples the browser folded into one pointermove, in their order, repeats dropped', () => {
    pickTool('pen')
    document.querySelector<HTMLCanvasElement>(CANVAS)!.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 100 }))
    document.dispatchEvent(
      withCoalesced(pointerEvent('pointermove', { x: 104, y: 101 }), [
        { x: 100, y: 100 },
        { x: 101, y: 100 },
        { x: 102, y: 101 },
        { x: 104, y: 101 },
      ]),
    )
    document.dispatchEvent(pointerEvent('pointerup', { x: 104, y: 101 }))
    expect(inkNow()[0]!.points).toEqual([
      { x: 100, y: 100 },
      { x: 101, y: 100 },
      { x: 102, y: 101 },
      { x: 104, y: 101 },
    ])
  })

  it('draws nothing to a press without a drag', () => {
    drag('pen', [
      { x: 100, y: 100 },
      { x: 100, y: 101 },
    ])
    expect(inkNow()).toEqual([])
  })

  it('keeps the shapes two-point: the end follows the pointer, and Shift snaps the line level', () => {
    drag(
      'line',
      [
        { x: 100, y: 100 },
        { x: 220, y: 112 },
        { x: 240, y: 118 },
      ],
      { shiftKey: true },
    )
    expect(inkNow()[0]!.points).toEqual([
      { x: 100, y: 100 },
      { x: 240, y: 100 },
    ])
    for (const [tool, end] of [
      ['line', { x: 240, y: 118 }],
      ['arrow', { x: 90, y: 60 }],
      ['rectangle', { x: 90, y: 60 }],
      ['ellipse', { x: 90, y: 60 }],
    ] as const) {
      drag(tool, [{ x: 10, y: 10 }, end])
      expect(latestStroke().points, tool).toEqual([{ x: 10, y: 10 }, end])
    }
  })

  it('stores viewport coordinates for ink on a pinned element, page coordinates for the rest', () => {
    setScroll(0, 300)
    const pinned = document.createElement('div')
    pinned.style.position = 'fixed'
    stackAt(pinned)
    drag('pen', [
      { x: 600, y: 28 },
      { x: 680, y: 28 },
      { x: 760, y: 28 },
    ])
    const pinnedStroke = inkNow()[0]!
    expect(pinnedStroke.pinned).toBe(true)
    expect(pinnedStroke.points).toEqual([
      { x: 600, y: 28 },
      { x: 680, y: 28 },
      { x: 760, y: 28 },
    ])

    stackAt(document.createElement('div'))
    drag('pen', [
      { x: 600, y: 28 },
      { x: 680, y: 28 },
    ])
    const allInk = inkNow()
    const pageStroke = allInk[allInk.length - 1]!
    expect(pageStroke.pinned).toBeUndefined()
    expect(pageStroke.points).toEqual([
      { x: 600, y: 328 },
      { x: 680, y: 328 },
    ])
  })

  it('starts nothing on a second pointer down while one stroke draws: the running stroke is the only one', () => {
    pickTool('pen')
    const canvas = document.querySelector<HTMLCanvasElement>(CANVAS)!
    canvas.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 100 }))
    document.dispatchEvent(pointerEvent('pointermove', { x: 150, y: 100 }))
    // a second finger: not primary, another pointer id
    canvas.dispatchEvent(pointerEvent('pointerdown', { x: 400, y: 400 }, { pointerId: 2, isPrimary: false }))
    document.dispatchEvent(pointerEvent('pointermove', { x: 420, y: 400 }, { pointerId: 2, isPrimary: false }))
    document.dispatchEvent(pointerEvent('pointerup', { x: 420, y: 400 }, { pointerId: 2 }))
    document.dispatchEvent(pointerEvent('pointermove', { x: 200, y: 100 }))
    document.dispatchEvent(pointerEvent('pointerup', { x: 200, y: 100 }))
    const ink = inkNow()
    expect(ink).toHaveLength(1)
    expect(ink[0]!.points).toEqual([
      { x: 100, y: 100 },
      { x: 150, y: 100 },
      { x: 200, y: 100 },
    ])
  })

  it("leaves a running stroke alone on another pointer's pointercancel, drops it on its own", () => {
    pickTool('pen')
    const canvas = document.querySelector<HTMLCanvasElement>(CANVAS)!
    canvas.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 100 }))
    document.dispatchEvent(pointerEvent('pointermove', { x: 150, y: 100 }))
    // another pointer's cancel is not this stroke's
    document.dispatchEvent(pointerEvent('pointercancel', { x: 0, y: 0 }, { pointerId: 2 }))
    document.dispatchEvent(pointerEvent('pointermove', { x: 200, y: 100 }))
    document.dispatchEvent(pointerEvent('pointerup', { x: 200, y: 100 }))
    expect(inkNow()).toHaveLength(1)

    canvas.dispatchEvent(pointerEvent('pointerdown', { x: 100, y: 300 }))
    document.dispatchEvent(pointerEvent('pointermove', { x: 150, y: 300 }))
    document.dispatchEvent(pointerEvent('pointercancel', { x: 150, y: 300 }))
    document.dispatchEvent(pointerEvent('pointerup', { x: 200, y: 300 }))
    expect(inkNow(), 'the cancelled stroke is gone, the committed one stays').toHaveLength(1)
  })

  it('undoes with Ctrl/Cmd+Z while a drawing tool is picked; the pointer tool and a focused input leave the key to the page', () => {
    drag('pen', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ])
    drag('pen', [
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ])
    expect(inkNow()).toHaveLength(2)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    expect(inkNow()).toHaveLength(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }))
    expect(inkNow()).toHaveLength(0)

    drag('pen', [
      { x: 100, y: 300 },
      { x: 200, y: 300 },
    ])
    pickTool('pointer')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    expect(inkNow(), 'the pointer tool leaves the key with the page').toHaveLength(1)

    pickTool('pen')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    expect(inkNow(), 'the focus in an input leaves the key with the page').toHaveLength(1)
  })

  it("opts the drawing canvas out of the browser's touch panning (annotate.md §1.2)", () => {
    const style = document.querySelector(`${LAYER} style`)!.textContent!
    expect(style).toMatch(/ann-annot-drawing [^{]*\{[^}]*touch-action: none/)
  })
})
