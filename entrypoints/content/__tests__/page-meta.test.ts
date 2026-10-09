import { describe, expect, it } from 'vitest'
import { extractContext, extractPageMeta, resolvePermalink } from '../page-meta'

const PAGE_URL = 'https://example.com/docs/guide'

function withPage(html: string): HTMLElement {
  document.head.innerHTML = '<base href="https://example.com/docs/" />'
  document.body.innerHTML = html
  return document.body
}

describe('resolvePermalink platform rules (capture.md §5)', () => {
  it('an X post takes its own status link', () => {
    withPage(`
      <article data-testid="tweet">
        <div class="identity">@sre_notes · 2h</div>
        <p id="body">We shipped jittered backoff this morning.</p>
        <a href="/status/1748113923456"><time>9:30</time></a>
      </article>`)
    const url = resolvePermalink(document.getElementById('body')!, PAGE_URL, 'post')
    expect(url).toBe('https://example.com/status/1748113923456')
  })

  it('a Medium article takes the canonical address, not the interface URL', () => {
    withPage('<main><article><h1>Title</h1><p id="p">Body text</p></article></main>')
    document.head.innerHTML = '<link rel="canonical" href="https://medium.com/p/abc123" />'
    const url = resolvePermalink(document.getElementById('p')!, 'https://user.medium.com/some-alias-reader', 'article')
    expect(url).toBe('https://medium.com/p/abc123')
  })

  it('a canonical link on a non-Medium page does not override the page URL', () => {
    withPage('<main><article><h1>Title</h1><p id="p">Body text</p></article></main>')
    document.head.innerHTML = '<link rel="canonical" href="https://elsewhere.example/x" />'
    const url = resolvePermalink(document.getElementById('p')!, PAGE_URL, 'article')
    expect(url).toBe(PAGE_URL)
  })

  it('a section adds the heading anchor', () => {
    withPage(`
      <section id="backoff">
        <h2 id="the-heading">Exponential backoff</h2>
        <p id="p">The three-step approach with enough body text to be a real section.</p>
      </section>`)
    const url = resolvePermalink(document.getElementById('p')!, `${PAGE_URL}?x=1`, 'section')
    expect(url).toBe(`${PAGE_URL}?x=1#the-heading`)
  })

  it('everything else keeps the page address, selections included', () => {
    withPage('<main><p id="p">A plain paragraph with an anchorless heading nearby.</p></main>')
    expect(resolvePermalink(document.getElementById('p')!, PAGE_URL, 'article')).toBe(PAGE_URL)
    expect(resolvePermalink(document.getElementById('p')!, PAGE_URL)).toBe(PAGE_URL)
    expect(resolvePermalink(document.getElementById('p')!, PAGE_URL, 'code')).toBe(PAGE_URL)
  })
})

describe('page metadata (capture.md §5)', () => {
  it('reads title, author, published and description; missing pieces stay unset', () => {
    withPage('<title>Guide</title><p>x</p>')
    document.head.innerHTML +=
      '<meta name="author" content="Jane Doe" /><meta property="article:published_time" content="2026-09-12T08:00:00Z" /><meta name="description" content="A guide" />'
    const meta = extractPageMeta(document, 'example.com')
    expect(meta).toEqual({ title: 'Guide', author: ['Jane Doe'], published: '2026-09-12', description: 'A guide' })

    withPage('<p>x</p>')
    expect(extractPageMeta(document, 'fallback.example')).toEqual({ title: 'fallback.example' })
  })

  it('rejects impossible dates', () => {
    withPage('<p>x</p>')
    document.head.innerHTML = '<meta property="article:published_time" content="2026-02-30T00:00:00Z" />'
    expect(extractPageMeta(document, 'h').published).toBeUndefined()
  })
})

describe('context extraction (capture.md §4)', () => {
  it('keeps the containing block when it fits the limit', () => {
    withPage('<p id="p">The team applied the change. Saturation dropped quickly. Everyone was relieved.</p>')
    const range = document.createRange()
    const p = document.getElementById('p')!.firstChild!
    range.setStart(p, 28)
    range.setEnd(p, 36) // "Saturation"
    expect(extractContext(range)).toContain('Saturation dropped quickly')
  })

  it('a triple-clicked paragraph is the paragraph, not the whole article (RV-CAP-07)', () => {
    withPage(`
      <article>
        <h1>Article title</h1>
        <p id="first">First paragraph entirely on its own.</p>
        <p id="middle">The middle paragraph that the user triple-clicked for context.</p>
        <p id="last">Last paragraph with unrelated content.</p>
      </article>`)
    const range = document.createRange()
    const middle = document.getElementById('middle')!
    range.selectNodeContents(middle)
    const context = extractContext(range)
    expect(context).toContain('middle paragraph')
    expect(context).not.toContain('Article title')
    expect(context).not.toContain('First paragraph')
  })

  it('a selection inside bold or link text takes the surrounding sentence, not the inline element', () => {
    withPage('<p id="p">Prefix words. <b id="b">bold text</b> and <a id="a" href="https://x.example">a link</a>. Suffix words.</p>')
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('b')!)
    const context = extractContext(range)
    expect(context).toContain('Prefix words')
    expect(context).toContain('Suffix words')
  })

  it('a selection crossing two paragraphs covers both blocks', () => {
    withPage(`
      <div>
        <p id="p1">Alpha paragraph with a few more words here.</p>
        <p id="p2">Beta paragraph closing the crossing selection.</p>
      </div>`)
    const range = document.createRange()
    range.setStart(document.getElementById('p1')!.firstChild!, 0)
    range.setEnd(document.getElementById('p2')!.firstChild!, 10)
    const context = extractContext(range)
    expect(context).toContain('Alpha paragraph')
    expect(context).toContain('Beta paragraph')
  })

  it('a selection inside a list item takes the item', () => {
    withPage('<ul><li id="li">The list item holding the selection entirely.</li><li>Other item that must not leak in.</li></ul>')
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('li')!)
    const context = extractContext(range)
    expect(context).toContain('list item holding')
    expect(context).not.toContain('Other item')
  })

  it('drops context when the selection itself exceeds the limit', () => {
    withPage(`<p id="p">${'a'.repeat(2500)}</p>`)
    const range = document.createRange()
    const p = document.getElementById('p')!.firstChild!
    range.setStart(p, 0)
    range.setEnd(p, 2200)
    expect(extractContext(range)).toBeUndefined()
  })

  it('falls back to a window around the selection when the block is huge', () => {
    const text = `${'x'.repeat(1500)} needle ${'y'.repeat(1500)}`
    withPage(`<p id="p">${text}</p>`)
    const p = document.getElementById('p')!.firstChild!
    const range = document.createRange()
    range.setStart(p, 1501)
    range.setEnd(p, 1507) // "needle"
    const context = extractContext(range)
    expect(context).toBeDefined()
    expect(context).toContain('needle')
    expect((context ?? '').length).toBeLessThanOrEqual(2000)
  })
})

describe('metadata never blocks the save (RV-CAP-06)', () => {
  it('a many-author byline splits and over-long names drop out', () => {
    withPage('<p>x</p>')
    document.head.innerHTML = '<meta name="author" content="A One, B Two, C Three, D Four, E Five, F Six, G Seven, H Eight, I Nine, J Ten, K Eleven, L Twelve" />'
    const meta = extractPageMeta(document, 'example.com')
    expect(meta.author).toHaveLength(12)
  })

  it('a single over-long author value is dropped, not fatal', () => {
    withPage('<p>x</p>')
    document.head.innerHTML = `<meta name="author" content="${'a'.repeat(120)}" />`
    const meta = extractPageMeta(document, 'example.com')
    expect(meta.author).toBeUndefined()
    expect(meta.title).toBe('example.com')
  })

  it('a long description is clipped with newlines folded', () => {
    withPage('<p>x</p>')
    document.head.innerHTML = `<meta name="description" content="${'word '.repeat(300)}\nnext line" />`
    const meta = extractPageMeta(document, 'example.com')
    expect(meta.description).toBeDefined()
    expect(meta.description!.length).toBeLessThanOrEqual(1000)
    expect(meta.description).not.toContain('\n')
  })
})
