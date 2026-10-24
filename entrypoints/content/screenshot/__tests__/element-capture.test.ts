/**
 * `restoreScrollPositions` rebuilds a scrolled window inside the offscreen
 * clone (issue #103): the foreignObject rasterizer drops scroll positions and
 * does not clip nested overflow, so outside boxes are hidden in place, inside
 * boxes are translated to where the scroll showed them, and a box straddling
 * the window recurses into its children.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
const sendMessage = vi.fn()
vi.mock('../../../../utils/message', () => ({ default: { sendMessage: (...args: unknown[]) => sendMessage(...args) } }))
vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }))
vi.mock('../anonymize', () => ({ anonymizeClone: vi.fn() }))

import { restoreScrollPositions } from '../element-capture'

/** jsdom lays nothing out; hand out the box each element would have. */
function boxOf(el: Element, rect: { x: number; y: number; w: number; h: number }): void {
  el.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.w, rect.h)
}

/** jsdom reports zeros; stand in for a real scroller's measurements. */
function scrolled(
  el: HTMLElement,
  measures: { scrollLeft?: number; scrollTop?: number; scrollWidth?: number; scrollHeight?: number; clientWidth?: number; clientHeight?: number },
): void {
  for (const [key, value] of Object.entries(measures)) Object.defineProperty(el, key, { value, configurable: true })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('a scrolled carousel is rebuilt inside the clone (issue #103)', () => {
  it('hides the outside slides in place and translates the visible one to the window', () => {
    document.body.innerHTML = '<div id="scroller"><div id="s1"></div><div id="s2"></div><div id="s3"></div></div>'
    const scroller = document.getElementById('scroller')!
    const clone = scroller.cloneNode(true) as HTMLElement
    boxOf(scroller, { x: 0, y: 0, w: 100, h: 100 })
    boxOf(clone, { x: 0, y: 0, w: 100, h: 100 })
    for (const [id, x] of [
      ['s1', 0],
      ['s2', 100],
      ['s3', 200],
    ] as const) {
      boxOf(document.getElementById(id)!, { x, y: 0, w: 100, h: 100 })
      boxOf(clone.querySelector(`#${id}`)!, { x, y: 0, w: 100, h: 100 })
    }
    scrolled(scroller, { scrollLeft: 100, scrollWidth: 300, clientWidth: 100, clientHeight: 100 })

    restoreScrollPositions(scroller, clone)

    expect((clone.querySelector('#s1') as HTMLElement).style.visibility).toBe('hidden')
    expect((clone.querySelector('#s2') as HTMLElement).style.transform).toBe('translate(-100px, 0px)')
    expect((clone.querySelector('#s3') as HTMLElement).style.visibility).toBe('hidden')
    // hidden in place: removal would re-pack the remaining slides and move them off the translated spot
    expect((clone.querySelector('#s1') as HTMLElement).style.display).toBe('')
  })

  it('recurses into a wrapper strip that straddles the window', () => {
    document.body.innerHTML = '<div id="scroller"><div id="strip"><div id="s1"></div><div id="s2"></div><div id="s3"></div></div></div>'
    const scroller = document.getElementById('scroller')!
    const clone = scroller.cloneNode(true) as HTMLElement
    boxOf(scroller, { x: 0, y: 0, w: 100, h: 100 })
    boxOf(clone, { x: 0, y: 0, w: 100, h: 100 })
    boxOf(document.getElementById('strip')!, { x: 0, y: 0, w: 300, h: 100 })
    boxOf(clone.querySelector('#strip')!, { x: 0, y: 0, w: 300, h: 100 })
    for (const [id, x] of [
      ['s1', 0],
      ['s2', 100],
      ['s3', 200],
    ] as const) {
      boxOf(document.getElementById(id)!, { x, y: 0, w: 100, h: 100 })
      boxOf(clone.querySelector(`#${id}`)!, { x, y: 0, w: 100, h: 100 })
    }
    scrolled(scroller, { scrollLeft: 100, scrollWidth: 300, clientWidth: 100, clientHeight: 100 })

    restoreScrollPositions(scroller, clone)

    expect((clone.querySelector('#strip') as HTMLElement).style.transform).toBe('') // the strip itself stays put
    expect((clone.querySelector('#s1') as HTMLElement).style.visibility).toBe('hidden')
    expect((clone.querySelector('#s2') as HTMLElement).style.transform).toBe('translate(-100px, 0px)')
    expect((clone.querySelector('#s3') as HTMLElement).style.visibility).toBe('hidden')
  })

  it('keeps a partly visible slide mid-transition, translated to the window start', () => {
    document.body.innerHTML = '<div id="scroller"><div id="s1"></div><div id="s2"></div><div id="s3"></div></div>'
    const scroller = document.getElementById('scroller')!
    const clone = scroller.cloneNode(true) as HTMLElement
    boxOf(scroller, { x: 0, y: 0, w: 100, h: 100 })
    boxOf(clone, { x: 0, y: 0, w: 100, h: 100 })
    for (const [id, x] of [
      ['s1', 0],
      ['s2', 100],
      ['s3', 200],
    ] as const) {
      boxOf(document.getElementById(id)!, { x, y: 0, w: 100, h: 100 })
      boxOf(clone.querySelector(`#${id}`)!, { x, y: 0, w: 100, h: 100 })
    }
    scrolled(scroller, { scrollLeft: 50, scrollWidth: 300, clientWidth: 100, clientHeight: 100 })

    restoreScrollPositions(scroller, clone)

    // s1 shows its right half, s2 its left half: both straddle, both are kept
    expect((clone.querySelector('#s1') as HTMLElement).style.visibility).toBe('')
    expect((clone.querySelector('#s1') as HTMLElement).style.transform).toBe('translate(-50px, 0px)')
    expect((clone.querySelector('#s2') as HTMLElement).style.transform).toBe('translate(-50px, 0px)')
    expect((clone.querySelector('#s3') as HTMLElement).style.visibility).toBe('hidden')
  })

  it('walks into nested scrollers and leaves unscrolled ones untouched', () => {
    document.body.innerHTML = '<div id="outer"><div id="inner"><p id="a"></p><p id="b"></p></div><p id="c"></p></div>'
    const outer = document.getElementById('outer')!
    const clone = outer.cloneNode(true) as HTMLElement
    boxOf(clone, { x: 0, y: 0, w: 100, h: 200 })
    const inner = document.getElementById('inner')!
    const innerClone = clone.querySelector('#inner') as HTMLElement
    boxOf(innerClone, { x: 0, y: 0, w: 100, h: 100 })
    boxOf(innerClone.querySelector('#a')!, { x: 0, y: 0, w: 100, h: 100 })
    boxOf(innerClone.querySelector('#b')!, { x: 0, y: 100, w: 100, h: 100 })
    Object.defineProperty(inner, 'scrollTop', { value: 100, configurable: true })
    Object.defineProperty(inner, 'scrollHeight', { value: 200, configurable: true })
    Object.defineProperty(inner, 'clientHeight', { value: 100, configurable: true })
    Object.defineProperty(inner, 'clientWidth', { value: 100, configurable: true })
    Object.defineProperty(inner, 'scrollWidth', { value: 100, configurable: true })
    Object.defineProperty(outer, 'clientWidth', { value: 100, configurable: true })
    Object.defineProperty(outer, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(outer, 'scrollWidth', { value: 100, configurable: true })
    Object.defineProperty(outer, 'scrollHeight', { value: 200, configurable: true })

    restoreScrollPositions(outer, clone)

    expect((innerClone.querySelector('#a') as HTMLElement).style.visibility).toBe('hidden')
    expect((innerClone.querySelector('#b') as HTMLElement).style.transform).toBe('translate(0px, -100px)')
    expect((clone.querySelector('#c') as HTMLElement).style.transform).toBe('')
  })
})
