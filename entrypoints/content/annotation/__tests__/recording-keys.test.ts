import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../user-input', () => ({ isUserInput: () => true }))

import { enterAnnotationLayer, exitAnnotationLayer, getActiveAnnotationLayer, isAnnotationLayerActive } from '../layer'
import { ANNOTATION_COLORS } from '../../../../core/screenshot-options'

/**
 * The recording-time single keys (annotate.md §3.1): the toolbar is off the
 * page while the recording runs, so each control has a key — P/H/L/A/R/O/T/N
 * for the tools, V back to the pointer, 1–5 for the colours, [ ] for the
 * width, Z undo, E clear, Esc out. A key reaches the layer only while it is
 * open and the focus is not in an input or editable area; the rest of the
 * time it belongs to the page (X's 点赞 L included).
 */

describe('recording-time single keys (annotate.md §3.1)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    exitAnnotationLayer()
  })

  afterEach(() => {
    exitAnnotationLayer()
  })

  const press = (key: string): boolean => getActiveAnnotationLayer()!.handleRecordingKey(new KeyboardEvent('keydown', { key, bubbles: true }))

  it('switches tools with their keys, and V is the pointer', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    // the toolbar is off the page while recording (recording mode): the keys work with it hidden
    getActiveAnnotationLayer()!.setRecordingMode(true)
    // each key is taken and does what it says: the layer's tool follows (a key that is only swallowed leaves the user stuck)
    const layer = getActiveAnnotationLayer()!
    for (const [key, tool] of [
      ['p', 'pen'],
      ['h', 'highlighter'],
      ['l', 'line'],
      ['a', 'arrow'],
      ['r', 'rectangle'],
      ['o', 'ellipse'],
      ['t', 'text'],
      ['n', 'step'],
      ['v', 'pointer'],
    ] as const) {
      expect(press(key), key).toBe(true)
      expect(layer.tool, key).toBe(tool)
    }
  })

  it('belongs to the page outside a recording, even with the layer open', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    expect(press('p')).toBe(false)
    expect(press('Escape')).toBe(false)
    expect(isAnnotationLayerActive()).toBe(true)
  })

  it('leaves chords to the browser: Ctrl+R and Cmd+P are not the rectangle or the pen', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    getActiveAnnotationLayer()!.setRecordingMode(true)
    expect(getActiveAnnotationLayer()!.handleRecordingKey(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true }))).toBe(false)
    expect(getActiveAnnotationLayer()!.handleRecordingKey(new KeyboardEvent('keydown', { key: 'p', metaKey: true }))).toBe(false)
    expect(getActiveAnnotationLayer()!.handleRecordingKey(new KeyboardEvent('keydown', { key: 'z', altKey: true }))).toBe(false)
  })

  it('picks the five colours with 1–5 and steps the width with [ and ]', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    getActiveAnnotationLayer()!.setRecordingMode(true)
    const layer = getActiveAnnotationLayer()!
    expect(press('2')).toBe(true)
    expect(layer.color).toBe(ANNOTATION_COLORS[1]!.value)
    expect(press('5')).toBe(true)
    expect(layer.color).toBe(ANNOTATION_COLORS[4]!.value)
    expect(press('6')).toBe(false) // no sixth colour
    expect(layer.color).toBe(ANNOTATION_COLORS[4]!.value)
    expect(press('[')).toBe(true)
    expect(layer.lineWidth).toBe('thin')
    expect(press('[')).toBe(true) // already thin, stays
    expect(layer.lineWidth).toBe('thin')
    expect(press(']')).toBe(true)
    expect(layer.lineWidth).toBe('medium')
  })

  it('undoes with Z and clears with E', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    const layer = getActiveAnnotationLayer()!
    layer.setRecordingMode(true)
    // undo with an empty history is still the layer's key
    expect(press('z')).toBe(true)
    expect(press('e')).toBe(true)
    expect(isAnnotationLayerActive()).toBe(true)
  })

  it('exits with Esc', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    getActiveAnnotationLayer()!.setRecordingMode(true)
    expect(press('Escape')).toBe(true)
    expect(isAnnotationLayerActive()).toBe(false)
  })

  it('leaves the key with the page while the focus is in an input or editable area', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    getActiveAnnotationLayer()!.setRecordingMode(true)
    const input = document.createElement('input')
    input.setAttribute('data-ann-ui', 'fixture-input')
    document.body.appendChild(input)
    input.focus()
    expect(press('p')).toBe(false)
    expect(press('1')).toBe(false)
    expect(press('Escape')).toBe(false)
    input.blur()
    expect(press('p')).toBe(true)
    const editable = document.createElement('textarea')
    document.body.appendChild(editable)
    editable.focus()
    expect(press('p')).toBe(false)
  })

  it('keys reach nothing when the layer is closed', () => {
    expect(isAnnotationLayerActive()).toBe(false)
    expect(getActiveAnnotationLayer()?.handleRecordingKey(new KeyboardEvent('keydown', { key: 'p' })) ?? false).toBe(false)
  })
})

/**
 * A layer opened while a tab is being recorded (annotate.md §3.1): the toolbar is off the page, so
 * with the pointer tool there would be nothing to draw with and nothing to pick a tool from. It
 * opens on the pen instead — a drag draws at once, and the single keys take it from there.
 */
describe('a layer opened while a tab is being recorded (annotate.md §3.1)', () => {
  const CANVAS = '[data-ann-ui="annotation-canvas"]'

  beforeEach(() => {
    document.body.innerHTML = ''
    exitAnnotationLayer()
    // jsdom has no elementsFromPoint, which the pinned-ink check asks the page for
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [document.body] })
  })

  afterEach(() => {
    exitAnnotationLayer()
  })

  const pointer = (type: string, x: number, y: number): PointerEvent => new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, bubbles: true })

  const drag = (): void => {
    document.querySelector<HTMLCanvasElement>(CANVAS)!.dispatchEvent(pointer('pointerdown', 40, 40))
    document.dispatchEvent(pointer('pointermove', 120, 60))
    document.dispatchEvent(pointer('pointerup', 120, 60))
  }

  it('is on the pen with no toolbar, and the pointer shows the pen in hand', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined, recording: true })
    const layer = getActiveAnnotationLayer()!
    expect(layer.tool).toBe('pen')
    expect(layer.recordingMode).toBe(true)
    expect(document.querySelector<HTMLElement>('[data-ann-ui="annotation-toolbar"]')!.style.display).toBe('none')
    expect(layer.host.classList.contains('ann-annot-drawing')).toBe(true)
    expect(layer.canvas!.style.cursor).toContain('data:image/svg+xml')
  })

  it('draws with a plain drag, no key pressed', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined, recording: true })
    const layer = getActiveAnnotationLayer()!
    expect(layer.strokes).toHaveLength(0)
    drag()
    expect(layer.strokes).toHaveLength(1)
    expect(layer.strokes[0]!.tool).toBe('pen')
  })

  it('still takes the single keys from there: V for the pointer, P for the pen again', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined, recording: true })
    const layer = getActiveAnnotationLayer()!
    expect(getActiveAnnotationLayer()!.handleRecordingKey(new KeyboardEvent('keydown', { key: 'v' }))).toBe(true)
    expect(layer.tool).toBe('pointer')
    drag()
    expect(layer.strokes, 'the pointer draws nothing').toHaveLength(0)
    expect(getActiveAnnotationLayer()!.handleRecordingKey(new KeyboardEvent('keydown', { key: 'p' }))).toBe(true)
    expect(layer.tool).toBe('pen')
  })

  it('opens as it always did when no recording runs: the pointer, with the toolbar', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    const layer = getActiveAnnotationLayer()!
    expect(layer.tool).toBe('pointer')
    expect(layer.recordingMode).toBe(false)
    expect(document.querySelector<HTMLElement>('[data-ann-ui="annotation-toolbar"]')!.style.display).toBe('')
    drag()
    expect(layer.strokes, 'the pointer tool leaves the page to itself').toHaveLength(0)
  })

  it('keeps the tool a layer was already on when the recording starts afterwards', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    const layer = getActiveAnnotationLayer()!
    layer.setRecordingMode(true)
    expect(layer.tool, 'only the toolbar steps aside').toBe('pointer')
    expect(document.querySelector<HTMLElement>('[data-ann-ui="annotation-toolbar"]')!.style.display).toBe('none')
  })
})
