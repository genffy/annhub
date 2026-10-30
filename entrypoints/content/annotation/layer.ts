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
import { uiText } from '../../../utils/ui-text'
import {
  ANNOTATION_COLORS,
  clampStep,
  drawAnnotation,
  isLineTool,
  nextStepNumber,
  stepAt,
  stepNumbers,
  stepRadius,
  type Annotation,
  type LineWidth,
  type Point,
  type ScreenshotTool,
} from '../screenshot/editor'
import type { UiTextKey } from '../../../utils/ui-text'
import { inkToEditorAnnotations, inkToViewport, snapshotInk, type InkStroke } from './ink'

const ROOT_ATTR = 'data-ann-ui'
const ROOT_VALUE = 'annotation-layer'

/** The erase delays of 自动擦除 (annotate.md §1.2, D-39): off by default, two fixed choices. */
export type AutoErase = 'off' | '3s' | '8s'
const AUTO_ERASE_MS: Record<Exclude<AutoErase, 'off'>, number> = { '3s': 3000, '8s': 8000 }

type InkTool = 'pointer' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'text' | 'step'

/** Simple inline icons (lucide paths) — the toolbar buttons are plain DOM, not a React root. */
const ICONS: Record<string, string> = {
  pointer: '<path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/>',
  pen: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  line: '<path d="M22 2 2 22"/>',
  arrow: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  rectangle: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  ellipse: '<circle cx="12" cy="12" r="10"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  step: '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  clear: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  screenshot: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  exit: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
}

const TOOL_KEYS: ReadonlyArray<{ tool: InkTool; labelKey: string }> = [
  { tool: 'pointer', labelKey: 'annotate.tool.pointer' },
  { tool: 'pen', labelKey: 'shot.tool.pen' },
  { tool: 'highlighter', labelKey: 'shot.tool.highlighter' },
  { tool: 'line', labelKey: 'shot.tool.line' },
  { tool: 'arrow', labelKey: 'shot.tool.arrow' },
  { tool: 'rectangle', labelKey: 'shot.tool.rect' },
  { tool: 'ellipse', labelKey: 'shot.tool.ellipse' },
  { tool: 'text', labelKey: 'shot.tool.text' },
  { tool: 'step', labelKey: 'shot.tool.step' },
]

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
  private readonly doc: Document
  private readonly options: AnnotationLayerOptions
  private readonly host: HTMLDivElement
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private toolbarEl: HTMLDivElement | null = null
  private noticeEl: HTMLDivElement | null = null
  private noticeTimer: number | null = null
  private tool: InkTool = 'pointer'
  private color = ANNOTATION_COLORS[0]!.value
  private lineWidth: LineWidth = 'medium'
  private autoErase: AutoErase = 'off'
  private strokes: InkStroke[] = []
  /** What undo goes back to, one entry per step: the strokes and the step-badge group before it (annotate.md §1.2). */
  private history: Array<{ strokes: InkStroke[]; stepSequence: number }> = []
  /** Which 重置计数 group the next badge counts in; 清空 starts the next one. */
  private stepSequence = 0
  private draft: InkStroke | null = null
  /** The pointer gesture in progress (a stroke or a badge drag), ended by exit() if the layer closes mid-drag. */
  private endGesture: (() => void) | null = null
  private selectedStep: InkStroke | null = null
  private stepRingEl: HTMLDivElement | null = null
  private textInput: HTMLTextAreaElement | null = null
  private textAt: Point = { x: 0, y: 0 }
  /** The stroke ids and their erase timers; erased ink leaves the page and the undo history without a step. */
  private eraseTimers = new Map<string, number>()
  private hiddenForScreenshot = false
  /** 录制中：the toolbar would be filmed, so it is gone and the single keys run the tools (annotate.md §3.1). */
  private recordingMode = false
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
    style.textContent = `
      /* The host rides the top layer via popover=manual; the UA stylesheet for [popover]
         shrinks it to fit-content with an auto margin and a Canvas background, so every
         one of those is overridden back to a full, transparent, click-through viewport. */
      [${ROOT_ATTR}="${ROOT_VALUE}"] { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; border: 0; padding: 0; background: transparent; overflow: visible; z-index: 2147483647; pointer-events: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-canvas { position: absolute; inset: 0; pointer-events: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"].ann-annot-drawing .ann-annot-canvas { pointer-events: auto; cursor: crosshair; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 2px; max-height: calc(100vh - 16px); overflow-y: auto; box-sizing: border-box; padding: 5px; border: 1px solid var(--annov-border, #d7dce1); border-radius: 6px; background: var(--annov-surface, #fff); box-shadow: var(--annov-shadow, 0 6px 20px rgba(0,0,0,.18)); pointer-events: auto; color: var(--annov-text, #252b31); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button:hover, [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button.ann-annot-active { background: var(--annov-tool-hover-bg, #e7f1f0); color: var(--annov-tool-hover-text, #126f65); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button:disabled { opacity: .35; cursor: default; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-divider { width: 22px; height: 1px; margin: 3px 0; background: var(--annov-border, #d7dce1); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-swatch { width: 17px !important; height: 17px !important; margin: 2px 0; border: 1px solid var(--annov-input-border, #aeb6bd) !important; border-radius: 50% !important; background: var(--swatch) !important; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-swatch.ann-annot-active { outline: 2px solid #4c91ff; outline-offset: 2px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-widths { display: flex; flex-direction: column; align-items: center; gap: 2px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-widths button { width: 26px !important; height: 20px !important; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-widths i { display: block; border-radius: 50%; background: currentColor; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-erase { width: 100%; margin: 2px 0; padding: 2px; border: 1px solid var(--annov-input-border, #aeb6bd); border-radius: 4px; background: transparent; color: inherit; font: 11px/1.3 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-notice { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 32px); box-sizing: border-box; padding: 7px 12px; border-radius: 4px; background: #252b31; color: #fff; font: 13px/1.4 -apple-system, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-text-input { position: absolute; min-width: 110px; min-height: 32px; padding: 4px; box-sizing: border-box; border: 1px solid #4c91ff; background: var(--annov-surface, #fff); color: var(--annov-text, #20252b); font: 16px/1.3 -apple-system, sans-serif; resize: both; pointer-events: auto; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-step-ring { position: absolute; box-sizing: border-box; border: 2px solid #4c91ff; border-radius: 50%; pointer-events: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-step-ring button { position: absolute; top: -10px; right: -10px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: #4c91ff; color: #fff; font: 600 15px/1 -apple-system, sans-serif; cursor: pointer; pointer-events: auto; }
    `
    this.host.appendChild(style)

    const canvas = this.doc.createElement('canvas')
    canvas.className = 'ann-annot-canvas'
    canvas.setAttribute(ROOT_ATTR, 'annotation-canvas')
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.host.appendChild(canvas)

    this.toolbarEl = this.buildToolbar()
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
    this.ensureStepRing()

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

  private scale(): number {
    return this.doc.defaultView?.devicePixelRatio || 1
  }

  /** The strokes as editor annotations in this canvas's pixel coordinates: page ink moves with the scroll, pinned ink stays. */
  private asAnnotations(strokes: readonly InkStroke[]): Annotation[] {
    const view = this.doc.defaultView!
    const onScreen = inkToViewport(strokes, view.scrollX, view.scrollY)
    return inkToEditorAnnotations(onScreen, { x: 0, y: 0, width: view.innerWidth, height: view.innerHeight }, this.scale())
  }

  private paint(): void {
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const annotations = this.asAnnotations([...this.strokes, ...(this.draft ? [this.draft] : [])])
    for (const annotation of annotations) drawAnnotation(ctx, annotation, this.scale(), stepNumbers(annotations), canvas.width)
    this.positionStepRing()
  }

  // ── toolbar ───────────────────────────────────────────────────────

  private icon(name: string): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`
  }

  private buildToolbar(): HTMLDivElement {
    const bar = this.doc.createElement('div')
    bar.className = 'ann-annot-toolbar'
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-orientation', 'vertical')
    bar.setAttribute('aria-label', uiText('annotate.toolbar'))
    bar.setAttribute(ROOT_ATTR, 'annotation-toolbar')

    for (const { tool, labelKey } of TOOL_KEYS) {
      const button = this.doc.createElement('button')
      button.type = 'button'
      button.setAttribute('data-ann-ui', `annotation-tool-${tool}`)
      button.setAttribute('aria-label', uiText(labelKey as UiTextKey))
      button.title = uiText(labelKey as UiTextKey)
      button.innerHTML = this.icon(tool)
      button.addEventListener('click', event => {
        if (!isUserInput(event)) return
        this.setTool(tool)
      })
      bar.appendChild(button)
    }

    const divider = this.doc.createElement('div')
    divider.className = 'ann-annot-divider'
    bar.appendChild(divider)

    for (const { value, name } of ANNOTATION_COLORS) {
      const swatch = this.doc.createElement('button')
      swatch.type = 'button'
      swatch.className = 'ann-annot-swatch'
      swatch.setAttribute('data-ann-ui', `annotation-color-${name}`)
      swatch.style.setProperty('--swatch', value)
      const label = uiText(`shot.color.${name}` as UiTextKey)
      swatch.setAttribute('aria-label', label)
      swatch.title = label
      swatch.addEventListener('click', event => {
        if (!isUserInput(event)) return
        this.color = value
        this.syncToolbar()
        this.applyToolCursor()
        this.paint()
      })
      bar.appendChild(swatch)
    }

    const widths = this.doc.createElement('div')
    widths.className = 'ann-annot-widths'
    widths.setAttribute('data-ann-ui', 'annotation-widths')
    widths.setAttribute('role', 'group')
    widths.setAttribute('aria-label', uiText('shot.lineWidth'))
    for (const width of ['thin', 'medium', 'thick'] as const) {
      const button = this.doc.createElement('button')
      button.type = 'button'
      button.setAttribute('data-ann-ui', `annotation-width-${width}`)
      button.setAttribute('aria-label', uiText(`shot.lineWidth.${width}` as UiTextKey))
      button.title = uiText(`shot.lineWidth.${width}` as UiTextKey)
      const dot = this.doc.createElement('i')
      dot.style.width = `${{ thin: 4, medium: 7, thick: 11 }[width]}px`
      dot.style.height = dot.style.width
      button.appendChild(dot)
      button.addEventListener('click', event => {
        if (!isUserInput(event)) return
        this.lineWidth = width
        this.syncToolbar()
      })
      widths.appendChild(button)
    }
    bar.appendChild(widths)

    const erase = this.doc.createElement('select')
    erase.className = 'ann-annot-erase'
    erase.setAttribute('data-ann-ui', 'annotation-auto-erase')
    erase.setAttribute('aria-label', uiText('annotate.autoerase'))
    for (const value of ['off', '3s', '8s'] as const) {
      const option = this.doc.createElement('option')
      option.value = value
      option.textContent = uiText(`annotate.autoerase.${value}` as UiTextKey)
      erase.appendChild(option)
    }
    erase.value = this.autoErase
    erase.addEventListener('change', () => {
      this.autoErase = erase.value as AutoErase
    })
    bar.appendChild(erase)

    const divider2 = this.doc.createElement('div')
    divider2.className = 'ann-annot-divider'
    bar.appendChild(divider2)

    const action = (name: string, labelKey: string, run: () => void, attribute: string): HTMLButtonElement => {
      const button = this.doc.createElement('button')
      button.type = 'button'
      button.setAttribute('data-ann-ui', attribute)
      button.setAttribute('aria-label', uiText(labelKey as UiTextKey))
      button.title = uiText(labelKey as UiTextKey)
      button.innerHTML = this.icon(name)
      button.addEventListener('click', event => {
        if (!isUserInput(event)) return
        run()
      })
      bar.appendChild(button)
      return button
    }
    action('undo', 'annotate.undo', () => this.undo(), 'annotation-undo')
    action('clear', 'annotate.clear', () => this.clear(), 'annotation-clear')
    action('screenshot', 'annotate.screenshot', () => this.startScreenshot(), 'annotation-screenshot')
    action('exit', 'annotate.exit', () => exitAnnotationLayer(), 'annotation-exit')

    this.syncToolbarInto(bar)
    return bar
  }

  private syncToolbar(): void {
    if (this.toolbarEl) this.syncToolbarInto(this.toolbarEl)
  }

  private syncToolbarInto(bar: HTMLDivElement): void {
    for (const { tool } of TOOL_KEYS) {
      bar.querySelector(`[data-ann-ui="annotation-tool-${tool}"]`)?.classList.toggle('ann-annot-active', this.tool === tool)
      const button = bar.querySelector<HTMLButtonElement>(`[data-ann-ui="annotation-tool-${tool}"]`)
      if (button) button.setAttribute('aria-pressed', String(this.tool === tool))
    }
    for (const { value, name } of ANNOTATION_COLORS) {
      bar.querySelector(`[data-ann-ui="annotation-color-${name}"]`)?.classList.toggle('ann-annot-active', this.color === value)
    }
    const widths = bar.querySelector('[data-ann-ui="annotation-widths"]')
    if (widths instanceof HTMLElement) widths.style.display = isLineTool(this.tool as ScreenshotTool) ? '' : 'none'
    for (const width of ['thin', 'medium', 'thick'] as const) {
      bar.querySelector(`[data-ann-ui="annotation-width-${width}"]`)?.classList.toggle('ann-annot-active', this.lineWidth === width)
    }
  }

  private setTool(tool: InkTool): void {
    if (this.tool === tool) return
    this.commitText()
    this.tool = tool
    this.selectedStep = null
    this.host.classList.toggle('ann-annot-drawing', tool !== 'pointer')
    this.syncToolbar()
    this.applyToolCursor()
    this.paint()
  }

  /** 录制中 the toolbar is off the page, so the pointer itself says which tool and colour are on (annotate.md §3.1). */
  private applyToolCursor(): void {
    if (!this.canvas) return
    if (!this.recordingMode || this.tool === 'pointer') {
      this.canvas.style.cursor = ''
      return
    }
    const color = ANNOTATION_COLORS.find(entry => entry.value === this.color)?.value ?? '#e5484d'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M12 3v18M3 12h18" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/></svg>`
    this.canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`
  }

  /** 开始录制时工具栏收起，停止后回来；录制中打开的批注层一开始就没有工具栏 (annotate.md §3.1, D-48)。 */
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
        this.commitText()
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
  private isPinnedPoint(clientX: number, clientY: number): boolean {
    const view = this.doc.defaultView!
    const stack = this.doc.elementsFromPoint(clientX, clientY)
    const target = stack.find(element => !element.closest('[data-ann-ui]'))
    if (!target) return false
    for (let node: Element | null = target; node && node !== this.doc.body; node = node.parentElement) {
      const style = view.getComputedStyle(node)
      if (style.position === 'fixed') return true
      if (style.position === 'sticky' && node.getBoundingClientRect().top <= 1) return true
    }
    return false
  }

  private readonly onPointerDown = (rawEvent: Event): void => {
    const event = rawEvent as PointerEvent
    if (this.tool === 'pointer' || this.textInput) return
    if (!isUserInput(event) || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const start = this.canvasPoint(event)
    if (this.tool === 'text') {
      this.openTextInput(start)
      return
    }
    if (this.tool === 'step') {
      this.pressStep(event)
      return
    }
    const id = this.newStrokeId()
    const draft: InkStroke = { id, tool: this.tool as InkStroke['tool'], points: [start, start], color: this.color }
    if (isLineTool(this.tool)) draft.width = this.lineWidth
    if (this.isPinnedPoint(event.clientX, event.clientY)) draft.pinned = true
    this.draft = draft
    const follow = (ev: PointerEvent): void => {
      const point = this.canvasPoint(ev)
      draft.points[1] = draft.tool === 'line' && ev.shiftKey ? snapLine(start, point) : point
      if (draft.tool === 'pen' || draft.tool === 'highlighter') draft.points.push(point)
      this.paint()
    }
    const move = (ev: PointerEvent): void => {
      if (!isUserInput(ev)) return
      follow(ev)
    }
    const up = (ev: PointerEvent): void => {
      if (!isUserInput(ev)) return
      cleanup()
      follow(ev)
      this.draft = null
      // a click without a drag draws nothing, as the screenshot editor's strokes do (screenshot.md §1.1)
      const moved = Math.hypot(draft.points[draft.points.length - 1]!.x - start.x, draft.points[draft.points.length - 1]!.y - start.y) >= 3 || draft.points.length > 3
      if (!moved) {
        this.paint()
        return
      }
      this.commit([...this.strokes, draft])
    }
    const cleanup = (): void => {
      this.doc.removeEventListener('pointermove', move, true)
      this.doc.removeEventListener('pointerup', up, true)
      this.doc.removeEventListener('pointercancel', cleanup, true)
      this.draft = null
      this.endGesture = null
    }
    this.endGesture = cleanup
    this.doc.addEventListener('pointermove', move, true)
    this.doc.addEventListener('pointerup', up, true)
    this.doc.addEventListener('pointercancel', cleanup, true)
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
    if (!pressedStroke && this.isPinnedPoint(event.clientX, event.clientY)) badge.pinned = true
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
    // the keys belong to the recording-time layer only; a chord belongs to the browser (Ctrl+R reloads, Cmd+P prints)
    if (!this.recordingMode || this.hiddenForScreenshot) return false
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    const active = this.doc.activeElement
    if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return false
    const key = event.key
    const lower = key.toLowerCase()
    const tools: Record<string, InkTool> = { p: 'pen', h: 'highlighter', l: 'line', a: 'arrow', r: 'rectangle', o: 'ellipse', t: 'text', n: 'step', v: 'pointer' }
    const tool = tools[lower]
    if (tool) {
      this.setTool(tool)
      return true
    }
    if (key >= '1' && key <= '5') {
      const swatch = ANNOTATION_COLORS[Number(key) - 1]
      if (!swatch) return false
      this.color = swatch.value
      this.syncToolbar()
      this.applyToolCursor()
      this.paint()
      return true
    }
    if (key === '[' || key === ']') {
      const widths: LineWidth[] = ['thin', 'medium', 'thick']
      const index = widths.indexOf(this.lineWidth)
      this.lineWidth = widths[Math.max(0, Math.min(widths.length - 1, index + (key === ']' ? 1 : -1)))]!
      this.syncToolbar()
      return true
    }
    if (lower === 'z') {
      this.undo()
      return true
    }
    if (lower === 'e') {
      this.clear()
      return true
    }
    if (key === 'Escape') {
      if (this.textInput) {
        this.commitText()
        return true
      }
      exitAnnotationLayer()
      return true
    }
    return false
  }

  // ── text tool ─────────────────────────────────────────────────────

  private openTextInput(at: Point): void {
    this.commitText()
    const view = this.doc.defaultView!
    const input = this.doc.createElement('textarea')
    input.className = 'ann-annot-text-input'
    input.setAttribute('aria-label', uiText('shot.textInput.placeholder'))
    input.placeholder = uiText('shot.textInput.placeholder')
    input.style.width = `${Math.min(210, view.innerWidth - 24)}px`
    input.style.left = `${Math.max(8, Math.min(at.x, view.innerWidth - Math.min(210, view.innerWidth - 24) - 8))}px`
    input.style.top = `${Math.max(8, Math.min(at.y, view.innerHeight - 54))}px`
    input.style.color = this.color
    input.addEventListener('keydown', event => {
      event.stopPropagation()
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        this.commitText()
      }
    })
    // clicking away closes the box like Enter and Esc do; a replaced box has nothing left to say
    input.addEventListener('blur', () => {
      if (this.textInput === input) this.commitText()
    })
    this.host.appendChild(input)
    this.textInput = input
    // the text belongs to the page where its box was opened, like every stroke; the box itself stays on the screen
    this.textAt = { x: at.x + view.scrollX, y: at.y + view.scrollY }
    input.focus()
  }

  /** Every close path — Enter, Esc, clicking away, another box — ends here, so typed text is never lost. */
  private commitText(): void {
    const input = this.textInput
    if (!input) return
    this.textInput = null
    const value = input.value.trim()
    input.remove()
    if (!value) return
    this.commit([...this.strokes, { id: this.newStrokeId(), tool: 'text', points: [this.textAt], text: value, color: this.color }])
  }

  // ── steps, undo, clear, auto-erase ────────────────────────────────

  private newStrokeId(): string {
    return `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** One step: a stroke drawn or written, a badge put down, dragged or deleted, the count reset, the ink cleared. */
  private commit(strokes: InkStroke[], stepSequence = this.stepSequence): void {
    this.history.push({ strokes: this.strokes, stepSequence: this.stepSequence })
    this.strokes = strokes
    this.stepSequence = stepSequence
    this.scheduleAutoErase(strokes)
    this.paint()
  }

  private undo(): void {
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
  private clear(): void {
    if (this.strokes.length === 0 && nextStepNumber(this.asAnnotations(this.strokes), this.stepSequence) === 1) return
    for (const timer of this.eraseTimers.values()) window.clearTimeout(timer)
    this.eraseTimers.clear()
    this.commit([], this.stepSequence + 1)
  }

  private deleteSelectedStep(): void {
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
    this.commitText()
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
  private positionStepRing(): void {
    const ring = this.stepRingEl
    if (!ring) return
    const step = this.selectedStep && this.strokes.includes(this.selectedStep) && this.selectedStep.tool === 'step' ? this.selectedStep : null
    if (!step) {
      ring.style.display = 'none'
      return
    }
    const scale = this.scale()
    const view = this.doc.defaultView!
    const radius = stepRadius(scale)
    const x = (step.points[0]!.x - view.scrollX) * scale
    const y = (step.points[0]!.y - view.scrollY) * scale
    Object.assign(ring.style, { display: 'block', left: `${x - radius}px`, top: `${y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px` })
    const sameGroup = this.strokes.filter(stroke => stroke.tool === 'step' && stroke.sequence === step.sequence)
    const number = sameGroup.indexOf(step) + 1
    const remove = ring.querySelector('button')!
    const label = uiText('shot.step.delete', { number })
    remove.title = label
    remove.setAttribute('aria-label', label)
  }

  private ensureStepRing(): void {
    if (this.stepRingEl) return
    const ring = this.doc.createElement('div')
    ring.className = 'ann-annot-step-ring'
    ring.setAttribute(ROOT_ATTR, 'annotation-step-selection')
    ring.style.display = 'none'
    const remove = this.doc.createElement('button')
    remove.type = 'button'
    remove.textContent = '×'
    remove.setAttribute(ROOT_ATTR, 'annotation-step-delete')
    remove.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.deleteSelectedStep()
    })
    ring.appendChild(remove)
    this.host.appendChild(ring)
    this.stepRingEl = ring
  }

  exit(): void {
    if (this.exited) return
    this.exited = true
    this.endGesture?.()
    this.commitText()
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
