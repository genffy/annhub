/**
 * Auto-detection of identity elements to pre-fill mosaic boxes —
 * docs/product/screenshot.md. Detection only suggests boxes; the preview lets the
 * user remove them when pixel masking is used instead of DOM anonymization.
 */

import type { ViewportRect } from './crop'
import { intersectRects } from './crop'

/** Any site can declare identity blocks with this attribute (E2E fixtures use it too); the value `avatar` marks an avatar. */
const GENERIC_SELECTOR = '[data-ann-identity]'

/** X/Twitter identity blocks (same surfaces twitterclip anonymizes). */
const X_AVATAR_SELECTOR = '[data-testid^="UserAvatar"]'
const X_SELECTORS = ['[data-testid="User-Name"]', X_AVATAR_SELECTOR]

/** The two kinds of identity element anonymization covers; settings switch each one (screenshot.md §3). */
export type IdentityPart = 'avatar' | 'name'
export type IdentityParts = Readonly<Record<IdentityPart, boolean>>
export const ALL_IDENTITY_PARTS: IdentityParts = { avatar: true, name: true }

export function identitySelectorsForHost(hostname: string): string[] {
  const host = hostname.toLowerCase()
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) {
    return [...X_SELECTORS, GENERIC_SELECTOR]
  }
  return [GENERIC_SELECTOR]
}

/** Avatars are X's UserAvatar blocks and `data-ann-identity="avatar"`; every other identity element is a name (X's display name and handle). */
export function identityPartOf(el: Element): IdentityPart {
  return el.matches(X_AVATAR_SELECTOR) || el.getAttribute('data-ann-identity') === 'avatar' ? 'avatar' : 'name'
}

/** The identity elements under `root` whose kind is switched on, each once (an element can match several selectors). */
export function identityElements(root: ParentNode, hostname: string, parts: IdentityParts = ALL_IDENTITY_PARTS): HTMLElement[] {
  const found = new Set<HTMLElement>()
  for (const selector of identitySelectorsForHost(hostname)) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      if (parts[identityPartOf(el)]) found.add(el)
    }
  }
  return [...found]
}

/**
 * Viewport rects of identity elements worth masking: visible, inside the
 * viewport, and intersecting the given selection. Zero-area results are
 * dropped (e.g. display:none or fully scrolled-out elements); kinds switched
 * off in settings are never proposed.
 */
export function detectIdentityRects(root: Document, hostname: string, selection: ViewportRect, parts: IdentityParts = ALL_IDENTITY_PARTS): ViewportRect[] {
  const rects: ViewportRect[] = []
  const viewport: ViewportRect = { x: 0, y: 0, width: root.defaultView?.innerWidth ?? 0, height: root.defaultView?.innerHeight ?? 0 }

  for (const el of identityElements(root, hostname, parts)) {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const onScreen = intersectRects({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, viewport)
    if (!onScreen) continue
    const inSelection = intersectRects(onScreen, selection)
    if (!inSelection) continue
    rects.push(inSelection)
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
