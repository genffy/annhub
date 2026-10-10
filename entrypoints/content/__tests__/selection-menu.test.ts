import { describe, expect, it, vi } from 'vitest'
import { plainTextForSelection, selectableRange } from '../selection-menu'

describe('shadow selection fallback (D-25)', () => {
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
