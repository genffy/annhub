const WORDS = 'Enough words to clear the floor for both runs. '
const LONG = 'Enough words. '

import { beforeEach, describe, expect, it } from 'vitest'
import {
  blockShapeOf,
  candidateAnchor,
  candidateDomRange,
  candidateRect,
  classifyElementAt,
  candidateSummary,
  composedParent,
  deepElementFromPoint,
  feedColumn,
  isArticleElement,
  pageArticleCandidates,
  runSectionsFor,
  runSpansWhole,
  sectionIntervalRect,
  sameCandidate,
  type BlockCandidate,
} from '../blocks'

/**
 * Classification over fixture DOM (capture.md §6.2). jsdom has no layout:
 * getBoundingClientRect returns zeros, so figure-by-width falls back to
 * naturalWidth (also 0) — figures here use the <figure> element rule, which
 * is the shape real articles use anyway. The chain itself is target-chain.ts.
 */

const PAGE =
  '<nav>site nav</nav>' +
  '<main>' +
  '<h1>Article title</h1>' +
  '<p id="intro">' +
  WORDS.repeat(4) +
  '</p>' +
  '<section id="s1">' +
  '<h2>First section</h2>' +
  '<p id="p1">' +
  WORDS.repeat(4) +
  '</p>' +
  '<pre id="code"><code class="language-ts">const x = 1</code></pre>' +
  '</section>' +
  '<section id="s2">' +
  '<h2>Data</h2>' +
  '<table id="table"><thead><tr><th>Attempt</th><th>Base</th></tr></thead>' +
  '<tbody><tr><td>1</td><td>200ms</td></tr><tr><td>2</td><td>400ms</td></tr></tbody></table>' +
  '<figure id="figure"><img src="https://img.example/c.png" alt="curve" /><figcaption>p99</figcaption></figure>' +
  '<blockquote id="quote"><p>' +
  WORDS.repeat(1) +
  '</p></blockquote>' +
  '</section>' +
  '<article data-testid="tweet" id="post">' +
  '<div class="identity">@sre_notes · 2h</div>' +
  '<p id="post-body">We shipped jittered backoff this morning.</p>' +
  '<a href="/sre_notes/status/123"><time>9:30</time></a>' +
  '</article>' +
  '<aside>related</aside>' +
  '</main>'

function page(): Document {
  document.body.innerHTML = PAGE
  return document
}

let doc: Document

beforeEach(() => {
  doc = page()
})

describe('each layer kind classifies (capture.md §6.2 目标链里的层)', () => {
  it('post: an X article[data-testid=tweet]', () => {
    expect(classifyElementAt(doc.querySelector('#post')!)).toMatchObject([{ kind: 'post' }])
  })

  it('code: a pre block', () => {
    expect(classifyElementAt(doc.querySelector('#code')!)).toMatchObject([{ kind: 'code' }])
  })

  it('table: a data table with a header', () => {
    expect(classifyElementAt(doc.querySelector('#table')!)).toMatchObject([{ kind: 'table' }])
  })

  it('figure: a figure element', () => {
    expect(classifyElementAt(doc.querySelector('#figure')!)).toMatchObject([{ kind: 'figure' }])
  })

  it('quote: a blockquote with at least 20 characters', () => {
    expect(classifyElementAt(doc.querySelector('#quote')!)).toMatchObject([{ kind: 'quote' }])
    doc.querySelector('#quote p')!.textContent = 'short'
    expect(classifyElementAt(doc.querySelector('#quote')!)).toMatchObject([{ kind: 'block' }])
  })

  it('section: a section element with a heading; without one it is a block', () => {
    expect(classifyElementAt(doc.querySelector('#s1')!)).toMatchObject([{ kind: 'section' }])
    const bare = doc.createElement('section')
    bare.textContent = 'x'.repeat(200)
    doc.body.appendChild(bare)
    expect(classifyElementAt(bare)).toMatchObject([{ kind: 'block', blockShape: 'block' }])
  })

  it('article: article/[role=article]/main/content containers, with the 120-char floor', () => {
    expect(classifyElementAt(doc.querySelector('main')!)).toMatchObject([{ kind: 'article' }])
    const bare = doc.createElement('article')
    bare.textContent = 'too short'
    doc.body.appendChild(bare)
    expect(classifyElementAt(bare)).toEqual([])
    const container = doc.createElement('div')
    container.className = 'markdown-body'
    container.textContent = 'x'.repeat(200)
    doc.body.appendChild(container)
    expect(classifyElementAt(container)).toMatchObject([{ kind: 'article' }])
  })

  it('blocks: paragraphs, list items, lists, headings and other block-level elements', () => {
    expect(classifyElementAt(doc.querySelector('#p1')!)).toMatchObject([{ kind: 'block', blockShape: 'paragraph' }])
    const list = doc.createElement('ul')
    list.innerHTML = '<li id="item">One</li>'
    doc.body.appendChild(list)
    expect(blockShapeOf(list)).toBe('list')
    expect(classifyElementAt(doc.getElementById('item')!)).toMatchObject([{ kind: 'block', blockShape: 'listItem' }])
    expect(classifyElementAt(doc.querySelector('h1')!)).toMatchObject([{ kind: 'block', blockShape: 'heading' }])
  })

  it('invisible elements and page chrome classify as nothing', () => {
    const hidden = doc.createElement('div')
    hidden.style.display = 'none'
    doc.body.appendChild(hidden)
    expect(classifyElementAt(hidden)).toEqual([])
    const chrome = doc.createElement('div')
    chrome.className = 'share-bar'
    chrome.textContent = 'x'.repeat(300)
    doc.body.appendChild(chrome)
    expect(classifyElementAt(chrome)).toMatchObject([{ kind: 'block' }])
  })
})

describe('runSectionsFor splits a flat page into heading runs', () => {
  const FLAT =
    '<div class="content" id="flat">' +
    '<h2 id="flat-a">Alpha</h2>' +
    '<p id="flat-a-p">' +
    WORDS.repeat(6) +
    '</p>' +
    '<h2 id="flat-b">Beta</h2>' +
    '<p id="flat-b-p">' +
    WORDS.repeat(6) +
    '</p>' +
    '<p id="flat-b-p2">Second Beta paragraph.</p>' +
    '</div>'

  it('finds the nearest heading run, innermost first, ending before the next same-or-higher heading', () => {
    document.body.innerHTML = FLAT
    const runs = runSectionsFor(doc.getElementById('flat')!, doc.getElementById('flat-b-p')!)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toEqual({ start: doc.getElementById('flat-b'), end: null })
    const alpha = runSectionsFor(doc.getElementById('flat')!, doc.getElementById('flat-a-p')!)
    expect(alpha[0]).toEqual({ start: doc.getElementById('flat-a'), end: doc.getElementById('flat-b') })
  })

  it('nested levels are runs of their own, the enclosing run after them', () => {
    document.body.innerHTML = '<div class="content"><h2 id="a">Alpha</h2><p id="a-p">' + WORDS.repeat(6) + '</p><h3 id="a1">One</h3><p>' + WORDS.repeat(6) + '</p></div>'
    const runs = runSectionsFor(doc.querySelector('.content')!, doc.querySelectorAll('p')[1]!)
    expect(runs.map(run => run.start)).toEqual([doc.getElementById('a1'), doc.getElementById('a')])
    expect(runs[1]!.end).toBeNull()
  })

  it('a run too short for a section is not one, and neither are the runs around it', () => {
    document.body.innerHTML = '<div class="content"><h2 id="a">Alpha</h2><p>short</p></div>'
    expect(runSectionsFor(doc.querySelector('.content')!, doc.querySelector('p')!)).toEqual([])
  })

  it('never throws on uppercase tagName headings (the old /h(d)/ crash)', () => {
    document.body.innerHTML = '<div class="content"><h2>Only heading</h2><p>short</p></div>'
    expect(() => runSectionsFor(doc.querySelector('.content')!, doc.querySelector('p')!)).not.toThrow()
  })

  it('a run that is all of an article is the article, not a section of it', () => {
    document.body.innerHTML = '<article><h1 id="title">The title</h1><p>' + WORDS.repeat(6) + '</p></article>'
    const run = runSectionsFor(doc.querySelector('article')!, doc.querySelector('p')!)[0]!
    expect(runSpansWhole(doc.querySelector('article')!, run)).toBe(true)
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

describe('composedParent crosses the light/shadow boundary', () => {
  it('climbs from a shadow-root element into the light DOM host', () => {
    const host = doc.createElement('div')
    const inner = doc.createElement('p')
    doc.body.appendChild(host)
    host.attachShadow({ mode: 'open' }).appendChild(inner)
    expect(composedParent(inner)).toBe(host)
  })
})

describe('candidateRect and sectionIntervalRect (RV-CAP-13)', () => {
  it('candidateRect unions the sibling run of a range section', () => {
    document.body.innerHTML = '<div class="content"><h2 id="h">Heading</h2><p id="p">' + LONG.repeat(12) + '</p></div>'
    const run = runSectionsFor(doc.querySelector('.content')!, doc.getElementById('p')!)![0]!
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const index = ['h', 'p'].indexOf((this as HTMLElement).id)
      return new DOMRect(index * 10, 5, 30, 20)
    }
    try {
      const rect = candidateRect({ kind: 'section', element: doc.querySelector('.content') as HTMLElement, range: run })
      expect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }).toEqual({ x: 0, y: 5, width: 40, height: 20 })
      const byInterval = sectionIntervalRect(doc.querySelector('.content')!, run)
      expect({ x: byInterval.x, y: byInterval.y }).toEqual({ x: rect.x, y: rect.y })
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })

  it('candidateDomRange covers the run and stops before the next heading', () => {
    document.body.innerHTML = '<div class="content"><h2 id="a">Alpha</h2><p>' + LONG.repeat(12) + '</p><h2 id="b">Beta</h2><p>' + LONG.repeat(12) + '</p></div>'
    const runs = runSectionsFor(doc.querySelector('.content')!, doc.getElementById('a')!.nextElementSibling!)
    const range = candidateDomRange({ kind: 'section', element: doc.querySelector('.content') as HTMLElement, range: runs[0]! })
    expect(range).not.toBeNull()
    const container = doc.querySelector('.content')!
    expect(range!.startContainer).toBe(container)
    expect(range!.startOffset).toBe([...container.childNodes].indexOf(doc.getElementById('a')!))
    expect(range!.endOffset).toBe([...container.childNodes].indexOf(doc.getElementById('b')!))
  })

  it('an element-kind candidate has no DOM range, and anchors on itself', () => {
    const code = { kind: 'code', element: doc.querySelector('#code')! } as BlockCandidate
    expect(candidateDomRange(code)).toBeNull()
    expect(candidateAnchor(code)).toBe(doc.querySelector('#code'))
    const run = { kind: 'section', element: doc.querySelector('main') as HTMLElement, range: { start: doc.querySelector('h1')!, end: null } } as BlockCandidate
    expect(candidateAnchor(run)).toBe(doc.querySelector('h1'))
    expect(sameCandidate(code, { ...code })).toBe(true)
    expect(sameCandidate(code, { ...code, kind: 'table' })).toBe(false)
  })
})

describe('candidateSummary', () => {
  it("reads a run section's own words", () => {
    document.body.innerHTML = '<div class="content"><h2 id="a">Alpha</h2><p>' + LONG.repeat(12) + '</p><h2 id="b">Beta</h2><p>' + LONG.repeat(12) + '</p></div>'
    const run = runSectionsFor(doc.querySelector('.content')!, doc.getElementById('a')!.nextElementSibling!)[0]!
    const text = candidateSummary({ kind: 'section', element: doc.querySelector('.content') as HTMLElement, range: run }, 400)
    expect(text.startsWith('Alpha')).toBe(true)
    expect(text).not.toContain('Beta')
  })

  it('falls back to an image alt text and is capped', () => {
    document.body.innerHTML = '<p><img id="pic" alt="p99 latency curve" src="https://img.example/c.png"></p>'
    const image = { kind: 'figure', element: doc.getElementById('pic') as HTMLElement } as BlockCandidate
    expect(candidateSummary(image)).toBe('p99 latency curve')
    document.body.innerHTML = '<pre id="long">' + 'word '.repeat(100) + '</pre>'
    expect(candidateSummary({ kind: 'code', element: doc.getElementById('long') as HTMLElement }, 20)).toHaveLength(20)
  })

  it('starts at the unit content, skipping the page furniture that sits inside it', () => {
    document.body.innerHTML =
      '<article>' + '<button toggle>Toggle the table of contents</button>' + '<h1>Zettelkasten</h1>' + '<p>The method takes notes and links them into a network.</p>' + '</article>'
    expect(candidateSummary({ kind: 'article', element: document.querySelector('article') as HTMLElement })).toMatch(/^Zettelkasten/)
  })
})

describe('a column of posts is not an article (issue #107)', () => {
  const tweet = (id: string): string => '<article data-testid="tweet" id="' + id + '"><p id="' + id + '-body">' + id + ' tweet body.</p></article>'

  it('feedColumn sees two posts and no prose of its own', () => {
    document.body.innerHTML = '<main id="col">' + tweet('a') + tweet('b') + '</main>'
    expect(feedColumn(doc.getElementById('col')!)).toBe(true)
  })

  it('a write-up that embeds posts is still an article', () => {
    document.body.innerHTML = '<article id="story"><p id="lead">' + LONG.repeat(12) + '</p>' + tweet('t1') + tweet('t2') + '</article>'
    expect(feedColumn(doc.getElementById('story')!)).toBe(false)
    expect(isArticleElement(doc.getElementById('story')!)).toBe(true)
  })

  it('pageArticleCandidates lists the article-shaped elements, the caller picks the most text', () => {
    document.body.innerHTML = '<article id="story"><p>' + LONG.repeat(12) + '</p>' + tweet('t1') + '</article><main id="col">' + tweet('a') + tweet('b') + '</main>'
    const candidates = pageArticleCandidates(doc)
    expect(candidates.map(el => el.id)).toContain('story')
    expect(candidates.map(el => el.id)).toContain('col')
  })
})
