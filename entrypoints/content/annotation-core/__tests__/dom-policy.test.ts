import { describe, it, expect, afterEach } from 'vitest'
import { isAnnotatableTextNode, isWithinAnnotationMarker, shouldSkipElement } from '../dom-policy'

function setupDOM(html: string): void {
  document.body.innerHTML = html
}

describe('annotation dom policy', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('allows a highlight inside normal links', () => {
    setupDOM('<main><a href="/story">Linked documentation</a></main>')
    const linkText = document.querySelector('a')?.firstChild as Text

    expect(isAnnotatableTextNode(linkText)).toBe(true)
  })

  it('treats text inside an existing highlight as already marked', () => {
    setupDOM('<main><span data-highlight-id="h1">highlight</span><span>plain</span></main>')

    expect(isWithinAnnotationMarker(document.querySelector('[data-highlight-id]')?.firstChild ?? null)).toBe(true)
    expect(isWithinAnnotationMarker(document.querySelector('span:not([data-highlight-id])')?.firstChild ?? null)).toBe(false)
  })

  it('skips controls, editable text and the extension’s own UI', () => {
    setupDOM('<main><button>Action</button><div contenteditable="true">draft</div><ann-selection>menu</ann-selection><p>article</p></main>')

    expect(shouldSkipElement(document.querySelector('button') as Element)).toBe(true)
    expect(shouldSkipElement(document.querySelector('[contenteditable]') as Element)).toBe(true)
    expect(shouldSkipElement(document.querySelector('ann-selection') as Element)).toBe(true)
    expect(shouldSkipElement(document.querySelector('p') as Element)).toBe(false)
  })

  it('skips text a reader cannot see', () => {
    setupDOM('<main><span hidden>hidden</span><span aria-hidden="true">decor</span><span class="sr-only">screen reader</span></main>')

    for (const span of document.querySelectorAll('span')) expect(isAnnotatableTextNode(span.firstChild as Text)).toBe(false)
  })
})
