import { sessionStyles } from './session-styles'
import { ROOT_ATTR } from './session-roots'

/** The listeners the session's mount wires onto the document. */
export interface SessionBootHandlers {
  onKeydown: (event: KeyboardEvent) => void
  onFocus: () => void
  onPointerDown: (event: PointerEvent) => void
  onHoverMove: (event: PointerEvent) => void
  onSwallowPageAction: (event: Event) => void
}

/** Cancelling pointerdown does not stop the click that follows it: the page's own action would fire (RV-CAP-05). */
export const SWALLOWED_EVENT_TYPES = ['click', 'dblclick', 'auxclick', 'contextmenu', 'submit'] as const

/**
 * Mounts the session's shell (RV-CAP-18, split out of the session): the style block, the dimming
 * overlay with the hint bar, the host on the document, and the document listeners. Returns the
 * overlay and the hint it created; the session owns what happens inside them.
 */
export function mountSessionShell(doc: Document, host: HTMLElement, handlers: SessionBootHandlers): { overlay: HTMLDivElement; hint: HTMLDivElement } {
  const style = doc.createElement('style')
  // The picking hints, the size label, the editor toolbar with its rows and the
  // success bubble are one always-dark pill set over the dimmed page (visual.md
  // §2): the --annov-pill-* tokens never follow the system appearance. The
  // text box and the error card are form-style surfaces and keep the theme
  // tokens. The selection blue marks the page's content, not a surface, and
  // stays what the AGENTS notes say: #4c91ff for both appearances — the draft's
  // #3b82f6 reads worse against the dimmed page (1.29:1 vs 1.53:1 on white).
  style.textContent = sessionStyles
  host.appendChild(style)

  const overlay = doc.createElement('div')
  overlay.className = 'ann-shot-overlay'
  overlay.setAttribute(ROOT_ATTR, 'screenshot-overlay')
  const hint = doc.createElement('div')
  hint.className = 'ann-shot-hint'
  overlay.appendChild(hint)
  host.appendChild(overlay)

  doc.documentElement.appendChild(host)
  doc.addEventListener('keydown', handlers.onKeydown, true)
  doc.addEventListener('focus', handlers.onFocus, true)
  // Selecting leaves the host pointer-events:none so a click still hits the
  // page element the element path wants. Confirming adds ann-shot-modal,
  // which takes the pointer so the page underneath cannot (issue #108).
  doc.addEventListener('pointerdown', handlers.onPointerDown, true)
  doc.addEventListener('pointermove', handlers.onHoverMove, true)
  for (const type of SWALLOWED_EVENT_TYPES) {
    doc.addEventListener(type, handlers.onSwallowPageAction, true)
  }
  return { overlay, hint }
}
