import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNoticeBubble, NOTICE_BUBBLE_FADE_MS, NOTICE_BUBBLE_MS } from '../notice-bubble'

/** A toolbar box sitting 100px wide at the viewport's bottom right, like the editor's bar. */
const TOOLBAR_BOX = (): DOMRect =>
  ({
    left: 900,
    right: 1000,
    top: 600,
    bottom: 640,
    width: 100,
    height: 40,
    x: 900,
    y: 600,
    toJSON: () => undefined,
  }) as DOMRect

describe('createNoticeBubble (真机反馈)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rides above the toolbar, clamped into the viewport', () => {
    const host = document.createElement('div')
    const bubble = createNoticeBubble(document, host, { toolbarBox: TOOLBAR_BOX, textNode: t => document.createTextNode(t) })
    bubble.show('已保存')
    const el = host.firstElementChild as HTMLDivElement
    expect(el.className).toBe('ann-shot-bubble')
    expect(el.getAttribute('data-ann-ui')).toBe('screenshot-bubble')
    expect(el.getAttribute('role')).toBe('status')
    expect(el.textContent).toContain('已保存')
    // jsdom lays the bubble out at 0×0, so the fallbacks 120×30 stand in
    expect(el.style.left).toBe(`${Math.max(8, Math.min(window.innerWidth - 120 - 8, 1000 - 120))}px`)
    expect(el.style.top).toBe(`${Math.max(8, 600 - 30 - 8)}px`)
  })

  it('sits top-centre without a toolbar', () => {
    const host = document.createElement('div')
    const bubble = createNoticeBubble(document, host, { toolbarBox: () => null, textNode: t => document.createTextNode(t) })
    bubble.show('已保存')
    const el = host.firstElementChild as HTMLDivElement
    expect(el.style.left).toBe(`${Math.max(8, window.innerWidth / 2 - 120 / 2)}px`)
    expect(el.style.top).toBe('64px')
  })

  it('leaves on its own: fade class first, removal on top of it', () => {
    const host = document.createElement('div')
    const bubble = createNoticeBubble(document, host, { toolbarBox: () => null, textNode: t => document.createTextNode(t) })
    bubble.show('已保存')
    const el = host.firstElementChild as HTMLDivElement
    vi.advanceTimersByTime(NOTICE_BUBBLE_MS)
    expect(el.className).toBe('ann-shot-bubble ann-shot-bubble-out')
    expect(host.contains(el)).toBe(true)
    vi.advanceTimersByTime(NOTICE_BUBBLE_FADE_MS)
    expect(host.contains(el)).toBe(false)
  })

  it('replaces the bubble that is up and forgets its fade', () => {
    const host = document.createElement('div')
    const bubble = createNoticeBubble(document, host, { toolbarBox: () => null, textNode: t => document.createTextNode(t) })
    bubble.show('第一张')
    const first = host.firstElementChild as HTMLDivElement
    vi.advanceTimersByTime(NOTICE_BUBBLE_MS - 1)
    bubble.show('第二张')
    expect(host.contains(first)).toBe(false)
    const second = host.firstElementChild as HTMLDivElement
    expect(second.textContent).toContain('第二张')
    // the first bubble's fade timer is gone: time passes, the second stays
    vi.advanceTimersByTime(NOTICE_BUBBLE_MS - 1)
    expect(host.contains(second)).toBe(true)
  })

  it('dispose stops a fade in flight; the element goes with the host', () => {
    const host = document.createElement('div')
    const bubble = createNoticeBubble(document, host, { toolbarBox: () => null, textNode: t => document.createTextNode(t) })
    bubble.show('已保存')
    const el = host.firstElementChild as HTMLDivElement
    vi.advanceTimersByTime(NOTICE_BUBBLE_MS)
    bubble.dispose()
    vi.advanceTimersByTime(NOTICE_BUBBLE_FADE_MS + 1000)
    expect(host.contains(el)).toBe(true)
  })
})
