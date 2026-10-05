import { describe, it, expect, afterEach } from 'vitest'
import { extractTwitterPermalink, findTwitterContainerByPermalink, findTwitterPermalinkContainer, getActiveAnnotationPlatformRule } from '../platform-rules'

function setupDOM(html: string): void {
  document.body.innerHTML = html
}

describe('annotation platform rules', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('matches X and Twitter hosts, including subdomains', () => {
    expect(getActiveAnnotationPlatformRule(new URL('https://x.com/home'))?.name).toBe('x')
    expect(getActiveAnnotationPlatformRule(new URL('https://mobile.x.com/home'))?.name).toBe('x')
    expect(getActiveAnnotationPlatformRule(new URL('https://twitter.com/home'))?.name).toBe('x')
    expect(getActiveAnnotationPlatformRule(new URL('https://example.com/'))).toBeNull()
  })

  it('extracts a tweet permalink from the time link first', () => {
    setupDOM(`
      <article>
        <a href="https://x.com/userA/status/111">first status link</a>
        <a href="/userB/status/222">
          <time datetime="2026-01-01">Jan 1</time>
        </a>
      </article>
    `)

    const article = document.querySelector('article') as Element
    expect(extractTwitterPermalink(article, 'https://x.com')).toBe('https://x.com/userB/status/222')
  })

  it('resolves a quoted tweet source before the outer tweet article', () => {
    setupDOM(`
      <article>
        <div data-testid="tweetText">Outer tweet text.</div>
        <a href="/outer/status/111"><time datetime="2026-05-20">11h</time></a>
        <div role="link" tabindex="0" data-testid="card.wrapper">
          <a href="/quoted/status/222"><time datetime="2026-05-19">11h</time></a>
          <div data-testid="tweetText">Quoted frontier content.</div>
        </div>
      </article>
    `)

    const quotedText = document.querySelector('[role="link"] [data-testid="tweetText"]') as Element
    const container = findTwitterPermalinkContainer(quotedText, 'https://x.com')
    const rule = getActiveAnnotationPlatformRule(new URL('https://x.com/home'))
    const source = rule?.findSourceFromElement(quotedText, 'https://x.com')

    expect(container).toBe(document.querySelector('[role="link"]'))
    expect(source?.container).toBe(container)
    expect(source?.sourceUrl).toBe('https://x.com/quoted/status/222')
  })

  it('finds an on-page tweet container by source permalink', () => {
    setupDOM(`
      <article>
        <div data-testid="tweetText">Outer tweet text.</div>
        <a href="/outer/status/111"><time datetime="2026-05-20">11h</time></a>
        <div role="link" tabindex="0">
          <a href="/quoted/status/222"><time datetime="2026-05-19">11h</time></a>
          <div data-testid="tweetText">Quoted frontier content.</div>
        </div>
      </article>
    `)

    const result = findTwitterContainerByPermalink('https://x.com/quoted/status/222', 'https://x.com')
    expect(result).toBe(document.querySelector('[role="link"]'))
  })
})
