/**
 * Cursor highlight and click ripple — annotate.md §3.2.
 *
 * Only during a recording, only on the recorded tab: a shape of the chosen
 * colour follows the pointer, so the audience keeps seeing it after the
 * browser fades the idle pointer out of the tab-capture video, and a ripple
 * marks each left press. It never blocks a click (pointer-events: none), it
 * hides while the pointer is off the page, and it hides for the screenshot
 * capture so it does not end up in the picture.
 */

import { isUserInput } from './user-input'

export interface CursorHighlightSettings {
  enabled: boolean
  shape: 'ring' | 'rounded' | 'diamond'
  color: string
}

const ROOT_ATTR = 'data-ann-ui'
const ROOT_VALUE = 'cursor-highlight'

let host: HTMLDivElement | null = null
let shapeEl: HTMLDivElement | null = null
let currentSettings: CursorHighlightSettings | null = null
let listeners: Array<[EventTarget, string, EventListener]> = []
/** Whether this frame has told its ancestors the pointer is inside it; reset when it leaves or the highlight re-arms. */
let ancestorsTold = false

function removeListeners(): void {
  for (const [target, type, listener] of listeners) target.removeEventListener(type, listener, true)
  listeners = []
}

function add(target: EventTarget, type: string, listener: (event: Event) => void): void {
  target.addEventListener(type, listener, true)
  listeners.push([target, type, listener])
}

function shapeStyle(settings: CursorHighlightSettings): string {
  const size = 26
  const common = `position:absolute;width:${size}px;height:${size}px;pointer-events:none;box-sizing:border-box;`
  switch (settings.shape) {
    case 'rounded':
      return `${common}border:2.5px solid ${settings.color};border-radius:7px;`
    case 'diamond':
      return `${common}width:${Math.round(size * 0.82)}px;height:${Math.round(size * 0.82)}px;border:2.5px solid ${settings.color};transform:rotate(45deg);`
    case 'ring':
    default:
      return `${common}border:2.5px solid ${settings.color};border-radius:50%;`
  }
}

function rippleStyle(color: string): string {
  return `position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid ${color};border-radius:50%;pointer-events:none;animation:annhub-ripple 480ms ease-out forwards;`
}

/** A pulse the stylesheet defines once per host; re-created with every host. */
const RIPPLE_KEYFRAMES = `
  @keyframes annhub-ripple {
    from { opacity: 0.9; transform: scale(0.6); }
    to { opacity: 0; transform: scale(3.2); }
  }
`

function ensureHost(doc: Document, settings: CursorHighlightSettings): void {
  if (host?.isConnected && currentSettings?.shape === settings.shape && currentSettings?.color === settings.color) return
  host?.remove()
  const next = doc.createElement('div')
  next.setAttribute(ROOT_ATTR, ROOT_VALUE)
  next.setAttribute('aria-hidden', 'true')
  next.style.cssText = `position:fixed;inset:0;z-index:2147483646;pointer-events:none;`
  const style = doc.createElement('style')
  style.textContent = RIPPLE_KEYFRAMES
  next.appendChild(style)
  const shape = doc.createElement('div')
  shape.setAttribute('data-ann-ui', 'cursor-highlight-shape')
  shape.style.cssText = `${shapeStyle(settings)}left:0;top:0;display:none;`
  next.appendChild(shape)
  doc.documentElement.appendChild(next)
  host = next
  shapeEl = shape
  currentSettings = settings
}

function moveShape(x: number, y: number): void {
  if (!shapeEl) return
  const half = 13
  shapeEl.style.left = `${x - half}px`
  shapeEl.style.top = `${y - half}px`
  shapeEl.style.transform = currentSettings?.shape === 'diamond' ? `rotate(45deg)` : ''
  shapeEl.style.display = 'block'
}

/** Turns the highlight on for a recording (with the settings) or off when it stops (annotate.md §3.2, §3.3). */
export function setCursorHighlight(active: boolean, settings?: CursorHighlightSettings): void {
  if (!active || !settings?.enabled) {
    removeListeners()
    host?.remove()
    host = null
    shapeEl = null
    currentSettings = null
    return
  }
  const doc = document
  ensureHost(doc, settings)

  removeListeners()
  ancestorsTold = false
  add(window, 'pointermove', event => {
    if (!isUserInput(event)) return
    moveShape((event as PointerEvent).clientX, (event as PointerEvent).clientY)
    // the pointer can already be inside this frame when the recording starts:
    // the first move here stands in for the enter the ancestors never see
    if (!ancestorsTold) {
      tellAncestors('annhub:cursor-in-subframe')
      ancestorsTold = true
    }
  })
  // the pointer left the page — over the browser's own UI or another window:
  // the highlight hides, and comes back when it returns (annotate.md §3.2)
  add(doc.documentElement, 'pointerleave', () => {
    if (shapeEl) shapeEl.style.display = 'none'
    // the pointer went back to an ancestor page, or left the page entirely:
    // the ancestors' rings show again either way
    tellAncestors('annhub:cursor-back-to-top')
    ancestorsTold = false
  })
  add(doc.documentElement, 'pointerenter', () => {
    if (shapeEl && shapeEl.style.left !== '0px') shapeEl.style.display = 'block'
    tellAncestors('annhub:cursor-in-subframe')
    ancestorsTold = true
  })
  // one ring on screen (annotate.md §3.2): while the pointer is inside a same-origin
  // subframe, that subframe's ring follows the pointer and every ancestor ring hides;
  // a cross-origin frame runs nothing of ours, so the ring stays at its edge there.
  // The parent document sees no pointer events across an iframe boundary, so the
  // subframe — the side that knows — tells them over DOM events (same-origin access).
  add(doc, 'annhub:cursor-in-subframe', () => {
    if (shapeEl) shapeEl.style.display = 'none'
  })
  add(doc, 'annhub:cursor-back-to-top', () => {
    if (shapeEl && shapeEl.style.left !== '0px') shapeEl.style.display = 'block'
  })
  const ancestorDocuments = (): Document[] => {
    const documents: Document[] = []
    try {
      // walk to the top: the topmost window is its own parent, which ends the walk
      for (let win = window.parent; win && win !== window; win = win.parent) {
        documents.push(win.document)
        if (win.parent === win) break
      }
    } catch {
      // a cross-origin ancestor: nothing of ours runs there, nothing to tell
    }
    return documents
  }
  const tellAncestors = (type: 'annhub:cursor-in-subframe' | 'annhub:cursor-back-to-top'): void => {
    for (const ancestor of ancestorDocuments()) ancestor.dispatchEvent(new CustomEvent(type))
  }
  add(doc, 'mousedown', event => {
    if (!isUserInput(event)) return
    const press = event as MouseEvent
    if (press.button !== 0) return
    const ripple = doc.createElement('div')
    ripple.setAttribute('data-ann-ui', 'cursor-highlight-ripple')
    ripple.style.cssText = `${rippleStyle(currentSettings?.color ?? '#e5484d')}left:${press.clientX}px;top:${press.clientY}px;`
    host?.appendChild(ripple)
    // each pulse leaves on its own timer: a press during another pulse must not keep that one on the page
    window.setTimeout(() => ripple.remove(), 520)
  })
  // the screenshot hides the extension's UI for the shot; the highlight is one of them (annotate.md §3.2)
  add(doc, 'annhub:capture-hide', () => {
    if (host) host.style.display = 'none'
  })
  add(doc, 'annhub:capture-restore', () => {
    if (host) host.style.display = ''
  })
}
