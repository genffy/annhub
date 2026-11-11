import { ROOT_ATTR } from './session-roots'
import { createScreenshotToolbar, type ScreenshotToolbar } from './toolbar'
import { TextInputOverlay } from './text-input'
import { StepBadges } from './step-badges'
import { BeautifyController } from './beautify-controller'
import { paintScreenshotDisplay } from './display'
import { previewBox, placeSizeLabel } from '../../../utils/screenshot-output'
import { renderScreenshot, nextStepNumber, snapLine, isLineTool, type Annotation, type LineWidth, type Point, type ScreenshotTool } from './editor'
import { pointerSamples } from '../pointer-samples'
import { localPoint } from './pointer-point'
import type { ViewportRect } from './crop'
import type { BeautifySettings } from '../../../core/screenshot-options'
import type { ExtensionSettings } from '../../../core/settings'
import type { WatermarkImage } from '../../../utils/screenshot-output'
import type { CaptureVia } from '../../../types/messages'

/**
 * The preview editor (RV-CAP-18, split out of the session): the composed picture, the toolbar
 * with its tools, colours and widths, the annotation history with undo, and the overlays it
 * hosts — the text box, the step badges, the beautify panel (screenshot.md §1.1–§4). Owns the
 * editing state and its canvases; the capture hands it a picture, the session answers for the
 * settings and the destinations through the port.
 */
export interface EditorStagePort {
  readonly doc: Document
  /** The session host the preview panel and the toolbar are appended to. */
  host(): HTMLElement
  /** True while the session's state is the preview editor. */
  inPreview(): boolean
  busy(): boolean
  notice(): { message: string; error: boolean } | undefined
  /** The status strip's toggles, or null while the settings take them off the table. */
  anonymize(): boolean | null
  watermark(): boolean | null
  /** The session's own UI that leaves with the selection: the picking hint and the ratio bar. */
  clearPickingUi(): void
  dimPageAgain(): void
  /** The frame the capture was cut from, while it still shows on screen. */
  selection(): ViewportRect | null
  /** The capture as it came from the screen, before any editing. */
  source(): HTMLCanvasElement | null
  /** Where the capture sits on screen when there is no selection: around the element. */
  elementRect(): ViewportRect | null
  beautify(): BeautifySettings
  changeBeautify(patch: Partial<BeautifySettings>): void
  resetBeautify(): void
  ratioPresets(): string[]
  /** What refreshDisplay composes onto: the watermark settings, its image, and whether it is on. */
  paintOptions(): { watermarkOn: boolean; watermark?: ExtensionSettings['watermark']; watermarkImage: WatermarkImage | null; via: CaptureVia; dpr: number }
  exit(): void
  copy(): void
  download(): void
  save(): void
  registerDrawingCleanup(cleanup: (() => void) | null): void
}

export class EditorStage {
  private previewEl: HTMLElement | null = null
  private toolbarEl: HTMLDivElement | null = null
  private toolbar: ScreenshotToolbar | null = null
  private toolbarResizeObserver: ResizeObserver | null = null
  private displayCanvas: HTMLCanvasElement | null = null
  private contentOrigin: Point = { x: 0, y: 0 }
  private previewNow: ViewportRect | null = null
  private croppedCanvas: HTMLCanvasElement | null = null
  private capturedDpr = 1
  private annotations: Annotation[] = []
  private history: Array<{ annotations: Annotation[]; stepSequence: number }> = []
  private stepSequence = 0
  private tool: ScreenshotTool = null
  private color = '#e5484d'
  private lineWidth: LineWidth = 'medium'

  readonly text: TextInputOverlay
  readonly steps: StepBadges
  readonly beautify: BeautifyController

  constructor(private readonly port: EditorStagePort) {
    this.text = new TextInputOverlay({
      doc: port.doc,
      previewPanel: () => this.previewEl!,
      color: () => this.color,
      commitText: (at, value, color) => this.commit([...this.annotations, { tool: 'text', start: at, text: value, color }]),
    })
    this.steps = new StepBadges({
      doc: port.doc,
      inPreview: () => port.inPreview(),
      annotations: () => this.annotations,
      tool: () => this.tool,
      color: () => this.color,
      busy: () => port.busy(),
      capturedDpr: () => this.capturedDpr,
      canvasSize: () => (this.croppedCanvas ? { width: this.croppedCanvas.width, height: this.croppedCanvas.height } : null),
      displayCanvas: () => this.displayCanvas,
      contentOrigin: () => this.contentOrigin,
      canvasPoint: event => this.canvasPoint(event),
      stepSequence: () => this.stepSequence,
      commit: (annotations, stepSequence) => this.commit(annotations, stepSequence),
      redraw: annotations => this.renderEditor(annotations),
      registerDrawingCleanup: cleanup => port.registerDrawingCleanup(cleanup),
      stepToolButton: () => this.toolbarEl?.querySelector<HTMLElement>('[data-ann-ui="screenshot-tool-step"]') ?? null,
    })
    this.beautify = new BeautifyController({
      doc: port.doc,
      host: () => port.host(),
      inPreview: () => port.inPreview(),
      beautify: () => this.port.beautify(),
      ratioPresets: () => port.ratioPresets(),
      change: patch => port.changeBeautify(patch),
      reset: () => port.resetBeautify(),
      toolbarChanged: () => this.updateToolbar(),
      toolbar: () => this.toolbarEl,
      beautifyButton: () => this.toolbarEl?.querySelector<HTMLElement>('[data-ann-ui="screenshot-beautify"]') ?? null,
      previewNow: () => this.previewNow,
      syncPanel: settings => this.beautify.sync(settings),
    })
  }

  get editingCanvas(): HTMLCanvasElement | null {
    return this.croppedCanvas
  }

  get display(): HTMLCanvasElement | null {
    return this.displayCanvas
  }

  /** The notice bubble places itself by the toolbar's box. */
  get toolbarElement(): HTMLDivElement | null {
    return this.toolbarEl
  }

  /** One editing step: what undo goes back to is kept, and the picture is drawn anew. */
  commit(annotations: Annotation[], stepSequence = this.stepSequence): void {
    this.history.push({ annotations: this.annotations, stepSequence: this.stepSequence })
    this.annotations = annotations
    this.stepSequence = stepSequence
    this.renderEditor()
    this.updateToolbar()
  }

  /** Steps back one editing step: an annotation drawn or written, a badge put down, dragged or deleted, the count reset. */
  undo(): void {
    const previous = this.history.pop()
    if (!previous) return
    this.annotations = previous.annotations
    this.stepSequence = previous.stepSequence
    this.renderEditor()
    this.updateToolbar()
  }

  /** The capture becomes the editing picture; the page's ink arrives as one step of its own. */
  attach(capture: HTMLCanvasElement, dpr: number, inkAnnotations: Annotation[] = [], masks: ViewportRect[] = []): void {
    this.capturedDpr = dpr
    const editable = this.port.doc.createElement('canvas')
    editable.width = capture.width
    editable.height = capture.height
    this.croppedCanvas = editable
    // what the preview shows and copy sends is a canvas of its own, composed from the capture: it is never the capture
    // itself, which saving takes and every redraw starts over from
    this.displayCanvas = this.port.doc.createElement('canvas')
    this.annotations = []
    this.history = []
    this.stepSequence = 0
    this.steps.reset()
    this.masks = masks
    // the page's ink arrives as one step of its own: one undo takes it all off again (annotate.md §1.3)
    if (inkAnnotations.length > 0) this.commit(inkAnnotations)
    this.renderEditor()
  }

  private masks: ViewportRect[] = []

  /** Draws the capture with its annotations — or with a draft of them while the pointer is still drawing. */
  renderEditor(annotations: Annotation[] = this.annotations): void {
    if (!this.croppedCanvas || !this.port.source()) return
    renderScreenshot(this.croppedCanvas, this.port.source()!, this.masks, annotations, this.capturedDpr)
    this.refreshDisplay()
  }

  /**
   * Composes the picture the preview shows — the capture with the beautify frame (background, padding, corners, shadow, ratio)
   * and the watermark — which is exactly what copy and download send. The library entry keeps the capture without either
   * (screenshot.md §4.2–4.4). Starts over from the capture every time: the frame is never drawn on a frame.
   */
  refreshDisplay(): void {
    const content = this.croppedCanvas
    const display = this.displayCanvas
    if (!content || !display) return
    const paint = this.port.paintOptions()
    this.contentOrigin = paintScreenshotDisplay(display, content, {
      source: this.port.source() ?? content,
      beautify: this.port.beautify(),
      scale: paint.dpr,
      textSelection: paint.via === 'menu',
      watermark: paint.watermarkOn ? paint.watermark : undefined,
      watermarkImage: paint.watermarkImage,
    })
    this.layout()
  }

  /** Where the capture itself sits on screen: the selection it was cut from, or — an element was not on the screen as it
   * was captured — the room the window leaves, around where the element is. */
  private contentBox(): ViewportRect {
    const selection = this.port.selection()
    if (selection) return selection
    const view = this.port.doc.defaultView!
    const source = this.port.source()!
    const around = this.port.elementRect() ?? { x: view.innerWidth / 2, y: view.innerHeight / 2, width: 0, height: 0 }
    return previewBox(around, { width: source.width / this.capturedDpr, height: source.height / this.capturedDpr }, { width: view.innerWidth, height: view.innerHeight })
  }

  /** The preview on screen: the capture where it was selected, or the beautified picture grown around it. */
  private previewRect(): ViewportRect {
    const content = this.contentBox()
    const display = this.displayCanvas
    if (!this.port.beautify().enabled || !display) return content
    const view = this.port.doc.defaultView!
    return previewBox(content, { width: display.width / this.capturedDpr, height: display.height / this.capturedDpr }, { width: view.innerWidth, height: view.innerHeight })
  }

  open(): void {
    this.port.clearPickingUi()
    this.port.dimPageAgain()
    this.previewEl?.remove()
    this.toolbarEl?.remove()
    this.toolbar = null

    const display = this.displayCanvas!
    const panel = this.port.doc.createElement('div')
    panel.className = 'ann-shot-preview'
    panel.setAttribute(ROOT_ATTR, 'screenshot-preview')
    const size = this.port.doc.createElement('span')
    size.className = 'ann-shot-size'
    panel.append(size, display, this.steps.ring())
    display.addEventListener('pointerdown', this.onCanvasPointerDown)
    display.addEventListener('pointermove', this.onCanvasHover)
    this.port.host().appendChild(panel)
    this.previewEl = panel

    this.toolbar = createScreenshotToolbar(this.port.doc, this.toolbarActions())
    this.toolbarEl = this.toolbar.el
    this.port.host().appendChild(this.toolbarEl)
    this.toolbar.update(this.toolbarState())
    this.toolbarResizeObserver = new ResizeObserver(() => {
      this.positionToolbar()
      this.positionSizeLabel()
      this.beautify.position()
    })
    this.toolbarResizeObserver.observe(this.toolbarEl)
    this.refreshDisplay()
    requestAnimationFrame(() => {
      this.layout()
      // The editor takes the keyboard: focus starts on the toolbar, not on the
      // masked page behind it.
      this.toolbarEl?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
    })
  }

  /** Puts the preview, the toolbar and the beautify panel where the picture now is. */
  layout(): void {
    const preview = this.previewEl
    const display = this.displayCanvas
    if (!this.port.inPreview() || !preview || !display) return
    const rect = this.previewRect()
    this.previewNow = rect
    Object.assign(preview.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    const size = preview.querySelector<HTMLElement>('.ann-shot-size')
    if (size) size.textContent = `${display.width} x ${display.height}`
    this.positionToolbar()
    this.positionSizeLabel()
    this.beautify.position()
    this.steps.positionRing()
  }

  /** The size label goes where the toolbar is not: above the picture, else below it, else inside its corner. */
  private positionSizeLabel(): void {
    const size = this.previewEl?.querySelector<HTMLElement>('.ann-shot-size')
    const rect = this.previewNow
    if (!size || !rect) return
    const view = this.port.doc.defaultView!
    const toolbar = this.toolbarEl?.isConnected ? this.toolbarEl.getBoundingClientRect() : null
    const spot = placeSizeLabel(rect, { width: size.offsetWidth, height: size.offsetHeight }, toolbar, { width: view.innerWidth, height: view.innerHeight })
    size.style.top = spot === 'above' ? '' : spot === 'below' ? 'calc(100% + 6px)' : '6px'
    size.style.bottom = spot === 'above' ? '' : 'auto'
    size.style.left = spot === 'inside' ? '6px' : ''
  }

  private positionToolbar(): void {
    const toolbar = this.toolbarEl
    const rect = this.previewNow
    if (!toolbar || !toolbar.isConnected || !rect) return
    const view = this.port.doc.defaultView!
    const width = toolbar.getBoundingClientRect().width
    const height = toolbar.getBoundingClientRect().height
    const below = rect.y + rect.height + 8
    const top = below + height <= view.innerHeight - 8 ? below : Math.max(8, rect.y - height - 8)
    toolbar.style.left = `${Math.max(8, Math.min(view.innerWidth - width - 8, rect.x + rect.width - width))}px`
    toolbar.style.top = `${top}px`
  }

  /** The toolbar's whole input, recomputed on every update (RV-CAP-16): `null` is a state the settings take off the table. */
  private toolbarState() {
    return {
      tool: this.tool,
      color: this.color,
      lineWidth: this.lineWidth,
      maskCount: this.masks.length,
      anonymize: this.port.anonymize(),
      watermark: this.port.watermark(),
      canUndo: this.history.length > 0,
      nextStep: nextStepNumber(this.annotations, this.stepSequence),
      beautifyOpen: this.beautify.isOpen,
      busy: this.port.busy(),
      notice: this.port.notice(),
    }
  }

  private toolbarActions() {
    return {
      onTool: (tool: ScreenshotTool) => {
        this.tool = tool
        // the selection belongs to the step tool: another tool, or none, lets it go
        if (tool !== 'step') this.steps.clearSelection()
        if (this.displayCanvas) this.displayCanvas.style.cursor = ''
        this.steps.positionRing()
        this.updateToolbar()
      },
      onColor: (color: string) => {
        this.color = color
        this.updateToolbar()
      },
      onLineWidth: (width: LineWidth) => {
        this.lineWidth = width
        this.updateToolbar()
      },
      onRemoveMask: (index: number) => {
        this.masks.splice(index, 1)
        this.renderEditor()
        this.updateToolbar()
      },
      onUndo: () => this.undo(),
      onResetSteps: () => this.steps.resetCount(),
      onBeautify: () => this.beautify.toggle(),
      onCopy: () => this.port.copy(),
      onDownload: () => this.port.download(),
      onCancel: () => this.port.exit(),
      onSave: () => this.port.save(),
    }
  }

  updateToolbar(): void {
    this.toolbar?.update(this.toolbarState())
  }

  /** The editor's surfaces and listeners go; the session ends. */
  close(): void {
    this.toolbarResizeObserver?.disconnect()
    this.toolbarResizeObserver = null
    this.toolbar = null
    this.toolbarEl?.remove()
    this.toolbarEl = null
    this.previewEl?.remove()
    this.previewEl = null
    this.displayCanvas = null
    this.croppedCanvas = null
  }

  /** A pointer position as a point of the capture: the preview may show it with padding around it, and scaled down. */
  canvasPoint(e: PointerEvent | { clientX: number; clientY: number }): Point {
    const display = this.displayCanvas!
    const content = this.croppedCanvas!
    const rect = display.getBoundingClientRect()
    const x = ((e.clientX - rect.left) * display.width) / (rect.width || 1) - this.contentOrigin.x
    const y = ((e.clientY - rect.top) * display.height) / (rect.height || 1) - this.contentOrigin.y
    return { x: Math.max(0, Math.min(content.width, x)), y: Math.max(0, Math.min(content.height, y)) }
  }

  /** Over a badge the step tool can drag, the pointer says so. */
  private readonly onCanvasHover = (e: PointerEvent): void => {
    if (!this.displayCanvas) return
    this.displayCanvas.style.cursor = this.steps.hoverCursor(e)
  }

  private readonly onCanvasPointerDown = (e: PointerEvent): void => {
    if (!this.port.inPreview() || this.port.busy() || !this.tool || !this.croppedCanvas) return
    e.preventDefault()
    e.stopPropagation()
    if (this.tool === 'text') {
      this.text.open(this.canvasPoint(e), localPoint(this.displayCanvas!, e))
      return
    }
    if (this.tool === 'step') {
      this.steps.press(e)
      return
    }
    const start = this.canvasPoint(e)
    const tool = this.tool
    const draft: Annotation = isLineTool(tool)
      ? { tool, start, end: start, points: [start], color: this.color, width: this.lineWidth }
      : { tool, start, end: start, points: [start], color: this.color }
    // the pen and the highlighter go where the pointer goes, taking every sample the frame folded
    // into the move; the line goes straight to it, or with Shift held to the nearest horizontal,
    // vertical or 45° diagonal (screenshot.md §1.1)
    const follow = (ev: PointerEvent) => {
      if (draft.tool === 'pen' || draft.tool === 'highlighter') {
        for (const sample of pointerSamples(ev)) {
          const point = this.canvasPoint(sample)
          const last = draft.points[draft.points.length - 1]!
          if (point.x === last.x && point.y === last.y) continue
          draft.points.push(point)
          draft.end = point
        }
      } else {
        const point = this.canvasPoint(ev)
        draft.end = draft.tool === 'line' && ev.shiftKey ? snapLine(start, point) : point
      }
    }
    const move = (ev: PointerEvent) => {
      follow(ev)
      this.renderEditor([...this.annotations, draft])
    }
    const up = (ev: PointerEvent) => {
      cleanup()
      follow(ev)
      if (Math.hypot(draft.end.x - start.x, draft.end.y - start.y) < 3 && draft.points.length < 3) {
        this.renderEditor()
        return
      }
      this.commit([...this.annotations, draft])
    }
    const cleanup = () => {
      this.port.doc.removeEventListener('pointermove', move)
      this.port.doc.removeEventListener('pointerup', up)
      this.port.doc.removeEventListener('pointercancel', cleanup)
      this.port.registerDrawingCleanup(null)
    }
    this.port.registerDrawingCleanup(cleanup)
    this.port.doc.addEventListener('pointermove', move)
    this.port.doc.addEventListener('pointerup', up)
    this.port.doc.addEventListener('pointercancel', cleanup)
  }
}
