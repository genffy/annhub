/**
 * Context extraction, page metadata and permalink resolution
 * (docs/v2/capture.md §4, §5). Every automatic step degrades instead of
 * blocking the save.
 */
import { CONTEXT_MAX_CHARS } from '../../learning-core/validate'
import { normalizedContains } from '../../learning-core/normalize'

// ── Context (capture.md §4) ─────────────────────────────────────────────

const BLOCK_ANCESTOR_SELECTOR = 'p, li, blockquote, td, th, pre, h1, h2, h3, h4, h5, h6, dt, dd, figcaption'

/**
 * The smallest context that makes the selection understandable again: the
 * containing sentence or semantic paragraph, never navigation, buttons,
 * footers or ads. Selections whose own text already exceeds the limit get
 * no context at all.
 *
 * The context's unit is the nearest BLOCK ancestor of the selection's ends
 * (capture.md §4): a triple-clicked paragraph, a selection inside bold text
 * or a link, and a cross-paragraph drag all resolve to whole blocks — never
 * to an inline element alone, never to the whole article.
 */
export function extractContext(range: Range): string | undefined {
  const selected = range.toString()
  if (selected.trim().length > CONTEXT_MAX_CHARS) return undefined

  // the smallest run of sibling blocks covering the selection's ends
  const scope = blockScopeOf(range)
  const blocks = scope ? collectBlocks(scope.parent, scope.from, scope.to) : []
  const joined = blocks.map(textOf).join(' ').replace(/\s+/g, ' ').trim()
  if (joined && normalizedContains(joined, selected)) {
    if (joined.length <= CONTEXT_MAX_CHARS) return joined
    // window around the selection when the block run itself is too long
    return windowAround(joined, selected)
  }

  // fallback: the selection's own text-bearing chain (last-resort pages)
  let container: Node | null = range.commonAncestorContainer
  for (let depth = 0; depth < 4 && container; depth++) {
    if (container.nodeType === Node.ELEMENT_NODE) {
      const text = textOf(container)
      if (text && text.length <= CONTEXT_MAX_CHARS && normalizedContains(text, selected)) {
        return text
      }
    }
    container = container.parentNode
  }
  return undefined
}

/** The direct child of the closest block ancestor on a node's chain. */
function blockChildOf(node: Node | null): Element | null {
  let el = node instanceof Element ? node : (node?.parentElement ?? null)
  while (el) {
    if (el.matches(BLOCK_ANCESTOR_SELECTOR)) return el
    el = el.parentElement
  }
  return null
}

/** The sibling block run [from, to] covering both selection ends. */
function blockScopeOf(range: Range): { parent: Element; from: Element; to: Element } | null {
  const startBlock = blockChildOf(range.startContainer)
  const endBlock = blockChildOf(range.endContainer) ?? startBlock
  if (!startBlock || !endBlock) return null
  const parent = startBlock.parentElement
  if (!parent || endBlock.parentElement !== parent) {
    // ends in different parents: each block is its own context unit
    return { parent: parent ?? startBlock, from: startBlock, to: startBlock }
  }
  return { parent, from: startBlock, to: endBlock }
}

function collectBlocks(parent: Element, from: Element, to: Element): Element[] {
  const children = Array.from(parent.children)
  const start = children.indexOf(from)
  const end = children.indexOf(to)
  if (start < 0 || end < 0) return [from]
  return children.slice(Math.min(start, end), Math.max(start, end) + 1)
}

function textOf(node: Node): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function windowAround(scope: string, selected: string): string | undefined {
  const at = scope.indexOf(selected.slice(0, 40))
  if (at < 0) return undefined
  const half = Math.floor((CONTEXT_MAX_CHARS - selected.length) / 2)
  const start = Math.max(0, at - half)
  const end = Math.min(scope.length, at + selected.length + half)
  const windowed = scope.slice(start, end)
  if (!normalizedContains(windowed, selected)) return undefined
  return windowed.trim()
}

// ── Page metadata (capture.md §5) ───────────────────────────────────────

export interface PageMeta {
  title: string
  author?: string[]
  published?: string
  description?: string
}

function metaContent(doc: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = doc.querySelector(selector)?.getAttribute('content')?.trim()
    if (value) return value
  }
  return undefined
}

export function extractPageMeta(doc: Document, sourceHost: string): PageMeta {
  const title = clipText(doc.title?.trim() || sourceHost, TITLE_MAX_CHARS) ?? sourceHost
  const author = metaContent(doc, ['meta[name="author"]', 'meta[property="article:author"]'])
  const authorList = splitAuthors(author)
    .map(name => name.trim())
    .filter(name => name.length > 0 && name.length <= LIST_ITEM_MAX_CHARS)
  const publishedRaw = metaContent(doc, ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[name="publish-date"]', 'meta[itemprop="datePublished"]'])
  const published = /^\d{4}-\d{2}-\d{2}/.exec(publishedRaw ?? '')?.[0]
  const description = clipText(metaContent(doc, ['meta[name="description"]', 'meta[property="og:description"]']), TEXT_MAX_CHARS)
  return {
    title,
    author: authorList.length > 0 ? authorList : undefined,
    published: published && isValidDate(published) ? published : undefined,
    description,
  }
}

// entry.md §5.2 limits; meta never blocks a save (capture.md §5, RV-CAP-06)
const TITLE_MAX_CHARS = 1000
const TEXT_MAX_CHARS = 1000
const LIST_ITEM_MAX_CHARS = 100

/** Free text clips at the limit with newlines folded to spaces. */
function clipText(value: string | undefined, max: number): string | undefined {
  if (!value) return value
  const folded = value.replace(/\s+/g, ' ').trim()
  return folded.length > max ? folded.slice(0, max) : folded
}

/** Multi-author bylines are comma- or semicolon-separated (or one string). */
function splitAuthors(raw: string | undefined): string[] {
  if (!raw) return []
  const split = raw.split(/[,;،；]/)
  // a single long name was not a list: keep it whole (it fails the length
  // filter above and the author property is simply not set)
  if (split.length === 1) return [raw]
  return split
}

function isValidDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const probe = new Date(Date.UTC(y!, m! - 1, d!))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m! - 1 && probe.getUTCDate() === d
}

// ── Permalinks (capture.md §5) ──────────────────────────────────────────

/**
 * The source URL a clip records: the block's own permalink when there is
 * one, otherwise the page address. Platform rules (X posts, Medium
 * articles) live here and nowhere else — new sites are added by appending
 * a rule, not by scattering hostname checks (capture.md §5).
 */
export function resolvePermalink(node: Node | null, pageUrl: string, kind?: 'post' | 'code' | 'table' | 'figure' | 'quote' | 'section' | 'article'): string {
  const doc = node?.ownerDocument
  if (!doc) return pageUrl

  // X post: the permalink is the post's own status link
  const post = (node instanceof Element ? node : node?.parentElement)?.closest?.('article[data-testid="tweet"]')
  if (post) {
    const status = Array.from(post.querySelectorAll('a[href*="/status/"]')).find(link => link.querySelector('time'))
    if (status) {
      const absolute = absoluteUrl(status.getAttribute('href'), doc.baseURI)
      if (absolute) return absolute
    }
  }

  // Medium article: the canonical address, not the reading-interface URL
  if (kind === 'article') {
    const canonical = mediumCanonical(doc)
    if (canonical) return canonical
  }

  // Section: page URL plus the heading's anchor (selections take the page URL)
  if (kind === 'section') {
    const heading = headingOf(node)
    if (heading) {
      const anchor = heading.id || heading.parentElement?.id
      if (anchor && !heading.id.startsWith('user-content-')) {
        const withAnchor = new URL(pageUrl)
        withAnchor.hash = `#${anchor}`
        return withAnchor.href
      }
    }
  }

  return pageUrl
}

/** Medium's own address for the article, when this page is a Medium article. */
function mediumCanonical(doc: Document): string | undefined {
  let host: string
  try {
    host = new URL(doc.baseURI).hostname
  } catch {
    return undefined
  }
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href')
  if (!canonical) return undefined
  const absolute = absoluteUrl(canonical, doc.baseURI)
  if (!absolute) return undefined
  const canonicalHost = new URL(absolute).hostname
  if (host !== 'medium.com' && canonicalHost !== 'medium.com') return undefined
  return absolute
}

function headingOf(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : (node?.parentElement ?? null)
  while (el) {
    if (/^h[1-4]$/.test(el.tagName.toLowerCase())) return el
    const heading = el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4') as HTMLElement | null
    if (heading) return heading
    if (el.tagName.toLowerCase() === 'article') return null
    el = el.parentElement
  }
  return null
}

function absoluteUrl(href: string | null | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined
  try {
    const url = new URL(href, baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}
