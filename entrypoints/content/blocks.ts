/**
 * Block detection (docs/product/capture.md §6.2). The pointer's innermost
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
import { isSemanticXPost } from './platform-x'

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
let scan: { texts: Map<Element, number>; holdsArticle: Map<Element, boolean>; feeds: Map<Element, boolean> } | null = null

function inOneScan<T>(run: () => T): T {
  if (scan) return run()
  scan = { texts: new Map(), holdsArticle: new Map(), feeds: new Map() }
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
  return isSemanticXPost(el) || (el.tagName.toLowerCase() === 'article' && el.getAttribute('data-testid') === 'tweet')
}

const POST_SELECTOR = 'article'

/** Posts in `el` that are not a quote nested inside another post. */
function topLevelPosts(el: Element): Element[] {
  const posts: Element[] = []
  for (const post of Array.from(el.querySelectorAll(POST_SELECTOR))) {
    if (!classifyPost(post)) continue
    const outer = post.parentElement?.closest(POST_SELECTOR)
    if (outer && classifyPost(outer) && el.contains(outer)) continue
    posts.push(post)
  }
  return posts
}

/**
 * A column of posts — an X timeline or a status thread — is not one section
 * or article. Parent must stop at the quote or the enclosing post: the column
 * box is the virtualized timeline (many screens tall), the pointer never
 * leaves it, and the outline sticks until the page scrolls (issue #107).
 * A write-up that embeds posts still qualifies as an article when the prose
 * outside those posts is its own.
 */
function feedColumn(el: Element): boolean {
  const known = scan?.feeds.get(el)
  if (known !== undefined) return known
  const posts = topLevelPosts(el)
  let result = false
  if (posts.length >= 2) {
    let prose = textLength(el)
    for (const post of posts) prose -= textLength(post)
    if (prose < 120) result = true
    else {
      const viewH = el.ownerDocument?.defaultView?.innerHeight ?? 0
      const height = el.getBoundingClientRect().height
      // Chrome around the posts (a topic blurb) must not reattach the column.
      if (viewH > 0 && height > viewH * 6 && prose < 600) result = true
    }
  }
  scan?.feeds.set(el, result)
  return result
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
 * The page's own article candidates, outermost only (download.md §2.4): the
 * same classifiers the block rules use, so the download's main-article pick
 * agrees with what hovering would outline. The caller takes the one holding
 * the most text.
 */
export function pageArticleCandidates(doc: Document): Element[] {
  const view = doc.defaultView
  if (!view) return []
  const matched = Array.from(doc.querySelectorAll('article, main, [role="article"], [role="main"], .entry-content, .post-content, .markdown-content, .markdown-body')).filter(
    el => classifyArticle(el) && visible(el, view) && !el.closest(EXCLUDE_SELECTOR) && !el.closest('[data-ann-ui]'),
  )
  return matched.filter(el => !matched.some(other => other !== el && other.contains(el)))
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
    // climbs from a shadow-root code block back into the page
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
  // Clamp the parent walk before section/article: only containers that would
  // become that next level can be the timeline column (issue #107).
  if ((classifyArticle(el) || el.tagName.toLowerCase() === 'section') && feedColumn(el)) return []
  if (classifyArticle(el)) {
    if (textLength(el) < 120) return []
    // headings that are the article's own children (danluu, the Rust book) still divide it: the target sits in
    // a section of the article, as on any other page
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
 * The union rect of a section's sibling run — the box a section paints, captures
 * and anchors its toast against. Falls back to the element's own box when the
 * interval holds nothing laid out.
 */
export function sectionIntervalRect(element: Element, range: NonNullable<BlockCandidate['range']>): DOMRect {
  const parent = range.start.parentElement
  if (!parent) return element.getBoundingClientRect()
  const children = Array.from(parent.children)
  const from = children.indexOf(range.start)
  const to = range.end ? children.indexOf(range.end) : children.length
  const boxes: DOMRect[] = []
  for (let i = from; i >= 0 && i < to; i++) {
    const child = children[i]!
    const style = parent.ownerDocument!.defaultView!.getComputedStyle(child)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    boxes.push(child.getBoundingClientRect())
  }
  if (boxes.length === 0) return element.getBoundingClientRect()
  const left = Math.min(...boxes.map(box => box.left))
  const top = Math.min(...boxes.map(box => box.top))
  const right = Math.max(...boxes.map(box => box.right))
  const bottom = Math.max(...boxes.map(box => box.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

/**
 * The rectangle a candidate paints: the union of a range section's sibling
 * run, or the element's own box.
 */
export function candidateRect(candidate: BlockCandidate): DOMRect {
  if (!candidate.range) return candidate.element.getBoundingClientRect()
  return sectionIntervalRect(candidate.element, candidate.range)
}
