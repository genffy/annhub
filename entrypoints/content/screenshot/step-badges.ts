import { uiText } from '../ui-text'
import { isUserInput } from '../user-input'
import { ROOT_ATTR } from './session-roots'
import { clampStep, nextStepNumber, stepAt, stepNumbers, stepRadius, type Annotation, type Point, type ScreenshotTool, type StepAnnotation } from './editor'

/**
 * The screenshot's step badges (RV-CAP-18, split out of the session): the numbered dots the step
 * tool puts down, the one selected, the ring that marks it and the press-drag that moves either
 * (screenshot.md §1.1). Owns the selection and the ring; the session answers through the port —
 * the sequence counter stays with the editor, where undo keeps it.
 */
export interface StepBadgesPort {
  readonly doc: Document
  /** True while the preview editor is the session's state. */
  inPreview(): boolean
  annotations(): Annotation[]
  tool(): ScreenshotTool
  color(): string
  busy(): boolean
  capturedDpr(): number
  /** The cropped canvas's pixel size, or null before the editor exists. */
  canvasSize(): { width: number; height: number } | null
  displayCanvas(): HTMLCanvasElement | null
  contentOrigin(): Point
  canvasPoint(event: PointerEvent): Point
  /** The next badge's sequence number. */
  stepSequence(): number
  /** Puts an editing step into the history and redraws; `stepSequence` overrides the counter (a reset). */
  commit(annotations: Annotation[], stepSequence?: number): void
  redraw(annotations?: Annotation[]): void
  /** Lets Esc cancel a drag in progress. */
  registerDrawingCleanup(cleanup: (() => void) | null): void
  /** Where keyboard focus returns after the ring's × acts. */
  stepToolButton(): HTMLElement | null
}

export class StepBadges {
  private selected: StepAnnotation | null = null
  private held = false
  private ringEl: HTMLDivElement | null = null

  constructor(private readonly port: StepBadgesPort) {}

  /** Over a badge the step tool can drag, the pointer says so. */
  hoverCursor(event: PointerEvent): 'move' | '' {
    if (!this.port.canvasSize() || this.held || !this.port.inPreview()) return ''
    return this.port.tool() === 'step' && stepAt(this.port.annotations(), this.port.canvasPoint(event), this.port.capturedDpr()) ? 'move' : ''
  }

  /** The selected badge, while the step tool can act on it: on the picture, and not under the pointer. */
  shown(): StepAnnotation | null {
    const step = this.selected
    return this.port.tool() === 'step' && step && !this.held && this.port.annotations().includes(step) ? step : null
  }

  /** The ring that marks the selected badge, with the × that deletes it. It sits over the picture, never on it. */
  ring(): HTMLDivElement {
    const ring = this.port.doc.createElement('div')
    ring.className = 'ann-shot-step-ring'
    ring.setAttribute(ROOT_ATTR, 'screenshot-step-selection')
    ring.style.display = 'none'
    const remove = this.port.doc.createElement('button')
    remove.type = 'button'
    remove.textContent = '×'
    remove.setAttribute(ROOT_ATTR, 'screenshot-step-delete')
    remove.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.deleteSelected()
      // the button goes with its badge; the keyboard stays with the tool
      this.port.stepToolButton()?.focus()
    })
    ring.append(remove)
    this.ringEl = ring
    return ring
  }

  /** Puts the ring where the selected badge is on screen: the preview may pad the capture and scale it down. */
  positionRing(): void {
    const ring = this.ringEl
    const display = this.port.displayCanvas()
    const step = this.shown()
    if (!ring) return
    if (!step || !display || !this.port.inPreview()) {
      ring.style.display = 'none'
      return
    }
    const box = display.getBoundingClientRect()
    const kx = box.width / (display.width || 1)
    const ky = box.height / (display.height || 1)
    const radius = stepRadius(this.port.capturedDpr()) * Math.max(kx, ky) + 4
    const x = (step.at.x + this.port.contentOrigin().x) * kx
    const y = (step.at.y + this.port.contentOrigin().y) * ky
    Object.assign(ring.style, { display: 'block', left: `${x - radius}px`, top: `${y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px` })
    const label = uiText('shot.step.delete', { number: stepNumbers(this.port.annotations()).get(step) ?? 1 })
    const remove = ring.querySelector('button')!
    remove.title = label
    remove.setAttribute('aria-label', label)
  }

  /** Another tool, or none: whatever was selected lets go. */
  clearSelection(): void {
    this.selected = null
  }

  /** A new editor picture: nothing is selected any more. */
  reset(): void {
    this.selected = null
    this.ringEl = null
  }

  /**
   * The step tool on the picture: a press on a badge selects it and drags it, anywhere else the next badge follows the
   * pointer and is put down where it is let go. Each is one step for undo; a click that only selects is none.
   */
  press(event: PointerEvent): void {
    const scale = this.port.capturedDpr()
    const size = this.port.canvasSize()
    if (!size) return
    const start = this.port.canvasPoint(event)
    const pressed = stepAt(this.port.annotations(), start, scale)
    const badge: StepAnnotation = pressed ?? { tool: 'step', at: clampStep(start, size, scale), color: this.port.color(), sequence: this.port.stepSequence() }
    // a pressed badge moves as far as the pointer does; a new one stays under the pointer
    const grab = pressed ? { x: start.x - pressed.at.x, y: start.y - pressed.at.y } : { x: 0, y: 0 }
    let placed = badge
    const draft = (): Annotation[] => (pressed ? this.port.annotations().map(annotation => (annotation === pressed ? placed : annotation)) : [...this.port.annotations(), placed])
    const follow = (ev: PointerEvent) => {
      const point = this.port.canvasPoint(ev)
      placed = { ...badge, at: clampStep({ x: point.x - grab.x, y: point.y - grab.y }, size, scale) }
    }
    this.selected = pressed
    this.held = true
    this.port.redraw(draft())
    const move = (ev: PointerEvent) => {
      follow(ev)
      this.port.redraw(draft())
    }
    const up = (ev: PointerEvent) => {
      cleanup()
      follow(ev)
      // a click on a badge only selects it, and a badge undo took away while it was held stays away
      if (pressed && (Math.hypot(placed.at.x - pressed.at.x, placed.at.y - pressed.at.y) < 3 || !this.port.annotations().includes(pressed))) {
        this.port.redraw()
        return
      }
      if (pressed) this.selected = placed
      this.port.commit(draft())
    }
    const cancel = () => {
      cleanup()
      this.port.redraw()
    }
    const cleanup = () => {
      this.held = false
      this.port.doc.removeEventListener('pointermove', move)
      this.port.doc.removeEventListener('pointerup', up)
      this.port.doc.removeEventListener('pointercancel', cancel)
      this.port.registerDrawingCleanup(null)
    }
    this.port.registerDrawingCleanup(cleanup)
    this.port.doc.addEventListener('pointermove', move)
    this.port.doc.addEventListener('pointerup', up)
    this.port.doc.addEventListener('pointercancel', cancel)
  }

  /** Delete, Backspace or the ring's ×: the selected badge goes, and the badges after it in its sequence move up one. */
  deleteSelected(): void {
    const step = this.shown()
    if (!step || this.port.busy()) return
    this.selected = null
    this.port.commit(this.port.annotations().filter(annotation => annotation !== step))
  }

  /** 重置计数: the next badge is 1, in a sequence of its own; the badges already down keep their numbers. */
  resetCount(): void {
    const sequence = this.port.stepSequence()
    if (this.port.busy() || nextStepNumber(this.port.annotations(), sequence) === 1) return
    this.port.commit(this.port.annotations(), sequence + 1)
  }
}
