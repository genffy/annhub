import type { ViewportRect } from './crop'
import type { OfferedFrame } from './last-frame'

/**
 * The pending frame's glue (RV-CAP-18, split out of the session): painting a programmatic
 * selection, entering the confirming state around it, confirming it into the capture, and
 * letting it go back to picking (screenshot.md §1.2). Owns the frame's label; the session
 * answers for the state and the parts around it.
 */
export interface PendingFramePort {
  readonly doc: Document
  /** The session host the pending rect is appended to. */
  host(): HTMLElement
  state(): 'selecting' | 'confirming' | 'capturing' | 'preview' | 'error' | 'done'
  setState(state: 'selecting' | 'confirming' | 'capturing' | 'preview' | 'error' | 'done'): void
  selection(): ViewportRect | null
  setSelection(rect: ViewportRect | null): void
  selectionElement(): HTMLDivElement | null
  setSelectionElement(el: HTMLDivElement | null): void
  /** The dimming overlay: transparent while a pending rect shows, dimmed again when it goes. */
  pageDim(dimmed: boolean): void
  /** The picker's visuals leave with a pending frame. */
  clearHover(): void
  clearRatioBar(): void
  syncHint(): void
  /** Confirming is modal for the page's pointer. */
  setConfirmShield(on: boolean): void
  /** The bar, handles and guides of the confirming state. */
  confirmBox(): { enter(label: string): void; clear(): void }
  /** The memory's offer goes when the frame is let go; a confirmed drag is adopted as a box. */
  forgetFrame(): void
  adoptFrame(selection: ViewportRect): void
  /** Enter releases into the region capture. */
  captureRegion(): void
}

export class PendingFrame {
  private label = ''

  constructor(private readonly port: PendingFramePort) {}

  get frameLabel(): string {
    return this.label
  }

  /** Paints a programmatic selection (restored frame) with its size label. */
  paint(): void {
    const selection = this.port.selection()
    if (!selection) return
    const rect = this.port.doc.createElement('div')
    rect.className = 'ann-shot-rect'
    const size = this.port.doc.createElement('span')
    size.className = 'ann-shot-size'
    size.textContent = `${Math.round(selection.width)} x ${Math.round(selection.height)}`
    if (selection.y < 28) {
      size.style.bottom = 'auto'
      size.style.top = 'calc(100% + 6px)'
    }
    rect.appendChild(size)
    Object.assign(rect.style, { left: `${selection.x}px`, top: `${selection.y}px`, width: `${selection.width}px`, height: `${selection.height}px` })
    this.port.host().appendChild(rect)
    this.port.setSelectionElement(rect)
    this.port.pageDim(false)
  }

  /** The remembered frame becomes the pending selection, and confirming opens around it. */
  async restore(offer: () => Promise<OfferedFrame | null>, stillPicking: () => boolean): Promise<void> {
    const frame = await offer()
    if (!frame || !stillPicking()) return
    this.port.setSelection(frame.frame)
    this.label = frame.label
    this.paint()
    this.enter(frame.label)
  }

  /** The released selection stays adjustable: handles, nudge, confirm bar. */
  enter(label = this.label): void {
    this.port.setState('confirming')
    this.label = label
    this.port.confirmBox().clear()
    // the pending frame owns the screen: no second candidate, no chips for the next drag, and a hint that is about it
    this.port.clearHover()
    this.port.clearRatioBar()
    this.port.syncHint()
    this.port.confirmBox().enter(label)
    this.port.setConfirmShield(true)
  }

  /** Enter confirms the pending selection (or the remembered frame). */
  confirm(): void {
    const selection = this.port.selection()
    if (!selection || this.port.state() !== 'confirming') return
    this.port.adoptFrame(selection)
    this.port.confirmBox().clear()
    this.port.captureRegion()
  }

  /**
   * A pending frame is let go (screenshot.md §1.2): its label and the memory's offer go with it,
   * and the picking line and chips are back — a new drag is under way, or the user clicked
   * outside to choose again. The overlay dims the page again until a new rect takes over that.
   */
  letGo(): void {
    this.label = ''
    this.port.forgetFrame()
    this.port.pageDim(true)
    this.port.syncHint()
  }
}
