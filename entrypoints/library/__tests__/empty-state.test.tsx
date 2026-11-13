import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyState } from '../library-view-helpers'
import { readHash } from '../route'
import { uiText } from '../ui-text'

/**
 * An empty view says how to fill it, and where that is a shortcut it names the key the browser has bound to the
 * screenshot, not the default one (extension.md §5, §7.1). With no key bound it names none and points at the
 * selection menu, which is always there.
 */

const KEYS = 'Ctrl+Shift+S'
/** Any way the words could name a key: a spelled-out modifier or a Mac glyph, or the slot left unfilled. */
const A_KEY = /Cmd|Ctrl|Shift|⌘|⇧|\{keys\}/

/** The view's empty answer as a reader sees it: the text, not the markup (which escapes the quotes of the copy). */
function textOf(view: 'all' | 'clips' | 'screenshots' | 'highlights', shortcutKeys: string): string {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<>{emptyState(view, readHash(`#/${view}`), shortcutKeys, () => {})}</>)
  return host.textContent ?? ''
}

describe('the empty views and the screenshot key', () => {
  it('write the key the browser binds into the "all" and the "screenshots" views', () => {
    expect(textOf('all', KEYS)).toContain(uiText('library.empty.how.shot', { keys: KEYS }))
    expect(textOf('screenshots', KEYS)).toContain(uiText('library.empty.screenshots.desc', { keys: KEYS }))
  })

  it('name no key when the browser binds none, and point at the selection menu instead', () => {
    expect(textOf('all', '')).toContain(uiText('library.empty.how.shot.unbound'))
    expect(textOf('screenshots', '')).toContain(uiText('library.empty.screenshots.desc.unbound'))
    for (const view of ['all', 'screenshots'] as const) expect(textOf(view, ''), `the ${view} view names a key`).not.toMatch(A_KEY)
  })

  it('leave the views that have no key to name as they are', () => {
    for (const view of ['clips', 'highlights'] as const) expect(textOf(view, ''), view).toBe(textOf(view, KEYS))
  })
})
