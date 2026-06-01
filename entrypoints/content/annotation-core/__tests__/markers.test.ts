import { describe, it, expect, afterEach } from 'vitest'
import { cleanupMarkers, unwrapMarker, wrapRange } from '../markers'

function setupDOM(html: string): void {
  document.body.innerHTML = html
}

describe('annotation marker helpers', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('wraps a range with configured attributes and class', () => {
    setupDOM('<p>Alpha ubiquitous beta.</p>')
    const text = document.querySelector('p')?.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 'Alpha '.length)
    range.setEnd(text, 'Alpha ubiquitous'.length)

    const marker = wrapRange(range, {
      tagName: 'span',
      className: 'ann-test-marker',
      attributes: { 'data-test-marker': '1' },
    })

    expect(marker?.textContent).toBe('ubiquitous')
    expect(marker?.className).toBe('ann-test-marker')
    expect(document.querySelector('[data-test-marker]')?.textContent).toBe('ubiquitous')
  })

  it('adds ruby annotation children after wrapping base text', () => {
    setupDOM('<p>Alpha ubiquitous beta.</p>')
    const text = document.querySelector('p')?.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 'Alpha '.length)
    range.setEnd(text, 'Alpha ubiquitous'.length)

    const marker = wrapRange(range, {
      tagName: 'ruby',
      attributes: { 'data-ann-vocab': '1' },
      buildChildren: base => {
        const rt = document.createElement('rt')
        rt.textContent = '常见'
        base.appendChild(rt)
      },
    })

    expect(marker?.tagName).toBe('RUBY')
    expect(marker?.firstChild?.textContent).toBe('ubiquitous')
    expect(marker?.querySelector('rt')?.textContent).toBe('常见')
  })

  it('falls back to extract and insert when surroundContents cannot wrap a complex range', () => {
    setupDOM('<p>Alpha <strong>ubiquitous</strong> beta.</p>')
    const p = document.querySelector('p') as Element
    const startText = p.firstChild as Text
    const endText = p.lastChild as Text
    const range = document.createRange()
    range.setStart(startText, 'Alpha '.length)
    range.setEnd(endText, ' beta'.length)

    const marker = wrapRange(range, {
      tagName: 'span',
      attributes: { 'data-test-marker': '1' },
    })

    expect(marker?.textContent).toBe('ubiquitous beta')
    expect(marker?.querySelector('strong')?.textContent).toBe('ubiquitous')
    expect(document.body.textContent).toBe('Alpha ubiquitous beta.')
  })

  it('unwraps ruby without leaking rt text into document flow', () => {
    setupDOM('<p>Alpha <ruby data-ann-vocab="1">ubiquitous<rt>常见</rt></ruby> beta.</p>')
    unwrapMarker(document.querySelector('ruby') as Element)

    expect(document.body.textContent).toBe('Alpha ubiquitous beta.')
    expect(document.querySelector('rt')).toBeNull()
  })

  it('cleans up all matching markers', () => {
    setupDOM('<p><span data-marker="1">Alpha</span> <span data-marker="1">beta</span></p>')
    cleanupMarkers('[data-marker]')

    expect(document.querySelectorAll('[data-marker]')).toHaveLength(0)
    expect(document.body.textContent).toBe('Alpha beta')
  })
})
