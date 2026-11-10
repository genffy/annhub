/**
 * Page-annotation layer — docs/product/annotate.md §1.
 *
 * A transparent overlay on the current tab's top page: a canvas for the ink
 * and one toolbar on the window edge. The layer rides the browser's top
 * layer (showPopover), so the page's own overlays, fullscreen content and
 * native modal dialogs cannot cover it; a modal dialog blocks the pointer
 * everywhere else, so the layer moves into the open dialog for the time and
 * moves back when it closes (market.md §4.7).
 *
 * Without a tool picked the page stays interactive; with one picked, a drag
 * draws and reaches nothing of the page. Ink lives in viewport coordinates
 * at draw time (annotate.md §1.2) and dies with the layer: exiting, a
 * refresh or a navigation clears it; nothing is saved. The screenshot
 * button (or the screenshot shortcut) hands the ink to the screenshot
 * session, which hides this layer and restores it when it ends.
 */
import { isUserInput } from '../user-input'
import { clampStep, drawAnnotation, isLineTool, nextStepNumber, stepAt, stepNumbers, type Annotation, type LineWidth, type Point } from '../screenshot/editor'
import { ANNOTATION_COLORS } from '../../../core/screenshot-options'
import { pointerSamples } from '../pointer-samples'
import { inkToEditorAnnotations, inkToViewport, snapshotInk, type InkStroke } from './ink'
import { ROOT_ATTR, ROOT_VALUE } from './annotation-roots'
import { layerStyles } from './layer-styles'
import { AUTO_ERASE_MS, buildToolbar, syncToolbarInto } from './toolbar'
import { commitText as commitTextInput, openTextInput } from './text-input'
import { handleRecordingKey } from './recording-keys'
import { ensureStepRing, positionStepRing } from './step-ring'
import { isPinnedPoint } from './pinned-point'

/** The erase delays of 自动擦除 (annotate.md §1.2): off by default, two fixed choices. */
export type AutoErase = 'off' | '3s' | '8s'

export type InkTool = 'pointer' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'text' | 'step'

/** Simple inline icons (lucide paths) — the toolbar buttons are plain DOM, not a React root. */
const SWALLOWED_EVENT_TYPES = ['click', 'dblclick', 'auxclick', 'contextmenu', 'submit'] as const

export interface AnnotationLayerOptions {
  /** The screenshot button (or the screenshot shortcut while the layer is open): hand over the ink and hide. */
  onScreenshot: (ink: InkStroke[]) => void
}

let activeLayer: AnnotationLayer | null = null

export function enterAnnotationLayer(options: AnnotationLayerOptions): AnnotationLayer {
  activeLayer?.exit()
  activeLayer = new AnnotationLayer(document, options)
  activeLayer.begin()
  return activeLayer
}

export function exitAnnotationLayer(): void {
  activeLayer?.exit()
  activeLayer = null
}

export function isAnnotationLayerActive(): boolean {
  return activeLayer !== null
}

/** The open layer, if any — the screenshot handover goes through it (annotate.md §1.1). */
export function getActiveAnnotationLayer(): AnnotationLayer | null {
  return activeLayer
}

/** A message for the open layer (e.g. 区块模式's shortcut): a transient status line, no dialog. */
export function notifyAnnotationLayer(message: string): void {
  activeLayer?.showNotice(message)
}

export class AnnotationLayer {
  doc: Document
  private readonly options: AnnotationLayerOptions
  host: HTMLDivElement
  canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private toolbarEl: HTMLDivElement | null = null
  private noticeEl: HTMLDivElement | null = null
  private noticeTimer: number | null = null
  tool: InkTool = 'pointer'
  color = ANNOTATION_COLORS[0]!.value
  lineWidth: LineWidth = 'medium'
  autoErase: AutoErase = 'off'
  strokes: InkStroke[] = []
  /** What undo goes back to, one entry per step: the strokes and the step-badge group before it (annotate.md §1.2). */
  history: Array<{ strokes: InkStroke[]; stepSequence: number }> = []
  /** Which 重置计数 group the next badge counts in; 清空 starts the next one. */
  private stepSequence = 0
  private draft: InkStroke | null = null
  /** The pointer gesture in progress (a stroke or a badge drag), ended by exit() if the layer closes mid-drag. */
  private endGesture: (() => void) | null = null
  selectedStep: InkStroke | null = null
  stepRingEl: HTMLDivElement | null = null
  textInput: HTMLTextAreaElement | null = null
  textAt: Point = { x: 0, y: 0 }
  /** The stroke ids and their erase timers; erased ink leaves the page and the undo history without a step. */
  eraseTimers = new Map<string, number>()
  hiddenForScreenshot = false
  /** 录制中：the toolbar would be filmed, so it is gone and the single keys run the tools (annotate.md §3.1). */
  recordingMode = false
  private exited = false
  private observer: MutationObserver | null = null
  private listeners: Array<[EventTarget, string, EventListener]> = []

  constructor(doc: Document, options: AnnotationLayerOptions) {
    this.doc = doc
    this.options = options
    this.host = doc.createElement('div')
    this.host.setAttribute(ROOT_ATTR, ROOT_VALUE)
    this.host.setAttribute('popover', 'manual')
  }

  begin(): void {
    const style = this.doc.createElement('style')
    style.textContent = layerStyles
    this.host.appendChild(style)

    const canvas = this.doc.createElement('canvas')
    canvas.className = 'ann-annot-canvas'
    canvas.setAttribute(ROOT_ATTR, 'annotation-canvas')
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.host.appendChild(canvas)

    this.toolbarEl = buildToolbar(this)
    this.host.appendChild(this.toolbarEl)

    const notice = this.doc.createElement('div')
    notice.className = 'ann-annot-notice'
    notice.setAttribute('data-ann-ui', 'annotation-notice')
    notice.setAttribute('role', 'status')
    notice.style.display = 'none'
    this.noticeEl = notice
    this.host.appendChild(notice)

    this.doc.documentElement.appendChild(this.host)
    this.showInTopLayer()
    this.syncCanvasSize()
    ensureStepRing(this)

    this.add(window, 'resize', () => this.syncCanvasSize())
    // the ink follows the page's scroll: it is stored where the content is, and
    // the canvas repaints at the new offset (annotate.md §1.2)
    let scrollPaintQueued = false
    this.add(window, 'scroll', () => {
      if (scrollPaintQueued || this.exited) return
      scrollPaintQueued = true
      requestAnimationFrame(() => {
        scrollPaintQueued = false
        this.paint()
      })
    })
    // Entering the top layer again puts the layer above a fullscreen element
    // that came later; the browser stacks the top layer by entry order.
    this.add(this.doc, 'fullscreenchange', () => {
      if (this.exited) return
      this.showInTopLayer()
      this.syncDialogPlacement()
    })
    this.add(this.doc, 'keydown', this.onKeydown, true)
    this.add(canvas, 'pointerdown', this.onPointerDown)
    for (const type of SWALLOWED_EVENT_TYPES) {
      this.add(this.doc, type, this.onSwallowPageAction, true)
    }
    // A native modal dialog blocks the pointer outside itself, this layer
    // included: move into the open dialog, move back when it closes.
    this.observer = new MutationObserver(() => {
      if (!this.exited) this.syncDialogPlacement()
    })
    this.observer.observe(this.doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    this.paint()
  }

  private add(target: EventTarget, type: string, listener: (event: Event) => void, capture = false): void {
    target.addEventListener(type, listener as EventListener, capture)
    this.listeners.push([target, type, listener as EventListener])
  }

  /** showPopover, guarded: an already-open popover throws instead of ignoring the call. */
  private showInTopLayer(): void {
    if (this.exited || this.hiddenForScreenshot) return
    try {
      if (!this.host.matches(':popover-open')) this.host.showPopover()
    } catch {
      /* a host that cannot re-enter the top layer keeps drawing where it is */
    }
  }

  private syncCanvasSize(): void {
    const view = this.doc.defaultView
    const canvas = this.canvas
    if (!view || !canvas) return
    const dpr = view.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(view.innerWidth * dpr))
    canvas.height = Math.max(1, Math.round(view.innerHeight * dpr))
    canvas.style.width = `${view.innerWidth}px`
    canvas.style.height = `${view.innerHeight}px`
    this.paint()
  }

  /** The open modal dialog to live in, if any; `dialog:modal` needs Chrome 105+, older ones just never match. */
  private containingDialog(): HTMLDialogElement | null {
    try {
      return this.doc.querySelector('dialog:modal')
    } catch {
      return null
    }
  }

  private syncDialogPlacement(): void {
    const dialog = this.containingDialog()
    const parent: HTMLElement = dialog ?? this.doc.documentElement
    if (this.host.parentElement !== parent) parent.appendChild(this.host)
  }

  // ── painting ──────────────────────────────────────────────────────

  scale(): number {
    return this.doc.defaultView?.devicePixelRatio || 1
  }

  /** The strokes as editor annotations in this canvas's pixel coordinates: page ink moves with the scroll, pinned ink stays. */
  private asAnnotations(strokes: readonly InkStroke[]): Annotation[] {
    const view = this.doc.defaultView!
    const onScreen = inkToViewport(strokes, view.scrollX, view.scrollY)
    return inkToEditorAnnotations(onScreen, { x: 0, y: 0, width: view.innerWidth, height: view.innerHeight }, this.scale())
  }

  paint(): void {
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const annotations = this.asAnnotations([...this.strokes, ...(this.draft ? [this.draft] : [])])
    for (const annotation of annotations) drawAnnotation(ctx, annotation, this.scale(), stepNumbers(annotations), canvas.width)
    positionStepRing(this)
  }

  // ── toolbar ───────────────────────────────────────────────────────

  /** Every close path of the text box, reachable from the recording keys too. */
  commitText(): void {
    commitTextInput(this)
  }

  syncToolbar(): void {
    if (this.toolbarEl) syncToolbarInto(this, this.toolbarEl)
  }

  setTool(tool: InkTool): void {
    if (this.tool === tool) return
    commitTextInput(this)
    this.tool = tool
    this.selectedStep = null
    this.host.classList.toggle('ann-annot-drawing', tool !== 'pointer')
    this.syncToolbar()
    this.applyToolCursor()
    this.paint()
  }

  /** 录制中 the toolbar is off the page, so the pointer itself says which tool and colour are on (annotate.md §3.1). */
  applyToolCursor(): void {
    if (!this.canvas) return
    if (!this.recordingMode || this.tool === 'pointer') {
      this.canvas.style.cursor = ''
      return
    }
    const color = ANNOTATION_COLORS.find(entry => entry.value === this.color)?.value ?? '#e5484d'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M12 3v18M3 12h18" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/></svg>`
    this.canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`
  }

  /** 开始录制时工具栏收起，停止后回来；录制中打开的批注层一开始就没有工具栏 (annotate.md §3.1)。 */
  setRecordingMode(active: boolean): void {
    if (this.recordingMode === active) return
    this.recordingMode = active
    if (this.toolbarEl) this.toolbarEl.style.display = active ? 'none' : ''
    this.applyToolCursor()
  }

  // ── input ─────────────────────────────────────────────────────────

  private readonly onSwallowPageAction = (event: Event): void => {
    // Only while a draw tool owns the pointer; in pointer mode the host is
    // transparent to events and the page behaves as if the layer were not there.
    if (this.tool === 'pointer' || this.textInput) return
    if (!isUserInput(event)) return
    const target = event.target
    if (!(target instanceof Node) || !this.host.contains(target)) return
    // A click on the canvas must not become a page action; the layer's own
    // chrome — toolbar, ring, text box — keeps working.
    if (target instanceof Element && !target.closest('.ann-annot-canvas')) return
    event.preventDefault()
    event.stopPropagation()
  }

  private readonly onKeydown = (rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent
    if (this.hiddenForScreenshot) return
    if (!isUserInput(event)) return
    if (event.key === 'Escape') {
      if (this.textInput) {
        event.preventDefault()
        event.stopPropagation()
        commitTextInput(this)
        return
      }
      // an editable's Esc belongs to the page: in pointer mode the layer stays out of the way
      const active = this.doc.activeElement
      if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      event.preventDefault()
      event.stopPropagation()
      exitAnnotationLayer()
    }
    if (this.selectedStep && (event.key === 'Delete' || event.key === 'Backspace')) {
      const active = this.doc.activeElement
      if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      event.preventDefault()
      this.deleteSelectedStep()
      return
    }
    // Ctrl/Cmd+Z undoes a step, as it does in the screenshot editor — but only while a drawing tool owns the
    // pointer: with the pointer tool, or the focus in an input or editable area, the key belongs to the page (annotate.md §1.2)
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
      if (this.tool === 'pointer') return
      const active = this.doc.activeElement
      if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      event.preventDefault()
      event.stopPropagation()
      this.undo()
    }
  }

  /** Where the stroke is stored: the PAGE's position, so scrolling moves the ink with the content (annotate.md §1.2). */
  private canvasPoint(event: PointerEvent): Point {
    const view = this.doc.defaultView!
    return { x: event.clientX + view.scrollX, y: event.clientY + view.scrollY }
  }

  /**
   * Whether a stroke starting here is pinned to the window (annotate.md
   * §1.2): the element under the pointer — or an ancestor — is fixed, or a
   * sticky bar currently stuck to the top. Pinned ink keeps viewport
   * coordinates and stays out of a scrolling capture.
   */
  private readonly onPointerDown = (rawEvent: Event): void => {
    const event = rawEvent as PointerEvent
    if (this.tool === 'pointer' || this.textInput) return
    if (!isUserInput(event) || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    // one stroke at a time (annotate.md §1.2): a gesture already running, or a second finger
    // coming down while one draws, starts nothing of its own
    if (this.endGesture || !event.isPrimary) return
    if (this.tool === 'text') {
      openTextInput(this, this.canvasPoint(event))
      return
    }
    if (this.tool === 'step') {
      this.pressStep(event)
      return
    }
    const tool = this.tool as InkStroke['tool']
    const traced = tool === 'pen' || tool === 'highlighter'
    // pinned ink keeps viewport coordinates from its first sample on (annotate.md §1.2): page
    // coordinates would sit a scroll's worth below the pointer once the page has scrolled
    const pinned = isPinnedPoint(this.doc, event.clientX, event.clientY)
    const view = this.doc.defaultView!
    const at = (e: { clientX: number; clientY: number }): Point => (pinned ? { x: e.clientX, y: e.clientY } : { x: e.clientX + view.scrollX, y: e.clientY + view.scrollY })
    const start = at(event)
    // a trace holds only the samples the pointer has passed; the shapes hold [start, end] with `end` rewritten per move
    const draft: InkStroke = { id: this.newStrokeId(), tool, points: traced ? [start] : [start, start], color: this.color }
    if (isLineTool(tool)) draft.width = this.lineWidth
    if (pinned) draft.pinned = true
    this.draft = draft
    const pointerId = event.pointerId
    const follow = (ev: PointerEvent): void => {
      if (traced) {
        for (const sample of pointerSamples(ev)) {
          const point = at(sample)
          const last = draft.points[draft.points.length - 1]!
          if (point.x !== last.x || point.y !== last.y) draft.points.push(point)
        }
      } else {
        const point = at(ev)
        draft.points[1] = tool === 'line' && ev.shiftKey ? snapLine(start, point) : point
      }
      this.paint()
    }
    const move = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId || !isUserInput(ev)) return
      follow(ev)
    }
    const up = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId || !isUserInput(ev)) return
      cleanup()
      follow(ev)
      this.draft = null
      // a click without a drag draws nothing, as the screenshot editor's strokes do (screenshot.md §1.1)
      const moved = Math.hypot(draft.points[draft.points.length - 1]!.x - start.x, draft.points[draft.points.length - 1]!.y - start.y) >= 3 || draft.points.length > 2
      if (!moved) {
        this.paint()
        return
      }
      this.commit([...this.strokes, draft])
    }
    // this pointer's cancel drops the half-drawn stroke; another pointer's leaves it alone
    const cancel = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return
      cleanup()
    }
    const cleanup = (): void => {
      this.doc.removeEventListener('pointermove', move, true)
      this.doc.removeEventListener('pointerup', up, true)
      this.doc.removeEventListener('pointercancel', cancel, true)
      this.draft = null
      this.endGesture = null
    }
    this.endGesture = cleanup
    this.doc.addEventListener('pointermove', move, true)
    this.doc.addEventListener('pointerup', up, true)
    this.doc.addEventListener('pointercancel', cancel, true)
  }

  /** The step tool on the layer: press a badge to drag it, anywhere else the next one follows the pointer and lands on release. */
  private pressStep(event: PointerEvent): void {
    const scale = this.scale()
    const view = this.doc.defaultView!
    const size = { width: this.canvas?.width ?? Math.round(view.innerWidth * scale), height: this.canvas?.height ?? Math.round(view.innerHeight * scale) }
    const startCanvas = { x: event.clientX * scale, y: event.clientY * scale }
    const annotations = this.asAnnotations(this.strokes)
    const pressedAnnotation = stepAt(annotations, startCanvas, scale)
    const pressedIndex = pressedAnnotation ? annotations.indexOf(pressedAnnotation) : -1
    const pressedStroke = pressedIndex >= 0 ? (this.strokes[pressedIndex] ?? null) : null
    const badge: InkStroke = pressedStroke ?? {
      id: this.newStrokeId(),
      tool: 'step',
      // page coordinates, like every stroke; a badge on a pinned element keeps viewport coordinates
      points: [this.canvasPoint(event)],
      color: this.color,
      sequence: this.stepSequence,
    }
    if (!pressedStroke && isPinnedPoint(this.doc, event.clientX, event.clientY)) badge.pinned = true
    // a pressed badge moves as far as the pointer does; a new one stays under the pointer.
    // the grab offset works in screen space: page ink moves with the scroll, pinned ink does not
    const pressedOnScreen = pressedStroke ? inkToViewport([pressedStroke], view.scrollX, view.scrollY)[0]!.points[0]! : null
    const grab = pressedOnScreen ? { x: startCanvas.x - pressedOnScreen.x * scale, y: startCanvas.y - pressedOnScreen.y * scale } : { x: 0, y: 0 }
    let placed = badge
    const draft = (): InkStroke[] => (pressedStroke ? this.strokes.map(stroke => (stroke === pressedStroke ? placed : stroke)) : [...this.strokes, placed])
    const follow = (ev: PointerEvent): void => {
      const at = clampStep({ x: ev.clientX * scale - grab.x, y: ev.clientY * scale - grab.y }, size, scale)
      // the clamped position is on the screen; storage is page coordinates, unless the badge is pinned
      placed = {
        ...badge,
        points: [{ x: at.x / scale + (badge.pinned ? 0 : view.scrollX), y: at.y / scale + (badge.pinned ? 0 : view.scrollY) }],
      }
    }
    this.selectedStep = pressedStroke
    this.paint()
    const move = (ev: PointerEvent): void => {
      if (!isUserInput(ev)) return
      follow(ev)
      this.paint()
    }
    const up = (ev: PointerEvent): void => {
      if (!isUserInput(ev)) return
      cleanup()
      follow(ev)
      if (pressedStroke) {
        const moved = Math.hypot(placed.points[0]!.x - badge.points[0]!.x, placed.points[0]!.y - badge.points[0]!.y) * scale >= 3
        // a click on a badge only selects it, and a badge undo took away while it was held stays away
        if (!moved || !this.strokes.includes(pressedStroke)) {
          this.selectedStep = this.strokes.includes(pressedStroke) ? pressedStroke : null
          this.paint()
          return
        }
        this.selectedStep = placed
      }
      this.commit(draft())
    }
    const cleanup = (): void => {
      this.doc.removeEventListener('pointermove', move, true)
      this.doc.removeEventListener('pointerup', up, true)
      this.doc.removeEventListener('pointercancel', cleanup, true)
      this.endGesture = null
    }
    this.endGesture = cleanup
    this.doc.addEventListener('pointermove', move, true)
    this.doc.addEventListener('pointerup', up, true)
    this.doc.addEventListener('pointercancel', cleanup, true)
  }

  /**
   * The recording-time single keys (annotate.md §3.1): tools, the five colours,
   * the width steps, undo, clear and Esc. They act only while the layer is open
   * and the focus is not in an input or editable area — the rest of the time
   * the key belongs to the page. The listener sits on the window's capture
   * phase from document_start, ahead of the site's own handlers.
   */
  handleRecordingKey(event: KeyboardEvent): boolean {
    return handleRecordingKey(this, event)
  }

  // ── text tool ─────────────────────────────────────────────────────

  newStrokeId(): string {
    return `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** One step: a stroke drawn or written, a badge put down, dragged or deleted, the count reset, the ink cleared. */
  commit(strokes: InkStroke[], stepSequence = this.stepSequence): void {
    this.history.push({ strokes: this.strokes, stepSequence: this.stepSequence })
    this.strokes = strokes
    this.stepSequence = stepSequence
    this.scheduleAutoErase(strokes)
    this.paint()
  }

  undo(): void {
    const previous = this.history.pop()
    if (!previous) return
    // the ink that undo brings back keeps its erase running; the ink it takes away stops, and so do its timers
    const restored = new Set(previous.strokes.map(stroke => stroke.id))
    for (const [id, timer] of this.eraseTimers) {
      if (restored.has(id)) continue
      window.clearTimeout(timer)
      this.eraseTimers.delete(id)
    }
    this.strokes = previous.strokes
    this.stepSequence = previous.stepSequence
    this.selectedStep = null
    this.scheduleAutoErase(this.strokes)
    this.paint()
  }

  /** 清空: the ink goes and the next badge is 1 again; undo brings both back (annotate.md §1.2). */
  clear(): void {
    if (this.strokes.length === 0 && nextStepNumber(this.asAnnotations(this.strokes), this.stepSequence) === 1) return
    for (const timer of this.eraseTimers.values()) window.clearTimeout(timer)
    this.eraseTimers.clear()
    this.commit([], this.stepSequence + 1)
  }

  deleteSelectedStep(): void {
    const selected = this.selectedStep
    if (!selected || !this.strokes.includes(selected)) return
    this.selectedStep = null
    this.commit(this.strokes.filter(stroke => stroke !== selected))
  }

  /** Erase each finished stroke when its delay runs out; the erased ink never enters undo, so history loses it too. */
  private scheduleAutoErase(strokes: readonly InkStroke[]): void {
    if (this.autoErase === 'off') return
    for (const stroke of strokes) {
      if (this.eraseTimers.has(stroke.id)) continue
      this.eraseTimers.set(
        stroke.id,
        window.setTimeout(() => {
          this.eraseTimers.delete(stroke.id)
          if (!this.strokes.some(candidate => candidate.id === stroke.id)) return
          this.strokes = this.strokes.filter(candidate => candidate.id !== stroke.id)
          this.history = this.history.map(entry => ({ ...entry, strokes: entry.strokes.filter(candidate => candidate.id !== stroke.id) }))
          if (this.selectedStep === stroke) this.selectedStep = null
          this.paint()
        }, AUTO_ERASE_MS[this.autoErase]),
      )
    }
  }

  // ── screenshot handover ───────────────────────────────────────────

  /**
   * The toolbar's button, and — from index.tsx — the screenshot shortcut while
   * the layer is open: the ink goes to the screenshot session, the layer hides
   * and comes back when the session ends (annotate.md §1.1, §1.3).
   */
  startScreenshot(): void {
    if (this.hiddenForScreenshot) return
    commitTextInput(this)
    // the ink goes over in page coordinates; the screenshot session moves it into the viewport of its capture (consumeInk)
    const ink = snapshotInk(this.strokes)
    this.hiddenForScreenshot = true
    try {
      if (this.host.matches(':popover-open')) this.host.hidePopover()
    } catch {
      /* the popover state is best effort; display:none below is what matters */
    }
    this.host.style.display = 'none'
    this.options.onScreenshot(ink)
  }

  /** The screenshot session ended (confirm, cancel or error): the layer returns with its ink (annotate.md §1.3). */
  restoreAfterScreenshot(): void {
    if (this.exited || !this.hiddenForScreenshot) return
    this.hiddenForScreenshot = false
    this.host.style.display = ''
    this.showInTopLayer()
    this.syncDialogPlacement()
    this.paint()
  }

  // ── notices, ring, exit ───────────────────────────────────────────

  showNotice(message: string): void {
    if (!this.noticeEl) return
    this.noticeEl.textContent = message
    this.noticeEl.style.display = ''
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer)
    this.noticeTimer = window.setTimeout(() => {
      if (this.noticeEl) this.noticeEl.style.display = 'none'
    }, 2500)
  }

  /** The ring around the selected badge, with the × that deletes it; it never enters the ink. */
  exit(): void {
    if (this.exited) return
    this.exited = true
    this.endGesture?.()
    commitTextInput(this)
    this.observer?.disconnect()
    this.observer = null
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener, true)
    this.listeners = []
    for (const [, timer] of this.eraseTimers) window.clearTimeout(timer)
    this.eraseTimers.clear()
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer)
    try {
      if (this.host.matches(':popover-open')) this.host.hidePopover()
    } catch {
      /* already gone */
    }
    this.host.remove()
    this.canvas = null
    this.ctx = null
    this.toolbarEl = null
    this.noticeEl = null
    this.stepRingEl = null
    this.strokes = []
    this.history = []
    if (activeLayer === this) activeLayer = null
  }
}

/** Where a line drawn with Shift held ends: the nearest horizontal, vertical or 45° diagonal through its start. */
function snapLine(start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const eighths = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  if (eighths % 4 === 0) return { x: end.x, y: start.y }
  if (eighths % 2 === 0) return { x: start.x, y: end.y }
  const along = (Math.abs(dx) + Math.abs(dy)) / 2
  return { x: start.x + Math.sign(dx) * along, y: start.y + Math.sign(dy) * along }
}
