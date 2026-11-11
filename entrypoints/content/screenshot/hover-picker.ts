import { uiText } from '../ui-text'
import { isUserInput } from '../user-input'
import { candidateRect, type BlockCandidate } from '../blocks'
import { chainForElement, layerLabel, startIndexOf } from '../target-chain'

/**
 * The picking hover (RV-CAP-18, split out of the session): the dashed outline that follows the
 * pointer over the page's element chain, the layer picker the arrow keys walk, and the margin
 * bar that rides the hovered frame (screenshot.md §1.4, capture.md §6.2). Owns the target, the
 * chain, the outline and the bar; what a click captures stays with the session.
 */
export interface HoverPickerPort {
  readonly doc: Document
  /** The session host the outline and the bar are appended to. */
  host(): HTMLElement
  /** True while the pointer is picking a target and nothing is selected. */
  picking(): boolean
  /** The page's elements under a point, own chrome excluded by the caller. */
  pageElements(x: number, y: number): Element[]
}

export class HoverPicker {
  private target: HTMLElement | null = null
  private chain: BlockCandidate[] = []
  private index = 0
  private outlineEl: HTMLDivElement | null = null
  private marginBarEl: HTMLDivElement | null = null
  /** The margin the hovered element's frame is taken with (screenshot.md §1.4). */
  margin = 0

  constructor(private readonly port: HoverPickerPort) {}

  /** True while a target is hovered — the remembered frame waits for the next trigger then. */
  get hasTarget(): boolean {
    return this.target !== null
  }

  get isPainted(): boolean {
    return this.outlineEl !== null
  }

  /** The layer a click would capture. */
  layer(): BlockCandidate | null {
    return this.chain[this.index] ?? null
  }

  track(x: number, y: number): void {
    if (!this.port.picking()) return
    if (typeof this.port.doc.elementsFromPoint !== 'function') return
    const stack = this.port.pageElements(x, y)
    // the pointer on our own chrome (margin chips, bars) keeps the hover alive
    const top = stack[0]
    if (top?.closest?.('[data-ann-ui]')) return
    const found = stack.find(el => !el.closest?.('[data-ann-ui]')) as HTMLElement | undefined
    if (!found || found === this.port.doc.body || found === this.port.doc.documentElement) {
      this.clear()
      return
    }
    if (found !== this.target) {
      this.target = found
      // the pixel view of the target chain (capture.md §6.2): the start block,
      // its ancestors, and the section layers a flat page inserts
      this.chain = chainForElement(found, this.port.doc, 'pixel')
      this.index = startIndexOf(this.chain)
      this.paint()
      return
    }
    // same element: keep the painted UI instead of rebuilding it under a click
    if (!this.outlineEl || !this.marginBarEl) this.paint()
  }

  /** One layer up (ArrowUp) or down (ArrowDown) the chain. */
  climb(direction: 1 | -1): void {
    this.index = Math.max(0, Math.min(this.chain.length - 1, this.index + direction))
    this.paint()
  }

  private paint(): void {
    const layer = this.chain[this.index]
    if (!layer) {
      this.clear()
      return
    }
    this.outlineEl?.remove()
    const outline = this.port.doc.createElement('div')
    outline.className = 'ann-shot-hover-outline'
    outline.setAttribute('data-ann-ui', 'shot-hover-outline')
    const box = candidateRect(layer)
    Object.assign(outline.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
    // what a click would take: the element's own name and size — a section its kind and size — on the outline's top edge
    const tag = this.port.doc.createElement('span')
    tag.className = 'ann-shot-hover-tag'
    tag.textContent = layerLabel(layer, 'pixel')
    outline.appendChild(tag)
    this.port.host().appendChild(outline)
    this.outlineEl = outline
    this.showMarginBar(box)
  }

  /** The margin bar rides the hovered element's frame (screenshot.md §1.4). */
  private showMarginBar(box: DOMRect): void {
    this.marginBarEl?.remove()
    const bar = this.port.doc.createElement('div')
    bar.className = 'ann-shot-margin-bar'
    bar.setAttribute('data-ann-ui', 'shot-margin-bar')
    const label = this.port.doc.createElement('span')
    label.className = 'ann-shot-margin-label'
    label.textContent = uiText('shot.margin')
    bar.appendChild(label)
    for (const margin of [0, 8, 16, 24, 32]) {
      const chip = this.port.doc.createElement('button')
      chip.type = 'button'
      chip.textContent = String(margin)
      chip.className = this.margin === margin ? 'ann-shot-ratio-active' : ''
      chip.setAttribute('data-ann-ui', `shot-margin-${margin}`)
      chip.addEventListener('click', event => {
        if (!isUserInput(event)) return
        this.margin = margin
        this.paint()
      })
      bar.appendChild(chip)
    }
    const custom = this.port.doc.createElement('input')
    custom.type = 'number'
    custom.min = '0'
    custom.max = '200'
    custom.value = this.margin && ![0, 8, 16, 24, 32].includes(this.margin) ? String(this.margin) : ''
    custom.placeholder = '···'
    custom.setAttribute('aria-label', uiText('shot.margin'))
    custom.addEventListener('change', event => {
      const value = Number((event.target as HTMLInputElement).value)
      if (Number.isFinite(value) && value >= 0) {
        this.margin = Math.round(value)
        this.paint()
      }
    })
    bar.appendChild(custom)
    this.port.host().appendChild(bar)
    this.marginBarEl = bar
    const view = this.port.doc.defaultView!
    const width = bar.offsetWidth || 300
    let x = box.left + box.width / 2 - width / 2
    x = Math.max(8, Math.min(view.innerWidth - width - 8, x))
    const below = box.bottom + 8
    const y = below + 40 <= view.innerHeight ? below : Math.max(8, box.top - 48)
    bar.style.left = `${x}px`
    bar.style.top = `${y}px`
  }

  /** A new target or none: everything the picker showed goes. */
  clear(): void {
    this.target = null
    this.chain = []
    this.index = 0
    this.hide()
  }

  /**
   * Hides the picker's visuals but remembers its target: a press-and-release
   * is the click-element path, and it captures what the pointer rested on
   * even though the press hid the dashed UI.
   */
  hide(): void {
    this.outlineEl?.remove()
    this.outlineEl = null
    this.marginBarEl?.remove()
    this.marginBarEl = null
  }
}
