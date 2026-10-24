import { describe, expect, it, vi } from 'vitest'
import { anchorLineBox, contentColumnRect, placeSelectionMenu, plainTextForSelection, selectableRange, type Box } from '../selection-menu'

describe('shadow selection fallback (capture.md §3)', () => {
  it('keeps a pure-text capture when composed ranges are unavailable', () => {
    document.body.innerHTML = '<div id="host"></div>'
    const host = document.getElementById('host')!
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<p>Shadow text</p>'
    const collapsed = document.createRange()
    collapsed.selectNodeContents(host)
    const selection = { rangeCount: 1, getRangeAt: () => collapsed, toString: () => 'Shadow text', anchorNode: host }
    vi.spyOn(document, 'getSelection').mockReturnValue(selection as unknown as Selection)
    const range = selectableRange(document, root)
    expect(range).not.toBeNull()
    expect(plainTextForSelection(range!)).toBe('Shadow text')
    vi.restoreAllMocks()
  })
})

describe('Enter follows the button that holds focus (真机走查 P3-3)', () => {
  it('fires the focused action, not a stale recorded one; a bare Enter stays with the page', async () => {
    vi.resetModules()
    vi.doMock('../user-input', () => ({ isUserInput: () => true }))
    const { SelectionMenu } = await import('../selection-menu')
    document.body.innerHTML = '<p id="para">Selectable words for the menu to appear.</p>'
    const para = document.getElementById('para')!
    const range = document.createRange()
    range.selectNodeContents(para)
    // jsdom ranges have no layout box
    ;(range as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left: 10, top: 10, right: 300, bottom: 40, width: 290, height: 30, x: 10, y: 10, toJSON: () => ({}) }) as DOMRect
    const onClip = vi.fn()
    const onScreenshot = vi.fn()
    const menu = new SelectionMenu(document, { onClip, onScreenshot })
    menu.show(range)
    const buttons = Array.from(document.querySelectorAll('[data-ann-ui="selection-menu"] button'))
    expect(buttons.length).toBe(2)
    // focus walked off the menu (caret browsing arrows): Enter must not fire the stale item
    document.body.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(onClip).not.toHaveBeenCalled()
    expect(onScreenshot).not.toHaveBeenCalled()
    // the Screenshot button focused: Enter fires exactly that one
    ;(buttons[1] as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(onClip).not.toHaveBeenCalled()
    expect(onScreenshot).toHaveBeenCalledTimes(1)
    menu.dismiss()
    vi.restoreAllMocks()
  })
})

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
})

describe('selection menu placement (x.com Home, issue #109)', () => {
  const menu = { width: 220, height: 44 }
  const viewport = { width: 1440, height: 813 }
  // Measured on a 1440px three-column page: text sits in the center column, the sidebar starts at 900.
  const column = box(299, 0, 601, 813)
  const anchor = box(367, 200, 429.3, 20)

  it('centers on the selection inside the column instead of the sidebar', () => {
    const placed = placeSelectionMenu(anchor, menu, viewport, column)
    expect(placed.left).toBeCloseTo(anchor.left + anchor.width / 2 - menu.width / 2)
    expect(placed.left).toBeGreaterThanOrEqual(column.left)
    expect(placed.left + menu.width).toBeLessThanOrEqual(column.right)
    expect(placed.left).toBeLessThan(anchor.right)
    expect(placed.top).toBeCloseTo(anchor.top - 8 - menu.height)
  })

  it('pulls a selection at the column edge back inside the column', () => {
    const edge = box(860, 200, 100, 20)
    const textColumn = box(400, 0, 580, 400)
    const placed = placeSelectionMenu(edge, menu, viewport, textColumn)
    expect(placed.left + menu.width).toBeCloseTo(textColumn.right)
    expect(placed.left).toBeLessThan(edge.right)
    expect(placed.left + menu.width).toBeGreaterThan(edge.left)
  })

  it('drops below the line when the top of the viewport is too close', () => {
    const placed = placeSelectionMenu(box(367, 12, 200, 20), menu, viewport, column)
    expect(placed.top).toBeCloseTo(32 + 8)
  })

  it('keeps a page-width box and a missing column on screen, still over the selection', () => {
    const page = box(0, 0, viewport.width, viewport.height)
    const nearRight = box(1300, 200, 80, 20)
    for (const limits of [null, page, box(100, 0, 100, 40)]) {
      const placed = placeSelectionMenu(nearRight, menu, viewport, limits)
      expect(placed.left).toBeGreaterThanOrEqual(8)
      expect(placed.left + menu.width).toBeLessThanOrEqual(viewport.width - 8)
      expect(placed.left).toBeLessThan(nearRight.right)
    }
  })

  it('uses the viewport rect as given, without adding a scroll offset', () => {
    const visible = box(367, 180, 429.3, 20)
    const placed = placeSelectionMenu(visible, menu, viewport, column)
    expect(placed.top).toBeCloseTo(visible.top - 8 - menu.height)
  })
})

describe('anchor line of a selection', () => {
  it('unions inline fragments on the first line and ignores a caret rect and the next line', () => {
    const fallback = box(0, 0, 10, 10)
    const line = anchorLineBox([box(367, 833, 0, 20), box(367, 833, 37.8, 20), box(404.8, 833, 37.7, 20), box(442.5, 833, 353.8, 20), box(367, 857, 400, 20)], fallback)
    expect(line.left).toBeCloseTo(367)
    expect(line.right).toBeCloseTo(796.3)
    expect(line.top).toBeCloseTo(833)
    expect(line.bottom).toBeCloseTo(853)
  })

  it('falls back when every rect is empty', () => {
    const fallback = box(10, 20, 30, 40)
    expect(anchorLineBox([box(0, 0, 0, 0)], fallback)).toEqual(fallback)
  })
})

describe('content column of a selection', () => {
  it('uses the nearest box that can hold the menu, not the page and not an inline or a shrink-wrapped parent', () => {
    document.body.innerHTML = '<div id="page"><div id="col"><p id="narrow"><span id="word">hello</span></p></div></div>'
    const word = document.getElementById('word')!
    const narrow = document.getElementById('narrow')!
    const col = document.getElementById('col')!
    const page = document.getElementById('page')!
    word.style.display = 'inline'
    narrow.getBoundingClientRect = () => new DOMRect(420, 40, 80, 24)
    col.getBoundingClientRect = () => new DOMRect(300, 0, 600, 800)
    page.getBoundingClientRect = () => new DOMRect(0, 0, 1440, 800)
    const range = document.createRange()
    range.selectNodeContents(word)
    const found = contentColumnRect(range, 220, 1440)
    expect(found?.left).toBe(300)
    expect(found?.width).toBe(600)
  })

  it('returns null when every ancestor is the page', () => {
    document.body.innerHTML = '<div id="page"><p id="only">text</p></div>'
    document.getElementById('only')!.getBoundingClientRect = () => new DOMRect(0, 0, 1440, 40)
    document.getElementById('page')!.getBoundingClientRect = () => new DOMRect(0, 0, 1440, 800)
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('only')!)
    expect(contentColumnRect(range, 220, 1440)).toBeNull()
  })

  it('crosses an open shadow root to the host column', () => {
    document.body.innerHTML = '<div id="host"></div>'
    const host = document.getElementById('host')!
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<p id="inner">shadow words</p>'
    const inner = root.getElementById('inner')!
    inner.getBoundingClientRect = () => new DOMRect(40, 10, 80, 20)
    host.getBoundingClientRect = () => new DOMRect(20, 0, 480, 200)
    const range = document.createRange()
    range.selectNodeContents(inner)
    const found = contentColumnRect(range, 220, 1440)
    expect(found?.left).toBe(20)
    expect(found?.width).toBe(480)
  })
})
