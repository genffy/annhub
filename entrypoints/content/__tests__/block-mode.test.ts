import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../user-input', () => ({ isUserInput: () => true }))

const LONG = 'This sentence is deliberately long so the block clears the 120 character minimum for sections. '.repeat(3)

import { BlockEntries, type BlockHoverHooks } from '../block-hover'
import type { BlockCandidate } from '../blocks'
import { uiText } from '../../../utils/ui-text'

/**
 * Keyboard block mode (capture.md §6.2 区块模式) over fixture DOM. The same
 * chain the hover capsule reads: the mode starts at the focused element's
 * start, Tab walks the targets of the same tier, ↑ / ↓ climb the chain the
 * way 外一层 / 里一层 do, and ↓ at the innermost level enters the target
 * inside, one level at a time.
 */

const NESTED = '<article><section><h2>Title</h2><p>' + LONG + '</p><pre id="code" tabindex="0">const a = 1\nconst b = 2</pre></section></article>'
const NESTED2 =
  '<article><section id="s1"><h2>One</h2><p>' +
  LONG +
  '</p><pre id="code" tabindex="0">const a = 1\nconst b = 2</pre><p>' +
  LONG +
  '</p></section><section id="s2"><h2>Two</h2><p>' +
  LONG +
  '</p></section></article>'

const FLAT =
  '<div class="content">' +
  '<h2 id="h-intro">Intro</h2><p>' +
  LONG +
  '</p>' +
  '<h2 id="h-install" tabindex="0">Install</h2><p id="target" tabindex="0">' +
  LONG +
  '</p><p>' +
  LONG +
  '</p>' +
  '<h2 id="h-usage">Usage</h2><p>' +
  LONG +
  '</p>' +
  '</div>'

const gate = { enabled: async () => true, siteDisabled: async () => false }

function press(key: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}

type Hooks = BlockHoverHooks & { onClip: ReturnType<typeof vi.fn> }

function hooksFor(withTopFrameEntries = true): Hooks {
  const hooks = { onClip: vi.fn(), onDisableSite: vi.fn(), onDisableEntry: vi.fn(), openSettings: vi.fn() } as unknown as Hooks
  if (withTopFrameEntries) {
    hooks.onScreenshot = vi.fn()
    hooks.onDownload = vi.fn()
  }
  return hooks
}

const created: BlockEntries[] = []

function start(hooks: Hooks = hooksFor()): { entries: BlockEntries; hooks: Hooks } {
  const entries = new BlockEntries(document, hooks, gate)
  created.push(entries)
  entries.enterBlockMode()
  return { entries, hooks }
}

const kindText = (): string => document.querySelector('.ann-block-mode-kind')?.textContent ?? ''
const clipped = (hooks: Hooks): { candidate: BlockCandidate; levelChanged: boolean } => {
  const [candidate, levelChanged] = hooks.onClip.mock.calls[0] as [BlockCandidate, boolean]
  return { candidate, levelChanged }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView
})

afterEach(() => {
  for (const entries of created.splice(0)) entries.dispose()
  document.querySelectorAll('[data-ann-ui]').forEach(node => node.remove())
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('levels with ↑ and ↓', () => {
  it('↑ climbs the chain and ↓ comes back down the same chain', () => {
    document.body.innerHTML = NESTED2
    document.getElementById('code')!.focus()
    const { hooks } = start()
    expect(kindText()).toContain(uiText('block.kind.code'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.section'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.article'))
    press('ArrowDown')
    expect(kindText()).toContain(uiText('block.kind.section'))
    press('ArrowDown')
    expect(kindText()).toContain(uiText('block.kind.code'))
    press('Enter')
    const { candidate, levelChanged } = clipped(hooks)
    expect(candidate.kind).toBe('code')
    expect(candidate.element.id).toBe('code')
    expect(levelChanged).toBe(true)
  })

  it('stops at the ends of the chain instead of wrapping or throwing', () => {
    document.body.innerHTML = NESTED2
    document.getElementById('code')!.focus()
    const { hooks } = start()
    press('ArrowUp')
    press('ArrowUp')
    press('ArrowUp')
    press('ArrowUp')
    press('Enter')
    expect(clipped(hooks).candidate.kind).toBe('article')
  })

  it('without a level change the clip reports levelChanged = false', () => {
    document.body.innerHTML = NESTED
    document.getElementById('code')!.focus()
    const { hooks } = start()
    press('Enter')
    expect(clipped(hooks).levelChanged).toBe(false)
  })
})

describe('the start on a flat page', () => {
  it('starts at the paragraph the focus sits in, and ↑ reaches its section then the article', () => {
    document.body.innerHTML = FLAT
    document.getElementById('target')!.focus()
    const { hooks } = start()
    expect(kindText()).toContain(uiText('block.kind.paragraph'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.section'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.article'))
    press('ArrowDown')
    press('Enter')
    const { candidate } = clipped(hooks)
    expect(candidate.kind).toBe('section')
    expect(candidate.range?.start).toBe(document.getElementById('h-install'))
    expect(candidate.range?.end).toBe(document.getElementById('h-usage'))
  })

  it('a focused heading starts at the section it begins', () => {
    document.body.innerHTML = FLAT
    document.getElementById('h-install')!.focus()
    start()
    expect(kindText()).toContain(uiText('block.kind.section'))
    press('ArrowDown')
    expect(kindText()).toContain(uiText('block.kind.heading'))
  })

  it('Tab walks the sections in document order and wraps; Shift+Tab walks back', () => {
    document.body.innerHTML = FLAT
    document.getElementById('h-install')!.focus()
    start()
    expect(kindText()).toContain('Install')
    press('Tab')
    expect(kindText()).toContain('Usage')
    press('Tab')
    expect(kindText()).toContain('Intro')
    press('Tab', { shiftKey: true })
    expect(kindText()).toContain('Usage')
    press('Tab', { shiftKey: true })
    expect(kindText()).toContain('Install')
  })

  it('Tab walks the block tier in document order: headings stop at themselves', () => {
    document.body.innerHTML =
      '<div class="content"><h2 id="h-a">Alpha</h2><p id="p-a" tabindex="0">Alpha one. ' +
      LONG +
      '</p><p id="p-a2">Alpha two. ' +
      LONG +
      '</p><h2 id="h-b">Beta</h2><p id="p-b">Beta one. ' +
      LONG +
      '</p><p id="p-b2">Beta two. ' +
      LONG +
      '</p></div>'
    document.getElementById('p-a')!.focus()
    start()
    expect(kindText()).toContain(uiText('block.kind.paragraph'))
    expect(kindText()).toContain('Alpha one')
    press('Tab')
    expect(kindText()).toContain(uiText('block.kind.paragraph'))
    expect(kindText()).toContain('Alpha two')
    press('Tab')
    expect(kindText()).toContain(uiText('block.kind.heading'))
    expect(kindText()).toContain('Beta')
    press('Tab')
    expect(kindText()).toContain(uiText('block.kind.paragraph'))
    expect(kindText()).toContain('Beta one')
    press('Tab')
    expect(kindText()).toContain(uiText('block.kind.paragraph'))
    expect(kindText()).toContain('Beta two')
    press('Tab')
    expect(kindText()).toContain(uiText('block.kind.heading'))
    expect(kindText()).toContain('Alpha')
  })

  it('levels keep working after Tab: ↑ climbs from the new section and ↓ returns to it', () => {
    document.body.innerHTML = '<main>' + FLAT + '</main>'
    document.getElementById('h-install')!.focus()
    const { hooks } = start()
    press('Tab')
    expect(kindText()).toContain('Usage')
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.article'))
    press('ArrowDown')
    expect(kindText()).toContain('Usage')
    press('Enter')
    expect(clipped(hooks).candidate.range?.start).toBe(document.getElementById('h-usage'))
  })
})

describe('Tab between whole-element units', () => {
  it('visits article units in document order from the focused one', () => {
    document.body.innerHTML = ['One', 'Two', 'Three'].map(name => '<article tabindex="0" id="u-' + name + '"><p>' + name + ' unit. ' + LONG + '</p></article>').join('')
    document.getElementById('u-Two')!.focus()
    start()
    expect(kindText()).toContain('Two unit')
    press('Tab')
    expect(kindText()).toContain('Three unit')
    press('Tab')
    expect(kindText()).toContain('One unit')
  })
})

describe('scrolling and focus', () => {
  it('only keyboard moves scroll the page; pointer moves just re-aim the outline', () => {
    document.body.innerHTML = NESTED
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll as unknown as typeof Element.prototype.scrollIntoView
    document.getElementById('code')!.focus()
    const target = document.querySelector('section p') as HTMLElement
    document.elementFromPoint = vi.fn(() => target)
    start()
    scroll.mockClear()
    const overlay = document.querySelector('[data-ann-ui="block-mode-overlay"]')!
    overlay.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 12 }))
    expect(scroll).not.toHaveBeenCalled()
    expect(kindText()).toContain(uiText('block.kind.paragraph'))
    press('ArrowUp')
    expect(scroll).toHaveBeenCalled()
  })

  it('a pointer move over nothing keeps the outlined target, so Enter saves what is drawn', () => {
    document.body.innerHTML = NESTED
    document.getElementById('code')!.focus()
    document.elementFromPoint = vi.fn(() => null)
    const { hooks } = start()
    document.querySelector('[data-ann-ui="block-mode-overlay"]')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 1, clientY: 1 }))
    press('Enter')
    expect(clipped(hooks).candidate.kind).toBe('code')
  })

  it('takes keyboard focus for the mode and gives it back on Esc', () => {
    document.body.innerHTML = NESTED
    const code = document.getElementById('code')!
    code.focus()
    start()
    expect(document.activeElement).not.toBe(code)
    press('Escape')
    expect(document.querySelector('[data-ann-ui="block-mode-overlay"]')).toBeNull()
    expect(document.activeElement).toBe(code)
  })

  it('starts on the first start in view when nothing is focused (capture.md §6.2)', () => {
    document.body.innerHTML = FLAT
    const target = document.getElementById('h-intro')!
    document.elementFromPoint = vi.fn((_x: number, y: number) => (y > 40 ? target : null))
    start()
    expect(kindText()).toContain(uiText('block.kind.section'))
    expect(kindText()).toContain('Intro')
  })
})

describe('a child frame offers clipping only (capture.md §3)', () => {
  it('S does nothing and the hint does not promise a screenshot', () => {
    document.body.innerHTML = NESTED
    document.getElementById('code')!.focus()
    const hooks = hooksFor(false)
    start(hooks)
    const hint = document.querySelector('.ann-block-mode-hint')!
    expect([...hint.querySelectorAll('kbd')].map(cap => cap.textContent)).toEqual(['Tab', '↑', '↓', 'Enter', 'Esc'])
    press('s')
    expect(document.querySelector('[data-ann-ui="block-mode-overlay"]')).not.toBeNull()
  })

  it('S starts the screenshot for the outlined unit where the hook exists, and ignores Cmd+S', () => {
    document.body.innerHTML = NESTED
    document.getElementById('code')!.focus()
    const { hooks } = start()
    expect([...document.querySelectorAll('.ann-block-mode-hint kbd')].map(cap => cap.textContent)).toEqual(['Tab', '↑', '↓', 'Enter', 'S', 'D', 'Esc'])
    press('s', { metaKey: true })
    expect(hooks.onScreenshot).not.toHaveBeenCalled()
    press('s')
    expect(hooks.onScreenshot).toHaveBeenCalledTimes(1)
    expect((hooks.onScreenshot as ReturnType<typeof vi.fn>).mock.calls[0]![0].kind).toBe('code')
  })
})

describe('the mode hint mentions a page without keyboard focus', () => {
  it('adds the note while the page has no focus and clears it when focus returns', () => {
    const hasFocus = vi.spyOn(document, 'hasFocus')
    hasFocus.mockReturnValue(false)
    const { entries } = start()
    const hint = document.querySelector('.ann-block-mode-hint')!
    expect(hint.textContent).toContain(uiText('page.noFocus'))

    hasFocus.mockReturnValue(true)
    document.dispatchEvent(new FocusEvent('focus'))
    expect(hint.textContent).not.toContain(uiText('page.noFocus'))
    hasFocus.mockRestore()
    entries.exitBlockMode()
  })
})

describe('↓ at the innermost level enters the target, one level at a time', () => {
  it('goes to the section inside the article before the paragraph inside the section, and ↑ walks back out the same way', () => {
    document.body.innerHTML = NESTED2
    const article = document.querySelector('article')!
    article.setAttribute('tabindex', '0')
    article.focus()
    const { hooks } = start()
    expect(kindText()).toContain(uiText('block.kind.article'))
    press('ArrowDown') // into the article: its section
    expect(kindText()).toContain(uiText('block.kind.section'))
    press('ArrowDown') // into the section: its first start, the paragraph
    expect(kindText()).toContain(uiText('block.kind.paragraph'))
    press('ArrowDown') // nothing is inside a paragraph: it stays
    expect(kindText()).toContain(uiText('block.kind.paragraph'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.section'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.article'))
    press('ArrowDown')
    press('ArrowDown')
    press('Enter')
    expect(clipped(hooks).candidate.kind).toBe('block')
    expect(clipped(hooks).candidate.blockShape).toBe('paragraph')
  })

  it('with a code block in the window, the section around it comes first', () => {
    document.body.innerHTML =
      '<main><h2 id="setup">Setup</h2><p id="setup-p">' + LONG + '</p><pre id="code">npm install</pre><p>' + LONG + '</p><h2>Next</h2><p>' + LONG + '</p></main>'
    const place = (id: string, top: number, bottom: number): void => {
      document.getElementById(id)!.getBoundingClientRect = () => new DOMRect(0, top, 600, bottom - top)
    }
    place('setup', -400, -360)
    place('setup-p', -340, -20)
    place('code', 10, 200)
    const main = document.querySelector('main')!
    main.setAttribute('tabindex', '0')
    main.focus()
    const { hooks } = start()
    expect(kindText()).toContain(uiText('block.kind.article'))
    press('ArrowDown')
    expect(kindText()).toContain(uiText('block.kind.section') + ' · Setup')
    press('ArrowDown')
    expect(kindText()).toContain(uiText('block.kind.code'))
    press('ArrowUp')
    press('ArrowUp')
    press('Enter')
    expect(clipped(hooks).candidate.kind).toBe('article')
  })
})

describe('a timeline post stays the outermost target (issue #107)', () => {
  const tweet = (id: string): string => '<article data-testid="tweet" id="' + id + '"><p id="' + id + '-body">' + id + ' tweet body.</p></article>'

  it('↑ in block mode stays on the post', () => {
    document.body.innerHTML = '<main id="col"><section id="feed"><h2>Explore</h2>' + tweet('a') + tweet('b') + tweet('c') + '</section></main>'
    const body = document.getElementById('a-body')!
    body.setAttribute('tabindex', '0')
    body.focus()
    start()
    expect(kindText()).toContain(uiText('block.kind.post'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.post'))
    expect(kindText()).not.toContain(uiText('block.kind.section'))
    expect(kindText()).not.toContain(uiText('block.kind.article'))
  })
})

describe('the shot hands over the outlined target (RV-CAP-13, capture.md §6.2)', () => {
  it("block mode's S receives the section's interval; an element-kind block keeps its plain element", () => {
    document.body.innerHTML = FLAT
    document.getElementById('target')!.focus()
    const flatHooks = hooksFor(true)
    start(flatHooks)
    press('ArrowUp')
    press('s')
    const section = (flatHooks.onScreenshot as ReturnType<typeof vi.fn>).mock.calls[0]![0] as BlockCandidate
    expect(section.kind).toBe('section')
    expect(section.range?.start).toBe(document.getElementById('h-install'))
    expect(section.range?.end).toBe(document.getElementById('h-usage'))
    for (const entries of created.splice(0)) entries.dispose()
    document.querySelectorAll('[data-ann-ui]').forEach(node => node.remove())

    document.body.innerHTML = NESTED
    document.getElementById('code')!.focus()
    const nestedHooks = hooksFor(true)
    start(nestedHooks)
    press('s')
    const code = (nestedHooks.onScreenshot as ReturnType<typeof vi.fn>).mock.calls[0]![0] as BlockCandidate
    expect(code.kind).toBe('code')
    expect(code.range).toBeUndefined()
    expect(code.element.id).toBe('code')
  })
})
