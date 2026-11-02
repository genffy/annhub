/**
 * The success notice (真机反馈): a bubble that rides above the toolbar — top-centre
 * without one — and leaves on its own, so the bar never carries stale text. Errors
 * are the toolbar's own notice row, not this bubble.
 */
import { ROOT_ATTR } from './session-roots'

/** A success notice stays as long as the clip toast next door; the fade is counted on top. */
export const NOTICE_BUBBLE_MS = 3000
export const NOTICE_BUBBLE_FADE_MS = 200

export interface NoticeBubble {
  /** Shows `message`, replacing whatever bubble is up. */
  show(message: string): void
  /** Stops a fade in flight; the element itself goes with the session host. */
  dispose(): void
}

export function createNoticeBubble(
  doc: Document,
  host: HTMLElement,
  options: {
    /** the toolbar's box while it is on the screen, else null: the bubble anchors over it */
    toolbarBox(): DOMRect | null
    textNode(text: string): Text
  },
): NoticeBubble {
  let el: HTMLDivElement | null = null
  let timer: number | null = null
  const clearTimer = (): void => {
    if (timer !== null) {
      doc.defaultView?.clearTimeout(timer)
      timer = null
    }
  }
  const show = (message: string): void => {
    el?.remove()
    el = null
    clearTimer()
    const view = doc.defaultView
    if (!view) return
    const bubble = doc.createElement('div')
    bubble.className = 'ann-shot-bubble'
    bubble.setAttribute(ROOT_ATTR, 'screenshot-bubble')
    bubble.setAttribute('role', 'status')
    // a tick in the pill's ok colour says “done” before the words do (the draft's toast)
    bubble.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
    bubble.append(options.textNode(message))
    host.appendChild(bubble)
    const width = bubble.offsetWidth || 120
    const height = bubble.offsetHeight || 30
    const bar = options.toolbarBox()
    const left = bar ? Math.max(8, Math.min(view.innerWidth - width - 8, bar.right - width)) : Math.max(8, view.innerWidth / 2 - width / 2)
    const top = bar ? Math.max(8, bar.top - height - 8) : 64
    Object.assign(bubble.style, { left: `${left}px`, top: `${top}px` })
    el = bubble
    timer = view.setTimeout(() => {
      bubble.classList.add('ann-shot-bubble-out')
      timer = view.setTimeout(() => {
        bubble.remove()
        if (el === bubble) el = null
        timer = null
      }, NOTICE_BUBBLE_FADE_MS)
    }, NOTICE_BUBBLE_MS)
  }
  const dispose = (): void => {
    clearTimer()
    el = null
  }
  return { show, dispose }
}
