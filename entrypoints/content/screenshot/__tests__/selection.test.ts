import { describe, expect, it } from 'vitest'
import {
  HANDLES,
  adjustHierarchy,
  boxWithinTolerance,
  buildSelector,
  collectEdges,
  expandByMargin,
  fitsInViewport,
  handleAnchor,
  nudgeBox,
  resizeFromHandle,
  snapPoint,
  type FrameRecord,
} from '../selection'
import { clearFrame, readFrame, rememberFrame } from '../selection'

const VIEW = { width: 1280, height: 800 }

describe('snap points to element edges (screenshot.md §1.2)', () => {
  const edges = collectEdges(
    [
      { left: 100, top: 50, right: 400, bottom: 300 },
      { left: 100, top: 300, right: 720, bottom: 640 },
    ],
    VIEW,
  )

  it('snaps within the threshold and reports which axis snapped', () => {
    const snapped = snapPoint({ x: 104, y: 52 }, edges)
    expect(snapped.x).toBe(100)
    expect(snapped.snappedX).toBe(100)
    expect(snapped.y).toBe(50)
    expect(snapped.snappedY).toBe(50)
  })

  it('leaves coordinates alone beyond the threshold', () => {
    const snapped = snapPoint({ x: 130, y: 412 }, edges, 8)
    expect(snapped.x).toBe(130)
    expect(snapped.snappedX).toBeNull()
    expect(snapped.y).toBe(412)
    expect(snapped.snappedY).toBeNull()
  })

  it('includes the viewport edges as candidates', () => {
    expect(snapPoint({ x: 2, y: 798 }, collectEdges([], VIEW)).x).toBe(0)
    expect(snapPoint({ x: 2, y: 798 }, collectEdges([], VIEW)).y).toBe(800)
  })
})

describe('nudge and handles (screenshot.md §1.2)', () => {
  const box = { x: 100, y: 100, width: 200, height: 120 }

  it('arrow keys move 1px, Shift moves 10px, clamped to the viewport', () => {
    expect(nudgeBox(box, 'ArrowLeft', false, VIEW).x).toBe(99)
    expect(nudgeBox(box, 'ArrowDown', true, VIEW).y).toBe(110)
    const atEdge = { x: 0, y: 700, width: 200, height: 100 }
    expect(nudgeBox(atEdge, 'ArrowUp', false, VIEW).y).toBe(699)
    expect(nudgeBox({ ...atEdge, y: 700 }, 'ArrowDown', true, VIEW).y).toBe(700) // clamped
  })

  it('eight handles exist with orthogonal cursors', () => {
    expect(HANDLES).toHaveLength(8)
    expect(handleAnchor('nw')).toMatchObject({ x: 0, y: 0, cursor: 'nwse-resize' })
    expect(handleAnchor('e')).toMatchObject({ x: 1, y: 0.5, cursor: 'ew-resize' })
    expect(handleAnchor('s')).toMatchObject({ x: 0.5, y: 1, cursor: 'ns-resize' })
  })

  it('resizing from a corner moves that corner only', () => {
    const grown = resizeFromHandle(box, 'se', 40, 30, VIEW)
    expect(grown).toEqual({ x: 100, y: 100, width: 240, height: 150 })
    const shrunk = resizeFromHandle(box, 'nw', 30, 20, VIEW)
    expect(shrunk).toEqual({ x: 130, y: 120, width: 170, height: 100 })
  })

  it('clamps handle drags to the viewport and a minimum size', () => {
    expect(resizeFromHandle(box, 'w', -500, 0, VIEW).x).toBe(0)
    const tiny = resizeFromHandle(box, 'e', -1000, 0, VIEW)
    expect(tiny.width).toBeGreaterThanOrEqual(8)
  })
})

describe('element + margin frames (screenshot.md §1.4)', () => {
  const element = { x: 200, y: 120, width: 400, height: 260 }

  it('expands the outer box by the margin on all four sides', () => {
    expect(expandByMargin(element, 24)).toEqual({ x: 176, y: 96, width: 448, height: 308 })
    expect(expandByMargin(element, 0)).toEqual(element)
  })

  it('a frame must fit the window; a bigger element goes the element path', () => {
    expect(fitsInViewport(expandByMargin(element, 24), VIEW)).toBe(true)
    expect(fitsInViewport(expandByMargin({ ...element, y: 780 }, 24), VIEW)).toBe(false)
    expect(fitsInViewport({ x: 0, y: 0, width: 1300, height: 100 }, VIEW)).toBe(false)
  })
})

describe('element hierarchy (screenshot.md §1.2)', () => {
  it('walks up and down the visible ancestor chain, skipping same-box wrappers', () => {
    document.body.innerHTML = `
      <div id="outer"><div id="samebox"><p id="target">text</p></div></div>`
    const target = document.getElementById('target')!
    const samebox = document.getElementById('samebox')!
    const outer = document.getElementById('outer')!
    // same-box wrappers: samebox and outer have identical rects in jsdom (all zeros)
    const chain = [target, samebox, outer]
    expect(adjustHierarchy(chain, 0, 1)).toBe(2) // skips samebox AND outer if same box
    expect(adjustHierarchy(chain, 2, -1)).toBe(0)
  })
})

describe('selector anchoring and tolerance (screenshot.md §1.4)', () => {
  it('builds a nth-of-type path that re-finds the element', () => {
    document.body.innerHTML = '<div><p>one</p><p id="two">two</p><span>s</span></div>'
    const two = document.getElementById('two')!
    const selector = buildSelector(two)
    expect(selector).toBe('div > p:nth-of-type(2)')
    expect(document.querySelector(selector)).toBe(two)
  })

  it('a re-found element counts as the same one within 10% drift', () => {
    expect(boxWithinTolerance({ width: 402, height: 260 }, { width: 400, height: 260 })).toBe(true)
    expect(boxWithinTolerance({ width: 460, height: 260 }, { width: 400, height: 260 })).toBe(false)
    expect(boxWithinTolerance({ width: 400, height: 300 }, { width: 400, height: 260 })).toBe(false)
  })
})

describe('frame memory (screenshot.md §1.4)', () => {
  it("round-trips a record for this page and discards another page's record", () => {
    sessionStorage.clear()
    const record: FrameRecord = {
      kind: 'element',
      selector: 'div > p:nth-of-type(2)',
      margin: 24,
      width: 448,
      height: 308,
      pageX: 176,
      pageY: 96,
      path: location.pathname + location.search,
    }
    rememberFrame(record)
    expect(readFrame()).toEqual(record)

    rememberFrame({ ...record, path: '/other-page' })
    expect(readFrame()).toBeNull() // discarded and cleared
    clearFrame()
    expect(readFrame()).toBeNull()
  })

  it('keeps a box record for free-dragged frames', () => {
    sessionStorage.clear()
    rememberFrame({ kind: 'box', pageX: 120, pageY: 64, width: 300, height: 200, path: location.pathname })
    expect(readFrame()).toMatchObject({ kind: 'box', pageX: 120, width: 300 })
    clearFrame()
  })
})
