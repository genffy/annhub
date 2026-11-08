import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../user-input', () => ({ isUserInput: () => true }))

const LONG = 'This sentence is deliberately long so the block clears the 120 character minimum for sections. '.repeat(3)

import { BlockEntries, type BlockHoverHooks } from '../block-hover'
import type { BlockCandidate } from '../blocks'
import { uiText } from '../../../utils/ui-text'

/**
 * The hover capsule over fixture DOM (capture.md §6.2): the pointer rests on
 * a start, the outline and its label appear with the capsule, 外一层 / 里一层
 * climb the chain with a dashed preview, and a block that just saw the
 * capsule close pauses until the pointer rests on another start.
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
  '<h2 id="h-install">Install</h2><p id="target" tabindex="0">' +
  LONG +
  '</p><p>' +
  LONG +
  '</p>' +
  '<h2 id="h-usage">Usage</h2><p>' +
  LONG +
  '</p>' +
  '</div>'

const gate = { enabled: async () => true, siteDisabled: async () => false }

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

const outline = (): HTMLElement | null => document.querySelector('[data-ann-ui="block-outline"]')
const capsule = (): HTMLElement | null => document.querySelector('[data-ann-ui="block-capsule"]')
const capsuleLabels = (): string[] => [...(capsule()?.querySelectorAll('button') ?? [])].map(button => button.getAttribute('aria-label') ?? button.textContent ?? '')

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

async function restOn(target: Element, x = 10, y = 10): Promise<void> {
  for (const entries of created.splice(0)) entries.dispose()
  vi.useFakeTimers()
  document.elementFromPoint = vi.fn(() => target)
  const entries = new BlockEntries(document, hooksFor(true), gate)
  created.push(entries)
  entries.install()
  document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }))
  await vi.advanceTimersByTimeAsync(450)
}

describe('the hover reveals the start (capture.md §6.2 悬停入口)', () => {
  it('rests on the innermost start: the code block, with its label on the outline', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    expect(outline()).not.toBeNull()
    expect(capsule()).not.toBeNull()
    const label = document.querySelector('[data-ann-ui="block-label"]')!
    expect(label.textContent).toBe(uiText('block.kind.code') + ' · ' + uiText('block.label.lines', { n: 2 }))
  })

  it('rests on the paragraph of a flat page, one 外一层 from its section', async () => {
    document.body.innerHTML = FLAT
    await restOn(document.getElementById('target')!)
    expect(document.querySelector('[data-ann-ui="block-label"]')!.textContent).toContain(uiText('block.kind.paragraph'))
  })

  it('rests on a heading: the start is the section it begins, the heading one level in', async () => {
    document.body.innerHTML = FLAT
    const hooks = hooksFor(true)
    document.elementFromPoint = vi.fn(() => document.getElementById('h-install'))
    vi.useFakeTimers()
    const entries = new BlockEntries(document, hooks, gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(450)
    expect(document.querySelector('[data-ann-ui="block-label"]')!.textContent).toContain(uiText('block.kind.section'))
    expect(capsuleLabels()).toContain(uiText('block.shrink'))
  })

  it('the capsule buttons run clip, screenshot, download, level buttons and more', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    expect(capsuleLabels()).toEqual([uiText('block.clip'), uiText('block.shot'), uiText('block.download'), uiText('block.expand'), uiText('block.more')])
  })

  it('a child frame offers clipping only: no screenshot and download buttons', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = NESTED
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    const entries = new BlockEntries(document, hooksFor(false), gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(450)
    const labels = capsuleLabels()
    expect(labels).toContain(uiText('block.clip'))
    expect(labels).not.toContain(uiText('block.shot'))
    expect(labels).not.toContain(uiText('block.download'))
  })

  it('resting where nothing qualifies clears the previous outline', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    document.elementFromPoint = vi.fn(() => null)
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 16, clientY: 16 }))
    await vi.advanceTimersByTimeAsync(450)
    expect(outline()).toBeNull()
    expect(capsule()).toBeNull()
  })

  it('scroll clears the outline, and a still pointer re-reveals after the page settles', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    document.dispatchEvent(new Event('scroll'))
    expect(outline()).toBeNull()
    await vi.advanceTimersByTimeAsync(450)
    expect(outline()).not.toBeNull()
  })
})

describe('the stillness clock (capture.md §6.2 停下)', () => {
  it('movement of 6px or more in a 100ms sample restarts the 400ms', async () => {
    document.body.innerHTML = NESTED
    for (const entries of created.splice(0)) entries.dispose()
    vi.useFakeTimers()
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    const entries = new BlockEntries(document, hooksFor(true), gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(150)
    // one still sample, then a jump: the clock restarts
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 30, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(350)
    expect(outline()).toBeNull()
    await vi.advanceTimersByTimeAsync(150)
    expect(outline()).not.toBeNull()
  })

  it('hand jitter under 6px does not restart the clock', async () => {
    document.body.innerHTML = NESTED
    for (const entries of created.splice(0)) entries.dispose()
    vi.useFakeTimers()
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    const entries = new BlockEntries(document, hooksFor(true), gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(150)
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 14, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(300)
    expect(outline()).not.toBeNull()
  })
})

describe('the dwell re-checks the page before it reveals (RV-CAP-15, capture.md §6.2)', () => {
  it('a press whose move still saw a collapsed selection reveals nothing once the drag is under way', async () => {
    const selection = vi.spyOn(document, 'getSelection')
    selection.mockReturnValue({ isCollapsed: true } as Selection)
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!, 10, 10)
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: 10, clientY: 10 }))
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 10, clientY: 10 }))
    selection.mockReturnValue({ isCollapsed: false } as Selection)
    await vi.advanceTimersByTimeAsync(450)
    expect(capsule()).toBeNull()
    expect(outline()).toBeNull()
  })
})

describe('外一层 and 里一层 (capture.md §6.2 换层)', () => {
  function mockCapsuleWidth(): void {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('data-ann-ui') === 'block-capsule') return 40 + this.querySelectorAll('button').length * 28
      return 0
    })
  }

  it('外一层 climbs to the section and on to the article; the capsule right edge stays put', async () => {
    document.body.innerHTML = NESTED2
    mockCapsuleWidth()
    const code = document.getElementById('code')!
    code.getBoundingClientRect = () => new DOMRect(280, 120, 560, 320)
    const section = document.getElementById('s1')!
    section.getBoundingClientRect = () => new DOMRect(260, 100, 600, 480)
    const article = document.querySelector('article')!
    article.getBoundingClientRect = () => new DOMRect(240, 80, 640, 600)
    await restOn(code, 400, 200)
    const before = capsule()!
    const beforeRight = Number.parseFloat(before.style.left) + before.offsetWidth

    const expand = [...before.querySelectorAll('.ann-blk-lv')][before.querySelectorAll('.ann-blk-lv').length - 1] as HTMLButtonElement
    expand.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('[data-ann-ui="block-label"]')!.textContent).toContain(uiText('block.kind.section'))
    expect(capsuleLabels()).toContain(uiText('block.shrink'))
    const after = capsule()!
    const afterRight = Number.parseFloat(after.style.left) + after.offsetWidth
    expect(Math.abs(afterRight - beforeRight)).toBeLessThan(1)

    const nextExpand = [...after.querySelectorAll('.ann-blk-lv')][after.querySelectorAll('.ann-blk-lv').length - 1] as HTMLButtonElement
    nextExpand.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('[data-ann-ui="block-label"]')!.textContent).toContain(uiText('block.kind.article'))
    // the outermost layer grays 外一层 out, never wraps around
    const outermost = [...capsule()!.querySelectorAll('.ann-blk-lv')][capsule()!.querySelectorAll('.ann-blk-lv').length - 1] as HTMLButtonElement
    expect(outermost.disabled).toBe(true)
    expect(outermost.getAttribute('aria-disabled')).toBe('true')
    expect(outermost.title).toBe(uiText('block.outermost'))
  })

  it('里一层 walks back to the start and the clip reports the level change', async () => {
    document.body.innerHTML = FLAT
    const hooks = hooksFor(true)
    document.elementFromPoint = vi.fn(() => document.getElementById('target'))
    vi.useFakeTimers()
    const entries = new BlockEntries(document, hooks, gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(450)
    // paragraph → section → back to the paragraph
    const expand = [...capsule()!.querySelectorAll('.ann-blk-lv')][capsule()!.querySelectorAll('.ann-blk-lv').length - 1] as HTMLButtonElement
    expand.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const shrink = capsule()!.querySelector('.ann-blk-lv') as HTMLButtonElement
    shrink.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('[data-ann-ui="block-label"]')!.textContent).toContain(uiText('block.kind.paragraph'))
    const clip = capsule()!.querySelector('.ann-blk-seg-clip') as HTMLButtonElement
    clip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const [candidate, levelChanged] = hooks.onClip.mock.calls[0] as [BlockCandidate, boolean]
    expect(candidate.element.id).toBe('target')
    expect(levelChanged).toBe(true)
  })

  it('a clip without a level change reports levelChanged = false', async () => {
    document.body.innerHTML = NESTED
    const hooks = hooksFor(true)
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    vi.useFakeTimers()
    const entries = new BlockEntries(document, hooks, gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(450)
    capsule()!
      .querySelector('.ann-blk-seg-clip')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect((hooks.onClip.mock.calls[0] as [BlockCandidate, boolean])[1]).toBe(false)
  })
})

describe('the preview (capture.md §6.2 预览)', () => {
  it('hovering 外一层 draws the dashed outline of the next layer and its label beside the pointer', async () => {
    document.body.innerHTML = FLAT
    await restOn(document.getElementById('target')!)
    const expand = [...capsule()!.querySelectorAll('.ann-blk-lv')][capsule()!.querySelectorAll('.ann-blk-lv').length - 1] as HTMLButtonElement
    expand.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true, clientX: 300, clientY: 60 }))
    const preview = document.querySelector('[data-ann-ui="block-preview"]')
    expect(preview).not.toBeNull()
    const tip = document.querySelector('[data-ann-ui="block-preview-tip"]')!
    expect(tip.textContent).toBe(uiText('block.expand') + ' · ' + uiText('block.kind.section') + ' · Install')
    expand.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }))
    expect(document.querySelector('[data-ann-ui="block-preview"]')).toBeNull()
    expect(document.querySelector('[data-ann-ui="block-preview-tip"]')).toBeNull()
  })

  it('at the outermost layer the preview says so and draws nothing', async () => {
    document.body.innerHTML = '<article id="art"><p>' + LONG + '</p></article>'
    await restOn(document.getElementById('art')!)
    const expand = [...capsule()!.querySelectorAll('.ann-blk-lv')][capsule()!.querySelectorAll('.ann-blk-lv').length - 1] as HTMLButtonElement
    expect(expand.disabled).toBe(true)
    expand.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true, clientX: 300, clientY: 60 }))
    expect(document.querySelector('[data-ann-ui="block-preview"]')).toBeNull()
    expect(document.querySelector('[data-ann-ui="block-preview-tip"]')!.textContent).toBe(uiText('block.outermost'))
  })
})

describe('the pause (capture.md §6.2 暂停)', () => {
  it('a key that closes the capsule pauses the block: it stays quiet until the pointer rests on another', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!, 10, 10)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(outline()).toBeNull()
    // the pointer keeps resting on the same block: no capsule, however long
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 12 }))
    await vi.advanceTimersByTimeAsync(2000)
    expect(outline()).toBeNull()
    // a different block under the pointer releases the pause
    document.elementFromPoint = vi.fn(() => document.querySelector('article p'))
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 14, clientY: 14 }))
    await vi.advanceTimersByTimeAsync(450)
    expect(outline()).not.toBeNull()
    expect(document.querySelector('[data-ann-ui="block-label"]')!.textContent).toContain(uiText('block.kind.paragraph'))
  })

  it('pauseHere pauses the block under the pointer after the selection menu went away', async () => {
    document.body.innerHTML = NESTED
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    const entries = new BlockEntries(document, hooksFor(true), gate)
    created.push(entries)
    entries.install()
    entries.pauseHere(10, 10)
    vi.useFakeTimers()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(2000)
    expect(outline()).toBeNull()
    document.elementFromPoint = vi.fn(() => document.querySelector('article p'))
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 14, clientY: 14 }))
    await vi.advanceTimersByTimeAsync(450)
    expect(outline()).not.toBeNull()
  })
})

describe('capsule placement stays inside the block (capture.md §6.2 位置)', () => {
  const CAPSULE_WIDTH = 208
  const CAPSULE_HEIGHT = 36

  async function showCapsule(clientX: number, clientY: number): Promise<HTMLElement> {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-ann-ui') === 'block-capsule' ? CAPSULE_WIDTH : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-ann-ui') === 'block-capsule' ? CAPSULE_HEIGHT : 0
    })
    const entries = new BlockEntries(document, hooksFor(true), gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX, clientY }))
    await vi.advanceTimersByTimeAsync(450)
    const found = capsule()
    expect(found).toBeInstanceOf(HTMLElement)
    return found as HTMLElement
  }

  it('keeps the capsule inside the post, beside the sidebar', async () => {
    document.body.innerHTML = '<article data-testid="tweet" id="post"><p id="body">' + LONG + '</p></article><div id="sidebar"><h2>Today\'s News</h2></div>'
    const post = document.getElementById('post')!
    post.getBoundingClientRect = () => new DOMRect(280, 120, 560, 320)
    document.elementFromPoint = vi.fn(() => document.getElementById('body'))
    const found = await showCapsule(400, 200)
    const left = Number.parseFloat(found.style.left)
    const right = left + CAPSULE_WIDTH
    expect(right).toBeLessThanOrEqual(840)
    expect(left).toBeGreaterThanOrEqual(280)
  })

  it('moves off a top-right control and keeps the capsule inside the post right edge', async () => {
    document.body.innerHTML = '<article data-testid="tweet" id="post"><p id="body">' + LONG + '</p><button id="caret" type="button">More</button></article>'
    const post = document.getElementById('post')!
    post.getBoundingClientRect = () => new DOMRect(280, 120, 560, 320)
    const caret = document.getElementById('caret')!
    caret.getBoundingClientRect = () => new DOMRect(800, 124, 34, 32)
    document.elementFromPoint = vi.fn((x: number, y: number) => {
      const overCaret = x >= 800 && x <= 834 && y >= 124 && y <= 156
      return overCaret ? caret : document.getElementById('body')
    })
    const found = await showCapsule(400, 200)
    const left = Number.parseFloat(found.style.left)
    const top = Number.parseFloat(found.style.top)
    const right = left + CAPSULE_WIDTH
    const bottom = top + CAPSULE_HEIGHT
    expect(right).toBeLessThanOrEqual(840)
    const overlapsCaret = right > 800 && left < 834 && bottom > 124 && top < 156
    expect(overlapsCaret).toBe(false)
  })
})

describe('a screenshot session owns the pointer in every state (issue #108)', () => {
  it('the session opens: the visible capsule disappears at once, the dwell stays quiet, and it comes back after', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!, 10, 10)
    expect(capsule()).not.toBeNull()

    // the shortcut path: the session appears while the pointer is still
    const session = document.createElement('div')
    session.setAttribute('data-ann-ui', 'screenshot-session')
    document.documentElement.appendChild(session)
    await vi.waitFor(() => expect(capsule()).toBeNull())
    expect(outline()).toBeNull()

    // a key during the session never pauses the block
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    // a dwell during the picking state reveals nothing
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 12 }))
    await vi.advanceTimersByTimeAsync(2000)
    expect(capsule()).toBeNull()
    expect(outline()).toBeNull()

    // once the session ends, the ordinary dwell reveals the same block again
    session.remove()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 12 }))
    await vi.advanceTimersByTimeAsync(450)
    expect(capsule()).not.toBeNull()
  })
})

describe('the hover entry honours its surroundings', () => {
  it('drops the clip capsule while a screenshot is waiting for confirmation', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!, 10, 10)
    expect(capsule()).not.toBeNull()

    const modal = document.createElement('div')
    modal.setAttribute('data-ann-ui', 'screenshot-session')
    modal.className = 'ann-shot-modal'
    document.documentElement.appendChild(modal)
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 40 }))
    expect(capsule()).toBeNull()
    expect(outline()).toBeNull()

    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 8, clientY: 8 }))
    await vi.advanceTimersByTimeAsync(450)
    expect(capsule()).toBeNull()

    // a dwell armed before confirm must not paint once the frame is modal
    modal.remove()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 6, clientY: 6 }))
    document.documentElement.appendChild(modal)
    await vi.advanceTimersByTimeAsync(450)
    expect(capsule()).toBeNull()
  })

  it('Escape and any other key clear the outline when focus is on the page', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(outline()).toBeNull()
  })

  it('moving the pointer off the block clears it, and moving back in time keeps it', async () => {
    document.body.innerHTML = NESTED
    const code = document.getElementById('code')!
    code.getBoundingClientRect = () => new DOMRect(0, 0, 600, 40)
    await restOn(code, 10, 10)
    expect(outline()).not.toBeNull()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 400 }))
    await vi.advanceTimersByTimeAsync(80)
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }))
    await vi.advanceTimersByTimeAsync(200)
    expect(outline()).not.toBeNull()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 400 }))
    await vi.advanceTimersByTimeAsync(180)
    expect(outline()).toBeNull()
  })

  it('drops a replayed clip click for the same block; the next deliberate clip works (issue #105)', async () => {
    document.body.innerHTML = NESTED
    const hooks = hooksFor(true)
    document.elementFromPoint = vi.fn(() => document.getElementById('code'))
    vi.useFakeTimers()
    const entries = new BlockEntries(document, hooks, gate)
    created.push(entries)
    entries.install()
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    await vi.advanceTimersByTimeAsync(450)
    const button = capsule()!.querySelector('.ann-blk-seg-clip')!

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(hooks.onClip).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1600)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(hooks.onClip).toHaveBeenCalledTimes(2)
  })
})
