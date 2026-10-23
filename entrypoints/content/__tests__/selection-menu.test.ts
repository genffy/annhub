import { describe, expect, it, vi } from 'vitest'
import { plainTextForSelection, selectableRange } from '../selection-menu'

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
