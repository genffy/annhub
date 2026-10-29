import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../user-input', () => ({ isUserInput: () => true }))

import { enterAnnotationLayer, exitAnnotationLayer, getActiveAnnotationLayer, isAnnotationLayerActive } from '../layer'

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

  const press = (key: string): boolean => getActiveAnnotationLayer()!.handleRecordingKey(new KeyboardEvent('keydown', { key, bubbles: true } as KeyboardEventInit))

  it('switches tools with their keys, and V is the pointer', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    expect(press('p')).toBe(true)
    expect(press('h')).toBe(true)
    expect(press('l')).toBe(true)
    expect(press('a')).toBe(true)
    expect(press('r')).toBe(true)
    expect(press('o')).toBe(true)
    expect(press('t')).toBe(true)
    expect(press('n')).toBe(true)
    expect(press('v')).toBe(true)
    // the toolbar is not part of this: the keys work with it hidden (recording mode)
    getActiveAnnotationLayer()!.setRecordingMode(true)
    expect(press('p')).toBe(true)
    expect(press('v')).toBe(true)
  })

  it('picks the five colours with 1–5 and steps the width with [ and ]', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
    expect(press('2')).toBe(true)
    expect(press('5')).toBe(true)
    expect(press('6')).toBe(false) // no sixth colour
    expect(press('[')).toBe(true)
    expect(press('[')).toBe(true) // already thin, stays
    expect(press(']')).toBe(true)
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
    expect(press('Escape')).toBe(true)
    expect(isAnnotationLayerActive()).toBe(false)
  })

  it('leaves the key with the page while the focus is in an input or editable area', () => {
    enterAnnotationLayer({ onScreenshot: () => undefined })
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
