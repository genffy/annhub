import { uiText } from '../ui-text'
import { isUserInput } from '../user-input'
import { HANDLES, handleAnchor, resizeFromHandle, type HandleId } from './selection'
import type { ViewportRect } from './crop'

/**
 * The pending frame's confirmation (RV-CAP-18, split out of the session): the released selection
 * stays adjustable — handles, a bar that confirms or cancels, snap guides while a new drag hunts
 * element edges (screenshot.md §1.2). Owns the bar, the handles and the guide lines; the
 * selection itself and what confirming triggers stay with the session.
 */
export interface ConfirmBoxPort {
  readonly doc: Document
  /** The session host the bar and the guides are appended to. */
  host(): HTMLElement
  selection(): ViewportRect | null
  setSelection(rect: ViewportRect): void
  /** The selection rect element the handles are attached to. */
  selectionElement(): HTMLDivElement | null
  viewport(): { width: number; height: number }
  /** Confirm releases into the capture; cancel ends the whole session. */
  confirm(): void
  cancel(): void
}

export class ConfirmBox {
  private barEl: HTMLDivElement | null = null
  private readonly handleEls: HTMLDivElement[] = []
  private snapXEl: HTMLDivElement | null = null
  private snapYEl: HTMLDivElement | null = null

  constructor(private readonly port: ConfirmBoxPort) {}

  /** The released selection stays adjustable: handles, nudge, confirm bar. */
  enter(label: string): void {
    this.clear()
    const doc = this.port.doc
    const selectionEl = this.port.selectionElement()
    if (!selectionEl || !this.port.selection()) return

    for (const handle of HANDLES) {
      const anchor = handleAnchor(handle)
      const el = doc.createElement('div')
      el.className = `ann-shot-handle ann-shot-handle-${handle}`
      el.setAttribute('data-ann-ui', `shot-handle-${handle}`)
      el.style.cursor = anchor.cursor
      el.addEventListener('pointerdown', event => {
        if (!isUserInput(event) || !this.port.selection()) return
        event.preventDefault()
        event.stopPropagation()
        this.dragHandle(handle, event)
      })
      selectionEl.appendChild(el)
      this.handleEls.push(el)
    }

    const bar = doc.createElement('div')
    bar.className = 'ann-shot-confirm-bar'
    bar.setAttribute('data-ann-ui', 'shot-confirm-bar')
    const confirm = doc.createElement('button')
    confirm.type = 'button'
    confirm.textContent = uiText('shot.confirmSelection')
    confirm.setAttribute('data-ann-ui', 'shot-confirm-btn')
    confirm.addEventListener('click', event => {
      if (isUserInput(event)) this.port.confirm()
    })
    const cancel = doc.createElement('button')
    cancel.type = 'button'
    cancel.textContent = uiText('common.cancel')
    cancel.setAttribute('data-ann-ui', 'shot-confirm-cancel')
    cancel.addEventListener('click', event => {
      if (isUserInput(event)) this.port.cancel()
    })
    bar.append(confirm, cancel)
    if (label) {
      const labelEl = doc.createElement('span')
      labelEl.className = 'ann-shot-frame-label'
      labelEl.setAttribute('data-ann-ui', 'shot-frame-label')
      labelEl.textContent = label
      bar.appendChild(labelEl)
    }
    this.port.host().appendChild(bar)
    this.barEl = bar
    this.positionBar()
    this.paint()
  }

  private positionBar(): void {
    const bar = this.barEl
    const selection = this.port.selection()
    if (!bar || !selection) return
    const view = this.port.viewport()
    const width = bar.offsetWidth || 220
    let x = selection.x + selection.width - width
    x = Math.max(8, Math.min(view.width - width - 8, x))
    const below = selection.y + selection.height + 8
    const y = below + 40 <= view.height ? below : Math.max(8, selection.y - 48)
    bar.style.left = `${x}px`
    bar.style.top = `${y}px`
  }

  /** Re-renders the pending rect's size label and the bar position. */
  paint(): void {
    const rect = this.port.selectionElement()
    const selection = this.port.selection()
    if (!rect || !selection) return
    rect.style.left = `${selection.x}px`
    rect.style.top = `${selection.y}px`
    rect.style.width = `${selection.width}px`
    rect.style.height = `${selection.height}px`
    const size = rect.querySelector<HTMLElement>('.ann-shot-size')
    if (size) size.textContent = `${Math.round(selection.width)} x ${Math.round(selection.height)}`
    this.positionBar()
  }

  private dragHandle(handle: HandleId, start: PointerEvent): void {
    const origin = { x: start.clientX, y: start.clientY }
    const base = { ...this.port.selection()! }
    const view = this.port.viewport()
    const doc = this.port.doc
    const move = (ev: PointerEvent): void => {
      if (!isUserInput(ev)) return
      this.port.setSelection(resizeFromHandle(base, handle, ev.clientX - origin.x, ev.clientY - origin.y, view))
      this.paint()
    }
    const up = (ev: PointerEvent): void => {
      if (isUserInput(ev)) void 0
      doc.removeEventListener('pointermove', move)
      doc.removeEventListener('pointerup', up)
    }
    doc.addEventListener('pointermove', move)
    doc.addEventListener('pointerup', up)
  }

  /** The guide lines a dragging selection snaps to element edges with. */
  paintSnapGuides(snapped: { snappedX: number | null; snappedY: number | null }): void {
    const doc = this.port.doc
    if (snapped.snappedX !== null && !this.snapXEl) {
      const line = doc.createElement('div')
      line.className = 'ann-shot-snap-line ann-shot-snap-x'
      this.port.host().appendChild(line)
      this.snapXEl = line
    }
    if (this.snapXEl) {
      this.snapXEl.style.display = snapped.snappedX === null ? 'none' : ''
      if (snapped.snappedX !== null) this.snapXEl.style.left = `${snapped.snappedX}px`
    }
    if (snapped.snappedY !== null && !this.snapYEl) {
      const line = doc.createElement('div')
      line.className = 'ann-shot-snap-line ann-shot-snap-y'
      this.port.host().appendChild(line)
      this.snapYEl = line
    }
    if (this.snapYEl) {
      this.snapYEl.style.display = snapped.snappedY === null ? 'none' : ''
      if (snapped.snappedY !== null) this.snapYEl.style.top = `${snapped.snappedY}px`
    }
  }

  clearSnapGuides(): void {
    this.snapXEl?.remove()
    this.snapYEl?.remove()
    this.snapXEl = null
    this.snapYEl = null
  }

  /** Bar, handles and guides leave the page; the selection rect itself stays for the next phase. */
  clear(): void {
    this.barEl?.remove()
    this.barEl = null
    for (const el of this.handleEls) el.remove()
    this.handleEls.length = 0
    this.clearSnapGuides()
  }
}
