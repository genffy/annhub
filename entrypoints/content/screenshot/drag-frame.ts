import { isUserInput } from '../user-input'
import { collectEdges, snapPoint } from './selection'
import { constrainToRatio, constrainToRatioValue, ratioOf } from '../../../utils/screenshot-output'
import type { ViewportRect } from './crop'

/**
 * The drag that draws a frame (RV-CAP-18, split out of the session): a press outside a pending
 * frame lets it go; the drag that follows sticks to element edges near it, keeps a ratio the
 * preset or Shift locked in, and paints the size as it goes (screenshot.md §1.2). A
 * press-and-release in the picking state is the click-element path. Owns the dragging rect and
 * the Shift ratio; the session answers for the state around it.
 */
export interface FrameDragPort {
  readonly doc: Document
  /** The session host the dragging rect is appended to. */
  host(): HTMLElement
  selection(): ViewportRect | null
  setSelection(rect: ViewportRect | null): void
  /** The selection element slot: the drag takes it over when its frame has area. */
  selectionElement(): HTMLDivElement | null
  setSelectionElement(el: HTMLDivElement | null): void
  /** Dimming overlay behind the frame; transparent while a rect shows. */
  pageDim(on: boolean): void
  /** Element boxes under a point, for snapping. */
  edgeRectsUnder(x: number, y: number): Array<{ left: number; top: number; right: number; bottom: number }>
  /** The preset the ratio bar locked in, or the literal 'free'. */
  ratio(): string
  /** Guides for what the drag snapped to. */
  paintSnapGuides(snapped: { snappedX: number | null; snappedY: number | null }): void
  clearSnapGuides(): void
  /** A frame the memory offered goes when a new drag replaces it. */
  frameReplaced(): void
  /** The drag ended as a click: the hovered element is captured, or the picker follows. */
  click(x: number, y: number, wasConfirming: boolean): void
  /** The released selection stays adjustable before capture. */
  released(): void
  registerCleanup(cleanup: (() => void) | null): void
}

export class FrameDrag {
  /** The ratio Shift locked in for this drag, from the pending selection's own shape. */
  private shiftRatio: number | null = null

  constructor(private readonly port: FrameDragPort) {}

  /** Shift went down while a pending selection shows: its shape is the drag's ratio. */
  noteShift(): void {
    const selection = this.port.selection()
    this.shiftRatio = selection && selection.height > 0 ? selection.width / selection.height : null
  }

  /**
   * A new drag from this press: the pending frame (if any) is already let go by the caller. The
   * pointer's move paints the frame; its release confirms it, or is a click on the hovered
   * element when it never moved.
   */
  begin(e: PointerEvent, wasConfirming: boolean): void {
    const { doc } = this.port
    const origin = { x: e.clientX, y: e.clientY }
    const rect = doc.createElement('div')
    rect.className = 'ann-shot-rect'
    const size = doc.createElement('span')
    size.className = 'ann-shot-size'
    rect.appendChild(size)

    const move = (ev: PointerEvent) => {
      if (!isUserInput(ev)) return
      const view = doc.defaultView!
      // snapping: the moving point sticks to element edges near it (screenshot.md §1.2)
      const edges = collectEdges(this.port.edgeRectsUnder(ev.clientX, ev.clientY), { width: view.innerWidth, height: view.innerHeight })
      const snapped = snapPoint({ x: ev.clientX, y: ev.clientY }, edges)
      this.port.paintSnapGuides(snapped)
      let raw: ViewportRect
      if (this.port.ratio() !== 'free') {
        raw = constrainToRatio(origin, snapped, this.port.ratio(), { width: view.innerWidth, height: view.innerHeight })
      } else if (this.shiftRatio !== null) {
        raw = constrainToRatioValue(origin, snapped, this.shiftRatio, { width: view.innerWidth, height: view.innerHeight })
      } else {
        raw = constrainToRatio(origin, snapped, 'free', { width: view.innerWidth, height: view.innerHeight })
      }
      const x0 = Math.max(0, raw.x)
      const y0 = Math.max(0, raw.y)
      const x1 = Math.min(view.innerWidth, raw.x + raw.width)
      const y1 = Math.min(view.innerHeight, raw.y + raw.height)
      const frame = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
      this.port.setSelection(frame)
      this.port.frameReplaced()
      if (frame.width > 0 && frame.height > 0 && !this.port.selectionElement()) {
        this.port.host().appendChild(rect)
        this.port.setSelectionElement(rect)
        this.port.pageDim(false)
      }
      rect.style.left = `${x0}px`
      rect.style.top = `${y0}px`
      rect.style.width = `${frame.width}px`
      rect.style.height = `${frame.height}px`
      const preset = ratioOf(this.port.ratio())
      size.textContent = `${Math.round(frame.width)} x ${Math.round(frame.height)}${preset ? ` · ${preset.id} 🔒` : this.shiftRatio !== null ? ' 🔒' : ''}`
      size.style.bottom = y0 < 28 ? 'auto' : ''
      size.style.top = y0 < 28 ? 'calc(100% + 6px)' : ''
    }
    const up = (ev: PointerEvent) => {
      if (!isUserInput(ev)) return
      detach()
      this.port.clearSnapGuides()
      this.shiftRatio = null
      const width = Math.abs(ev.clientX - origin.x)
      const height = Math.abs(ev.clientY - origin.y)
      if (width < 4 && height < 4) {
        // A click, not a drag → element path with the hovered element and margin.
        rect.remove()
        if (this.port.selectionElement() && this.port.selectionElement() !== rect) this.port.selectionElement()!.remove()
        this.port.setSelectionElement(null)
        this.port.setSelection(null)
        this.port.pageDim(true)
        this.port.click(ev.clientX, ev.clientY, wasConfirming)
        return
      }
      const selection = this.port.selection()
      if (!selection || selection.width < 4 || selection.height < 4) {
        rect.remove()
        if (this.port.selectionElement() && this.port.selectionElement() !== rect) this.port.selectionElement()!.remove()
        this.port.setSelectionElement(null)
        this.port.setSelection(null)
        this.port.pageDim(true)
        return
      }
      // the released selection stays adjustable before capture (screenshot.md §1.2)
      this.port.released()
    }
    const detach = () => {
      doc.removeEventListener('pointermove', move)
      doc.removeEventListener('pointerup', up)
      this.port.registerCleanup(null)
    }
    this.port.registerCleanup(detach)
    doc.addEventListener('pointermove', move)
    doc.addEventListener('pointerup', up)
  }
}
