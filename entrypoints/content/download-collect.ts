/**
 * What a page download takes with it (download.md §5.1): the addresses the
 * page itself declares, read with the same resolver the Markdown converter
 * writes links by, so what is fetched is what the Markdown points at.
 * Duplicates, tracking pixels and SVGs stay out; the main-article finder
 * picks the page's own article block by the block rules' classifiers.
 */
import { DOWNLOAD_LIMITS, type DownloadMediaKind } from '../../core/download'
import { isSvgAddress, resolveAudioSource, resolveImageCandidates, resolveVideoPoster, resolveVideoSource } from './media-source'
import { pageArticleCandidates } from './blocks'

export interface CollectedMedia {
  url: string
  kind: DownloadMediaKind
  candidates?: string[]
}

/** The elements a heading-bounded section converts: its sibling run, `from` inclusive to `to` exclusive. */
function sliceElements(root: Element, from: Element, to: Element | null): Element[] {
  const children = Array.from(root.children)
  const start = children.indexOf(from)
  if (start === -1) return [from]
  const end = to ? children.indexOf(to) : children.length
  return children.slice(start, end === -1 ? children.length : end)
}

/**
 * The media manifest of a block: images, direct-link video and audio, a
 * poster only when its video has no direct file, deduplicated, in document
 * order. `slice` restricts to a section's sibling run, as the conversion
 * does. Only what the converted Markdown writes as an image link is taken
 * (download.md §5.1): a picture the converter drops as page chrome never
 * becomes a file in `assets/`.
 */
export function collectMedia(root: Element, markdown?: string, slice?: { from: Element; to: Element | null }): CollectedMedia[] {
  const roots = slice ? sliceElements(root, slice.from, slice.to) : [root]
  const elements = roots.flatMap(element => [element, ...Array.from(element.querySelectorAll('*'))])
  const items: CollectedMedia[] = []
  const seen = new Set<string>()
  const add = (url: string | undefined, kind: DownloadMediaKind, candidates: string[] = []): void => {
    if (!url || seen.has(url) || isSvgAddress(url) || (markdown !== undefined && !isReferenced(markdown, url))) return
    seen.add(url)
    items.push({ url, kind, ...(candidates.length ? { candidates } : {}) })
  }
  for (const el of elements) {
    const tag = el.tagName.toLowerCase()
    // Markdown membership decides inclusion, including media in closed details.
    if (tag === 'img') {
      const [primary, ...candidates] = resolveImageCandidates(el, el.ownerDocument?.baseURI ?? location.href)
      if (!tooSmall(el)) add(primary, 'image', candidates)
      continue
    }
    if (tag === 'video') {
      const direct = resolveVideoSource(el, location.href)
      if (direct) add(direct, 'video')
      else add(resolveVideoPoster(el, location.href), 'image')
      continue
    }
    if (tag === 'audio') add(resolveAudioSource(el, location.href), 'audio')
  }
  return items
}

/**
 * Whether the Markdown links this address as a picture: the converter encodes
 * `(`, `)` and spaces in a destination; compare in that same form.
 */
function isReferenced(markdown: string, url: string): boolean {
  const encoded = url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20')
  return markdown.includes(`](${encoded})`)
}

/** A picture with a known edge under the threshold is a tracker or decoration, not content (download.md §5.1). */
function tooSmall(img: Element): boolean {
  const el = img as HTMLImageElement
  const known = (natural: number, attr: string): number => (natural > 0 ? natural : Number(img.getAttribute(attr)) || 0)
  const width = known(el.naturalWidth, 'width')
  const height = known(el.naturalHeight, 'height')
  return (width > 0 && width < DOWNLOAD_LIMITS.minImagePx) || (height > 0 && height < DOWNLOAD_LIMITS.minImagePx)
}

/** The page's main article (download.md §2.4): the article candidate holding the most text. */
export function findMainArticle(doc: Document): Element | null {
  const candidates = pageArticleCandidates(doc)
  let best: { el: Element; text: number } | null = null
  for (const el of candidates) {
    const text = (el.textContent ?? '').trim().length
    if (!best || text > best.text) best = { el, text }
  }
  return best?.el ?? null
}
