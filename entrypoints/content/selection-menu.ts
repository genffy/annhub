/**
 * The selection menu — exactly two actions, clip and screenshot, in that
 * order, icon plus short text (docs/v2/extension.md §2.1). It appears for
 * mouse drags and keyboard selections alike (no minimum length; an
 * all-whitespace selection never shows it), keyboard users drive it with
 * Tab and Enter, and hovering or focusing an action for ~300ms reveals its
 * consequence line.
 */
import { isBlankText } from '../../learning-core/normalize'
import { isUserInput } from './user-input'
import { uiText } from '../../utils/ui-text'

const ROOT_ATTR = 'data-ann-ui'
const HINT_DELAY_MS = 300

export interface SelectionMenuHooks {
  onClip(): void
  onScreenshot(): void
}

export class SelectionMenu {
  private host: HTMLElement | null = null
  private hintTimer: number | null = null
  private focusIndex = -1
  private currentRange: Range | null = null
  private cleanupFns: (() => void)[] = []

  constructor(
    private readonly doc: Document,
    private readonly hooks: SelectionMenuHooks,
  ) {}

  /** Shows the menu for a live selection; the range is re-read on trigger. */
  show(range: Range): void {
    this.dismiss()
    this.currentRange = range

    const host = this.doc.createElement('div')
    host.setAttribute(ROOT_ATTR, 'selection-menu')
    host.setAttribute('role', 'menu')

    const clip = this.action('menu.clip', 'ann-menu-clip', 'bookmark')
    const shot = this.action('menu.screenshot', 'ann-menu-shot', 'scan')
    const row = this.doc.createElement('div')
    row.className = 'ann-menu-row'
    row.append(clip.button, shot.button)
    const hint = this.doc.createElement('div')
    hint.className = 'ann-menu-hint'
    hint.setAttribute('aria-live', 'polite')
    host.append(row, hint)
    this.doc.documentElement.appendChild(host)
    this.host = host
    this.position(range)

    const onKey = (event: KeyboardEvent): void => {
      if (!isUserInput(event)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        this.dismiss()
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        this.focusIndex = (this.focusIndex + 1) % 2
        ;(this.focusIndex === 0 ? clip.button : shot.button).focus()
        this.showHint(this.focusIndex === 0 ? 'menu.clip.hint' : 'menu.screenshot.hint')
        return
      }
      if (event.key === 'Enter') {
        // Enter only fires an action once Tab focused one; a bare Enter
        // belongs to the page (extension.md §2.1)
        if (this.focusIndex < 0) return
        event.preventDefault()
        if (this.focusIndex === 0) this.hooks.onClip()
        else this.hooks.onScreenshot()
      }
    }
    this.doc.addEventListener('keydown', onKey, true)
    this.cleanupFns.push(() => this.doc.removeEventListener('keydown', onKey, true))
  }

  private action(key: 'menu.clip' | 'menu.screenshot', className: string, _icon: string) {
    const button = this.doc.createElement('button')
    button.className = `ann-menu-action ${className}`
    button.setAttribute('role', 'menuitem')
    button.type = 'button'
    button.textContent = uiText(key)
    button.addEventListener('pointerenter', () => this.showHint(key === 'menu.clip' ? 'menu.clip.hint' : 'menu.screenshot.hint'))
    button.addEventListener('focus', () => this.showHint(key === 'menu.clip' ? 'menu.clip.hint' : 'menu.screenshot.hint'))
    button.addEventListener('pointerleave', () => this.clearHint())
    button.addEventListener('click', event => {
      if (!isUserInput(event)) return
      if (key === 'menu.clip') this.hooks.onClip()
      else this.hooks.onScreenshot()
    })
    return { button }
  }

  /** The live selection the menu was opened for; reads it fresh at trigger time. */
  range(): Range | null {
    return this.currentRange
  }

  private showHint(key: 'menu.clip.hint' | 'menu.screenshot.hint'): void {
    this.clearHint()
    this.hintTimer = window.setTimeout(() => {
      const hint = this.host?.querySelector('.ann-menu-hint')
      if (hint) hint.textContent = uiText(key)
    }, HINT_DELAY_MS)
  }

  private clearHint(): void {
    if (this.hintTimer !== null) {
      window.clearTimeout(this.hintTimer)
      this.hintTimer = null
    }
    const hint = this.host?.querySelector('.ann-menu-hint')
    if (hint) hint.textContent = ''
  }

  private position(range: Range): void {
    if (!this.host) return
    const rect = range.getBoundingClientRect()
    const view = this.doc.defaultView!
    const box = this.host
    // measure without layout thrash: place, then clamp
    box.style.visibility = 'hidden'
    box.style.left = '0px'
    box.style.top = '0px'
    const size = { width: box.offsetWidth || 240, height: box.offsetHeight || 72 }
    let x = Math.min(Math.max(8, rect.left), Math.max(8, view.innerWidth - size.width - 8))
    if (rect.right + 8 + size.width <= view.innerWidth - 8) x = rect.right + 8
    const above = rect.top - 8 - size.height >= 8
    const y = above ? rect.top - 8 - size.height : Math.min(rect.bottom + 8, view.innerHeight - size.height - 8)
    box.style.left = `${x}px`
    box.style.top = `${Math.max(8, y)}px`
    box.style.visibility = ''
  }

  dismiss(): void {
    this.cleanupFns.forEach(fn => fn())
    this.cleanupFns = []
    this.host?.remove()
    this.host = null
    this.currentRange = null
    this.focusIndex = -1
    this.clearHint()
  }

  isShowing(): boolean {
    return this.host !== null
  }
}

/**
 * Whitespace-only selections never show the menu (extension.md §2.1), and
 * neither do selections inside editable areas (capture.md §3, US-CAP-01):
 * the user is editing, not capturing — the menu would swallow Enter and
 * silently save a clip of the draft.
 */
export function selectableRange(doc: Document): Range | null {
  const selection = doc.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (range.collapsed) return null
  if (isBlankText(range.toString())) return null
  if (selectionIsEditable(range)) return null
  return range
}

/** True when either end of the selection sits in an editing host. */
function selectionIsEditable(range: Range): boolean {
  return editableHostOf(range.startContainer) !== null || editableHostOf(range.endContainer) !== null
}

function editableHostOf(node: Node | null): Element | null {
  let el: Element | null = node instanceof Element ? node : (node?.parentElement ?? null)
  while (el) {
    const host = el as HTMLElement
    if (host.isContentEditable) return el
    const tag = el.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea') return el
    el = el.parentElement
  }
  return null
}
