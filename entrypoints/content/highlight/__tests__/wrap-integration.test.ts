import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { HighlightDOMManager } from '../highlight-dom'

/**
 * Phase 4 — Verify the highlight creation path consumes annotation-core helpers:
 *   • `wrapTextNode` goes through `wrapRange` (markers.ts) instead of bespoke DOM mutation.
 *   • `removeHighlight` goes through `unwrapMarker` (markers.ts) — no leftover tooltip text,
 *     no orphan nodes.
 *   • `manual-highlight` DOM policy is honored: contenteditable / nested annotation markers /
 *     extension UI surfaces are not wrapped.
 *
 * These tests are intentionally written against `createHighlight` (public surface) rather than
 * the private `wrapTextNode`, so they keep working if implementation details change but the
 * contract holds.
 */

describe('HighlightDOMManager — wrapRange / manual-highlight policy integration', () => {
  let manager: HighlightDOMManager

  beforeEach(() => {
    manager = HighlightDOMManager.getInstance()
    manager.clearAllHighlights()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    manager.clearAllHighlights()
    document.body.innerHTML = ''
  })

  function rangeOver(text: Text, start: number, end: number): Range {
    const range = document.createRange()
    range.setStart(text, start)
    range.setEnd(text, end)
    return range
  }

  it('creates a highlight via wrapRange — span has marker attributes and original text', () => {
    document.body.innerHTML = '<p>Alpha ubiquitous beta.</p>'
    const text = document.querySelector('p')!.firstChild as Text
    const range = rangeOver(text, 'Alpha '.length, 'Alpha ubiquitous'.length)

    const elements = manager.createHighlight(range, '#ffeb3b', 'h-test-1')

    expect(elements).toHaveLength(1)
    const span = elements[0]
    expect(span.tagName).toBe('SPAN')
    expect(span.getAttribute('data-highlight-id')).toBe('h-test-1')
    expect(span.getAttribute('data-highlight-color')).toBe('#ffeb3b')
    expect(span.className).toBe('ann-highlight')
    // The wrapped text content (sans tooltip child) is preserved verbatim
    const tooltip = span.querySelector('.ann-highlight-tooltip')
    const wrappedText = Array.from(span.childNodes)
      .filter(n => n !== tooltip)
      .map(n => n.textContent)
      .join('')
    expect(wrappedText).toBe('ubiquitous')
  })

  it('removeHighlight via unwrapMarker — tooltip text does not leak into document flow', () => {
    document.body.innerHTML = '<p>Alpha ubiquitous beta.</p>'
    const text = document.querySelector('p')!.firstChild as Text
    const range = rangeOver(text, 'Alpha '.length, 'Alpha ubiquitous'.length)

    manager.createHighlight(range, '#ffeb3b', 'h-test-2')
    manager.removeHighlight('h-test-2')

    expect(document.querySelectorAll('[data-highlight-id]')).toHaveLength(0)
    expect(document.querySelectorAll('.ann-highlight-tooltip')).toHaveLength(0)
    expect(document.body.textContent).toBe('Alpha ubiquitous beta.')
  })

  it('manual-highlight policy skips contenteditable regions', () => {
    document.body.innerHTML = '<div contenteditable="true"><p>Alpha ubiquitous beta.</p></div>'
    const text = document.querySelector('p')!.firstChild as Text
    const range = rangeOver(text, 'Alpha '.length, 'Alpha ubiquitous'.length)

    const elements = manager.createHighlight(range, '#ffeb3b', 'h-test-3')

    expect(elements).toHaveLength(0)
    expect(document.querySelectorAll('[data-highlight-id]')).toHaveLength(0)
  })

  it('manual-highlight policy skips text already inside another annotation marker', () => {
    document.body.innerHTML = '<p>Alpha <span data-highlight-id="existing">ubiquitous</span> beta.</p>'
    const existing = document.querySelector('[data-highlight-id]')!
    const text = existing.firstChild as Text
    const range = rangeOver(text, 0, 'ubiquitous'.length)

    const elements = manager.createHighlight(range, '#ffeb3b', 'h-test-4')

    // Should NOT nest a new highlight inside the existing one
    expect(elements).toHaveLength(0)
    expect(document.querySelectorAll('[data-highlight-id]')).toHaveLength(1)
  })

  it('manual-highlight policy skips text already inside a vocab marker', () => {
    document.body.innerHTML = '<p>Alpha <ruby data-ann-vocab="1">ubiquitous<rt>常见</rt></ruby> beta.</p>'
    const vocab = document.querySelector('[data-ann-vocab]')!
    const text = vocab.firstChild as Text
    const range = rangeOver(text, 0, 'ubiquitous'.length)

    const elements = manager.createHighlight(range, '#ffeb3b', 'h-test-5')

    expect(elements).toHaveLength(0)
  })

  it('createHighlight then removeHighlight is idempotent (no orphan tooltip, no orphan node)', () => {
    document.body.innerHTML = '<p>Alpha ubiquitous beta.</p>'
    const text = document.querySelector('p')!.firstChild as Text
    const range = rangeOver(text, 'Alpha '.length, 'Alpha ubiquitous'.length)

    manager.createHighlight(range, '#ffeb3b', 'h-test-6')
    manager.removeHighlight('h-test-6')
    manager.removeHighlight('h-test-6') // second remove is a noop

    expect(document.body.innerHTML).toBe('<p>Alpha ubiquitous beta.</p>')
  })
})
