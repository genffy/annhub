import { describe, it, expect, afterEach } from 'vitest'
import { collectTextNodes, createRangeFromTextIndex, findBestTextMatch, findTextRangeInElement } from '../text-range'

function setupDOM(html: string): void {
  document.body.innerHTML = html
}

describe('annotation text range helpers', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('finds exact text in an element', () => {
    setupDOM('<main><p>Alpha ubiquitous beta.</p></main>')
    const range = findTextRangeInElement(document.querySelector('main') as Element, 'ubiquitous')

    expect(range?.toString()).toBe('ubiquitous')
  })

  it('creates a range across text nodes from a flat text index', () => {
    setupDOM('<p>Alpha <strong>ubiquitous</strong> beta.</p>')
    const p = document.querySelector('p') as Element
    const textNodes = Array.from(p.childNodes).flatMap(node => {
      if (node.nodeType === Node.TEXT_NODE) return [node as Text]
      return Array.from(node.childNodes).filter(child => child.nodeType === Node.TEXT_NODE) as Text[]
    })

    const range = createRangeFromTextIndex(textNodes, 'Alpha '.length, 'ubiquitous beta'.length)

    expect(range?.toString()).toBe('ubiquitous beta')
  })

  it('supports normalized matching when punctuation differs', () => {
    expect(findBestTextMatch('Alpha, ubiquitous beta.', 'alpha ubiquitous')).toBe(0)
  })

  it('returns the full original range for normalized matches', () => {
    setupDOM('<main>Intro... Alpha, ubiquitous beta.</main>')
    const range = findTextRangeInElement(document.querySelector('main') as Element, 'alpha ubiquitous')

    expect(range?.toString()).toBe('Alpha, ubiquitous')
  })

  it('maps normalized matches back to original text offsets', () => {
    expect(findBestTextMatch('Intro... Alpha, ubiquitous beta.', 'alpha ubiquitous')).toBe('Intro... '.length)
  })

  it('uses escaped context matching without treating context as regex syntax', () => {
    const text = 'before (v1.2) target after [done]'
    const index = findBestTextMatch(text, 'target', {
      before: 'before (v1.2) ',
      after: ' after [done]',
    })

    expect(index).toBe('before (v1.2) '.length)
  })

  it('respects manual-highlight intent: skips text inside existing annotation markers', () => {
    setupDOM('<main><p>Alpha ubiquitous beta.</p><p><span data-highlight-id="x">ubiquitous</span></p></main>')

    const range = findTextRangeInElement(document.querySelector('main') as Element, 'ubiquitous', {}, { intent: 'manual-highlight' })

    // The first ubiquitous (in plain <p>) should be matched, not the one already wrapped
    expect(range?.toString()).toBe('ubiquitous')
    expect(range?.startContainer.parentElement?.tagName).toBe('P')
  })

  it('respects auto-vocab intent: skips link/button text', () => {
    setupDOM('<main><a href="#">ubiquitous link</a><p>ubiquitous content</p></main>')

    const range = findTextRangeInElement(document.querySelector('main') as Element, 'ubiquitous', {}, { intent: 'auto-vocab' })

    expect(range?.toString()).toBe('ubiquitous')
    expect(range?.startContainer.parentElement?.tagName).toBe('P')
  })

  it('collectTextNodes filters by intent', () => {
    setupDOM('<main><a href="#">link text</a><p>article text</p></main>')
    const root = document.querySelector('main') as Element

    const all = collectTextNodes(root)
    const autoVocab = collectTextNodes(root, { intent: 'auto-vocab' })

    expect(all).toHaveLength(2)
    expect(autoVocab).toHaveLength(1)
    expect(autoVocab[0].textContent).toBe('article text')
  })
})
