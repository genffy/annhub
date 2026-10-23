/**
 * The source URL a screenshot records (capture.md §5, screenshot.md §4.1).
 * The same permalink rules as a clip: the captured post's own status link
 * when the frame covers one, otherwise the page address. Rules stay in
 * `page-meta`; this module only decides which node the frame is of.
 */
import type { ViewportRect } from './crop'
import { ownPermalink, resolvePermalink } from '../page-meta'

/** Center first, then a cross, so a gap between posts does not hide the post the frame mostly covers. */
const SAMPLE_FRACTIONS: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.5],
  [0.5, 0.25],
  [0.5, 0.75],
  [0.25, 0.5],
  [0.75, 0.5],
]

/**
 * Permalink for a region (or an element shot that went through the region
 * path). The center of the frame wins when it sits in a block that has its
 * own permalink — including when that permalink is the page the user is
 * already on, so a quote inside the post is not recorded instead. Other
 * points are tried only when the center has none (the gap between posts on
 * a timeline). Extension UI in the hit stack is skipped.
 */
export function permalinkForRegion(rect: ViewportRect, pageUrl: string, elementsAt: (x: number, y: number) => readonly Element[]): string {
  return resolvePermalink(nodeInFrame(rect, pageUrl, elementsAt), pageUrl)
}

function nodeInFrame(rect: ViewportRect, pageUrl: string, elementsAt: (x: number, y: number) => readonly Element[]): Element | null {
  let fallback: Element | null = null
  for (const [fx, fy] of SAMPLE_FRACTIONS) {
    const el = firstContent(elementsAt(rect.x + rect.width * fx, rect.y + rect.height * fy))
    if (!el) continue
    if (!fallback) fallback = el
    if (ownPermalink(el, pageUrl)) return el
  }
  return fallback
}

function firstContent(elements: readonly Element[]): Element | null {
  for (const el of elements) {
    if (el.closest?.('[data-ann-ui]')) continue
    return el
  }
  return null
}
