import { beforeEach, describe, expect, it } from 'vitest'
import { candidateAnchor, candidateRect, candidateSummary, candidatesFor, chainOf, deepElementFromPoint, peersOf, sameCandidate, type BlockCandidate } from '../blocks'

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

// ── Real page shapes from the review sampling (RV-CAP-01) ────────────────

const FLAT_DOC = `
<div class="content" id="flat">
  <h2 id="flat-a">Alpha</h2>
  <p id="flat-a-p">${'Alpha body with plenty of words to clear the floor. '.repeat(3)}</p>
  <h2 id="flat-b">Beta</h2>
  <p id="flat-b-p">${'Beta body with plenty of words to clear the floor. '.repeat(3)}</p>
  <p id="flat-b-p2">Second Beta paragraph.</p>
</div>
`

const DIV_SOUP = `
<div class="post-content prose" id="soup">
  <p id="soup-1">${'Plain div soup paragraph one with enough text. '.repeat(3)}</p>
  <p id="soup-2">${'Plain div soup paragraph two with enough text. '.repeat(3)}</p>
  <p id="soup-3">${'Plain div soup paragraph three with enough text. '.repeat(3)}</p>
</div>
`

const DOCUSAURUS = `
<article id="docus">
  <div class="markdown" id="docus-md">
    <h1 id="docus-h1">Title</h1>
    <p id="docus-p1">${'Docusaurus paragraph with words to spare. '.repeat(4)}</p>
    <h2 id="docus-h2">Sub</h2>
    <p id="docus-p2">${'Second paragraph with words to spare too. '.repeat(4)}</p>
  </div>
</article>
`

describe('flat documents: headings and paragraphs as siblings (RV-CAP-01)', () => {
  it('offers a heading-bounded section run, not the whole container', () => {
    document.body.innerHTML = FLAT_DOC
    const chain = candidatesFor(doc.querySelector('#flat-b-p')!, doc)
    const section = chain.find(candidate => candidate.kind === 'section')
    expect(section).toBeDefined()
    expect(section!.range).toEqual({ start: doc.querySelector('#flat-b')!, end: null })
    // the run under Alpha stops at the Beta heading
    const alpha = candidatesFor(doc.querySelector('#flat-a-p')!, doc).find(candidate => candidate.kind === 'section')
    expect(alpha!.range).toEqual({ start: doc.querySelector('#flat-a')!, end: doc.querySelector('#flat-b')! })
  })

  it('never throws on uppercase tagName headings (the old /h(\\d)/ crash)', () => {
    document.body.innerHTML = '<div class="content"><h2>Only heading</h2><p>short</p></div>'
    expect(() => candidatesFor(doc.querySelector('p')!, doc)).not.toThrow()
  })

  it('multi-class content containers classify as article', () => {
    document.body.innerHTML = DIV_SOUP
    const chain = candidatesFor(doc.querySelector('#soup-2')!, doc)
    expect(chain.some(candidate => candidate.kind === 'article' && candidate.element.id === 'soup')).toBe(true)
  })

  it('tier three: the innermost div directly holding three text blocks', () => {
    document.body.innerHTML = DIV_SOUP
    // post-content is a known container class; drop it to isolate tier three
    doc.querySelector('#soup')!.removeAttribute('class')
    const tier3 = candidatesFor(doc.querySelector('#soup-2')!, doc)
    expect(tier3.some(candidate => candidate.kind === 'article' && candidate.element.id === 'soup')).toBe(true)
  })

  it('Docusaurus shape: article → div.markdown → heading-led runs', () => {
    document.body.innerHTML = DOCUSAURUS
    const chain = candidatesFor(doc.querySelector('#docus-p2')!, doc)
    expect(chain.some(candidate => candidate.kind === 'article' && candidate.element.id === 'docus')).toBe(true)
    const section = chain.find(candidate => candidate.kind === 'section')
    expect(section).toBeDefined()
    expect(section!.range).toEqual({ start: doc.querySelector('#docus-h2')!, end: null })
  })

  it('candidateRect unions the sibling run of a range section', () => {
    document.body.innerHTML = FLAT_DOC
    const section = candidatesFor(doc.querySelector('#flat-b-p')!, doc).find(candidate => candidate.kind === 'section')!
    const boxes = [doc.querySelector('#flat-b')!, doc.querySelector('#flat-b-p')!, doc.querySelector('#flat-b-p2')!].map(el => {
      const box = el.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    })
    // jsdom rects are zeros; stub distinct boxes and assert the union math
    const calls: number[] = []
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      calls.push(1)
      const index = ['flat-b', 'flat-b-p', 'flat-b-p2'].indexOf((this as HTMLElement).id)
      return new DOMRect(index * 10, 5, 30, 20)
    }
    try {
      const rect = candidateRect(section)
      expect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }).toEqual({ x: 0, y: 5, width: 50, height: 20 })
      expect(calls.length).toBe(3)
    } finally {
      Element.prototype.getBoundingClientRect = original
      expect(boxes).toHaveLength(3)
    }
  })
})

describe('keyboard mode helpers (capture.md §6.2, D-27)', () => {
  it('detecting from a unit reproduces it: a flat section is found again from its heading, not from its container', () => {
    document.body.innerHTML = FLAT_DOC
    const section = candidatesFor(doc.querySelector('#flat-b-p')!, doc).find(candidate => candidate.kind === 'section')!
    expect(candidateAnchor(section)).toBe(doc.querySelector('#flat-b'))
    expect(chainOf(section, doc).some(candidate => sameCandidate(candidate, section))).toBe(true)
    // the old approach (the unit's element as the target) loses the unit
    expect(candidatesFor(section.element, doc).some(candidate => sameCandidate(candidate, section))).toBe(false)
  })

  it('peers of a flat section are the other heading runs, in document order', () => {
    document.body.innerHTML = FLAT_DOC
    const section = candidatesFor(doc.querySelector('#flat-b-p')!, doc).find(candidate => candidate.kind === 'section')!
    const peers = peersOf(section, doc)
    expect(peers.length).toBeGreaterThan(1)
    expect(peers.every(peer => peer.kind === 'section')).toBe(true)
    const anchors = peers.map(peer => candidateAnchor(peer))
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i - 1]!.compareDocumentPosition(anchors[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(peers.some(peer => sameCandidate(peer, section))).toBe(true)
  })

  it("a summary reads a run section's own words, and falls back to an image's alt text", () => {
    document.body.innerHTML = FLAT_DOC
    const section = candidatesFor(doc.querySelector('#flat-b-p')!, doc).find(candidate => candidate.kind === 'section')!
    const text = candidateSummary(section, 400)
    expect(text.startsWith(doc.querySelector('#flat-b')!.textContent!.trim())).toBe(true)
    expect(text).not.toContain(doc.querySelector('#flat-a')!.textContent!.trim())
    document.body.innerHTML = '<p><img id="pic" alt="p99 latency curve" src="https://img.example/c.png"></p>'
    const image = { kind: 'figure', element: doc.getElementById('pic') as HTMLElement } as BlockCandidate
    expect(candidateSummary(image)).toBe('p99 latency curve')
  })

  it('a summary is capped', () => {
    document.body.innerHTML = `<pre id="long">${'word '.repeat(100)}</pre>`
    expect(candidateSummary({ kind: 'code', element: doc.getElementById('long') as HTMLElement }, 20)).toHaveLength(20)
  })
})
