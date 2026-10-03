/**
 * Auto-detection of identity elements to pre-fill mosaic boxes —
 * docs/v2/screenshot.md. Detection only suggests boxes; the preview lets the
 * user remove them when pixel masking is used instead of DOM anonymization.
 */

import { intersectRects, ViewportRect } from './crop'

/** Any site can declare identity blocks with this attribute (E2E fixtures use it too). */
const GENERIC_SELECTOR = '[data-ann-identity]'

/** X/Twitter identity blocks (same surfaces twitterclip anonymizes). */
const X_SELECTORS = ['[data-testid="User-Names"]', '[data-testid^="UserAvatar"]']

export function identitySelectorsForHost(hostname: string): string[] {
  const host = hostname.toLowerCase()
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) {
    return [...X_SELECTORS, GENERIC_SELECTOR]
  }
  return [GENERIC_SELECTOR]
}

/**
 * Viewport rects of identity elements worth masking: visible, inside the
 * viewport, and intersecting the given selection. Zero-area results are
 * dropped (e.g. display:none or fully scrolled-out elements).
 */
export function detectIdentityRects(root: Document, hostname: string, selection: ViewportRect): ViewportRect[] {
  const selectors = identitySelectorsForHost(hostname)
  const rects: ViewportRect[] = []
  const viewport: ViewportRect = { x: 0, y: 0, width: root.defaultView?.innerWidth ?? 0, height: root.defaultView?.innerHeight ?? 0 }

  for (const selector of selectors) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      const onScreen = intersectRects(
        { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        viewport,
      )
      if (!onScreen) continue
      const inSelection = intersectRects(onScreen, selection)
      if (!inSelection) continue
      rects.push(inSelection)
    }
  }

  // Elements may match several selectors; dedupe near-identical rects.
  const deduped: ViewportRect[] = []
  for (const r of rects) {
    if (!deduped.some(d => Math.abs(d.x - r.x) < 2 && Math.abs(d.y - r.y) < 2 && Math.abs(d.width - r.width) < 2 && Math.abs(d.height - r.height) < 2)) {
      deduped.push(r)
    }
  }
  return deduped
}
