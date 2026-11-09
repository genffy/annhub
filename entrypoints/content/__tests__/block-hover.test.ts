import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../user-input', () => ({ isUserInput: () => true }))

const LONG = 'This sentence is deliberately long so the block clears the 120 character minimum for sections. '.repeat(3)

import { BlockEntries, paintOutline, placeLabel, type BlockHoverHooks } from '../block-hover'
import type { PlacedBox } from '../capsule-place'
import type { BlockCandidate } from '../blocks'
import { layerKindName, layerLabel } from '../target-chain'
import { uiText } from '../../../utils/ui-text'

/**
 * The hover capsule over fixture DOM (capture.md §6.2): the pointer rests on
 * a start, the outline and its label appear with the capsule — the range is
 * decided by where the pointer stops, the capsule has no level buttons — and
 * a block that just saw the capsule close pauses until the pointer rests on
 * another start.
 */

const NESTED = '<article><section><h2>Title</h2><p>' + LONG + '</p><pre id="code" tabindex="0">const a = 1\nconst b = 2</pre></section></article>'
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

  it('rests on the paragraph of a flat page: the target is the paragraph itself', async () => {
    document.body.innerHTML = FLAT
    await restOn(document.getElementById('target')!)
    expect(document.querySelector('[data-ann-ui="block-label"]')!.textContent).toContain(uiText('block.kind.paragraph'))
  })

  it('rests in the gap between the blocks: the target is the article the gap belongs to', async () => {
    document.body.innerHTML = FLAT
    // elementFromPoint answers the shared container: the pointer is on its own gap
    await restOn(document.querySelector('.content')!)
    const label = document.querySelector('[data-ann-ui="block-label"]')!
    expect(label.textContent).toContain(uiText('block.kind.article'))
    expect(label.textContent).toContain(uiText('block.label.whole'))
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
    // the start is the section the heading begins; the heading stays one ↓ away in block mode
    expect(document.querySelector('[data-ann-ui="block-label"]')!.textContent).toContain(uiText('block.kind.section'))
    expect(capsuleLabels()).toEqual([uiText('block.clip'), uiText('block.shot'), uiText('block.download'), uiText('block.more')])
  })

  it('the capsule buttons run clip, screenshot, download and more — no level buttons', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    expect(capsuleLabels()).toEqual([uiText('block.clip'), uiText('block.shot'), uiText('block.download'), uiText('block.more')])
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

describe('leaving the window is not an element appearing under the pointer (capture.md §6.2 收起)', () => {
  it('the capsule coming up under a resting pointer fires a leave towards it: the hover stays', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    expect(capsule()).not.toBeNull()
    // what Chrome does when an element appears under a pointer that has not moved: the old chain is left towards it
    document.getElementById('code')!.dispatchEvent(new MouseEvent('pointerleave', { relatedTarget: capsule() }))
    await vi.advanceTimersByTimeAsync(400)
    expect(capsule()).not.toBeNull()
    expect(outline()).not.toBeNull()
  })

  it('so does any element of the page that comes up under it', async () => {
    document.body.innerHTML = NESTED + '<div id="popover">hello</div>'
    await restOn(document.getElementById('code')!)
    document.getElementById('code')!.dispatchEvent(new MouseEvent('pointerleave', { relatedTarget: document.getElementById('popover') }))
    await vi.advanceTimersByTimeAsync(400)
    expect(capsule()).not.toBeNull()
  })

  it('the pointer leaving the document closes the hover after 150ms', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    document.getElementById('code')!.dispatchEvent(new MouseEvent('pointerleave', { relatedTarget: null }))
    await vi.advanceTimersByTimeAsync(100)
    expect(capsule()).not.toBeNull()
    await vi.advanceTimersByTimeAsync(100)
    expect(capsule()).toBeNull()
    expect(outline()).toBeNull()
  })

  it('a leave towards another document (a frame beside this one) is leaving this one', async () => {
    document.body.innerHTML = NESTED
    await restOn(document.getElementById('code')!)
    const elsewhere = document.implementation.createHTMLDocument('frame').createElement('div')
    document.getElementById('code')!.dispatchEvent(new MouseEvent('pointerleave', { relatedTarget: elsewhere }))
    await vi.advanceTimersByTimeAsync(200)
    expect(capsule()).toBeNull()
  })
})

describe('the label sits above the outline, in view, and gives way to the capsule (capture.md §6.2 标注怎样写)', () => {
  const LABEL_HEIGHT = 24
  const CAPSULE_WIDTH = 152
  const CAPSULE_HEIGHT = 36

  beforeEach(() => {
    // jsdom has no layout: the label is 8px a character, 24px tall
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-ann-ui') === 'block-label' ? (this.textContent ?? '').length * 8 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-ann-ui') === 'block-label' ? LABEL_HEIGHT : 0
    })
  })

  function layerAt(left: number, top: number, width: number, height = 200): BlockCandidate {
    document.body.innerHTML = '<p id="para">' + LONG + '</p>'
    const element = document.getElementById('para') as HTMLElement
    element.getBoundingClientRect = () => new DOMRect(left, top, width, height)
    return { kind: 'block', blockShape: 'paragraph', element }
  }

  /** The box `positionCapsule` reports for a capsule at this corner. */
  function capsuleAt(left: number, top: number): PlacedBox {
    return { left, top, right: left + CAPSULE_WIDTH, bottom: top + CAPSULE_HEIGHT }
  }

  function place(layer: BlockCandidate, capsule: PlacedBox | null): HTMLElement {
    const { label } = paintOutline(document, layer, false)
    placeLabel(document, label, layer, capsule)
    return label
  }

  it('sits above the top edge, at its left end, when the window has room', () => {
    const label = place(layerAt(100, 100, 600), null)
    expect(label.style.left).toBe('104px')
    expect(label.style.top).toBe(100 - LABEL_HEIGHT - 4 + 'px')
  })

  it('a block near the top of the window pins the label to the visible top instead of above the window', () => {
    // 10px from the top: above the edge would be −18px
    expect(place(layerAt(100, 10, 600), null).style.top).toBe('4px')
    // a block taller than the window, scrolled so its top is far above
    expect(place(layerAt(100, -300, 600, 2000), null).style.top).toBe('4px')
    // just enough room: 33 − 24 − 4 = 5
    expect(place(layerAt(100, 33, 600), null).style.top).toBe('5px')
  })

  it('a block narrower than 260px keeps the kind alone; a wider one the full label', () => {
    const narrow = layerAt(100, 100, 240)
    expect(place(narrow, null).textContent).toBe(layerKindName(narrow))
    const wide = layerAt(100, 100, 320)
    expect(place(wide, null).textContent).toBe(layerLabel(wide, 'content'))
    expect(layerLabel(wide, 'content').length).toBeGreaterThan(layerKindName(wide).length)
  })

  it('a label that would touch the capsule keeps the kind alone; one clear of it keeps the words', () => {
    // the capsule sits in the block's right-top corner, 6px inside: in a 300px block it meets the label
    const middling = layerAt(100, 100, 300)
    const touching = place(middling, capsuleAt(400 - CAPSULE_WIDTH - 6, 82))
    expect(touching.textContent).toBe(layerKindName(middling))
    // in a wide block it is far from the label
    const wide = layerAt(100, 100, 600)
    const clear = place(wide, capsuleAt(700 - CAPSULE_WIDTH - 6, 82))
    expect(clear.textContent).toBe(layerLabel(wide, 'content'))
    // a capsule on the same side but below the label's rows does not touch it either
    const below = place(middling, capsuleAt(400 - CAPSULE_WIDTH - 6, 140))
    expect(below.textContent).toBe(layerLabel(middling, 'content'))
  })

  it('a kind that still touches the capsule (a block barely wider than it) goes up above the capsule', () => {
    // 170px wide: the capsule fills it from 12px in, and even the kind alone meets it
    const layer = layerAt(100, 100, 170)
    const label = place(layer, capsuleAt(270 - CAPSULE_WIDTH - 6, 82))
    expect(label.textContent).toBe(layerKindName(layer))
    expect(label.style.top).toBe(82 - LABEL_HEIGHT - 4 + 'px')
    // no room above the capsule: the label stays pinned to the top
    const cramped = place(layerAt(100, 20, 170), capsuleAt(270 - CAPSULE_WIDTH - 6, 2))
    expect(cramped.style.top).toBe('4px')
  })

  it('a capsule at the left end sends the label to the right end of the top edge', () => {
    const layer = layerAt(100, 100, 600)
    const label = place(layer, capsuleAt(106, 82))
    const width = (label.textContent ?? '').length * 8
    expect(label.style.left).toBe(700 - width - 4 + 'px')
  })

  it('a block with no layout (jsdom) keeps the full label whatever the capsule', () => {
    document.body.innerHTML = '<p id="para">' + LONG + '</p>'
    const layer: BlockCandidate = { kind: 'block', blockShape: 'paragraph', element: document.getElementById('para') as HTMLElement }
    expect(place(layer, capsuleAt(0, 0)).textContent).toBe(layerLabel(layer, 'content'))
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

describe('the hover clip never reports a level change', () => {
  it('the capsule has no level buttons, so levelChanged = false', async () => {
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
  const CAPSULE_WIDTH = 152 // four icon buttons and the more menu
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

  it('the label gives way to the capsule where it was placed, not where its entry animation still holds it', async () => {
    // the capsule fades in 4px low: its rectangle, read back at once, is that far off its layout box
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const node = this as HTMLElement
      if (node.getAttribute('data-ann-ui') !== 'block-capsule') return new DOMRect(0, 0, 0, 0)
      return new DOMRect(Number.parseFloat(node.style.left), Number.parseFloat(node.style.top) + 4, CAPSULE_WIDTH, CAPSULE_HEIGHT)
    })
    document.body.innerHTML = '<p id="para">' + LONG + '</p>'
    const para = document.getElementById('para')!
    // 170px: the capsule fills the right-top corner and even the kind alone meets it
    para.getBoundingClientRect = () => new DOMRect(100, 100, 170, 200)
    document.elementFromPoint = vi.fn(() => para)
    const found = await showCapsule(150, 150)
    const label = document.querySelector('[data-ann-ui="block-label"]') as HTMLElement
    // 24px tall with no layout, and the 4px of air above the capsule's own top
    expect(Number.parseFloat(label.style.top)).toBe(Number.parseFloat(found.style.top) - 24 - 4)
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
