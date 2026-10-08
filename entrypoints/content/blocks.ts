/**
 * Block detection (docs/v2/capture.md §6.2). The pointer's innermost
 * qualifying unit is the target; smaller kinds outrank bigger ones:
 * post/code/table/figure/quote → section → article.
 *
 * Detection runs only after the pointer rests, and only inspects the
 * ancestor chain under the pointer (through open shadow roots) — never a
 * whole-page scan, so scrolling never pays for it.
 */
import { isPageChrome } from './markdown'

export type BlockKind = 'post' | 'code' | 'table' | 'figure' | 'quote' | 'section' | 'article'

export interface BlockCandidate {
  kind: BlockKind
  element: HTMLElement
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

/** A heading-bounded section: a `section` with a heading, or a container whose heading leads the content. */
function classifySection(el: Element, node: Node): boolean {
  if (el.tagName.toLowerCase() === 'section' && el.querySelector('h1,h2,h3,h4')) return true
  const heading = leadingHeading(el)
  if (!heading || el.querySelector('article')) return false
  return !hasHeadingBetween(el, heading, node)
}

function leadingHeading(el: Element): HTMLElement | null {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase()
    if (/^h[1-4]$/.test(tag)) return child as HTMLElement
    if (tag === 'section' || tag === 'article') return null
  }
  return null
}

function hasHeadingBetween(scope: Element, heading: Element, node: Node): boolean {
  const level = Number(/h(\d)/.exec(heading.tagName)![1])
  let el = node instanceof Element ? node : node.parentElement
  while (el && el !== scope) {
    if (/^h[1-4]$/.test(el.tagName.toLowerCase())) {
      const elLevel = Number(/h(\d)/.exec(el.tagName)![1])
      if (elLevel <= level && el !== heading) return true
    }
    el = el.parentElement
  }
  return false
}

function classifyArticle(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'article' || el.getAttribute('role') === 'article') return true
  if (tag === 'main' || el.getAttribute('role') === 'main') return true
  const cls = el.className
  return typeof cls === 'string' && /^(entry-content|post-content|markdown-content|markdown-body)$/.test(cls)
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
    if (isPageChrome(el)) {
      el = el.parentElement
      continue
    }
    const kind = classify(el, target)
    if (kind) found.push({ kind, element: el as HTMLElement })
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

function classify(el: Element, target: Element): BlockKind | null {
  const win = el.ownerDocument!.defaultView!
  if (!visible(el, win)) return null
  if (classifyPost(el)) return 'post'
  if (el.tagName.toLowerCase() === 'pre') return 'code'
  if (classifyTable(el)) return 'table'
  if (classifyFigure(el)) return 'figure'
  if (classifyQuote(el)) return 'quote'
  if (classifyArticle(el)) return textLength(el) >= 120 ? 'article' : null
  if (classifySection(el, target)) return textLength(el) >= 120 ? 'section' : null
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

export function blockKindLabelKey(kind: BlockKind): string {
  return `block.kind.${kind}` as const
}
