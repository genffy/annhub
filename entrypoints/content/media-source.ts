/**
 * The address a page itself declares for a medium — download.md §5.1. Both
 * the Markdown converter (the link it writes) and the download collector
 * (the address it fetches) ask here, so what the Markdown links and what
 * the run fetches are the same address by construction. The order is the
 * doc's: largest selected srcset candidate, currentSrc, an http(s) src,
 * then lazy-load data- attributes — with a `data:` placeholder
 * in src skipped in favour of the later addresses.
 */

const LAZY_ATTRS = ['data-src', 'data-original', 'data-actualsrc', 'data-lazy-src']

function absolute(href: string | null | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined
  try {
    const url = new URL(href, baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.href
    // the URL parser leaves ( and ) literal: the converter encodes them in destinations
  } catch {
    return undefined
  }
}

/** Page-declared responsive candidates, largest first; no synthesized addresses. */
function srcsetCandidates(raw: string | null, baseUrl: string): string[] {
  return (raw ?? '')
    .split(',')
    .flatMap(part => {
      const [candidate, descriptor] = part.trim().split(/\s+/)
      const url = absolute(candidate, baseUrl)
      const score = descriptor ? Number.parseFloat(descriptor) : 1
      return url && Number.isFinite(score) && score > 0 ? [{ url, score }] : []
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.url)
}

/** Largest selected source first, then the remaining addresses declared by this image. */
export function resolveImageCandidates(el: Element, baseUrl: string): string[] {
  const img = el as HTMLImageElement
  const live = absolute(img.currentSrc, baseUrl)
  const own = srcsetCandidates(el.getAttribute('srcset') || el.getAttribute('data-srcset'), baseUrl)
  const sources = Array.from(el.closest('picture')?.querySelectorAll('source') ?? [])
  const sourceSets = sources.map(source => srcsetCandidates(source.getAttribute('srcset') || source.getAttribute('data-srcset'), baseUrl))
  // currentSrc identifies the source Chrome selected, even when it picked a small density.
  const selected = live
    ? sourceSets.find(set => set.includes(live))
    : sourceSets.find((_, index) => {
        const media = sources[index]!.getAttribute('media')
        return !media || el.ownerDocument.defaultView?.matchMedia?.(media).matches
      })
  return [
    ...new Set(
      [...(selected ?? own), live, absolute(el.getAttribute('src'), baseUrl), ...LAZY_ATTRS.map(attr => absolute(el.getAttribute(attr), baseUrl))].filter((url): url is string =>
        Boolean(url),
      ),
    ),
  ]
}

/** The same primary address is written into Markdown and used by the download manifest. */
export function resolveImageSource(el: Element, baseUrl: string): string | undefined {
  return resolveImageCandidates(el, baseUrl)[0]
}

function mediaChildSource(el: Element, baseUrl: string): string | undefined {
  const own = absolute(el.getAttribute('src'), baseUrl)
  if (own) return own
  for (const source of Array.from(el.querySelectorAll('source'))) {
    const candidate = absolute(source.getAttribute('src'), baseUrl)
    if (candidate) return candidate
  }
  return undefined
}

/** A direct http(s) file address of a <video> — what a download may fetch (download.md §5.2). */
export function resolveVideoSource(el: Element, baseUrl: string): string | undefined {
  return mediaChildSource(el, baseUrl)
}

/** A direct http(s) file address of an <audio>. */
export function resolveAudioSource(el: Element, baseUrl: string): string | undefined {
  return mediaChildSource(el, baseUrl)
}

/** A <video>'s poster, treated as an image (download.md §5.1). */
export function resolveVideoPoster(el: Element, baseUrl: string): string | undefined {
  return absolute(el.getAttribute('poster'), baseUrl)
}

/** An SVG by address or type: kept as a link, never fetched (download.md §5.2). */
export function isSvgAddress(url: string): boolean {
  return /\.svg(\?|#|$)/i.test(url)
}
