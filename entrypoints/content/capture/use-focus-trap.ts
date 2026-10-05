/**
 * Focus management for the capture window (extension.md §10.1): focus enters
 * the window when it opens, Tab stays inside it, and focus returns to where it
 * was when the window closes.
 */
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return
    const root = container.getRootNode() as Document | ShadowRoot
    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null

    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === root.activeElement)
    const first = focusables()[0]
    if (first) first.focus()
    else container.focus()

    const onKeyDown = (e: Event) => {
      const event = e as KeyboardEvent
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstEl = items[0]!
      const lastEl = items[items.length - 1]!
      const current = (root as ShadowRoot).activeElement ?? document.activeElement
      if (event.shiftKey && current === firstEl) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && current === lastEl) {
        event.preventDefault()
        firstEl.focus()
      } else if (!container.contains(current)) {
        event.preventDefault()
        firstEl.focus()
      }
    }
    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [containerRef, active])
}
