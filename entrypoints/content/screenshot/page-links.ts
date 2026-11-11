import { permalinkForRegion } from './permalink'
import { resolvePermalink } from '../page-meta'
import { pageElementsFromPoint } from './page-elements'
import type { ViewportRect } from './crop'

/**
 * The session's view of the page it sits on (RV-CAP-18, split out of the session): its address,
 * the permalinks its captures keep, the elements under a point through the session's own
 * shield, and which pointer targets are the session's own chrome.
 */
export class PageLinks {
  constructor(
    private readonly doc: Document,
    private readonly host: HTMLElement,
  ) {}

  url(): string {
    return this.doc.defaultView?.location.href ?? ''
  }

  /** Page elements under a viewport point, clamped, through the session's shield. */
  elementsAt(x: number, y: number): Element[] {
    const view = this.doc.defaultView
    if (!view) return []
    const maxX = Math.max(0, view.innerWidth - 1)
    const maxY = Math.max(0, view.innerHeight - 1)
    return pageElementsFromPoint(this.doc, this.host, Math.min(Math.max(0, x), maxX), Math.min(Math.max(0, y), maxY))
  }

  /**
   * Permalink for a dragged (or element-via-region) frame. Resolved before the shot, while the
   * post is still the one on screen (capture.md §5).
   */
  regionPermalink(rect: ViewportRect): string {
    return permalinkForRegion(rect, this.url(), (x, y) => this.elementsAt(x, y))
  }

  /** Permalink for an element shot: the block itself, same rule as a block clip. */
  elementPermalink(node: Node): string {
    return resolvePermalink(node, this.url())
  }

  /** Element boxes under a point, for drag snapping. */
  edgeRectsUnder(x: number, y: number): Array<{ left: number; top: number; right: number; bottom: number }> {
    const rects: Array<{ left: number; top: number; right: number; bottom: number }> = []
    for (const el of this.elementsAt(x, y).slice(0, 6)) {
      if (el.closest?.('[data-ann-ui]')) continue
      const box = el.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) rects.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom })
    }
    return rects
  }

  /** Whether a pointer target is one of the session's own surfaces. */
  isShotChrome(target: EventTarget | null): boolean {
    if (!(target instanceof Element) || !this.host.contains(target)) return false
    return Boolean(target.closest('.ann-shot-confirm-bar, .ann-shot-handle, [data-ann-ui="screenshot-ratio-bar"], .ann-shot-margin-bar, .ann-shot-toolbar, .ann-shot-preview'))
  }
}
