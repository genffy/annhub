import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../user-input', () => ({ isUserInput: () => true }))

import { BlockEntries, type BlockHoverHooks } from '../block-hover'
import type { BlockCandidate } from '../blocks'
import { uiText } from '../../../utils/ui-text'

/**
 * Keyboard block mode (capture.md §6.2) over fixture DOM. The chain of the current target is
 * only ever replaced by a new target: ↓ walks back down what ↑ climbed, and a heading-run section on a
 * flat page is saved as that run — not as the container it shares with its neighbours.
 */

const LONG = 'This sentence is deliberately long so the block clears the 120 character minimum for sections. '.repeat(3)

const NESTED = `<article><section><h2>Title</h2><p>${LONG}</p><pre id="code" tabindex="0">const a = 1\nconst b = 2</pre></section></article>`

const FLAT = `<div class="content">
  <h2 id="h-intro">Intro</h2><p>${LONG}</p>
  <h2 id="h-install">Install</h2><p id="target" tabindex="0">${LONG}</p><p>${LONG}</p>
  <h2 id="h-usage">Usage</h2><p>${LONG}</p>
</div>`

const gate = { enabled: async () => true, siteDisabled: async () => false }

function press(key: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}

type Hooks = BlockHoverHooks & { onClip: ReturnType<typeof vi.fn> }

function hooksFor(withScreenshot = true): Hooks {
  const hooks = { onClip: vi.fn(), onDisableSite: vi.fn(), onDisableEntry: vi.fn(), openSettings: vi.fn() } as unknown as Hooks
  if (withScreenshot) hooks.onScreenshot = vi.fn()
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

let scroll: ReturnType<typeof vi.fn>

beforeEach(() => {
  scroll = vi.fn()
  Element.prototype.scrollIntoView = scroll as unknown as typeof Element.prototype.scrollIntoView
})

afterEach(() => {
  // the mode's overlay lives on <html>, not <body>: leave every mode and drop whatever it appended
  for (const entries of created.splice(0)) entries.dispose()
  document.querySelectorAll('[data-ann-ui]').forEach(node => node.remove())
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('levels with ↑ and ↓', () => {
  it('↑ climbs the chain and ↓ comes back down the same chain', () => {
    document.body.innerHTML = NESTED
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
    document.body.innerHTML = NESTED
    document.getElementById('code')!.focus()
    const { hooks } = start()
    press('ArrowDown')
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

describe('a heading-run section on a flat page', () => {
  it('Enter saves the section that is outlined, as its run, not the shared container', () => {
    document.body.innerHTML = FLAT
    document.getElementById('target')!.focus()
    const { hooks } = start()
    // the status reads the run's own words: the Install section, not the first words of the container
    expect(kindText()).toContain(uiText('block.kind.section'))
    expect(kindText()).toContain('Install')
    expect(kindText()).not.toContain('Intro')
    press('Enter')
    const { candidate } = clipped(hooks)
    expect(candidate.kind).toBe('section')
    expect(candidate.range?.start).toBe(document.getElementById('h-install'))
    expect(candidate.range?.end).toBe(document.getElementById('h-usage'))
  })

  it('Tab walks the sections in document order and wraps; Shift+Tab walks back', () => {
    document.body.innerHTML = FLAT
    document.getElementById('target')!.focus()
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

  it('levels keep working after Tab: ↑ climbs from the new section and ↓ returns to it', () => {
    // the article level on a flat page is the page's own <main>
    document.body.innerHTML = `<main>${FLAT}</main>`
    document.getElementById('target')!.focus()
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
    document.body.innerHTML = ['One', 'Two', 'Three'].map(name => `<article tabindex="0" id="u-${name}"><p>${name} unit. ${LONG}</p></article>`).join('')
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
    document.getElementById('code')!.focus()
    const target = document.querySelector('section p') as HTMLElement
    document.elementFromPoint = vi.fn(() => target)
    start()
    scroll.mockClear()
    const overlay = document.querySelector('[data-ann-ui="block-mode-overlay"]')!
    overlay.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 12 }))
    expect(scroll).not.toHaveBeenCalled()
    expect(kindText()).toContain(uiText('block.kind.section'))
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

  it('starts on the first unit in view when nothing is focused (capture.md §6.2)', () => {
    document.body.innerHTML = FLAT
    const target = document.getElementById('h-intro')!
    document.elementFromPoint = vi.fn((_x: number, y: number) => (y > 40 ? target : null))
    start()
    expect(kindText()).toContain('Intro')
  })
})

describe('a child frame offers clipping only (capture.md §3)', () => {
  it('S does nothing and the hint does not promise a screenshot', () => {
    document.body.innerHTML = NESTED
    document.getElementById('code')!.focus()
    const hooks = hooksFor(false)
    start(hooks)
    expect(document.querySelector('.ann-block-mode-hint')?.textContent).toBe(uiText('block.mode.hintClipOnly'))
    press('s')
    expect(document.querySelector('[data-ann-ui="block-mode-overlay"]')).not.toBeNull()
  })

  it('S starts the screenshot for the outlined unit where the hook exists, and ignores Cmd+S', () => {
    document.body.innerHTML = NESTED
    document.getElementById('code')!.focus()
    const { hooks } = start()
    expect(document.querySelector('.ann-block-mode-hint')?.textContent).toBe(uiText('block.mode.hint'))
    press('s', { metaKey: true })
    expect(hooks.onScreenshot).not.toHaveBeenCalled()
    press('s')
    expect(hooks.onScreenshot).toHaveBeenCalledTimes(1)
    expect((hooks.onScreenshot as ReturnType<typeof vi.fn>).mock.calls[0]![0].kind).toBe('code')
  })

  it('the hover capsule has no screenshot button without the hook', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = NESTED
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    const entries = new BlockEntries(document, hooksFor(false), gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    await vi.advanceTimersByTimeAsync(450)
    const capsule = document.querySelector('[data-ann-ui="block-capsule"]')
    expect(capsule).not.toBeNull()
    const labels = [...capsule!.querySelectorAll('button')].map(button => button.textContent)
    expect(labels).toContain(uiText('block.clip'))
    expect(labels).not.toContain(uiText('block.shot'))
    entries.dispose()
  })

  it('drops the clip capsule while a screenshot is waiting for confirmation', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = NESTED
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    const entries = new BlockEntries(document, hooksFor(true), gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    await vi.advanceTimersByTimeAsync(450)
    expect(document.querySelector('[data-ann-ui="block-capsule"]')).not.toBeNull()

    const modal = document.createElement('div')
    modal.setAttribute('data-ann-ui', 'screenshot-session')
    modal.className = 'ann-shot-modal'
    document.documentElement.appendChild(modal)
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 40 }))
    expect(document.querySelector('[data-ann-ui="block-capsule"]')).toBeNull()
    expect(document.querySelector('[data-ann-ui="block-outline"]')).toBeNull()

    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 8, clientY: 8 }))
    await vi.advanceTimersByTimeAsync(450)
    expect(document.querySelector('[data-ann-ui="block-capsule"]')).toBeNull()

    // a dwell armed before confirm must not paint once the frame is modal
    modal.remove()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 6, clientY: 6 }))
    document.documentElement.appendChild(modal)
    await vi.advanceTimersByTimeAsync(450)
    expect(document.querySelector('[data-ann-ui="block-capsule"]')).toBeNull()
    entries.dispose()
  })

  it('with the hook the capsule keeps clip, screenshot, up and more', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = NESTED
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    const entries = new BlockEntries(document, hooksFor(true), gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    await vi.advanceTimersByTimeAsync(450)
    const labels = [...document.querySelectorAll('[data-ann-ui="block-capsule"] button')].map(button => button.textContent)
    expect(labels).toEqual([uiText('block.clip'), uiText('block.shot'), '⌃', uiText('block.more')])
    entries.dispose()
  })
})

describe('capsule placement stays inside the block (capture.md §6.2)', () => {
  const CAPSULE_WIDTH = 164 // half of this, 82px, is the overflow measured at 110% zoom
  const CAPSULE_HEIGHT = 36

  function mockCapsuleBox(): void {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-ann-ui') === 'block-capsule' ? CAPSULE_WIDTH : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-ann-ui') === 'block-capsule' ? CAPSULE_HEIGHT : 0
    })
  }

  async function showCapsule(clientX: number, clientY: number): Promise<HTMLElement> {
    const entries = new BlockEntries(document, hooksFor(true), gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX, clientY }))
    await vi.advanceTimersByTimeAsync(450)
    const capsule = document.querySelector('[data-ann-ui="block-capsule"]')
    expect(capsule).toBeInstanceOf(HTMLElement)
    return capsule as HTMLElement
  }

  it('keeps a 164px capsule inside the post, including the 82px that used to hang off at 110% zoom', async () => {
    vi.useFakeTimers()
    mockCapsuleBox()
    document.body.innerHTML = `<article data-testid="tweet" id="post"><p id="body">${LONG}</p></article><div id="sidebar"><h2>Today's News</h2></div>`
    const post = document.getElementById('post')!
    // right edge 840, directly beside the sidebar
    post.getBoundingClientRect = () => new DOMRect(280, 120, 560, 320)
    const body = document.getElementById('body')!
    document.elementFromPoint = vi.fn(() => body)
    const capsule = await showCapsule(400, 200)
    const left = Number.parseFloat(capsule.style.left)
    const right = left + CAPSULE_WIDTH
    expect(right).toBeLessThanOrEqual(840)
    expect(right).toBeGreaterThan(840 - 16)
    // the old corner-centered placement ended at 840 + 82
    expect(right).toBeLessThan(840 + 82)
    expect(left).toBeGreaterThanOrEqual(280)
  })

  it('moves off a top-right control and keeps the capsule inside the post’s right edge', async () => {
    vi.useFakeTimers()
    mockCapsuleBox()
    document.body.innerHTML = `<article data-testid="tweet" id="post"><p id="body">${LONG}</p><button id="caret" type="button">More</button></article>`
    const post = document.getElementById('post')!
    post.getBoundingClientRect = () => new DOMRect(280, 120, 560, 320)
    const body = document.getElementById('body')!
    const caret = document.getElementById('caret')!
    caret.getBoundingClientRect = () => new DOMRect(800, 124, 34, 32)
    document.elementFromPoint = vi.fn((x: number, y: number) => {
      const overCaret = x >= 800 && x <= 834 && y >= 124 && y <= 156
      return overCaret ? caret : body
    })
    const capsule = await showCapsule(400, 200)
    const left = Number.parseFloat(capsule.style.left)
    const top = Number.parseFloat(capsule.style.top)
    const right = left + CAPSULE_WIDTH
    const bottom = top + CAPSULE_HEIGHT
    expect(right).toBeLessThanOrEqual(840)
    expect(left).toBeGreaterThanOrEqual(280)
    const overlapsCaret = right > 800 && left < 834 && bottom > 124 && top < 156
    expect(overlapsCaret).toBe(false)
  })
})

describe('↓ at the innermost level enters the unit, one level at a time (真机走查 P2-1)', () => {
  it('goes to the section inside the article before the code inside the section, and ↑ walks back out the same way', () => {
    document.body.innerHTML = NESTED
    // start on the article itself: its own chain is just [article]
    const article = document.querySelector('article')!
    article.setAttribute('tabindex', '0')
    article.focus()
    const { hooks } = start()
    expect(kindText()).toContain(uiText('block.kind.article'))
    press('ArrowDown') // into the article: its section, not straight to the code inside the section
    expect(kindText()).toContain(uiText('block.kind.section'))
    press('ArrowDown')
    expect(kindText()).toContain(uiText('block.kind.code'))
    press('ArrowDown') // nothing is inside a code block: it stays
    expect(kindText()).toContain(uiText('block.kind.code'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.section'))
    press('ArrowUp')
    expect(kindText()).toContain(uiText('block.kind.article'))
    press('ArrowDown')
    press('ArrowDown')
    press('Enter') // the outlined code block is what gets saved
    expect(clipped(hooks).candidate.kind).toBe('code')
  })

  it('with a code block in the window, the section around it comes first', () => {
    // a long section of a flat article, scrolled to its code: the heading and the first paragraph are above the window
    document.body.innerHTML = `<main><h2 id="setup">Setup</h2><p id="setup-p">${LONG}</p><pre id="code">npm install</pre><p>${LONG}</p><h2>Next</h2><p>${LONG}</p></main>`
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
    expect(kindText()).toContain(`${uiText('block.kind.section')} · Setup`)
    press('ArrowDown')
    expect(kindText()).toContain(uiText('block.kind.code'))
    press('Enter')
    expect(clipped(hooks).candidate.element.id).toBe('code')
  })
})
