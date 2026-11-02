import { describe, expect, it, vi } from 'vitest'

let aPerson = false
vi.mock('../../user-input', () => ({ isUserInput: () => aPerson }))

import { renderRatioBar } from '../ratio-bar'

/** The bar's buttons in DOM order, with the ratio chip ids and the stitcher at the end. */
function chips(bar: HTMLDivElement): HTMLButtonElement[] {
  return Array.from(bar.querySelectorAll('button'))
}

describe('renderRatioBar (screenshot.md §1.3)', () => {
  it('offers free first, the presets in their order, then the stitching button', () => {
    const host = document.createElement('div')
    const bar = renderRatioBar(document, host, {
      ratio: 'free',
      presets: ['1:1', '16:9'],
      textNode: t => document.createTextNode(t),
      onRatio: () => undefined,
      onStitch: () => undefined,
    })
    expect(host.contains(bar)).toBe(true)
    expect(chips(bar).map(button => button.textContent)).toEqual(['自由', '1:1', '16:9', '滚动长图'])
    const buttons = chips(bar)
    expect(buttons[buttons.length - 1]!.getAttribute('data-ann-ui')).toBe('shot-stitch-button')
  })

  it('marks only the active ratio', () => {
    const bar = renderRatioBar(document, document.createElement('div'), {
      ratio: '16:9',
      presets: ['1:1', '16:9'],
      textNode: t => document.createTextNode(t),
      onRatio: () => undefined,
      onStitch: () => undefined,
    })
    // every chip but the stitcher is a ratio chip
    const states = chips(bar)
      .slice(0, -1)
      .map(button => [button.className, button.getAttribute('aria-pressed')])
    expect(states).toEqual([
      ['', 'false'],
      ['', 'false'],
      ['ann-shot-ratio-active', 'true'],
    ])
  })

  it("draws the preset glyph at the draft's 13px longest side", () => {
    const bar = renderRatioBar(document, document.createElement('div'), {
      ratio: 'free',
      presets: ['16:9', '9:16'],
      textNode: t => document.createTextNode(t),
      onRatio: () => undefined,
      onStitch: () => undefined,
    })
    const wide = chips(bar)[1]!.querySelector('i')!
    const tall = chips(bar)[2]!.querySelector('i')!
    // k = 13 / max(w, h), rounded
    expect(wide.style.width).toBe(`${Math.round((16 * 13) / 16)}px`)
    expect(wide.style.height).toBe(`${Math.round((9 * 13) / 16)}px`)
    expect(tall.style.width).toBe(`${Math.round((9 * 13) / 16)}px`)
    expect(tall.style.height).toBe('13px')
    // the free chip is the arrows glyph, not a box
    expect(chips(bar)[0]!.querySelector('svg')).toBeTruthy()
    expect(chips(bar)[0]!.querySelector('i')).toBeNull()
  })

  it("moves only on the user's own click", () => {
    const onRatio = vi.fn()
    const onStitch = vi.fn()
    const bar = renderRatioBar(document, document.createElement('div'), { ratio: 'free', presets: ['1:1'], textNode: t => document.createTextNode(t), onRatio, onStitch })
    const [free, preset, stitch] = chips(bar)
    for (const button of [free!, preset!, stitch!]) button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onRatio).not.toHaveBeenCalled()
    expect(onStitch).not.toHaveBeenCalled()
    aPerson = true
    preset!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    stitch!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onRatio).toHaveBeenCalledWith('1:1')
    expect(onStitch).toHaveBeenCalledTimes(1)
  })
})
