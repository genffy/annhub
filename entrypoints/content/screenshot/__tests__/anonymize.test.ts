import { describe, expect, it, beforeEach } from 'vitest'
import { anonymizeClone, applyViewportAnonymization } from '../anonymize'

function stubRect(width: number, height: number): void {
  Element.prototype.getBoundingClientRect = function () {
    const el = this as HTMLElement
    const meta = JSON.parse(el.dataset.rect ?? '{"left":0,"top":0}')
    return {
      left: meta.left,
      top: meta.top,
      width,
      height,
      right: meta.left + width,
      bottom: meta.top + height,
      x: meta.left,
      y: meta.top,
      toJSON: () => ({}),
    } as DOMRect
  }
}

describe('applyViewportAnonymization', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    stubRect(100, 20)
  })

  it('covers identity elements with gray overlays and restores them fully', () => {
    document.body.innerHTML = `
      <div data-ann-identity data-rect='{"left":10,"top":20}'>alice — 2h</div>
    `
    const el = document.querySelector('[data-ann-identity]') as HTMLElement
    const before = el.innerHTML

    const restore = applyViewportAnonymization(document, 'localhost')
    const overlay = el.querySelector('[data-ann-ui="anonymize-overlay"]')
    expect(overlay).not.toBeNull()
    expect(el.style.backgroundColor).toBe('rgb(209, 213, 219)')

    restore()
    expect(el.querySelector('[data-ann-ui="anonymize-overlay"]')).toBeNull()
    expect(el.innerHTML).toBe(before)
    expect(el.style.backgroundColor).toBe('')
    expect(document.querySelectorAll('[data-ann-ui="anonymize-overlay"]')).toHaveLength(0)
  })

  it('uses a fixed sibling overlay for replaced elements (img)', () => {
    document.body.innerHTML = `
      <div><img data-ann-identity data-rect='{"left":0,"top":0}' src="avatar.png" alt="avatar" /></div>
    `
    const img = document.querySelector('img[data-ann-identity]') as HTMLImageElement
    const parent = img.parentElement!

    const restore = applyViewportAnonymization(document, 'localhost')
    const overlay = parent.querySelector('[data-ann-ui="anonymize-overlay"]') as HTMLElement
    expect(overlay).not.toBeNull()
    // Circular because the selector matches an avatar-shaped replaced element.
    expect(overlay.style.borderRadius).toBe('50%')
    expect(overlay.style.position).toBe('fixed')
    expect(img.contains(overlay)).toBe(false)

    restore()
    expect(parent.querySelector('[data-ann-ui="anonymize-overlay"]')).toBeNull()
  })

  it('skips zero-area elements', () => {
    stubRect(0, 0)
    document.body.innerHTML = `<div data-ann-identity data-rect='{"left":0,"top":0}'>hidden</div>`
    const restore = applyViewportAnonymization(document, 'localhost')
    expect(document.querySelectorAll('[data-ann-ui="anonymize-overlay"]')).toHaveLength(0)
    restore()
  })
})

describe('anonymizeClone', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    stubRect(120, 24)
  })

  it('swaps identity contents for sized gray placeholders (no restore needed)', () => {
    const clone = document.createElement('div')
    clone.innerHTML = `
      <div data-ann-identity data-rect='{"left":0,"top":0}'>@somebody</div>
      <p>body text stays</p>
    `
    anonymizeClone(clone, document)
    const swapped = clone.querySelector('[data-ann-identity]') as HTMLElement
    expect(swapped.textContent).not.toContain('@somebody')
    const placeholder = swapped.querySelector('[data-ann-ui="anonymize-overlay"]') as HTMLElement
    expect(placeholder).not.toBeNull()
    expect(placeholder.style.width).toBe('120px')
    expect(placeholder.style.height).toBe('24px')
    expect(clone.querySelector('p')!.textContent).toBe('body text stays')
  })

  it('replaces replaced-elements entirely in the clone', () => {
    const clone = document.createElement('div')
    clone.innerHTML = `<img data-ann-identity data-rect='{"left":0,"top":0}' src="a.png" />`
    anonymizeClone(clone, document)
    expect(clone.querySelector('img')).toBeNull()
    const placeholder = clone.querySelector('[data-ann-ui="anonymize-overlay"]') as HTMLElement
    expect(placeholder).not.toBeNull()
    expect(placeholder.style.borderRadius).toBe('50%')
  })
})
