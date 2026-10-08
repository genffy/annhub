import { beforeEach, describe, expect, it } from 'vitest'
import { candidatesFor, deepElementFromPoint, type BlockCandidate } from '../blocks'

/**
 * Block detection over fixture DOM (capture.md §6.2). jsdom has no layout:
 * getBoundingClientRect returns zeros, so figure-by-width falls back to
 * naturalWidth (also 0) — figures here use the <figure> element rule, which
 * is the shape real articles use anyway.
 */

const PAGE = `
<nav>site nav</nav>
<main>
  <h1>Article title</h1>
  <p id="intro">${'Intro paragraph with enough words to matter. '.repeat(4)}</p>
  <section id="s1">
    <h2>First section</h2>
    <p id="p1">${'Section body text that is long enough to count. '.repeat(4)}</p>
    <pre id="code"><code class="language-ts">const x = 1</code></pre>
  </section>
  <section id="s2">
    <h2>Data</h2>
    <table id="table">
      <thead><tr><th>Attempt</th><th>Base</th></tr></thead>
      <tbody><tr><td>1</td><td>200ms</td></tr><tr><td>2</td><td>400ms</td></tr></tbody>
    </table>
    <figure id="figure"><img src="https://img.example/c.png" alt="curve" /><figcaption>p99</figcaption></figure>
    <blockquote id="quote"><p>${'A quoted passage of at least twenty characters.'}</p></blockquote>
  </section>
  <article data-testid="tweet" id="post">
    <div class="identity">@sre_notes · 2h</div>
    <p id="post-body">We shipped jittered backoff this morning.</p>
    <a href="/status/123"><time>9:30</time></a>
  </article>
  <aside>related</aside>
</main>
`

function page(): Document {
  document.body.innerHTML = PAGE
  return document
}

let doc: Document

beforeEach(() => {
  doc = page()
})

function kinds(candidates: BlockCandidate[]): string[] {
  return candidates.map(candidate => candidate.kind)
}

describe('candidate chain at a paragraph (capture.md §6.2)', () => {
  it('starts at the innermost unit: paragraph → its section → the article/main', () => {
    const chain = candidatesFor(doc.querySelector('#p1')!, doc)
    expect(kinds(chain)).toEqual(['section', 'article'])
    // innermost first
    expect(chain[0]!.element.id).toBe('s1')
  })

  it('ranks the small kinds before section before article', () => {
    const chain = candidatesFor(doc.querySelector('#code')!, doc)
    expect(kinds(chain)).toEqual(['code', 'section', 'article'])
    expect(chain[0]!.element.id).toBe('code')
  })
})

describe('each of the seven kinds', () => {
  it('post: an X article[data-testid=tweet]', () => {
    const chain = candidatesFor(doc.querySelector('#post-body')!, doc)
    expect(chain[0]).toMatchObject({ kind: 'post' })
    expect(chain[0]!.element.id).toBe('post')
  })

  it('code: a pre block', () => {
    expect(kinds(candidatesFor(doc.querySelector('#code code')!, doc))[0]).toBe('code')
  })

  it('table: a data table with a header', () => {
    expect(kinds(candidatesFor(doc.querySelector('#table tbody')!, doc))[0]).toBe('table')
  })

  it('figure: a figure element', () => {
    expect(kinds(candidatesFor(doc.querySelector('#figure img')!, doc))[0]).toBe('figure')
  })

  it('quote: a blockquote with at least 20 characters', () => {
    expect(kinds(candidatesFor(doc.querySelector('#quote p')!, doc))[0]).toBe('quote')
    // a too-short quote is not a unit
    doc.querySelector('#quote p')!.textContent = 'short'
    expect(kinds(candidatesFor(doc.querySelector('#quote p')!, doc))[0]).not.toBe('quote')
  })

  it('section: a heading-bounded section, or a section element with a heading', () => {
    const chain = candidatesFor(doc.querySelector('#p1')!, doc)
    expect(chain[0]).toMatchObject({ kind: 'section' })
    expect(chain[0]!.element.id).toBe('s1')
  })

  it('article: article/[role=article]/main/content containers, with the 120-char floor', () => {
    const chain = candidatesFor(doc.querySelector('#p1')!, doc)
    expect(chain[chain.length - 1]).toMatchObject({ kind: 'article' })
    expect(chain[chain.length - 1]!.element.tagName.toLowerCase()).toBe('main')

    // a content container with too little text is not an article
    const bare = doc.createElement('article')
    bare.textContent = 'too short'
    doc.body.appendChild(bare)
    expect(kinds(candidatesFor(bare, doc))).not.toContain('article')
  })

  it('recognizes the common content-container classes as article', () => {
    const container = doc.createElement('div')
    container.className = 'markdown-body'
    container.textContent = 'x'.repeat(200)
    doc.body.appendChild(container)
    expect(kinds(candidatesFor(container, doc))[0]).toBe('article')
  })
})

describe('exclusions (capture.md §6.2 不出现)', () => {
  it('yields nothing from nav/aside/aria-hidden/page chrome', () => {
    expect(candidatesFor(doc.querySelector('nav')!, doc)).toEqual([])
    expect(candidatesFor(doc.querySelector('aside')!, doc)).toEqual([])

    const hidden = doc.querySelector('#intro')!.cloneNode(true) as HTMLElement
    hidden.setAttribute('aria-hidden', 'true')
    doc.body.appendChild(hidden)
    expect(candidatesFor(hidden, doc)).toEqual([])

    const chrome = doc.createElement('div')
    chrome.className = 'share-bar'
    chrome.textContent = 'x'.repeat(300)
    doc.body.appendChild(chrome)
    expect(candidatesFor(chrome, doc)).toEqual([])
  })

  it('never walks above main/body', () => {
    const chain = candidatesFor(doc.querySelector('#p1')!, doc)
    for (const candidate of chain) {
      expect(candidate.element.tagName.toLowerCase()).not.toBe('body')
      expect(candidate.element.tagName.toLowerCase()).not.toBe('html')
    }
  })
})

describe('deepElementFromPoint through open shadow roots', () => {
  it('crosses an open shadow root boundary', () => {
    const host = doc.createElement('div')
    const inner = doc.createElement('p')
    inner.id = 'shadow-p'
    doc.body.appendChild(host)
    host.attachShadow({ mode: 'open' }).appendChild(inner)

    doc.elementFromPoint = () => host
    host.shadowRoot!.elementFromPoint = () => inner
    expect(deepElementFromPoint(1, 1, doc)).toBe(inner)
  })

  it('returns the plain element when there is no shadow root', () => {
    const el = doc.querySelector('#intro')!
    doc.elementFromPoint = () => el
    expect(deepElementFromPoint(1, 1, doc)).toBe(el)
  })
})
