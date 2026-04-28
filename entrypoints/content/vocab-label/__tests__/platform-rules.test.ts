import { describe, it, expect, afterEach } from 'vitest'
import { getActivePlatformRule } from '../platform-rules'

function setupDOM(html: string): void {
  document.body.innerHTML = html
}

describe('vocab platform rules', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('collects only tweet text blocks on X', () => {
    setupDOM(`
      <main>
        <article>
          <div data-testid="User-Name">Mike Chong</div>
          <div data-testid="tweetText">Ubiquitous article content.</div>
          <div data-testid="like">Like</div>
        </article>
        <article>
          <div data-testid="tweetText">Quoted phenomenon appears here.</div>
        </article>
      </main>
    `)

    const rule = getActivePlatformRule('x.com')
    const main = document.querySelector('main') as Element
    const blocks = rule?.collectBlocks(main) ?? []

    expect(blocks).toHaveLength(2)
    expect(blocks.every(block => block.getAttribute('data-testid') === 'tweetText')).toBe(true)
    expect(blocks.map(block => block.textContent)).toEqual([
      'Ubiquitous article content.',
      'Quoted phenomenon appears here.',
    ])
  })

  it('finds the nearest tweet text block from a nested mutation target', () => {
    setupDOM(`
      <article>
        <div data-testid="tweetText">
          <span><strong>Nested ubiquitous content.</strong></span>
        </div>
      </article>
    `)

    const rule = getActivePlatformRule('twitter.com')
    const nested = document.querySelector('strong') as Element
    const blocks = rule?.collectBlocks(nested) ?? []

    expect(blocks).toHaveLength(1)
    expect(blocks[0].getAttribute('data-testid')).toBe('tweetText')
  })

  it('does not match unrelated hosts', () => {
    expect(getActivePlatformRule('example.com')).toBeNull()
  })
})
