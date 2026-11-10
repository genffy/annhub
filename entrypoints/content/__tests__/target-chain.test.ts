const WORDS = 'Enough words in this paragraph to give the section it belongs to the characters a section needs. '

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  blockStartElement,
  chainAtPoint,
  chainForElement,
  chainHolding,
  childChainOf,
  contentLayers,
  firstVisibleChain,
  isSuppressed,
  layerLabel,
  peersOf,
  pixelChainFor,
  rankOf,
  startIndexOf,
} from '../target-chain'
import { candidateAnchor, type BlockCandidate } from '../blocks'
import { uiText } from '../../../utils/ui-text'

/**
 * The one target chain the capsule, the block mode, the viewfinder and the
 * download read (capture.md §6.2). jsdom has no layout: rects are zeros, so
 * the 30×10 start rule treats every layer as eligible unless a test stubs
 * the boxes.
 */

const LONG = WORDS.repeat(3)

const PAGE =
  '<nav>site nav</nav>' +
  '<main>' +
  '<h1>Article title</h1>' +
  '<p id="intro">' +
  WORDS.repeat(4) +
  '</p>' +
  '<section id="s1"><h2>First section</h2><p id="p1">' +
  WORDS.repeat(4) +
  '</p><pre id="code"><code>const x = 1</code></pre></section>' +
  '<section id="s2"><h2>Data</h2>' +
  '<table id="table"><thead><tr><th>Attempt</th><th>Base</th></tr></thead><tbody><tr><td>1</td><td>200ms</td></tr><tr><td>2</td><td>400ms</td></tr></tbody></table>' +
  '<figure id="figure"><img src="https://img.example/c.png" alt="curve" /><figcaption>p99</figcaption></figure>' +
  '<blockquote id="quote"><p>' +
  WORDS +
  '</p></blockquote></section>' +
  '<article data-testid="tweet" id="post"><p id="post-body">We shipped jittered backoff.</p><a href="/sre_notes/status/123"><time>9:30</time></a></article>' +
  '<aside>related</aside>' +
  '</main>'

const FLAT =
  '<div class="content">' +
  '<h2 id="h-intro">Intro</h2><p>' +
  LONG +
  '</p>' +
  '<h2 id="h-install">Install</h2><p id="target">' +
  LONG +
  '</p><p>' +
  LONG +
  '</p>' +
  '<h2 id="h-usage">Usage</h2><p>' +
  LONG +
  '</p>' +
  '</div>'

let doc: Document

beforeEach(() => {
  document.body.innerHTML = PAGE
  doc = document
})

function kinds(chain: BlockCandidate[]): string[] {
  return chain.map(layer => (layer.kind === 'block' ? 'block:' + (layer.blockShape ?? 'block') : layer.kind))
}

function ids(chain: BlockCandidate[]): string[] {
  return chain.map(layer => (layer.range ? layer.range.start.id + ' run' : layer.element.id))
}

describe('the chain at a point (capture.md §6.2 目标链里的层)', () => {
  it('starts at the innermost block: paragraph → its section → the article', () => {
    const chain = chainForElement(doc.querySelector('#p1')!, doc)
    expect(kinds(chain)).toEqual(['block:paragraph', 'section', 'article'])
    expect(chain[0]!.element.id).toBe('p1')
    expect(chain[1]!.element.id).toBe('s1')
  })

  it('a pre is the code block itself, not a plain block', () => {
    const chain = chainForElement(doc.querySelector('#code')!, doc)
    expect(kinds(chain)).toEqual(['code', 'section', 'article'])
  })

  it('a small unit swallows the blocks inside it: the post is the start', () => {
    const chain = chainForElement(doc.querySelector('#post-body')!, doc)
    expect(kinds(chain)).toEqual(['post', 'article'])
    expect(chain[0]!.element.id).toBe('post')
  })

  it('climbs out of an inline element to its block', () => {
    doc.querySelector('#p1')!.innerHTML = '<span id="span">some words</span>'
    expect(blockStartElement(doc.getElementById('span')!, doc).id).toBe('p1')
  })

  it('inserts the heading run on a flat page: paragraph → the run → the article', () => {
    document.body.innerHTML = FLAT
    const chain = chainForElement(doc.getElementById('target')!, doc)
    expect(kinds(chain)).toEqual(['block:paragraph', 'section', 'article'])
    expect(chain[1]!.element).toBe(doc.querySelector('.content'))
    expect(chain[1]!.range).toEqual({ start: doc.getElementById('h-install'), end: doc.getElementById('h-usage') })
    expect(chain[2]!.kind).toBe('article')
  })

  it('stops at the article: nothing beyond it is a layer', () => {
    const chain = chainForElement(doc.querySelector('#p1')!, doc)
    expect(chain[chain.length - 1]!.kind).toBe('article')
    expect(chain[chain.length - 1]!.element.tagName.toLowerCase()).toBe('main')
  })

  it('the pixel view keeps every ancestor; the content view merges wrappers away', () => {
    document.body.innerHTML = '<main id="m"><div id="wrap"><p id="p">' + LONG + '</p></div><p>' + LONG + '</p></main>'
    const pixel = pixelChainFor(doc.getElementById('p')!, doc)
    expect(pixel.map(layer => layer.element.id)).toEqual(['p', 'wrap', 'm'])
    const content = chainForElement(doc.getElementById('p')!, doc)
    // the wrapper adds no words: it merges into the paragraph, which keeps the outer box
    expect(kinds(content)).toEqual(['block:block', 'article'])
    expect(content[0]!.element.id).toBe('wrap')
  })
})

describe('the start (capture.md §6.2 起点)', () => {
  it('a h1-h4 heading starts the section it begins; the heading stays one level in', () => {
    document.body.innerHTML = FLAT
    const chain = chainForElement(doc.getElementById('h-install')!, doc)
    expect(kinds(chain)).toEqual(['block:heading', 'section', 'article'])
    expect(startIndexOf(chain)).toBe(1)
    expect(chain[startIndexOf(chain)]!.range?.start).toBe(doc.getElementById('h-install'))
  })

  it('a heading whose run is too short for a section starts at the heading itself', () => {
    document.body.innerHTML = '<div class="content"><h2 id="h">Only heading</h2><p>short</p></div>'
    const chain = chainForElement(doc.getElementById('h')!, doc)
    expect(startIndexOf(chain)).toBe(0)
  })

  it('a heading in a <section> too short to be one starts at the heading: the section is a block', () => {
    document.body.innerHTML = '<main><p>' + LONG + '</p><section id="tiny"><h2 id="h">Tiny</h2><p>a few words</p></section></main>'
    const chain = chainForElement(doc.getElementById('h')!, doc)
    expect(kinds(chain)).not.toContain('section')
    expect(startIndexOf(chain)).toBe(0)
    document.body.innerHTML = '<main><p>' + LONG + '</p><section id="full"><h2 id="h">Full</h2><p>' + LONG + '</p></section></main>'
    const full = chainForElement(doc.getElementById('h')!, doc)
    expect(kinds(full)).toContain('section')
    expect(full[startIndexOf(full)]!.kind).toBe('section')
  })

  it('a block smaller than 30×10 yields to the first big-enough ancestor', () => {
    document.body.innerHTML = '<main id="m"><div id="small">' + LONG + '</div><p>' + LONG + '</p></main>'
    const small = doc.getElementById('small')!
    small.getBoundingClientRect = () => new DOMRect(0, 0, 20, 5)
    doc.getElementById('m')!.getBoundingClientRect = () => new DOMRect(0, 0, 600, 400)
    const chain = chainForElement(small, doc)
    expect(startIndexOf(chain)).toBe(1)
    // the small block stays in the chain, one level in
    expect(chain[0]!.element.id).toBe('small')
  })

  it('a heading before the first paragraph is the article, not a section (danluu)', () => {
    document.body.innerHTML = '<main id="m"><p id="intro">' + LONG + '</p><h3 id="a">Alpha</h3><p id="a-p">' + LONG + '</p><h3 id="b">Beta</h3><p>' + LONG + '</p></main>'
    const intro = chainForElement(doc.getElementById('intro')!, doc)
    expect(kinds(intro)).toEqual(['block:paragraph', 'article'])
    const body = chainForElement(doc.getElementById('a-p')!, doc)
    // the section adds only its heading: the paragraph merges into it
    expect(kinds(body)).toEqual(['section', 'article'])
    expect(body.find(layer => layer.kind === 'section')!.range).toEqual({ start: doc.getElementById('a'), end: doc.getElementById('b') })
  })

  it('nested heading levels are layers of their own, one per level', () => {
    document.body.innerHTML =
      '<div class="content"><h2 id="a">Alpha</h2><p>' + LONG + '</p><h3 id="a1">One</h3><p id="p">' + LONG + '</p><h2 id="b">Beta</h2><p>' + LONG + '</p></div>'
    const chain = chainForElement(doc.getElementById('p')!, doc)
    const sections = chain.filter(layer => layer.kind === 'section')
    expect(sections.map(layer => layer.range!.start.id)).toEqual(['a1', 'a'])
  })
})

describe('the content view merges (capture.md §6.2 内容看法)', () => {
  it('an outer layer adding fewer than 20 characters and no media merges: a code card is the code block', () => {
    document.body.innerHTML = '<main><div id="card"><pre id="code">const a = 1</pre><span>ts</span></div><p>' + LONG + '</p></main>'
    const chain = chainForElement(doc.getElementById('code')!, doc)
    expect(kinds(chain)).toEqual(['code', 'article'])
    expect(chain[0]!.element.id).toBe('card')
  })

  it('an outer layer that adds an image does not merge', () => {
    document.body.innerHTML = '<main><div id="card"><pre id="code">const a = 1</pre><img id="img" alt="shot" src="https://img.example/s.png" /></div><p>' + LONG + '</p></main>'
    const chain = chainForElement(doc.getElementById('code')!, doc)
    expect(chain[0]!.kind).toBe('code')
    expect(chain[0]!.element.id).toBe('code')
    expect(chain[1]!.kind).toBe('block')
    expect(chain[1]!.element.id).toBe('card')
  })

  it('a same-kind frame holding at least 90% of the inner text merges: the docs-page wrappers', () => {
    document.body.innerHTML =
      '<main id="m"><div class="row"><article id="art"><div class="markdown" id="md"><h1>Title</h1><p>' +
      LONG +
      '</p></div></article><div class="toc"><ul><li>Alpha</li></ul></div></div></main>'
    const chain = chainForElement(doc.querySelector('#md p')!, doc)
    expect(kinds(chain)).toEqual(['article'])
    expect(chain[0]!.element.id).toBe('m')
  })

  it('a multi-section article keeps its sections as layers', () => {
    document.body.innerHTML = '<article id="art"><div class="markdown"><h1>Title</h1><p>' + LONG + '</p><h2 id="s">Sub</h2><p id="p">' + LONG + '</p></div></article>'
    const chain = chainForElement(doc.getElementById('p')!, doc)
    // the section adds only its heading: the paragraph merges into it
    expect(kinds(chain)).toEqual(['section', 'article'])
    expect(chain[0]!.range?.start.id).toBe('s')
  })
})

describe('a column of posts is not a parent level (issue #107)', () => {
  const tweet = (id: string, inner = ''): string => '<article data-testid="tweet" id="' + id + '"><p id="' + id + '-body">' + id + ' tweet body.</p>' + inner + '</article>'
  const TIMELINE =
    '<main id="col"><section id="feed" role="region"><h2>Explore</h2>' +
    tweet('a', '<blockquote id="a-quote"><p id="a-quote-p">A quoted passage inside the tweet that is long enough.</p></blockquote>') +
    tweet('b', tweet('b-inner')) +
    tweet('c') +
    '</section></main>'

  it('stops the chain at the post: the timeline section and main are not a section or an article', () => {
    document.body.innerHTML = TIMELINE
    expect(kinds(chainForElement(doc.getElementById('a-body')!, doc))).toEqual(['post'])
    // a quote climbs to its post, not the column
    expect(kinds(chainForElement(doc.getElementById('a-quote-p')!, doc))).toEqual(['quote', 'post'])
    // a nested post climbs one level, to the enclosing post
    expect(ids(chainForElement(doc.getElementById('b-inner-body')!, doc))).toEqual(['b-inner', 'b'])
  })

  it('still treats a write-up that embeds two posts as an article', () => {
    document.body.innerHTML = '<article id="story"><h1>Roundup</h1><p id="lead">' + WORDS.repeat(8) + '</p>' + tweet('t1') + tweet('t2') + '</article>'
    expect(kinds(chainForElement(doc.getElementById('lead')!, doc))).toEqual(['block:paragraph', 'article'])
    expect(ids(chainForElement(doc.getElementById('t1-body')!, doc))).toEqual(['t1', 'story'])
  })

  it('Tab peers of a timeline post are the other posts, not the column', () => {
    document.body.innerHTML = TIMELINE
    const post = chainForElement(doc.getElementById('a')!, doc)[0]!
    expect(peersOf(post, doc).map(peer => peer.element.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('the chain without posts or an article', () => {
  it('ends at the outermost block that holds no page furniture', () => {
    document.body.innerHTML = '<div id="page"><header>site</header><div id="body"><p id="p">' + LONG + '</p><p>' + LONG + '</p></div><footer>end</footer></div>'
    const chain = chainForElement(doc.getElementById('p')!, doc)
    expect(ids(chain)).toEqual(['p', 'body'])
  })
})

describe('labels (capture.md §6.2 标注)', () => {
  const label = (layer: BlockCandidate): string => layerLabel(layer, 'content')

  it('a paragraph opens with its words, cut at 16 characters', () => {
    document.body.innerHTML = FLAT
    const chain = chainForElement(doc.getElementById('target')!, doc)
    expect(label(chain[0]!)).toBe(uiText('block.kind.paragraph') + ' · ' + 'Enough words in …')
  })

  it('a post shows its handle from the status link', () => {
    const chain = chainForElement(doc.querySelector('#post-body')!, doc)
    expect(label(chain[0]!)).toBe(uiText('block.kind.post') + ' · @sre_notes')
  })

  it('a code block counts its lines, a table its rows and columns', () => {
    const code = chainForElement(doc.querySelector('#code')!, doc)[0]!
    expect(label(code)).toBe(uiText('block.kind.code') + ' · ' + uiText('block.label.lines', { n: 1 }))
    const table = chainForElement(doc.querySelector('#table')!, doc)[0]!
    expect(label(table)).toBe(uiText('block.kind.table') + ' · ' + uiText('block.label.cells', { rows: 3, cols: 2 }))
  })

  it('a code block counts the lines of its pre, not the card around it, and the newline ending the last line opens none', () => {
    document.body.innerHTML = '<main><div id="card"><div class="head">bash\nCopy\nRun</div><pre id="code">a\nb\nc\n</pre></div><p>' + LONG + '</p></main>'
    const card = chainForElement(doc.getElementById('code')!, doc)[0]!
    // the card merged in: its element is the wrapper, the toolbar words are not code lines
    expect(card.element.id).toBe('card')
    expect(label(card)).toBe(uiText('block.kind.code') + ' · ' + uiText('block.label.lines', { n: 3 }))
    const bare = { kind: 'code' as const, element: doc.getElementById('code')! }
    expect(label(bare)).toBe(uiText('block.kind.code') + ' · ' + uiText('block.label.lines', { n: 3 }))
    doc.getElementById('code')!.textContent = 'one line'
    expect(label(bare)).toBe(uiText('block.kind.code') + ' · ' + uiText('block.label.lines', { n: 1 }))
  })

  it("a block's words leave out the page's own interface: a toolbar, a share bar, a button", () => {
    document.body.innerHTML =
      '<main><div id="card"><div class="toolbar">Copy code</div><button>Run</button><p id="body">The words the block really opens with, and more.</p></div><p>' +
      LONG +
      '</p></main>'
    const block = { kind: 'block' as const, blockShape: 'block' as const, element: doc.getElementById('card')! }
    expect(label(block)).toBe(uiText('block.kind.block') + ' · The words the bl…')
    // only the interface: no words, the kind alone
    doc.getElementById('body')!.remove()
    expect(label(block)).toBe(uiText('block.kind.block'))
    // a quote reads the same way
    const quote = { kind: 'quote' as const, element: doc.createElement('blockquote') }
    quote.element.innerHTML = '<span class="share">Share this</span>Quoted words that carry the point.'
    doc.body.appendChild(quote.element)
    expect(label(quote)).toBe(uiText('block.kind.quote') + ' · Quoted words tha…')
  })

  it('the words of two blocks written with no whitespace between them stay apart; an inline element does not split a word', () => {
    // minified markup: the heading and the paragraph meet in the source
    document.body.innerHTML = '<main><div id="short"><h2>Tiny section</h2><p>a few words</p></div><p id="inline">Hel<b>lo</b> there, friends</p><p>' + LONG + '</p></main>'
    const wrapper = { kind: 'block' as const, blockShape: 'block' as const, element: doc.getElementById('short')! }
    expect(label(wrapper)).toBe(uiText('block.kind.block') + ' · Tiny section a f…')
    const inline = { kind: 'block' as const, blockShape: 'paragraph' as const, element: doc.getElementById('inline')! }
    expect(label(inline)).toBe(uiText('block.kind.paragraph') + ' · Hello there, fri…')
    // text straight in the wrapper, after a block child, is a line of its own too
    document.body.innerHTML = '<main><div id="mixed"><p>One two</p>three four five six</div><p>' + LONG + '</p></main>'
    const mixed = { kind: 'block' as const, blockShape: 'block' as const, element: doc.getElementById('mixed')! }
    expect(label(mixed)).toBe(uiText('block.kind.block') + ' · One two three fo…')
  })

  it('a figure shows its caption, or its size without one', () => {
    const figure = chainForElement(doc.querySelector('#figure')!, doc)[0]!
    expect(label(figure)).toBe(uiText('block.kind.figure') + ' · p99')
    const plain = { kind: 'figure' as const, element: doc.getElementById('figure')! }
    plain.element.querySelector('figcaption')!.remove()
    plain.element.getBoundingClientRect = () => new DOMRect(0, 0, 640, 360)
    expect(label(plain)).toBe(uiText('block.kind.figure') + ' · 640 × 360')
  })

  it('a quote opens with its words, a section with its heading, the article with the whole page', () => {
    const quote = chainForElement(doc.querySelector('#quote p')!, doc)[0]!
    expect(label(quote).startsWith(uiText('block.kind.quote') + ' · ')).toBe(true)
    document.body.innerHTML = FLAT
    const section = chainForElement(doc.getElementById('target')!, doc)[1]!
    expect(label(section)).toBe(uiText('block.kind.section') + ' · Install')
    const article = chainForElement(doc.getElementById('target')!, doc)[2]!
    expect(label(article)).toBe(uiText('block.kind.article') + ' · ' + uiText('block.label.whole'))
  })

  it('the pixel view writes the element name and size, a section its kind and size', () => {
    const figure = chainForElement(doc.querySelector('#figure')!, doc, 'pixel')[0]!
    figure.element.getBoundingClientRect = () => new DOMRect(0, 0, 640, 360)
    expect(layerLabel(figure, 'pixel')).toBe('figure · 640 × 360')
    document.body.innerHTML = FLAT
    const section = chainForElement(doc.getElementById('target')!, doc, 'pixel')[1]!
    expect(layerLabel(section, 'pixel')).toBe(uiText('block.kind.section') + ' · 0 × 0')
  })
})

describe('keyboard tiers (capture.md §6.2 同档)', () => {
  it('blocks and small units are one tier, sections a tier per heading level, the article a tier of its own', () => {
    document.body.innerHTML = FLAT
    const paragraph = chainForElement(doc.getElementById('target')!, doc)[0]!
    const section = chainForElement(doc.getElementById('target')!, doc)[1]!
    const article = chainForElement(doc.getElementById('target')!, doc)[2]!
    expect(rankOf(paragraph)).toBe(0)
    expect(rankOf(section)).toBe(2)
    expect(rankOf(article)).toBe(5)
    const code = { kind: 'code' as const, element: doc.getElementById('target')! }
    expect(rankOf(code)).toBe(0)
  })

  it('peers of a flat section are the other runs of the same heading level, in document order', () => {
    document.body.innerHTML = FLAT
    const section = chainForElement(doc.getElementById('target')!, doc)[1]!
    const peers = peersOf(section, doc)
    expect(peers.map(peer => peer.range?.start.id)).toEqual(['h-intro', 'h-install', 'h-usage'])
    for (let i = 1; i < peers.length; i++) {
      expect(candidateAnchor(peers[i - 1]!).compareDocumentPosition(candidateAnchor(peers[i]!)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('Tab moves within the block tier: headings stop at the heading itself', () => {
    document.body.innerHTML = FLAT
    const paragraph = chainForElement(doc.getElementById('target')!, doc)[0]!
    const peers = peersOf(paragraph, doc)
    // single-paragraph sections merge their paragraph: the stops are the headings and the Install paragraphs
    expect(peers.map(peer => peer.element.tagName.toLowerCase())).toEqual(['h2', 'h2', 'p', 'p', 'h2'])
    expect(peers.every(peer => peer.kind === 'block')).toBe(true)
  })

  it('a small unit inside another is a level below it, not its peer', () => {
    document.body.innerHTML =
      '<article data-testid="tweet" id="one"><p>' +
      LONG +
      '</p><figure id="one-pic"><img alt="chart" src="https://img.example/1.png" /></figure></article>' +
      '<article data-testid="tweet" id="two"><p>' +
      LONG +
      '</p></article>'
    const post = chainForElement(doc.getElementById('one')!, doc)[0]!
    expect(peersOf(post, doc).map(peer => peer.element.id)).toEqual(['one', 'two'])
    const picture = chainForElement(doc.getElementById('one-pic')!, doc)[0]!
    expect(peersOf(picture, doc).map(peer => peer.element.id)).toEqual(['one', 'two'])
  })

  it('a layer that merged a wrapper is one Tab stop: a paragraph in a div, a code card, a figure card', () => {
    document.body.innerHTML =
      '<article><p id="a">A. ' +
      LONG +
      '</p><div id="w"><p id="inner">Wrapped. ' +
      LONG +
      '</p></div><div id="card"><div class="toolbar">bash</div><pre id="code">const a = 1</pre></div>' +
      '<div id="fig"><figure><img alt="chart" src="https://img.example/1.png" /><figcaption>chart</figcaption></figure></div><p id="b">B. ' +
      LONG +
      '</p></article>'
    const current = chainForElement(doc.getElementById('a')!, doc)[0]!
    const peers = peersOf(current, doc)
    expect(peers.map(peer => peer.element.id)).toEqual(['a', 'w', 'card', 'fig', 'b'])
    expect(peers.map(peer => peer.kind)).toEqual(['block', 'block', 'code', 'figure', 'block'])
    // standing on a merged layer, the tier is the same one
    const card = peers[2]!
    expect(peersOf(card, doc).map(peer => peer.element.id)).toEqual(['a', 'w', 'card', 'fig', 'b'])
  })

  it('stops are in reading order: the heading inside a wrapper comes before the table the wrapper merged onto', () => {
    // the section adds only "Data" to the table, so it merges onto it; the table is more than 20 characters
    // for the heading to merge the other way round, so the heading is a stop of its own
    document.body.innerHTML =
      '<main><p id="a">A. ' +
      LONG +
      '</p><section id="data"><h2 id="dh">Data</h2><table id="t"><tbody><tr><td>Attempt</td><td>Base</td></tr><tr><td>1</td><td>200ms</td></tr><tr><td>2</td><td>400ms</td></tr></tbody></table></section>' +
      '<p id="b">B. ' +
      LONG +
      '</p></main>'
    const table = chainForElement(doc.getElementById('t')!, doc)[0]!
    expect(table).toMatchObject({ kind: 'table' })
    expect(table.element.id).toBe('data')
    // the wrapper's own element is scanned first, but the stop stands where the table does
    expect(peersOf(table, doc).map(peer => peer.element.id)).toEqual(['a', 'dh', 'data', 'b'])
    // the same from the heading
    const heading = chainForElement(doc.getElementById('dh')!, doc)[0]!
    expect(heading).toMatchObject({ kind: 'block', blockShape: 'heading' })
    expect(peersOf(heading, doc).map(peer => peer.element.id)).toEqual(['a', 'dh', 'data', 'b'])
  })

  it('one outline is one stop: a card reached from its tiny language tag is still the code block', () => {
    document.body.innerHTML =
      '<article><p id="a">A. ' +
      LONG +
      '</p><div id="card"><div id="lang">ts</div><pre id="code">const a = 1; const b = 2; const c = 3;</pre></div><p id="b">B. ' +
      LONG +
      '</p></article>'
    // the tag is too small to start anything: its start is the card, which it leaves a block (the code adds more than 20 characters)
    doc.getElementById('lang')!.getBoundingClientRect = () => new DOMRect(10, 10, 16, 16)
    doc.getElementById('card')!.getBoundingClientRect = () => new DOMRect(0, 0, 600, 200)
    const fromTag = chainForElement(doc.getElementById('lang')!, doc)
    const onTag = fromTag[startIndexOf(fromTag)]!
    expect(onTag.kind).toBe('block')
    expect(onTag.element.id).toBe('card')
    // from the code the same card merges into a code block
    expect(chainForElement(doc.getElementById('code')!, doc)[0]).toMatchObject({ kind: 'code' })
    const current = chainForElement(doc.getElementById('a')!, doc)[0]!
    const peers = peersOf(current, doc)
    expect(peers.map(peer => peer.element.id)).toEqual(['a', 'card', 'b'])
    expect(peers[1]!.kind).toBe('code')
    // standing on the card as a block, Tab starts from that very layer
    const fromThere = peersOf(onTag, doc)
    expect(fromThere.map(peer => peer.element.id)).toEqual(['a', 'card', 'b'])
    expect(fromThere[1]).toBe(onTag)
  })

  it("the page's own interface is no Tab stop", () => {
    document.body.innerHTML = '<article><p id="a">A. ' + LONG + '</p><div class="share-bar">Share this story with friends</div><p id="b">B. ' + LONG + '</p></article>'
    const current = chainForElement(doc.getElementById('a')!, doc)[0]!
    expect(peersOf(current, doc).map(peer => peer.element.id)).toEqual(['a', 'b'])
  })

  it('a Tab press measures a container shared by hundreds of paragraphs once', () => {
    document.body.innerHTML = '<main id="m">' + Array.from({ length: 300 }, (_, i) => '<p id="p' + i + '">Paragraph ' + i + '. ' + LONG + '</p>').join('') + '</main>'
    const main = doc.getElementById('m')!
    const read = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!.get!
    let reads = 0
    Object.defineProperty(main, 'textContent', {
      configurable: true,
      get() {
        reads++
        return read.call(main)
      },
    })
    const current = chainForElement(doc.getElementById('p0')!, doc)[0]!
    reads = 0
    expect(peersOf(current, doc)).toHaveLength(300)
    // each measure of main (its length, its non-whitespace length) happens once per press, not once per paragraph
    expect(reads).toBeLessThanOrEqual(4)
  })

  it('chainHolding finds the chain of a merged layer from what is inside it, and nothing for a layer the page does not have', () => {
    document.body.innerHTML = '<main><div id="card"><div class="toolbar">bash</div><pre id="code">const a = 1</pre></div><p>' + LONG + '</p></main>'
    const card = chainForElement(doc.getElementById('code')!, doc)[0]!
    expect(card).toMatchObject({ kind: 'code' })
    expect(card.element.id).toBe('card')
    // from the wrapper alone there is no merge, so its own chain has no code block
    expect(chainForElement(doc.getElementById('card')!, doc)[0]!.kind).toBe('block')
    const held = chainHolding(card, doc)
    expect(kinds(held)).toEqual(['code', 'article'])
    expect(held[0]!.element.id).toBe('card')
    // a layer that is its own anchor's chain needs no search
    const paragraph = chainForElement(doc.querySelector('main > p')!, doc)[0]!
    expect(chainHolding(paragraph, doc)[0]!.element).toBe(paragraph.element)
    // a layer whose element the page no longer has
    const gone = { kind: 'code' as const, element: doc.createElement('div') }
    expect(chainHolding(gone, doc)).toEqual([])
  })

  it('Tab between whole-element units of the article tier', () => {
    document.body.innerHTML = ['One', 'Two', 'Three'].map(name => '<article tabindex="0" id="u-' + name + '"><p>' + name + ' unit. ' + LONG + '</p></article>').join('')
    const article = chainForElement(doc.getElementById('u-Two')!, doc)[0]!
    expect(peersOf(article, doc).map(peer => peer.element.id)).toEqual(['u-One', 'u-Two', 'u-Three'])
  })
})

describe('childChainOf: what ↓ enters (capture.md §6.2 换层与进入)', () => {
  const unit = (kind: BlockCandidate['kind'], id: string): BlockCandidate => ({ kind, element: doc.getElementById(id) as HTMLElement })
  const names = (chain: BlockCandidate[]): string[] => chain.map(layer => (layer.range ? layer.range.start.id + ' run' : layer.element.id))

  it('an article enters its section first, then the section enters its first start', () => {
    document.body.innerHTML = '<main id="m"><section id="s"><h2>Heading</h2><p id="p">' + LONG + '</p><pre id="code">const x = 1</pre><p>' + LONG + '</p></section></main>'
    expect(names(childChainOf(unit('article', 'm'), doc))).toEqual(['s'])
    expect(names(childChainOf(unit('section', 's'), doc))).toEqual(['p'])
  })

  it('a heading is not a start inside its own section: the first paragraph is', () => {
    document.body.innerHTML = '<main id="m"><section id="s"><h2 id="h">Heading</h2><p id="p">' + LONG + '</p><p id="p2">' + LONG + '</p></section></main>'
    expect(names(childChainOf(unit('section', 's'), doc))).toEqual(['p'])
  })

  it('goes past blocks with nothing inside them, to a section below them', () => {
    document.body.innerHTML = '<main id="m"><p>' + LONG + '</p><h3 id="a">Alpha</h3><p>' + LONG + '</p></main>'
    const entered = childChainOf(unit('article', 'm'), doc)
    expect(entered[entered.length - 1]!.kind).toBe('section')
    expect(entered[entered.length - 1]!.range?.start.id).toBe('a')
  })

  it('starts where the window is, and wraps around to the top when nothing below has a unit inside', () => {
    document.body.innerHTML =
      '<main id="m">' +
      '<section id="s1"><h2>One</h2><p>' +
      LONG +
      '</p></section>' +
      '<section id="s2"><h2>Two</h2><p>' +
      LONG +
      '</p></section>' +
      '<section id="s3"><h2>Three</h2><p>' +
      LONG +
      '</p></section>' +
      '<p id="tail">' +
      LONG +
      '</p></main>'
    const place = (id: string, top: number, bottom: number): void => {
      doc.getElementById(id)!.getBoundingClientRect = () => new DOMRect(0, top, 600, bottom - top)
    }
    place('s1', -900, -500)
    place('s2', -480, 120)
    place('s3', 140, 700)
    expect(names(childChainOf(unit('article', 'm'), doc)), 'the section the window shows the end of').toEqual(['s2'])
    place('s2', -480, -20)
    place('s3', -10, -5)
    place('tail', 0, 300)
    expect(names(childChainOf(unit('article', 'm'), doc)), 'past the last section: back to the first').toEqual(['s1'])
  })

  it('reaches code in an open shadow root (MDN)', () => {
    document.body.innerHTML = '<main><section id="s"><h2>Fetch</h2><p>' + LONG + '</p><div id="host"></div></section></main>'
    const shadow = doc.getElementById('host')!.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<pre id="shadow-code">fetch(url)</pre>'
    const chain = childChainOf(unit('section', 's'), doc)
    expect(chain.map(layer => layer.kind)).toEqual(['code'])
    // the host wrapper adds no words: it merged into the code block, so the entered layer is the whole card
    expect(chain[0]!.element).toBe(doc.getElementById('host'))
  })
})

describe('firstVisibleChain and suppression (capture.md §6.2)', () => {
  it('finds the first start in the window that is not suppressed', () => {
    document.body.innerHTML = FLAT
    const target = doc.getElementById('h-intro')!
    doc.elementFromPoint = vi.fn((_x: number, y: number) => (y > 40 ? target : null))
    const chain = firstVisibleChain(doc)
    expect(chain[0]!.element.id).toBe('h-intro')
  })

  it('blocks in page furniture, and blocks with no text or media, are suppressed', () => {
    document.body.innerHTML = '<nav id="nav"><p id="nav-p">' + LONG + '</p></nav>'
    const navChain = chainForElement(doc.getElementById('nav-p')!, doc)
    expect(isSuppressed(navChain, startIndexOf(navChain))).toBe(true)
    document.body.innerHTML = '<main id="m"><div id="empty"></div><p>' + LONG + '</p></main>'
    const emptyChain = chainForElement(doc.getElementById('empty')!, doc)
    expect(isSuppressed(emptyChain, 0)).toBe(true)
    const paragraph = chainForElement(doc.querySelector('#m p')!, doc)
    expect(isSuppressed(paragraph, 0)).toBe(false)
  })

  it("the page's own interface never enters the content chain", () => {
    const chrome = document.createElement('div')
    chrome.className = 'share-bar'
    chrome.textContent = 'x'.repeat(300)
    document.body.appendChild(chrome)
    expect(chainForElement(chrome, doc)).toEqual([])
  })

  it('the pixel view still takes pictures in page furniture: the region counts there', () => {
    document.body.innerHTML = '<nav id="nav"><p id="nav-p">' + LONG + '</p></nav>'
    const pixel = chainForElement(doc.getElementById('nav-p')!, doc, 'pixel')
    expect(pixel.length).toBeGreaterThan(0)
  })
})

describe('chainAtPoint hit-tests the point', () => {
  it('reads the target from elementFromPoint', () => {
    document.body.innerHTML = FLAT
    doc.elementFromPoint = () => doc.getElementById('target')
    const chain = chainAtPoint(12, 12, doc)
    expect(chain[0]!.element.id).toBe('target')
    doc.elementFromPoint = () => null
    expect(chainAtPoint(12, 12, doc)).toEqual([])
  })
})

describe('contentLayers applies the stop rules in order', () => {
  it('a feed column is cut before the article stop', () => {
    const pixel: BlockCandidate[] = [
      { kind: 'post', element: doc.getElementById('post')! },
      { kind: 'section', element: doc.querySelector('main')! },
      { kind: 'article', element: doc.querySelector('main')! },
    ]
    // main holds the page's posts: a feed, so everything beyond the post goes
    document.body.innerHTML =
      '<main id="col"><section id="feed"><h2>Explore</h2>' +
      '<article data-testid="tweet" id="a"><p>a tweet body.</p></article>' +
      '<article data-testid="tweet" id="b"><p>b tweet body.</p></article>' +
      '</section></main>'
    const layers = contentLayers([
      { kind: 'post', element: doc.getElementById('a')! },
      { kind: 'section', element: doc.getElementById('feed')! },
      { kind: 'article', element: doc.getElementById('col')! },
    ])
    void pixel
    expect(layers.map(layer => layer.kind)).toEqual(['post'])
  })
})
