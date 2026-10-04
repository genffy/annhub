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

  it('skips text inside existing annotation markers', () => {
    setupDOM('<main><p>Alpha ubiquitous beta.</p><p><span data-highlight-id="x">ubiquitous</span></p></main>')

    const range = findTextRangeInElement(document.querySelector('main') as Element, 'ubiquitous')

    // The first ubiquitous (in plain <p>) should be matched, not the one already wrapped
    expect(range?.toString()).toBe('ubiquitous')
    expect(range?.startContainer.parentElement?.tagName).toBe('P')
  })

  it('collectTextNodes skips unsafe nodes (script) but keeps links and article text', () => {
    setupDOM('<main><script>var a = 1</script><a href="#">link text</a><p>article text</p></main>')

    expect(collectTextNodes(document.querySelector('main') as Element).map(n => n.textContent)).toEqual(['link text', 'article text'])
  })
})
