/**
 * The selection menu — exactly two actions, clip and screenshot, in that
 * order, icon plus short text (docs/product/extension.md §2.1). It appears for
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
const VIEWPORT_MARGIN = 8
const SELECTION_GAP = 8
/** A box this close to the viewport width is the page, not a column beside a sidebar. */
const PAGE_GUTTER = 48
const plainSelectionText = new WeakMap<Range, string>()

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * The first line of a selection. Inline fragments on that line (a post splits
 * one line into spans and links) become one box; later lines do not, so a tall
 * selection still anchors where it starts. Zero-size caret rects are ignored.
 */
export function anchorLineBox(rects: readonly Box[], fallback: Box): Box {
  const visible = rects.filter(rect => rect.width >= 1 && rect.height >= 1)
  if (visible.length === 0) return fallback
  const topmost = visible.reduce((best, rect) => (rect.top < best.top ? rect : best))
  const line = visible.filter(rect => rect.bottom > topmost.top + 0.5 && rect.top < topmost.bottom - 0.5)
  const rows = line.length > 0 ? line : [topmost]
  const left = Math.min(...rows.map(rect => rect.left))
  const right = Math.max(...rows.map(rect => rect.right))
  const top = Math.min(...rows.map(rect => rect.top))
  const bottom = Math.max(...rows.map(rect => rect.bottom))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

/**
 * Center the menu on the selection's first line, above that line when it fits
 * and below it otherwise. Keep it inside `column` when that box is a content
 * column rather than the page.
 *
 * Every box is viewport CSS pixels — the same space as `getClientRects` and
 * `position: fixed`. Do not add a scroll offset or an iframe's position in
 * the parent page: an inner scroller (the column x.com actually scrolls) is
 * already in the rect, and a child frame positions its menu in its own viewport.
 * Placing at the selection's right edge whenever the viewport has room parks
 * the menu on the next column (x.com Home's Premium / search sidebar).
 */
export function placeSelectionMenu(
  anchor: Box,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  column: Box | null,
): { left: number; top: number } {
  const limits = horizontalLimits(column, menu.width, viewport.width)
  let left = anchor.left + anchor.width / 2 - menu.width / 2
  if (left + menu.width > limits.right) left = limits.right - menu.width
  if (left < limits.left) left = limits.left
  const minLeft = VIEWPORT_MARGIN
  const maxLeft = Math.max(minLeft, viewport.width - menu.width - VIEWPORT_MARGIN)
  left = Math.min(Math.max(minLeft, left), maxLeft)

  const above = anchor.top - SELECTION_GAP - menu.height
  const below = anchor.bottom + SELECTION_GAP
  const top = above >= VIEWPORT_MARGIN ? above : Math.min(Math.max(VIEWPORT_MARGIN, below), Math.max(VIEWPORT_MARGIN, viewport.height - menu.height - VIEWPORT_MARGIN))
  return { left, top }
}

function horizontalLimits(column: Box | null, menuWidth: number, viewportWidth: number): { left: number; right: number } {
  const page = { left: VIEWPORT_MARGIN, right: viewportWidth - VIEWPORT_MARGIN }
  if (!column || column.width < menuWidth || column.width > viewportWidth - PAGE_GUTTER) return page
  return { left: Math.max(page.left, column.left), right: Math.min(page.right, column.right) }
}

/** Nearest ancestor box that can hold the menu and is not the page itself. */
export function contentColumnRect(range: Range, menuWidth: number, viewportWidth: number): DOMRect | null {
  const doc = range.commonAncestorContainer.ownerDocument
  const view = doc?.defaultView
  if (!doc || !view) return null
  let el: Element | null = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
  while (el && el !== doc.documentElement && el !== doc.body) {
    const display = view.getComputedStyle(el).display
    if (display !== 'inline' && display !== 'contents' && display !== 'none') {
      const box = el.getBoundingClientRect()
      if (box.width >= menuWidth && box.height >= 1 && box.width <= viewportWidth - PAGE_GUTTER) return box
    }
    const root = el.getRootNode()
    el = el.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return null
}

export function plainTextForSelection(range: Range): string | undefined {
  return plainSelectionText.get(range)
}

export interface SelectionMenuHooks {
  onClip(): void
  /** Absent in a child frame: the screenshot session belongs to the top frame's viewport, so the menu offers clipping only. */
  onScreenshot?(): void
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
    const shot = this.hooks.onScreenshot ? this.action('menu.screenshot', 'ann-menu-shot', 'scan') : null
    const buttons = shot ? [clip.button, shot.button] : [clip.button]
    const row = this.doc.createElement('div')
    row.className = 'ann-menu-row'
    row.append(...buttons)
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
        this.focusIndex = (this.focusIndex + 1) % buttons.length
        buttons[this.focusIndex]!.focus()
        this.showHint(this.focusIndex === 0 ? 'menu.clip.hint' : 'menu.screenshot.hint')
        return
      }
      if (event.key === 'Enter') {
        // Enter fires the action of the button that actually holds focus; with
        // caret browsing the arrows can move focus off the menu, and a stale
        // recorded index must not fire instead (真机走查 P3-3). A bare Enter —
        // nothing of ours focused — still belongs to the page (extension.md §2.1).
        const index = buttons.indexOf(this.doc.activeElement as HTMLButtonElement)
        if (index < 0) return
        event.preventDefault()
        if (index === 0) this.hooks.onClip()
        else this.hooks.onScreenshot?.()
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
      else this.hooks.onScreenshot?.()
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
    const view = this.doc.defaultView
    if (!view) return
    const box = this.host
    // measure without layout thrash: place, then clamp
    box.style.visibility = 'hidden'
    box.style.left = '0px'
    box.style.top = '0px'
    const menu = { width: box.offsetWidth || 240, height: box.offsetHeight || 40 }
    const anchor = anchorLineBox(clientRectsOf(range), range.getBoundingClientRect())
    const column = contentColumnRect(range, menu.width, view.innerWidth)
    const placed = placeSelectionMenu(anchor, menu, { width: view.innerWidth, height: view.innerHeight }, column)
    box.style.left = `${placed.left}px`
    box.style.top = `${placed.top}px`
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
export function selectableRange(doc: Document, shadowRoot?: ShadowRoot): Range | null {
  const selection = doc.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  let range = selection.getRangeAt(0)
  if (range.collapsed && selection.toString().trim() && selection.getComposedRanges) {
    const roots: ShadowRoot[] = shadowRoot ? [shadowRoot] : []
    const visit = (parent: Document | ShadowRoot) => {
      for (const element of parent.querySelectorAll('*')) {
        if (element.shadowRoot) {
          if (!roots.includes(element.shadowRoot)) roots.push(element.shadowRoot)
          visit(element.shadowRoot)
        }
      }
    }
    visit(doc)
    for (const root of roots) {
      const composed = selection.getComposedRanges({ shadowRoots: [root] })[0]
      if (!composed) continue
      const candidate = doc.createRange()
      candidate.setStart(composed.startContainer, composed.startOffset)
      candidate.setEnd(composed.endContainer, composed.endOffset)
      if (candidate.toString().trim()) {
        range = candidate
        break
      }
    }
  }
  if (range.collapsed && selection.toString().trim() && !selection.getComposedRanges) {
    let root = shadowRoot ?? (selection.anchorNode instanceof Element ? selection.anchorNode.shadowRoot : null)
    if (!root) {
      const wanted = selection.toString().replace(/\s+/g, ' ').trim()
      root = [...doc.querySelectorAll('*')].map(element => element.shadowRoot).find(candidate => candidate?.textContent?.replace(/\s+/g, ' ').includes(wanted)) ?? null
    }
    const host = root?.host
    if (!host) return null
    if (root?.activeElement && editableHostOf(root.activeElement)) return null
    range = doc.createRange()
    range.selectNode(host)
    plainSelectionText.set(range, selection.toString())
  }
  if (range.collapsed) return null
  if (isBlankText(plainSelectionText.get(range) ?? range.toString())) return null
  if (selectionIsEditable(range)) return null
  return range
}

/** True when either end of the selection sits in an editing host. */
function selectionIsEditable(range: Range): boolean {
  return editableHostOf(range.startContainer) !== null || editableHostOf(range.endContainer) !== null
}

function clientRectsOf(range: Range): Box[] {
  if (typeof range.getClientRects !== 'function') return []
  return [...range.getClientRects()]
}

function editableHostOf(node: Node | null): Element | null {
  let el: Element | null = node instanceof Element ? node : (node?.parentElement ?? null)
  while (el) {
    const host = el as HTMLElement
    if (host.isContentEditable) return el
    const tag = el.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea') return el
    el = el.parentElement ?? (el.getRootNode() as ShadowRoot).host ?? null
  }
  return null
}
