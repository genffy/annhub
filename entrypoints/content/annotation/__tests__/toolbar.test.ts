import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../user-input', () => ({ isUserInput: () => true }))

import { enterAnnotationLayer, exitAnnotationLayer, getActiveAnnotationLayer } from '../layer'

/**
 * The toolbar on the window edge (annotate.md §1.1): one narrow column of square buttons — nothing in
 * it carries words, which would widen the whole bar — and the three width steps always stand in it,
 * dim where the tool takes no width, so the bar is the same size for every tool.
 */

const TOOLBAR = '[data-ann-ui="annotation-toolbar"]'
const WIDTHS = ['thin', 'medium', 'thick'] as const

const widthStep = (width: (typeof WIDTHS)[number]): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`[data-ann-ui="annotation-width-${width}"]`)!

const click = (selector: string): void => {
  document.querySelector(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const pickTool = (tool: string): void => click(`[data-ann-ui="annotation-tool-${tool}"]`)

describe('the annotation toolbar (annotate.md §1.1)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    exitAnnotationLayer()
    enterAnnotationLayer({ onScreenshot: () => undefined })
  })

  afterEach(() => {
    exitAnnotationLayer()
  })

  it('has no control that carries words and no native select: words would widen the whole bar', () => {
    const bar = document.querySelector(TOOLBAR)!
    expect(bar.querySelectorAll('select')).toHaveLength(0)
    const withWords = [...bar.querySelectorAll('button')].filter(button => (button.textContent ?? '').trim() !== '')
    expect(withWords.map(button => button.getAttribute('data-ann-ui'))).toEqual([])
  })

  it('keeps the width steps in the bar for every tool and enables them only where the tool takes a width', () => {
    const takesWidth: Record<string, boolean> = {
      pointer: false,
      pen: true,
      highlighter: true,
      line: true,
      arrow: false,
      rectangle: false,
      ellipse: false,
      text: false,
      step: false,
    }
    const group = document.querySelector<HTMLElement>('[data-ann-ui="annotation-widths"]')!
    for (const [tool, enabled] of Object.entries(takesWidth)) {
      pickTool(tool)
      // hidden, the group would take its rows out of the bar and the bar would change size with the tool
      expect(group.style.display, `the width group stays in the layout with the ${tool}`).toBe('')
      for (const width of WIDTHS) expect(widthStep(width).disabled, `${width} with the ${tool}`).toBe(!enabled)
    }
  })

  it('marks the chosen width, and keeps the mark while the tool takes none', () => {
    pickTool('pen')
    expect(widthStep('medium').classList.contains('ann-annot-active')).toBe(true)
    widthStep('thick').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(getActiveAnnotationLayer()!.lineWidth).toBe('thick')
    expect(widthStep('thick').classList.contains('ann-annot-active')).toBe(true)
    expect(widthStep('medium').classList.contains('ann-annot-active')).toBe(false)

    pickTool('arrow')
    expect(widthStep('thick').classList.contains('ann-annot-active'), 'the choice shows, dimmed, while the arrow takes none').toBe(true)
    expect(widthStep('thick').disabled).toBe(true)
    pickTool('line')
    expect(widthStep('thick').disabled).toBe(false)
    expect(getActiveAnnotationLayer()!.lineWidth, 'and it is still the width when a line tool comes back').toBe('thick')
  })
})
