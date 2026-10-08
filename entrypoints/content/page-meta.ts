/**
 * Context extraction, page metadata and permalink resolution
 * (docs/v2/capture.md §4, §5). Every automatic step degrades instead of
 * blocking the save.
 */
import { CONTEXT_MAX_CHARS } from '../../learning-core/validate'
import { normalizedContains } from '../../learning-core/normalize'

// ── Context (capture.md §4) ─────────────────────────────────────────────

/**
 * The smallest context that makes the selection understandable again: the
 * containing sentence or semantic paragraph, never navigation, buttons,
 * footers or ads. Selections whose own text already exceeds the limit get
 * no context at all.
 */
export function extractContext(range: Range): string | undefined {
  const selected = range.toString()
  if (selected.trim().length > CONTEXT_MAX_CHARS) return undefined

  // walk the containing blocks outward until one contains the selection
  let container: Node | null = range.commonAncestorContainer
  for (let depth = 0; depth < 4 && container; depth++) {
    if (container.nodeType === Node.ELEMENT_NODE) {
      const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text && text.length <= CONTEXT_MAX_CHARS && normalizedContains(text, selected)) {
        return text
      }
    }
    container = container.parentNode
  }

  // still nothing that fits: window around the selection inside the closest text-bearing ancestor
  const scope = range.commonAncestorContainer.parentElement?.textContent ?? selected
  if (scope.trim().length <= CONTEXT_MAX_CHARS && normalizedContains(scope, selected)) return scope.trim()
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
  const title = doc.title?.trim() || sourceHost
  const author = metaContent(doc, ['meta[name="author"]', 'meta[property="article:author"]'])
  const publishedRaw = metaContent(doc, ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[name="publish-date"]', 'meta[itemprop="datePublished"]'])
  const published = /^\d{4}-\d{2}-\d{2}/.exec(publishedRaw ?? '')?.[0]
  const description = metaContent(doc, ['meta[name="description"]', 'meta[property="og:description"]'])
  return {
    title,
    author: author ? [author] : undefined,
    published: published && isValidDate(published) ? published : undefined,
    description,
  }
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
