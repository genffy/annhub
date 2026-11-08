/**
 * One target chain for the hover capsule, the keyboard block mode, the
 * screenshot viewfinder and the page download (docs/product/capture.md §6.2).
 * Three entries pointing at the same spot outline the same range: the chain
 * starts at the innermost block under the pointer (with two exceptions: a
 * heading starts the section it begins, a block under 30×10 CSS pixels yields
 * to the first big-enough ancestor), and climbs out to the article or the
 * feed's outermost post.
 *
 * Two views read the same chain. The pixel view (the screenshot viewfinder)
 * keeps every ancestor up to just below body, skipping only layers whose box
 * equals the one inside, and inserts a section as a layer on pages where
 * headings and paragraphs are siblings. The content view (the capsule and the
 * block mode) derives from it: blocks inside small units are dropped, an outer
 * layer that adds fewer than 20 non-whitespace characters and no image or
 * video merges into the one below (a same-kind outer frame holding at least
 * 90% of the inner layer's text merges too), and the chain ends at the
 * article, at a column of posts, or at the outermost block without page
 * furniture.
 */
import {
  blockShapeOf,
  candidateAnchor,
  candidateRect,
  candidateSummary,
  classifyElementAt,
  composedParent,
  CONTENT_SELECTOR,
  deepElementFromPoint,
  EXCLUDE_SELECTOR,
  feedColumn,
  headingLevel,
  inOneScan,
  isArticleElement,
  isSmallUnit,
  nonWsTextLength,
  rendered,
  runSectionsFor,
  runSpansWhole,
  sameCandidate,
  type BlockCandidate,
  type BlockKind,
} from './blocks'
import { isPageChrome } from './markdown'
import { uiText } from '../../utils/ui-text'

export type ChainView = 'pixel' | 'content'

const PEER_SCAN_LIMIT = 3_000
/** A block this size or bigger can start a target (capture.md §6.2 起点). */
const START_MIN_WIDTH = 30
const START_MIN_HEIGHT = 10
/** An outer layer adding this many non-whitespace characters or fewer, and no media, merges down (capture.md §6.2 内容看法). */
const MERGE_CHARS = 20
/** A same-kind outer layer holding at least this share of the inner layer's text merges down. */
const MERGE_SHARE = 0.9
/** Page furniture that ends a chain when no article is on it (capture.md §6.2 内容看法). */
const REGION_SELECTOR = 'nav, header, footer, aside, form, dialog'
const MEDIA_SELECTOR = 'img, video'

/** The innermost block at a point: inline elements climb out to their block (capture.md §6.2 块). */
export function blockStartElement(target: Element, doc: Document): Element {
  let current: Element = target
  const view = doc.defaultView
  if (!view) return current
  for (let depth = 0; depth < 12; depth++) {
    const display = view.getComputedStyle(current).display
    if (display.startsWith('inline') && display !== 'inline-block') {
      const parent = composedParent(current)
      if (!parent) break
      current = parent
    } else {
      break
    }
  }
  return current
}

/** Two boxes are the same layer when no edge differs by half a pixel. */
function sameBox(a: DOMRect, b: DOMRect): boolean {
  return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.right - b.right) < 0.5 && Math.abs(a.bottom - b.bottom) < 0.5
}

/** Whether a layer after `previous` doubles its box: only real boxes count, a zero box has no layout to compare (jsdom). */
function doublesBox(previous: BlockCandidate, candidate: BlockCandidate): boolean {
  const prevRect = candidateRect(previous)
  if (prevRect.width <= 0 && prevRect.height <= 0) return false
  return sameBox(prevRect, candidateRect(candidate))
}

/** Whether an element lays out as a block: the pixel view layers every ancestor that does. */
function isBlockLevel(el: Element, doc: Document): boolean {
  const view = doc.defaultView
  if (!view) return false
  const display = view.getComputedStyle(el).display
  return !(display.startsWith('inline') && display !== 'inline-block')
}

/**
 * The pixel view of the chain, innermost first: the start block, every
 * ancestor up to just below body, and a section inserted where headings and
 * paragraphs are siblings. Layers whose box equals the one inside are
 * skipped; a page must never see detection throw.
 */
export function pixelChainFor(target: Element, doc: Document): BlockCandidate[] {
  const start = blockStartElement(target, doc)
  const layers: BlockCandidate[] = []
  let el: Element | null = start
  let child: Element | null = null
  while (el && el !== doc.body && el !== doc.documentElement) {
    try {
      const element = el as HTMLElement
      // a flat page's heading runs sit between the child's layers and el's own;
      // a section element is one whole layer, its run is not split out again
      if (child && el.tagName.toLowerCase() !== 'section') {
        const runs = runSectionsFor(el, child).filter(run => !isArticleElement(element) || !runSpansWhole(element, run))
        for (const run of runs) layers.push({ kind: 'section', element, range: run })
      }
      const classified = classifyElementAt(el)
      for (const candidate of classified) {
        // only a plain block wrapper skips when its box equals the layer inside:
        // a unit (an article exactly wrapping its section) stays a layer
        if (candidate.kind === 'block' && layers.length > 0 && doublesBox(layers[layers.length - 1]!, candidate)) continue
        layers.push(candidate)
      }
      // an ancestor nothing classifies (a feed column, a short article) is
      // still a pixel layer: the viewfinder takes the picture either way
      if (classified.length === 0 && isBlockLevel(el, doc)) {
        const candidate: BlockCandidate = { kind: 'block', element, blockShape: blockShapeOf(el) }
        if (layers.length === 0 || !doublesBox(layers[layers.length - 1]!, candidate)) layers.push(candidate)
      }
    } catch {
      /* one bad element is not a candidate, never a broken hover */
    }
    child = el
    el = composedParent(el)
  }
  return layers
}

/** The children a layer's own scope covers: its element, or the run of its heading. */
function scopeChildren(layer: BlockCandidate): Element[] {
  if (!layer.range) return [layer.element]
  const children = Array.from(layer.range.start.parentElement?.children ?? [])
  const from = children.indexOf(layer.range.start)
  if (from < 0) return [layer.element]
  const to = layer.range.end ? children.indexOf(layer.range.end) : -1
  return children.slice(from, to < 0 ? children.length : to)
}

/** Whether a layer's own scope holds page furniture (capture.md §6.2 内容看法). */
function scopeHasRegion(layer: BlockCandidate): boolean {
  return scopeChildren(layer).some(el => el.matches(REGION_SELECTOR) || el.querySelector(REGION_SELECTOR) !== null)
}

/** The images and videos inside a layer's own scope. */
function scopeMedia(layer: BlockCandidate): Element[] {
  return scopeChildren(layer).flatMap(el => Array.from(el.matches(MEDIA_SELECTOR) ? [el] : el.querySelectorAll(MEDIA_SELECTOR)))
}

/** Non-whitespace characters of a layer's own scope. */
function scopeText(layer: BlockCandidate): number {
  let total = 0
  for (const el of scopeChildren(layer)) total += nonWsTextLength(el)
  return total
}

/**
 * Two adjacent layers merge when the outer one adds fewer than 20
 * non-whitespace characters and no image or video, or when a same-kind outer
 * frame holds at least 90% of the inner layer's text. The merged layer keeps
 * the outer scope; a block and a unit merge into that unit, two blocks keep
 * the outer block's name, two units keep the outer unit (capture.md §6.2).
 */
function mergeable(inner: BlockCandidate, outer: BlockCandidate): boolean {
  // a small unit inside another small unit is a layer of its own — the picture
  // in a post, the quoted post (capture.md §6.2 内容看法)
  if (isSmallUnit(inner) && isSmallUnit(outer)) return false
  if (isSmallUnit(inner) || isSmallUnit(outer)) {
    // a block and a unit merge (the div wrapping a pre is the code block);
    // two units of which one is small do not
    if (inner.kind !== 'block' && outer.kind !== 'block') return false
  }
  const innerLen = scopeText(inner)
  const outerLen = scopeText(outer)
  if (outerLen - innerLen < MERGE_CHARS) {
    const innerMedia = scopeMedia(inner)
    if (scopeMedia(outer).every(media => innerMedia.includes(media))) return true
  }
  if (inner.kind === outer.kind && innerLen >= outerLen * MERGE_SHARE) return true
  return false
}

function merge(inner: BlockCandidate, outer: BlockCandidate): BlockCandidate {
  let kind: BlockKind = 'block'
  if (inner.kind !== 'block' && outer.kind !== 'block') kind = outer.kind
  else if (inner.kind !== 'block') kind = inner.kind
  else if (outer.kind !== 'block') kind = outer.kind
  const merged: BlockCandidate = { ...outer, kind }
  if (kind === 'block') merged.blockShape = outer.blockShape ?? inner.blockShape
  return merged
}

/**
 * The content view of a pixel chain (capture.md §6.2 内容看法): blocks inside
 * small units are dropped, adjacent layers merge, and the chain ends at the
 * article, at a column of posts, or at the outermost block without page
 * furniture.
 */
export function contentLayers(pixel: BlockCandidate[]): BlockCandidate[] {
  let layers = pixel
  // a small unit swallows the blocks inside it: pointing at a post's paragraph is pointing at the post
  const firstUnit = layers.findIndex(isSmallUnit)
  if (firstUnit > 0) layers = layers.filter((layer, index) => layer.kind !== 'block' || index >= firstUnit)
  // the page's own interface is never a layer to clip; the stops come before the
  // merges so a merged layer cannot smuggle in furniture or a column of posts
  layers = layers.filter(layer => !isPageChrome(layer.element))
  // a column of posts and everything outside it never enter the chain: the
  // outermost post survives, layers around the column do not
  const feedIndex = layers.findIndex(layer => !isSmallUnit(layer) && feedColumn(layer.element))
  if (feedIndex >= 0) {
    let lastUnit = -1
    for (let index = 0; index < feedIndex; index++) {
      if (isSmallUnit(layers[index]!)) lastUnit = index
    }
    layers = lastUnit >= 0 ? layers.slice(0, lastUnit + 1) : []
  } else {
    // the chain ends at the article, nothing beyond it is a layer
    let articleIndex = -1
    for (let index = 0; index < layers.length; index++) {
      if (layers[index]!.kind === 'article') articleIndex = index
    }
    if (articleIndex >= 0) {
      layers = layers.slice(0, articleIndex + 1)
    } else {
      // without posts or an article: the outermost block that holds no page furniture
      const regionIndex = layers.findIndex(scopeHasRegion)
      if (regionIndex >= 0) layers = layers.slice(0, regionIndex)
    }
  }
  // merges run innermost-first and cascade
  const merged: BlockCandidate[] = []
  for (const layer of layers) {
    const previous = merged[merged.length - 1]
    if (previous && mergeable(previous, layer)) merged[merged.length - 1] = merge(previous, layer)
    else merged.push(layer)
  }
  return merged
}

/** A zero-area box has no layout (jsdom): the size rule cannot judge it. */
function startEligible(layer: BlockCandidate): boolean {
  const rect = candidateRect(layer)
  if (rect.width === 0 && rect.height === 0) return true
  return rect.width >= START_MIN_WIDTH && rect.height >= START_MIN_HEIGHT
}

/**
 * The chain's start (capture.md §6.2 起点): a h1-h4 heading starts the section
 * it begins (the heading stays one level in); a block smaller than 30×10
 * yields to the first big-enough ancestor. Every new start resets the level.
 */
export function startIndexOf(layers: BlockCandidate[]): number {
  if (layers.length === 0) return 0
  const first = layers[0]!
  if (first.kind === 'block' && first.blockShape === 'heading') {
    const level = headingLevel(first.element)
    const next = layers[1]
    // the heading starts the section it begins: the run on a flat page, or the
    // section element whose own heading it is
    if (level >= 1 && level <= 4 && next && next.kind === 'section') {
      if (next.range?.start === first.element) return 1
      if (!next.range && next.element.querySelector('h1, h2, h3, h4') === first.element) return 1
    }
    // the section the heading begins may have merged into the article: the run
    // still lives in a container between the heading and the article
    if (level >= 1 && level <= 4 && next && next.kind === 'article') {
      for (let el = first.element.parentElement; el; el = el.parentElement) {
        const runs = runSectionsFor(el, first.element)
        if (runs.length > 0 && runs[0]!.start === first.element) return 1
        if (el === next.element) break
      }
    }
  }
  for (let index = 0; index < layers.length; index++) {
    if (startEligible(layers[index]!)) return index
  }
  return layers.length - 1
}

/** The chain at a point, in the given view. */
export function chainAtPoint(x: number, y: number, doc: Document, view: ChainView = 'content'): BlockCandidate[] {
  const target = deepElementFromPoint(x, y, doc)
  if (!target) return []
  return chainForElement(target, doc, view)
}

/** The chain of an element, in the given view. */
export function chainForElement(target: Element, doc: Document, view: ChainView = 'content'): BlockCandidate[] {
  const pixel = pixelChainFor(target, doc)
  if (pixel.length === 0) return []
  return view === 'pixel' ? pixel : contentLayers(pixel)
}

/**
 * Where the block entry never appears (capture.md §6.2 不出现): page furniture,
 * forms and dialogs, the extension's own UI, invisible elements, and blocks
 * with neither text nor an image or video. The screenshot viewfinder ignores
 * this — it takes the picture, so the region still counts.
 */
export function isSuppressed(chain: BlockCandidate[], start: number): boolean {
  const layer = chain[start]
  if (!layer) return true
  const el = layer.range ? layer.range.start : layer.element
  if (el.closest(EXCLUDE_SELECTOR)) return true
  if (!rendered(el)) return true
  if (layer.kind === 'block' && !(el.textContent ?? '').trim() && !el.querySelector(MEDIA_SELECTOR)) return true
  return false
}

/** The layer the three entries start at. */
export function chainStart(chain: BlockCandidate[]): BlockCandidate | null {
  return chain.length > 0 ? chain[startIndexOf(chain)]! : null
}

/** The @handle a post's label shows (capture.md §6.2 标注). */
function postHandle(post: HTMLElement): string | null {
  const link = post.querySelector('a[href*="/status/"]')
  const match = link?.getAttribute('href')?.match(/^\/([^/]+)\/status\//)
  if (match) return '@' + match[1]
  const at = /@(\w{1,15})/.exec(post.textContent ?? '')
  return at ? '@' + at[1]! : null
}

/** Text truncated to n characters with an ellipsis. */
function cut(text: string, limit: number): string {
  const chars = Array.from(text)
  return chars.length > limit ? chars.slice(0, limit).join('') + '…' : text
}

/** The kind a label or the mode's status names first. */
export function layerKindName(layer: BlockCandidate): string {
  if (layer.kind === 'block') {
    return uiText(('block.kind.' + (layer.blockShape ?? 'block')) as 'block.kind.paragraph')
  }
  return uiText(('block.kind.' + layer.kind) as 'block.kind.post')
}

/** The mode's status words: the kind and the layer's own words. */
export function layerStatus(layer: BlockCandidate): string {
  const kind = layerKindName(layer)
  const summary = candidateSummary(layer)
  return summary ? kind + ' · ' + summary : kind
}

/**
 * The outline's label (capture.md §6.2 标注). The pixel view writes the
 * element name and the size (a section its kind and size); the content view
 * writes kind and range: paragraphs open with their words, a post with its
 * handle, a code block with its line count, a table with its rows and
 * columns, a figure with its caption or size, a section with its heading, and
 * the article with the whole page.
 */
export function layerLabel(layer: BlockCandidate, view: ChainView): string {
  const rect = candidateRect(layer)
  const size = Math.round(rect.width) + ' × ' + Math.round(rect.height)
  if (view === 'pixel') {
    if (layer.kind === 'section') return uiText('block.kind.section') + ' · ' + size
    return layer.element.tagName.toLowerCase() + ' · ' + size
  }
  const name = layerKindName(layer)
  const text = (layer.element.textContent ?? '').replace(/\s+/g, ' ').trim()
  switch (layer.kind) {
    case 'block': {
      const words = cut(text, 16)
      return words ? name + ' · ' + words : name
    }
    case 'post': {
      const handle = postHandle(layer.element)
      return handle ? name + ' · ' + handle : name
    }
    case 'code': {
      const lines = (layer.element.textContent ?? '').split('\n').length
      return name + ' · ' + uiText('block.label.lines', { n: lines })
    }
    case 'table': {
      const rows = layer.element.querySelectorAll('tr').length
      let cols = 0
      for (const row of Array.from(layer.element.querySelectorAll('tr'))) cols = Math.max(cols, row.children.length)
      return name + ' · ' + uiText('block.label.cells', { rows, cols })
    }
    case 'figure': {
      const caption = layer.element.querySelector('figcaption')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const words = cut(caption, 16)
      return name + ' · ' + (words ? words : size)
    }
    case 'quote': {
      const words = cut(text, 16)
      return words ? name + ' · ' + words : name
    }
    case 'section': {
      const heading = (layer.range?.start.textContent ?? layer.element.querySelector('h1, h2, h3, h4')?.textContent ?? '').replace(/\s+/g, ' ').trim()
      return name + ' · ' + cut(heading, 24)
    }
    case 'article':
      return name + ' · ' + uiText('block.label.whole')
  }
}

/**
 * Keyboard tiers (capture.md §6.2 区块模式): blocks and small units are one
 * tier, sections a tier per heading level, the article a tier of its own.
 */
export function rankOf(layer: BlockCandidate): number {
  if (layer.kind === 'block' || isSmallUnit(layer)) return 0
  if (layer.kind === 'section') {
    if (layer.range) return headingLevel(layer.range.start)
    return headingLevel(layer.element.querySelector('h1, h2, h3, h4') ?? layer.element)
  }
  return 5
}

const ARTICLE_PEER_SELECTOR = 'article, [role="article"], main, [role="main"], .entry-content, .post-content, .markdown-content, .markdown-body, div'
const SECTION_PEER_SELECTOR = 'section, h1, h2, h3, h4'

/** A div has own words worth stopping on when text sits directly in it. */
function hasDirectText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) return true
  }
  return false
}

/**
 * The targets of the same tier as current — blocks and small units one
 * tier, sections per heading level, articles the last (capture.md §6.2 同档)
 * — in document order: Tab / Shift+Tab move between them. A small unit inside
 * another small unit (a picture in a post) is a level below it, reached with
 * ↓; a heading stops at the heading itself, and only blocks that can be
 * starts stop at all. Runs only when the user presses Tab — never while the
 * pointer moves — and looks inside the shadow root current lives in.
 */
export function peersOf(current: BlockCandidate, doc: Document): BlockCandidate[] {
  return inOneScan(() => {
    const root = current.element.getRootNode()
    const scope: ParentNode = root instanceof ShadowRoot ? root : doc
    const rank = rankOf(current)
    const selector = rank === 0 ? CONTENT_SELECTOR + ', div' : rank === 5 ? ARTICLE_PEER_SELECTOR : SECTION_PEER_SELECTOR
    const peers: BlockCandidate[] = []
    let scanned = 0
    for (const target of scope.querySelectorAll(selector)) {
      if (++scanned > PEER_SCAN_LIMIT) break
      if (rank === 0 && target.tagName.toLowerCase() === 'div' && !hasDirectText(target)) continue
      const chain = chainForElement(target, doc)
      if (chain.length === 0) continue
      const start = startIndexOf(chain)
      if (isSuppressed(chain, start)) continue
      chain.forEach((candidate, index) => {
        if (rankOf(candidate) !== rank || candidateAnchor(candidate) !== target) return
        if (isSmallUnit(candidate) && chain.slice(index + 1).some(outer => isSmallUnit(outer))) return
        if (candidate.kind === 'block' && candidate.blockShape !== 'heading' && start !== index) return
        if (!peers.some(peer => sameCandidate(peer, candidate))) peers.push(candidate)
      })
    }
    // the current target itself stops the tier only when it belongs there: a picture
    // inside a post is a ↓ level, and a block that is not a start is not a stop
    const ownChain = chainForElement(candidateAnchor(current), doc)
    const ownIndex = ownChain.findIndex(candidate => sameCandidate(candidate, current))
    let eligible = ownIndex >= 0
    if (eligible && isSmallUnit(current) && ownChain.slice(ownIndex + 1).some(outer => isSmallUnit(outer))) eligible = false
    if (eligible && current.kind === 'block' && current.blockShape !== 'heading' && startIndexOf(ownChain) !== ownIndex) eligible = false
    if (eligible && !peers.some(peer => sameCandidate(peer, current))) peers.push(current)
    return peers.sort((a, b) => {
      const order = candidateAnchor(a).compareDocumentPosition(candidateAnchor(b))
      return order & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : order & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0
    })
  })
}

/** Where a section starts: a section element or a heading. */
const SECTION_ANCHORS = SECTION_PEER_SELECTOR

/** The rendered content blocks inside a unit, in document order, through open shadow roots. */
function contentBlocksOf(unit: BlockCandidate): Element[] {
  const stack = (unit.range ? runChildren(unit.range) : childrenOf(unit.element)).reverse()
  const blocks: Element[] = []
  while (stack.length > 0 && blocks.length < PEER_SCAN_LIMIT) {
    const el = stack.pop()!
    if (el.matches(EXCLUDE_SELECTOR)) continue
    if (el.matches(CONTENT_SELECTOR) && rendered(el)) blocks.push(el)
    const children = childrenOf(el)
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!)
  }
  return blocks
}

/** An element's children as the page renders them: a host's shadow tree first (MDN's code examples live there). */
function childrenOf(el: Element): Element[] {
  return [...Array.from(el.shadowRoot?.children ?? []), ...Array.from(el.children)]
}

/** The sibling run a heading-run section covers. */
function runChildren(range: NonNullable<BlockCandidate['range']>): Element[] {
  const children = Array.from(range.start.parentElement?.children ?? [])
  const from = children.indexOf(range.start)
  if (from < 0) return []
  const to = range.end ? children.indexOf(range.end) : -1
  return children.slice(from, to < 0 ? children.length : to)
}

function composedContains(ancestor: Element, node: Element): boolean {
  for (let cursor: Element | null = node; cursor; cursor = composedParent(cursor)) if (cursor === ancestor) return true
  return false
}

/** Whether node lies inside a layer: inside its element, or inside its run when it is a heading run. */
function layerContains(layer: BlockCandidate, node: Element): boolean {
  if (!layer.range) return composedContains(layer.element, node)
  const run = runChildren(layer.range)
  return run.some(child => composedContains(child, node))
}

/**
 * The chain of the first target strictly inside parent, innermost first (↓
 * at the innermost level enters the target instead of doing nothing). An
 * article's next level down is its sections: the one the window is in, else
 * the next one to start, before anything smaller; other targets enter the
 * first start in the window. Walks the unit's own content in document order —
 * through open shadow roots — from the first block that reaches into the
 * window, then on down, then around; the target found may be below the
 * window, and the mode scrolls it into view.
 */
export function childChainOf(parent: BlockCandidate, doc: Document): BlockCandidate[] {
  return inOneScan(() => {
    const blocks = contentBlocksOf(parent)
    const start = Math.max(
      0,
      blocks.findIndex(block => block.getBoundingClientRect().bottom > 0),
    )
    const ordered = [...blocks.slice(start), ...blocks.slice(0, start)]
    const inside = (block: Element): BlockCandidate[] => {
      // a heading of the parent's own section is not a start inside it
      if (parent.kind === 'section' && !parent.range && block.matches('h1, h2, h3, h4') && parent.element.querySelector('h1, h2, h3, h4') === block) {
        return []
      }
      // a section element enters as itself even when the chain merged it into
      // the article (a single-section page: article adds nothing beyond it)
      const direct = classifyElementAt(block).filter(layer => layer.kind === 'section' && layerContains(parent, candidateAnchor(layer)))
      if (direct.length > 0) return direct
      const chain = chainForElement(block, doc)
      if (chain.length === 0 || isSuppressed(chain, startIndexOf(chain))) return []
      // a block whose start is the parent itself (a heading of the parent's
      // section) is not a start inside the parent
      const parentAtStart = chain[startIndexOf(chain)]
      if (parentAtStart && sameCandidate(parentAtStart, parent)) return []
      const inner: BlockCandidate[] = []
      for (const layer of chain) {
        if (sameCandidate(layer, parent)) break
        if (layerContains(parent, candidateAnchor(layer))) inner.push(layer)
        else break
      }
      return inner
    }
    if (parent.kind === 'article') {
      // the first block in the window tells which section the window is in; after it, only where sections start
      for (const [index, block] of ordered.entries()) {
        if (index > 0 && !block.matches(SECTION_ANCHORS)) continue
        const inner = inside(block)
        if (inner.some(layer => layer.kind === 'section')) return inner
      }
    }
    for (const block of ordered) {
      const inner = inside(block)
      if (inner.length > 0) return inner
    }
    return []
  })
}

/**
 * The chain of the first start on screen: scans down the middle of the window
 * and then the quarter lines, so a keyboard user who never moved the mouse
 * still starts on something (capture.md §6.2 区块模式).
 */
export function firstVisibleChain(doc: Document): BlockCandidate[] {
  const view = doc.defaultView
  if (!view) return []
  const columns = [view.innerWidth / 2, view.innerWidth / 4, (view.innerWidth * 3) / 4]
  try {
    for (let y = 8; y < view.innerHeight; y += 16) {
      for (const x of columns) {
        const chain = chainAtPoint(x, y, doc)
        if (chain.length > 0 && !isSuppressed(chain, startIndexOf(chain))) return chain
      }
    }
  } catch {
    /* a document without hit-testing has no first target */
  }
  return []
}

/** The same layer for the pause bookkeeping: kind, element and the run's start. */
export function sameLayer(a: BlockCandidate, b: BlockCandidate): boolean {
  return sameCandidate(a, b)
}
