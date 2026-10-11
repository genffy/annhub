/**
 * Block detection (docs/v2/capture.md §6.2). The pointer's innermost
 * qualifying unit is the target; smaller kinds outrank bigger ones:
 * post/code/table/figure/quote → section → article.
 *
 * Detection runs only after the pointer rests, and only inspects the
 * ancestor chain under the pointer (through open shadow roots) — never a
 * whole-page scan, so scrolling never pays for it. The keyboard mode looks
 * further only when a key asks it to: `Tab` for the units of the same kind,
 * `↓` for the units inside the current one. Detection never throws into the
 * page: an element that cannot be classified is simply not a candidate.
 */
import { isPageChrome } from './markdown'

export type BlockKind = 'post' | 'code' | 'table' | 'figure' | 'quote' | 'section' | 'article'

export interface BlockCandidate {
  kind: BlockKind
  element: HTMLElement
  /**
   * A heading-bounded section on a page where headings and paragraphs are
   * siblings: the run from `start` up to (exclusive) `end` inside
   * `start.parentElement` (capture.md §6.2 一节). Absent for whole-element
   * targets — the outline and the conversion then use `element` itself.
   */
  range?: { start: Element; end: Element | null }
}

const KIND_RANK: Record<BlockKind, number> = { post: 0, code: 0, table: 0, figure: 0, quote: 0, section: 1, article: 2 }

const EXCLUDE_SELECTOR = 'nav, header, footer, aside, form, dialog, [aria-hidden="true"], [data-ann-ui]'

/** The deepest element at the point, crossing open shadow roots (capture.md §3). */
export function deepElementFromPoint(x: number, y: number, doc: Document): Element | null {
  let scope: ShadowRoot | Document = doc
  let el: Element | null = null
  for (let depth = 0; depth < 12; depth++) {
    el = scope.elementFromPoint(x, y)
    if (!el) return null
    const root: ShadowRoot | null = el.shadowRoot
    if (!root) return el
    scope = root
  }
  return el
}

/** The parent across the light/shadow boundary: `parentElement` stops at the shadow root's edge. */
export function composedParent(el: Element): Element | null {
  const parent = el.parentElement
  if (parent) return parent
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

/** The heading level of an element (case-safe), or 0 when it is not a heading. */
function headingLevel(el: Element): number {
  const match = /^h([1-6])$/.exec(el.tagName.toLowerCase())
  return match ? Number(match[1]) : 0
}

/**
 * What one key press has measured. `Tab` and `↓` detect many units whose
 * chains share the same large ancestors (the page's `main`, the article, the
 * Markdown container); the page does not change while they are measured.
 */
let scan: { texts: Map<Element, number>; holdsArticle: Map<Element, boolean> } | null = null

function inOneScan<T>(run: () => T): T {
  if (scan) return run()
  scan = { texts: new Map(), holdsArticle: new Map() }
  try {
    return run()
  } finally {
    scan = null
  }
}

function textLength(el: Element): number {
  const known = scan?.texts.get(el)
  if (known !== undefined) return known
  const length = (el.textContent ?? '').replace(/\s+/g, ' ').trim().length
  scan?.texts.set(el, length)
  return length
}

function holdsArticle(el: Element): boolean {
  const known = scan?.holdsArticle.get(el)
  if (known !== undefined) return known
  const holds = el.querySelector('article') !== null
  scan?.holdsArticle.set(el, holds)
  return holds
}

function visible(el: Element, win: Window): boolean {
  if (el.hasAttribute('hidden')) return false
  const style = win.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function classifyPost(el: Element): boolean {
  // Platform rule: an X timeline or status page post (capture.md §6.2)
  return el.tagName.toLowerCase() === 'article' && el.getAttribute('data-testid') === 'tweet'
}

function classifyTable(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'table') return false
  if (el.closest('[role="presentation"]')) return false // layout table
  const rows = el.querySelectorAll('tr')
  if (rows.length < 2) return false
  const hasHeader = el.querySelector('th') !== null
  const columns = Math.max(...Array.from(rows).map(row => row.children.length))
  return hasHeader || (rows.length >= 2 && columns >= 2)
}

function classifyFigure(el: Element): boolean {
  if (el.tagName.toLowerCase() === 'figure') return true
  if (el.tagName.toLowerCase() !== 'img') return false
  const box = el.getBoundingClientRect()
  return box.width >= 200 || (el as HTMLImageElement).naturalWidth >= 200
}

function classifyQuote(el: Element): boolean {
  return el.tagName.toLowerCase() === 'blockquote' && textLength(el) >= 20
}

/**
 * A heading-bounded section: a `section` element with a heading, or — when
 * headings and paragraphs are siblings (React docs, MkDocs, Docusaurus…) —
 * the sibling run from the heading governing `node` to the next heading of
 * the same or higher level (capture.md §6.2).
 */
function classifySection(el: Element, node: Node): BlockCandidate | null {
  if (el.tagName.toLowerCase() === 'section' && el.querySelector('h1,h2,h3,h4')) return { kind: 'section', element: el as HTMLElement }
  return runSection(el, node)
}

/** The heading run of `el` that `node` sits in, when it has the words of a section. */
function runSection(el: Element, node: Node): BlockCandidate | null {
  if (holdsArticle(el)) return null
  const range = sectionRangeFor(el, node)
  if (!range || rangeTextLength(el, range) < 120) return null
  return { kind: 'section', element: el as HTMLElement, range }
}

/**
 * Whether a run is all of `el`: it starts at the first child with content and
 * runs to the end, like the title heading of an article that has no other
 * heading of its level. Such a run is the article itself, not a section of it.
 */
function spansWhole(el: Element, range: NonNullable<BlockCandidate['range']>): boolean {
  if (range.end) return false
  for (const child of Array.from(el.children)) {
    if (child === range.start) return true
    if (!child.matches(EXCLUDE_SELECTOR) && !isPageChrome(child) && textLength(child) > 0) return false
  }
  return true
}

/** The sibling run of `el` that the heading governing `node` defines. */
function sectionRangeFor(el: Element, node: Node): BlockCandidate['range'] | null {
  // the direct child of `el` on the node's chain
  let child: Element | null = node instanceof Element ? node : node.parentElement
  while (child && child.parentElement !== el) child = child.parentElement
  if (!child) return null

  const children = Array.from(el.children)
  const childIndex = children.indexOf(child)
  if (childIndex < 0) return null

  // nearest heading at or before the child
  let heading: Element | null = null
  for (let i = childIndex; i >= 0; i--) {
    if (headingLevel(children[i]!) > 0) {
      heading = children[i]!
      break
    }
  }
  if (!heading) return null

  // the run ends just before the next heading of the same or higher level
  const level = headingLevel(heading)
  let end: Element | null = null
  for (let i = children.indexOf(heading) + 1; i < children.length; i++) {
    const next = children[i]!
    const nextLevel = headingLevel(next)
    if (nextLevel > 0 && nextLevel <= level) {
      end = next
      break
    }
  }
  return { start: heading, end }
}

function rangeTextLength(parent: Element, range: NonNullable<BlockCandidate['range']>): number {
  const children = Array.from(parent.children)
  const from = children.indexOf(range.start)
  const to = range.end ? children.indexOf(range.end) : children.length
  let total = 0
  for (let i = from; i >= 0 && i < to; i++) total += textLength(children[i]!)
  return total
}

/** The known content-container classes, matched per class word (multi-class friendly). */
const CONTENT_CLASSES = ['entry-content', 'post-content', 'markdown-content', 'markdown-body']

function classifyArticle(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'article' || el.getAttribute('role') === 'article') return true
  if (tag === 'main' || el.getAttribute('role') === 'main') return true
  return CONTENT_CLASSES.some(name => el.classList.contains(name))
}

/**
 * Tier three (capture.md §6.2): no `article`/`main`/`[role=main]`/known
 * container — take the innermost container directly holding at least three
 * text-carrying blocks (paragraphs, headings, lists, code, quotes).
 */
function classifyDenseContainer(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'div') return false
  let texty = 0
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase()
    const isTextBlock = tag === 'p' || tag === 'pre' || tag === 'ul' || tag === 'ol' || tag === 'blockquote' || headingLevel(child) > 0
    if (isTextBlock && textLength(child) >= 20) texty++
  }
  return texty >= 3
}

/**
 * The candidate chain at a point, innermost first (capture.md §6.2 层级).
 * Every ancestor is classified once; ties prefer the deeper element, and
 * smaller kinds rank before section before article.
 */
export function candidatesAtPoint(x: number, y: number, doc: Document): BlockCandidate[] {
  const target = deepElementFromPoint(x, y, doc)
  if (!target) return []
  return candidatesFor(target, doc)
}

export function candidatesFor(target: Element, doc: Document): BlockCandidate[] {
  return chainFrom(target, doc, null)
}

/** The candidate chain from `target` outwards, innermost first; with `top`, only up to that element. */
function chainFrom(target: Element, doc: Document, top: Element | null): BlockCandidate[] {
  if (target.closest(EXCLUDE_SELECTOR)) return []

  const found: BlockCandidate[] = []
  let el: Element | null = target
  while (el && el !== doc.body && el !== doc.documentElement) {
    if (!isPageChrome(el)) {
      // a page must never see detection throw (RV-CAP-01): one bad element
      // means no candidate there, not a broken hover
      try {
        found.push(...classify(el, target))
      } catch {
        /* not a candidate */
      }
    }
    if (el === top) break
    // through open shadow roots: the chain crosses the boundary, so "Parent"
    // climbs from a shadow-root code block back into the page (真机走查 P2-3)
    el = composedParent(el)
  }

  // innermost-first: rank, then DOM depth (deeper first within a rank)
  found.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || depth(b.element) - depth(a.element))
  const deduped: BlockCandidate[] = []
  for (const candidate of found) {
    if (deduped.some(existing => sameCandidate(existing, candidate))) continue
    if (deduped.some(existing => existing.element.contains(candidate.element) && KIND_RANK[existing.kind] === KIND_RANK[candidate.kind])) continue
    deduped.push(candidate)
  }
  return deduped
}

/** What `el` is, seen from `target`: usually one unit or none; an article with headings of its own can be two. */
function classify(el: Element, target: Element): BlockCandidate[] {
  const win = el.ownerDocument!.defaultView!
  if (!visible(el, win)) return []
  const element = el as HTMLElement
  if (classifyPost(el)) return [{ kind: 'post', element }]
  if (el.tagName.toLowerCase() === 'pre') return [{ kind: 'code', element }]
  if (classifyTable(el)) return [{ kind: 'table', element }]
  if (classifyFigure(el)) return [{ kind: 'figure', element }]
  if (classifyQuote(el)) return [{ kind: 'quote', element }]
  if (classifyArticle(el)) {
    if (textLength(el) < 120) return []
    // headings that are the article's own children (danluu, the Rust book) still divide it: the target sits in
    // a section of the article, as on any other page (真机走查 P2-1)
    const run = runSection(el, target)
    const article: BlockCandidate = { kind: 'article', element }
    return run?.range && !spansWhole(el, run.range) ? [run, article] : [article]
  }
  const section = classifySection(el, target)
  if (section) return [section]
  if (classifyDenseContainer(el)) return textLength(el) >= 120 ? [{ kind: 'article', element }] : []
  return []
}

function depth(el: Element): number {
  let d = 0
  let cursor: Element | null = el
  while (cursor) {
    d++
    cursor = cursor.parentElement
  }
  return d
}

/**
 * The rectangle a candidate paints: the union of a range section's sibling
 * run, or the element's own box.
 */
export function candidateRect(candidate: BlockCandidate): DOMRect {
  if (!candidate.range) return candidate.element.getBoundingClientRect()
  const parent = candidate.range.start.parentElement
  if (!parent) return candidate.element.getBoundingClientRect()
  const children = Array.from(parent.children)
  const from = children.indexOf(candidate.range.start)
  const to = candidate.range.end ? children.indexOf(candidate.range.end) : children.length
  const boxes: DOMRect[] = []
  for (let i = from; i >= 0 && i < to; i++) {
    const child = children[i]!
    const style = parent.ownerDocument!.defaultView!.getComputedStyle(child)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    boxes.push(child.getBoundingClientRect())
  }
  if (boxes.length === 0) return candidate.element.getBoundingClientRect()
  const left = Math.min(...boxes.map(box => box.left))
  const top = Math.min(...boxes.map(box => box.top))
  const right = Math.max(...boxes.map(box => box.right))
  const bottom = Math.max(...boxes.map(box => box.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

// ── Keyboard block mode helpers (capture.md §6.2, D-27) ───────────────────

/**
 * The node a unit is anchored at: a heading-run section starts at its
 * heading (its `element` is only the shared parent), anything else is its own
 * element. Detecting from the anchor reproduces the unit; detecting from
 * `element` would not.
 */
export function candidateAnchor(candidate: BlockCandidate): Element {
  return candidate.range?.start ?? candidate.element
}

export function sameCandidate(a: BlockCandidate, b: BlockCandidate): boolean {
  return a.kind === b.kind && a.element === b.element && (a.range?.start ?? null) === (b.range?.start ?? null)
}

/** The chain a unit sits in, innermost first, computed from the unit itself. */
export function chainOf(candidate: BlockCandidate, doc: Document): BlockCandidate[] {
  return candidatesFor(candidateAnchor(candidate), doc)
}

const PEER_SELECTORS: Record<BlockKind, string> = {
  post: 'article',
  code: 'pre',
  table: 'table',
  figure: 'figure, img',
  quote: 'blockquote',
  section: 'section, h1, h2, h3, h4',
  article: 'article, [role="article"], main, [role="main"], .entry-content, .post-content, .markdown-content, .markdown-body',
}

/** The elements the units of a tier are anchored at: every kind that ranks the same. */
function tierSelector(rank: number): string {
  const kinds = (Object.keys(KIND_RANK) as BlockKind[]).filter(kind => KIND_RANK[kind] === rank)
  return [...new Set(kinds.flatMap(kind => PEER_SELECTORS[kind].split(', ')))].join(', ')
}

/** A dense-container article is a plain `div`; finding its peers means looking at divs. */
const PEER_SCAN_LIMIT = 3_000

/**
 * The units of the same tier as `current` — posts, code, tables, figures and
 * quotes are one tier, sections the next, articles the last (capture.md §6.2,
 * D-27) — in document order: Tab / Shift+Tab move between them. A small unit
 * inside another small unit (a picture in a post, code in a figure) is a level
 * below it, reached with ↓. Runs only when the user presses Tab — never while
 * the pointer moves — and looks inside the shadow root `current` lives in.
 */
export function peersOf(current: BlockCandidate, doc: Document): BlockCandidate[] {
  return inOneScan(() => {
    const root = current.element.getRootNode()
    const scope: ParentNode = root instanceof ShadowRoot ? root : doc
    const rank = KIND_RANK[current.kind]
    const denseDiv = current.kind === 'article' && current.element.tagName.toLowerCase() === 'div'
    const selector = denseDiv ? `${PEER_SELECTORS.article}, div` : tierSelector(rank)
    const peers: BlockCandidate[] = []
    let scanned = 0
    for (const target of scope.querySelectorAll(selector)) {
      if (++scanned > PEER_SCAN_LIMIT) break
      const chain = candidatesFor(target, doc)
      chain.forEach((candidate, index) => {
        if (KIND_RANK[candidate.kind] !== rank || candidateAnchor(candidate) !== target) return
        // the chain runs outwards: a small unit after this one holds it
        if (rank === 0 && chain.slice(index + 1).some(outer => KIND_RANK[outer.kind] === 0)) return
        if (!peers.some(peer => sameCandidate(peer, candidate))) peers.push(candidate)
      })
    }
    if (!peers.some(peer => sameCandidate(peer, current))) peers.push(current)
    return peers.sort((a, b) => {
      const order = candidateAnchor(a).compareDocumentPosition(candidateAnchor(b))
      return order & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : order & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0
    })
  })
}

/**
 * The chain of the first unit on screen: scans down the middle of the window
 * and then the quarter lines, so a keyboard user who never moved the mouse
 * still starts on something (D-27).
 */
export function firstVisibleChain(doc: Document): BlockCandidate[] {
  const view = doc.defaultView
  if (!view) return []
  const columns = [view.innerWidth / 2, view.innerWidth / 4, (view.innerWidth * 3) / 4]
  try {
    for (let y = 8; y < view.innerHeight; y += 16) {
      for (const x of columns) {
        const chain = candidatesAtPoint(x, y, doc)
        if (chain.length > 0) return chain
      }
    }
  } catch {
    /* a document without hit-testing has no first unit */
  }
  return []
}

/** The content blocks of a page, and the elements units are: where `↓` looks for the units inside a unit. */
const CONTENT_SELECTOR = 'p, li, dd, pre, table, figure, img, blockquote, section, article, h1, h2, h3, h4, h5, h6'

/** A same-kind unit holding this much of the current unit's text is only its wrapper, not a level of its own. */
const WRAPPER_SHARE = 0.9

/** Where a section starts: a `section` element or a heading. */
const SECTION_ANCHORS = PEER_SELECTORS.section

/**
 * The chain of the first unit strictly inside `parent`, innermost first (真机走查
 * P2-1: `↓` at the innermost level enters the unit instead of doing nothing); []
 * when nothing smaller is inside. Walks the unit's own content in document
 * order — through open shadow roots, where MDN keeps its code — from the first
 * block that reaches into the window, then on down, then around: the unit found
 * may be below the window, and the mode scrolls it into view. Same-kind wrappers
 * that hold nearly all of `parent` (a docs page's `main`, its `article`, the
 * Markdown container) are not a level: outlining one would look like nothing
 * happened. An article's next level down is its sections (capture.md §6.2):
 * the one the window is in, else the next one to start, before anything
 * smaller — a quote above the first heading must not hide them.
 */
export function childChainOf(parent: BlockCandidate, doc: Document): BlockCandidate[] {
  return inOneScan(() => {
    const blocks = contentBlocksOf(parent)
    const start = Math.max(
      0,
      blocks.findIndex(block => block.getBoundingClientRect().bottom > 0),
    )
    const ordered = [...blocks.slice(start), ...blocks.slice(0, start)]
    const parentText = unitTextLength(parent)
    const inside = (block: Element): BlockCandidate[] =>
      chainFrom(block, doc, parent.element).filter(
        candidate => !sameCandidate(candidate, parent) && unitContains(parent, candidateAnchor(candidate)) && !wrapperOf(parent, candidate, parentText),
      )
    if (parent.kind === 'article') {
      // the first block in the window tells which section the window is in; after it, only where sections start
      for (const [index, block] of ordered.entries()) {
        if (index > 0 && !block.matches(SECTION_ANCHORS)) continue
        const inner = inside(block)
        if (inner.some(candidate => candidate.kind === 'section')) return inner
      }
    }
    for (const block of ordered) {
      const inner = inside(block)
      if (inner.length > 0) return inner
    }
    return []
  })
}

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

/** Whether the page renders `el` at all: not inside a hidden subtree, a closed `details` or a hidden tab panel. */
function rendered(el: Element): boolean {
  // Chrome before 121 knows the visibility option only as checkVisibilityCSS
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
  const win = el.ownerDocument.defaultView
  if (!win) return false
  for (let cursor: Element | null = el; cursor; cursor = composedParent(cursor)) if (!visible(cursor, win)) return false
  return true
}

function composedContains(ancestor: Element, node: Element): boolean {
  for (let cursor: Element | null = node; cursor; cursor = composedParent(cursor)) if (cursor === ancestor) return true
  return false
}

/** Whether `node` lies inside a unit: inside its element, or inside its run when it is a heading run. */
function unitContains(unit: BlockCandidate, node: Element): boolean {
  if (!unit.range) return composedContains(unit.element, node)
  const run = runChildren(unit.range)
  return run.some(child => composedContains(child, node))
}

function unitTextLength(unit: BlockCandidate): number {
  return unit.range ? rangeTextLength(unit.element, unit.range) : textLength(unit.element)
}

/** A whole-element unit of the parent's kind that holds nearly all of it (heading runs always differ by their heading). */
function wrapperOf(parent: BlockCandidate, candidate: BlockCandidate, parentText: number): boolean {
  if (parent.range || candidate.range || candidate.kind !== parent.kind) return false
  return unitTextLength(candidate) >= parentText * WRAPPER_SHARE
}

/** What a screen reader hears after the kind: the unit's own words (a run section reads only its run). */
export function candidateSummary(candidate: BlockCandidate, limit = 80): string {
  let text: string
  if (candidate.range) {
    const children = Array.from(candidate.range.start.parentElement?.children ?? [])
    const from = Math.max(children.indexOf(candidate.range.start), 0)
    const end = candidate.range.end ? children.indexOf(candidate.range.end) : -1
    text = children
      .slice(from, end < 0 ? children.length : end)
      .map(child => child.textContent ?? '')
      .join(' ')
  } else {
    text = summaryTextOf(candidate.element)
  }
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) {
    const image = candidate.element.tagName.toLowerCase() === 'img' ? candidate.element : candidate.element.querySelector('img')
    text = candidate.element.getAttribute('aria-label') ?? image?.getAttribute('alt') ?? ''
  }
  return text.slice(0, limit)
}

/**
 * The unit's own words, starting at its first content block: a heading or
 * paragraph inside the unit, not the page furniture that happens to sit in it
 * (Wikipedia's “Toggle the table of contents”, Medium's tags and highlight
 * markers — 真机走查 P3-8). Falls back to the whole text when no content
 * block qualifies.
 */
function summaryTextOf(el: HTMLElement): string {
  const blocks = Array.from(el.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre'))
  for (const block of blocks) {
    if (block.closest('button, nav, aside, summary, [aria-hidden="true"], [role="button"]')) continue
    const t = (block.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (t.length >= 12) return t
  }
  return el.textContent ?? ''
}
