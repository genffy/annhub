import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../user-input', () => ({ isUserInput: () => true }))

import { BlockEntries, type BlockHoverHooks } from '../block-hover'
import type { BlockCandidate } from '../blocks'
import { uiText } from '../../../utils/ui-text'

/**
 * Keyboard block mode (capture.md §6.2, D-27) over fixture DOM. The chain of the current target is
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

  it('starts on the first unit in view when nothing is focused (D-27)', () => {
    document.body.innerHTML = FLAT
    const target = document.getElementById('h-intro')!
    document.elementFromPoint = vi.fn((_x: number, y: number) => (y > 40 ? target : null))
    start()
    expect(kindText()).toContain('Intro')
  })
})

describe('a child frame offers clipping only (D-29)', () => {
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
