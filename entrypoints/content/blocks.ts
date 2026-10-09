/**
 * Block detection (docs/v2/capture.md §6.2). The pointer's innermost
 * qualifying unit is the target; smaller kinds outrank bigger ones:
 * post/code/table/figure/quote → section → article.
 *
 * Detection runs only after the pointer rests, and only inspects the
 * ancestor chain under the pointer (through open shadow roots) — never a
 * whole-page scan, so scrolling never pays for it. Detection never throws
 * into the page: an element that cannot be classified is simply not a
 * candidate.
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

/** The heading level of an element (case-safe), or 0 when it is not a heading. */
function headingLevel(el: Element): number {
  const match = /^h([1-6])$/.exec(el.tagName.toLowerCase())
  return match ? Number(match[1]) : 0
}

function textLength(el: Element): number {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length
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
function classifySection(el: Element, node: Node): { ok: boolean; range?: BlockCandidate['range'] } {
  if (el.tagName.toLowerCase() === 'section' && el.querySelector('h1,h2,h3,h4')) return { ok: true }
  if (el.querySelector('article')) return { ok: false }
  const range = sectionRangeFor(el, node)
  if (!range) return { ok: false }
  const parent = range.start.parentElement
  if (!parent) return { ok: false }
  const measured = rangeTextLength(parent, range)
  return { ok: measured >= 120, range }
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
  if (target.closest(EXCLUDE_SELECTOR)) return []

  const found: BlockCandidate[] = []
  let el: Element | null = target
  while (el && el !== doc.body && el !== doc.documentElement) {
    if (!isPageChrome(el)) {
      // a page must never see detection throw (RV-CAP-01): one bad element
      // means no candidate there, not a broken hover
      try {
        const kind = classify(el, target)
        if (kind) found.push(kind)
      } catch {
        /* not a candidate */
      }
    }
    el = el.parentElement
  }

  // innermost-first: rank, then DOM depth (deeper first within a rank)
  found.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || depth(b.element) - depth(a.element))
  const deduped: BlockCandidate[] = []
  for (const candidate of found) {
    if (deduped.some(existing => existing.element === candidate.element)) continue
    if (deduped.some(existing => existing.element.contains(candidate.element) && KIND_RANK[existing.kind] === KIND_RANK[candidate.kind])) continue
    deduped.push(candidate)
  }
  return deduped
}

function classify(el: Element, target: Element): BlockCandidate | null {
  const win = el.ownerDocument!.defaultView!
  if (!visible(el, win)) return null
  if (classifyPost(el)) return { kind: 'post', element: el as HTMLElement }
  if (el.tagName.toLowerCase() === 'pre') return { kind: 'code', element: el as HTMLElement }
  if (classifyTable(el)) return { kind: 'table', element: el as HTMLElement }
  if (classifyFigure(el)) return { kind: 'figure', element: el as HTMLElement }
  if (classifyQuote(el)) return { kind: 'quote', element: el as HTMLElement }
  if (classifyArticle(el)) return textLength(el) >= 120 ? { kind: 'article', element: el as HTMLElement } : null
  const section = classifySection(el, target)
  if (section.ok) return { kind: 'section', element: el as HTMLElement, ...(section.range ? { range: section.range } : {}) }
  if (classifyDenseContainer(el)) return textLength(el) >= 120 ? { kind: 'article', element: el as HTMLElement } : null
  return null
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
