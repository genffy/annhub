/**
 * Unit and block classification (docs/product/capture.md §6.2). One target
 * chain serves the hover capsule, the keyboard block mode, the screenshot
 * viewfinder and the page download; this module classifies the layers, and
 * target-chain.ts assembles them into a chain.
 *
 * A layer is one of: a block (paragraph, list item, list, heading or any
 * other block-level element), a small unit (post, code block, table, figure,
 * quote), a section or the article. Detection runs only after the pointer
 * rests, and only inspects the ancestor chain under the pointer (through
 * open shadow roots) — never a whole-page scan, so scrolling never pays for
 * it. Detection never throws into the page: an element that cannot be
 * classified is simply not a candidate.
 */
import { isPageChrome } from './markdown'
import { isSemanticXPost } from './platform-x'

export type BlockKind = 'block' | 'post' | 'code' | 'table' | 'figure' | 'quote' | 'section' | 'article'

/** What a block layer is called (capture.md §6.2 目标链里的层). */
export type BlockShape = 'paragraph' | 'listItem' | 'list' | 'heading' | 'block'

export const SMALL_UNITS: readonly BlockKind[] = ['post', 'code', 'table', 'figure', 'quote']

/** A section or an article needs this many characters of text to be a layer (capture.md §6.2 目标链里的层). */
const SECTION_MIN_CHARS = 120

export interface BlockCandidate {
  kind: BlockKind
  /** Set when the layer is a block: what to call it (段落、列表项、列表、标题、块). */
  blockShape?: BlockShape
  element: HTMLElement
  /**
   * A heading-bounded section on a page where headings and paragraphs are
   * siblings: the run from `start` up to (exclusive) `end` inside
   * `start.parentElement` (capture.md §6.2 一节). Absent for whole-element
   * targets — the outline and the conversion then use `element` itself.
   */
  range?: { start: Element; end: Element | null }
}

export function isSmallUnit(layer: BlockCandidate): boolean {
  return SMALL_UNITS.includes(layer.kind)
}

/** Regions the block entry never appears in (capture.md §6.2 不出现). */
export const EXCLUDE_SELECTOR = 'nav, header, footer, aside, form, dialog, [aria-hidden="true"], [data-ann-ui]'

/** The content blocks a page is made of: what the keyboard mode looks through. */
export const CONTENT_SELECTOR = 'p, li, dd, pre, table, figure, img, blockquote, section, article, h1, h2, h3, h4, h5, h6'

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
export function headingLevel(el: Element): number {
  const match = /^h([1-6])$/.exec(el.tagName.toLowerCase())
  return match ? Number(match[1]) : 0
}

/** What a block-level element is called (capture.md §6.2 块): p, li, ul/ol, h1-h6, or a plain block. */
export function blockShapeOf(el: Element): BlockShape {
  const tag = el.tagName.toLowerCase()
  if (tag === 'p') return 'paragraph'
  if (tag === 'li') return 'listItem'
  if (tag === 'ul' || tag === 'ol') return 'list'
  if (headingLevel(el) > 0) return 'heading'
  return 'block'
}

/**
 * What one key press has measured. Detection for `Tab` and `↓` touches many
 * units whose chains share the same large ancestors (the page's `main`, the
 * article, the Markdown container); the page does not change while they are
 * measured.
 */
let scan: { texts: Map<Element, number>; nonWs: Map<Element, number>; holdsArticle: Map<Element, boolean>; feeds: Map<Element, boolean> } | null = null

export function inOneScan<T>(run: () => T): T {
  if (scan) return run()
  scan = { texts: new Map(), nonWs: new Map(), holdsArticle: new Map(), feeds: new Map() }
  try {
    return run()
  } finally {
    scan = null
  }
}

export function textLength(el: Element): number {
  const known = scan?.texts.get(el)
  if (known !== undefined) return known
  const length = (el.textContent ?? '').replace(/\s+/g, ' ').trim().length
  scan?.texts.set(el, length)
  return length
}

/**
 * Text length with whitespace stripped out entirely (capture.md §6.2 内容看法: 多出的文字不到 20 个字符，不算空白).
 * Cached inside one scan like textLength: every target of a Tab press shares the same big containers.
 */
export function nonWsTextLength(el: Element): number {
  const known = scan?.nonWs.get(el)
  if (known !== undefined) return known
  const length = (el.textContent ?? '').replace(/\s/g, '').length
  scan?.nonWs.set(el, length)
  return length
}

function holdsArticle(el: Element): boolean {
  const known = scan?.holdsArticle.get(el)
  if (known !== undefined) return known
  const holds = el.querySelector('article') !== null
  scan?.holdsArticle.set(el, holds)
  return holds
}

export function visible(el: Element, win: Window): boolean {
  if (el.hasAttribute('hidden')) return false
  const style = win.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

/** Whether the page renders `el` at all: not inside a hidden subtree, a closed `details` or a hidden tab panel. */
export function rendered(el: Element): boolean {
  // Chrome before 121 knows the visibility option only as checkVisibilityCSS
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
  const win = el.ownerDocument.defaultView
  if (!win) return false
  for (let cursor: Element | null = el; cursor; cursor = composedParent(cursor)) if (!visible(cursor, win)) return false
  return true
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
 * or article (capture.md §6.2 内容看法). Parent must stop at the quote or the
 * enclosing post: the column box is the virtualized timeline (many screens
 * tall), the pointer never leaves it, and the outline sticks until the page
 * scrolls. A write-up that embeds posts still qualifies as an article when
 * the prose outside those posts is its own.
 */
export function feedColumn(el: Element): boolean {
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
 * The heading runs a flat page splits into, innermost first: the nearest
 * heading at or before `child` starts the innermost run; each enclosing
 * heading of a lower level starts another. Each run needs the words of a
 * section (capture.md §6.2 一节), and `el` holding a nested article never
 * runs (the article belongs inside it, not around it).
 */
export function runSectionsFor(el: Element, child: Element): Array<NonNullable<BlockCandidate['range']>> {
  if (holdsArticle(el)) return []
  const children = Array.from(el.children)
  let index = children.indexOf(child)
  if (index < 0) return []
  const runs: Array<NonNullable<BlockCandidate['range']>> = []
  let level = 7
  while (index >= 0) {
    let heading: Element | null = null
    for (let i = index; i >= 0; i--) {
      const candidate = children[i]!
      const candidateLevel = headingLevel(candidate)
      if (candidateLevel > 0 && candidateLevel <= 4 && candidateLevel < level) {
        heading = candidate
        level = candidateLevel
        break
      }
    }
    if (!heading) return runs
    const run: NonNullable<BlockCandidate['range']> = { start: heading, end: null }
    for (let i = children.indexOf(heading) + 1; i < children.length; i++) {
      const nextLevel = headingLevel(children[i]!)
      if (nextLevel > 0 && nextLevel <= level) {
        run.end = children[i]!
        break
      }
    }
    if (rangeTextLength(el, run) < SECTION_MIN_CHARS) return runs
    runs.push(run)
    index = children.indexOf(heading) - 1
  }
  return runs
}

function rangeTextLength(parent: Element, range: NonNullable<BlockCandidate['range']>): number {
  const children = Array.from(parent.children)
  const from = children.indexOf(range.start)
  const to = range.end ? children.indexOf(range.end) : children.length
  let total = 0
  for (let i = from; i >= 0 && i < to; i++) total += textLength(children[i]!)
  return total
}

/**
 * Whether a run is all of `el`: it starts at the first child with content and
 * runs to the end, like the title heading of an article that has no other
 * heading of its level. Such a run is the article itself, not a section of it.
 */
/** Whether a run is all of `el`'s content: the article's title heading is the article, not a section of it. */
export function runSpansWhole(el: Element, range: NonNullable<BlockCandidate['range']>): boolean {
  if (range.end) return false
  for (const child of Array.from(el.children)) {
    if (child === range.start) return true
    if (!child.matches(EXCLUDE_SELECTOR) && !isPageChrome(child) && textLength(child) > 0) return false
  }
  return true
}

/** The known content-container classes, matched per class word (multi-class friendly). */
const CONTENT_CLASSES = ['entry-content', 'post-content', 'markdown-content', 'markdown-body']

/** The article classifiers: `article`/`[role=article]`, `main`/`[role=main]`, known containers, or a dense text container. */
export function isArticleElement(el: Element): boolean {
  return classifyArticle(el) || classifyDenseContainer(el)
}

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
 * What `el` itself is. The chain walk (target-chain.ts) inserts the heading
 * runs a flat page splits into before this layer. A page must never see
 * detection throw (RV-CAP-01): one bad element means no candidate there, not
 * a broken hover.
 */
export function classifyElementAt(el: Element): BlockCandidate[] {
  try {
    const win = el.ownerDocument!.defaultView!
    if (!visible(el, win)) return []
    const element = el as HTMLElement
    if (classifyPost(el)) return [{ kind: 'post', element }]
    if (el.tagName.toLowerCase() === 'pre') return [{ kind: 'code', element }]
    if (classifyTable(el)) return [{ kind: 'table', element }]
    if (classifyFigure(el)) return [{ kind: 'figure', element }]
    if (classifyQuote(el)) return [{ kind: 'quote', element }]
    if (isArticleElement(el)) {
      if (textLength(el) < SECTION_MIN_CHARS) return []
      return [{ kind: 'article', element }]
    }
    // a section needs the words of one, like an article (capture.md §6.2 一节): a short one is a block
    if (el.tagName.toLowerCase() === 'section' && textLength(el) >= SECTION_MIN_CHARS) {
      const heading = el.querySelector('h1, h2, h3, h4')
      if (heading) return [{ kind: 'section', element }]
    }
    // a plain block-level element is a block layer; inline ancestors are not
    const display = win.getComputedStyle(el).display
    if (display.startsWith('inline') && display !== 'inline-block') return []
    return [{ kind: 'block', element, blockShape: blockShapeOf(el) }]
  } catch {
    return []
  }
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
 * The rectangle a layer paints: the union of a range section's sibling
 * run, or the element's own box.
 */
export function candidateRect(candidate: BlockCandidate): DOMRect {
  if (!candidate.range) return candidate.element.getBoundingClientRect()
  return sectionIntervalRect(candidate.element, candidate.range)
}

/**
 * A DOM Range covering a section's interval — the anchor its toast and edit
 * bubble sit against, where an element-kind block anchors on the element
 * itself (RV-CAP-14).
 */
export function candidateDomRange(candidate: BlockCandidate): Range | null {
  if (!candidate.range) return null
  const range = candidate.element.ownerDocument.createRange()
  range.setStartBefore(candidate.range.start)
  // the interval ends just before the next heading, the same edge every union rect uses
  if (candidate.range.end) range.setEndBefore(candidate.range.end)
  else range.setEnd(candidate.element, candidate.element.childNodes.length)
  return range
}

/**
 * The node a layer is anchored at: a heading-run section starts at its
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
 * markers). Falls back to the whole text when no content block qualifies.
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
