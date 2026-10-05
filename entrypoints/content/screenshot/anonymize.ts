/**
 * DOM-placeholder anonymization — docs/v2/screenshot.md, the twitterclip
 * approach: cover identity elements with clean gray placeholders instead of
 * pixelating them. Two paths:
 *
 * 1. `applyViewportAnonymization` — region capture (captureVisibleTab):
 *    overlays appended into/over the LIVE elements, restored right after
 *    the shot. Overlays sit in the photographed viewport, so they appear
 *    in the output as crisp gray bars.
 * 2. `anonymizeClone` — element capture (DOM rasterization): swaps the
 *    contents inside our own clone, no restore needed.
 */

import { uiText } from '../../../utils/ui-text'
import { identitySelectorsForHost } from './detect'

const OVERLAY_ATTR = 'data-ann-ui'
const OVERLAY_VALUE = 'anonymize-overlay'

/** Elements that cannot contain children (img/video/svg/input/canvas...). */
function isReplacedElement(el: Element): boolean {
  return ['img', 'video', 'svg', 'canvas', 'input', 'iframe', 'picture'].includes(el.tagName.toLowerCase())
}

function makePlaceholder(doc: Document, circular: boolean): HTMLDivElement {
  const overlay = doc.createElement('div')
  overlay.setAttribute(OVERLAY_ATTR, OVERLAY_VALUE)
  overlay.setAttribute('aria-label', uiText('shot.anonymizePlaceholder'))
  overlay.style.setProperty('position', 'absolute', 'important')
  overlay.style.setProperty('inset', '0', 'important')
  overlay.style.setProperty('background', '#d1d5db', 'important')
  overlay.style.setProperty('border-radius', circular ? '50%' : '4px', 'important')
  overlay.style.setProperty('z-index', '2147483647', 'important')
  overlay.style.setProperty('pointer-events', 'none', 'important')
  return overlay
}

/**
 * Cover identity elements for a viewport (captureVisibleTab) shot.
 * Returns a restore function that removes every overlay it created.
 */
export function applyViewportAnonymization(doc: Document, hostname: string): () => void {
  const selectors = identitySelectorsForHost(hostname)
  const cleanups: Array<() => void> = []

  for (const selector of selectors) {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      const circular = isReplacedElement(el) || /avatar/i.test(selector)

      if (isReplacedElement(el)) {
        // Cannot append into replaced elements (img/video/...): a fixed
        // sibling overlay positioned over the element's current rect.
        if (!el.parentElement) continue
        const overlay = makePlaceholder(doc, circular)
        overlay.style.setProperty('position', 'fixed', 'important')
        overlay.style.removeProperty('inset')
        const r = el.getBoundingClientRect()
        overlay.style.left = `${r.left}px`
        overlay.style.top = `${r.top}px`
        overlay.style.width = `${r.width}px`
        overlay.style.height = `${r.height}px`
        el.parentElement.appendChild(overlay)
        cleanups.push(() => overlay.remove())
      } else {
        const hadPosition = el.style.position
        if (!hadPosition || hadPosition === 'static') el.style.setProperty('position', 'relative', 'important')
        // The rounded placeholder lets corner pixels of the original content
        // peek through; painting the host element the same gray closes that gap.
        const hadBackground = el.style.backgroundColor
        el.style.setProperty('background-color', '#d1d5db', 'important')
        const overlay = makePlaceholder(doc, circular)
        el.appendChild(overlay)
        cleanups.push(() => {
          overlay.remove()
          if ((!hadPosition || hadPosition === 'static') && el.style.position === 'relative') {
            el.style.removeProperty('position')
          }
          if (hadBackground) {
            el.style.setProperty('background-color', hadBackground, '')
          } else {
            el.style.removeProperty('background-color')
          }
        })
      }
    }
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}

export function anonymizeClone(clone: HTMLElement, doc: Document): void {
  const selectors = identitySelectorsForHost(doc.defaultView?.location.hostname ?? '')
  for (const selector of selectors) {
    for (const el of Array.from(clone.querySelectorAll<HTMLElement>(selector))) {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      const circular = isReplacedElement(el) || /avatar/i.test(selector)
      const placeholder = makePlaceholder(doc, circular)
      placeholder.style.setProperty('position', 'static', 'important')
      placeholder.style.removeProperty('inset')
      placeholder.style.setProperty('width', `${Math.round(rect.width)}px`, 'important')
      placeholder.style.setProperty('height', `${Math.round(rect.height)}px`, 'important')
      placeholder.style.setProperty('display', 'block', 'important')
      placeholder.style.setProperty('margin', '0', 'important')
      if (isReplacedElement(el)) {
        el.replaceWith(placeholder)
      } else {
        el.replaceChildren(placeholder)
        // Keep the element's own styling (padding/border) from adding halo.
        el.style.setProperty('padding', '0', 'important')
        el.style.setProperty('border', 'none', 'important')
      }
    }
  }
}
