import { describe, it, expect, afterEach } from 'vitest'
import {
  findNearestAnnotatableBlock,
  isAnnotatableTextNode,
  isWithinAnnotationMarker,
  shouldSkipElement,
  shouldSkipTextNode,
} from '../dom-policy'

function setupDOM(html: string): void {
  document.body.innerHTML = html
}

describe('annotation dom policy', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps auto vocab conservative for normal links', () => {
    setupDOM('<main><a href="/story">Ubiquitous documentation</a></main>')
    const linkText = document.querySelector('a')?.firstChild as Text

    expect(shouldSkipTextNode(linkText, document.querySelector('main') as Element)).toBe(true)
  })

  it('allows manual highlight inside normal links', () => {
    setupDOM('<main><a href="/story">Ubiquitous documentation</a></main>')
    const linkText = document.querySelector('a')?.firstChild as Text

    expect(shouldSkipTextNode(linkText, document.querySelector('main') as Element, false, 'manual-highlight')).toBe(false)
    expect(isAnnotatableTextNode(linkText, 'manual-highlight')).toBe(true)
  })

  it('allows X quoted tweet text for auto vocab even when the card has role link', () => {
    setupDOM(`
      <main>
        <div role="link">
          <div data-testid="tweetText">Quoted frontier content.</div>
        </div>
      </main>
    `)
    const text = document.querySelector('[data-testid="tweetText"]')?.firstChild as Text

    expect(shouldSkipTextNode(text, document.querySelector('main') as Element)).toBe(false)
  })

  it('still skips anchor text inside quoted cards for auto vocab', () => {
    setupDOM(`
      <main>
        <div role="link">
          <div data-testid="tweetText">
            <a href="/profile">Mike Chong</a>
            <span>Ubiquitous content.</span>
          </div>
        </div>
      </main>
    `)
    const anchorText = document.querySelector('a')?.firstChild as Text
    const bodyText = document.querySelector('span')?.firstChild as Text

    expect(shouldSkipTextNode(anchorText, document.querySelector('main') as Element)).toBe(true)
    expect(shouldSkipTextNode(bodyText, document.querySelector('main') as Element)).toBe(false)
  })

  it('detects vocab and highlight markers as annotation markers', () => {
    setupDOM(`
      <main>
        <ruby data-ann-vocab="1">word<rt>词</rt></ruby>
        <span data-highlight-id="h1">highlight</span>
      </main>
    `)

    expect(isWithinAnnotationMarker(document.querySelector('[data-ann-vocab]')?.firstChild ?? null)).toBe(true)
    expect(isWithinAnnotationMarker(document.querySelector('[data-highlight-id]')?.firstChild ?? null)).toBe(true)
  })

  it('finds the nearest annotatable block for rescans', () => {
    setupDOM('<main><section><p>Ubiquitous content.</p></section></main>')
    const main = document.querySelector('main') as Element
    const text = document.querySelector('p')?.firstChild as Text

    expect(findNearestAnnotatableBlock(text, main)).toBe(document.querySelector('p'))
  })

  it('skips controls for both intents', () => {
    setupDOM('<main><button>Ubiquitous action</button></main>')
    const button = document.querySelector('button') as Element

    expect(shouldSkipElement(button, 'auto-vocab')).toBe(true)
    expect(shouldSkipElement(button, 'manual-highlight')).toBe(true)
  })
})
