/**
 * Screenshot capture UI chain — docs/product/screenshot.md.
 * Plain DOM (no React) for the session shell and its toolbar (RV-CAP-16).
 * One session element per trigger (idempotent enter()).
 *
 * Region mode: drag on the page → hide session (capture must not include it)
 * → CAPTURE_VISIBLE_TAB → crop → in-place editor.
 * Element mode: a click without drag rasterizes the clicked element via an
 * offscreen clone (can exceed the viewport); the block capsule's "截图"
 * jumps straight here with the block as target.
 * Anonymize ('A', default from settings): identity elements are covered
 * with gray placeholders before the shot (region: live overlays, element:
 * clone swap). Confirm saves a screenshot entry; copy and download are
 * independent of it and keep the session open.
 *
 * The session lives in the page's DOM, so the page's scripts can dispatch
 * events at it. Only the user's own pointer and keyboard input
 * (`isUserInput`) moves it along; a script cannot drag a region or click an
 * element for the user, which is what stands between a page and the
 * privileged capture and fetch calls behind them.
 */

import MessageUtils from '../../../utils/message'
import { uiText, type UiTextKey } from '../ui-text'
import { renderHintBar } from './hint-bar'
import { newEntryId } from '../../../core/assets'
import { resolvePermalink } from '../page-meta'
import { isUserInput } from '../user-input'
import { sessionStyles } from './session-styles'
import { ROOT_ATTR, ROOT_VALUE } from './session-roots'
import { renderRatioBar } from './ratio-bar'
import { pageElementsFromPoint } from './page-elements'
import { createNoticeBubble, type NoticeBubble } from './notice-bubble'
import { pointerSamples } from '../pointer-samples'
import type { CaptureVia } from '../../../types/messages'
import type { ViewportRect } from './crop'
import { computeCropSource, CropError, intersectRects } from './crop'
import { ALL_IDENTITY_PARTS, detectIdentityRects, type IdentityParts } from './detect'
import { applyViewportAnonymization } from './anonymize'
import { captureElement } from './element-capture'
import { requestCapture } from './capture-rate'
import { candidateRect, sectionIntervalRect } from '../blocks'
import type { BlockCandidate } from '../blocks'
import { createScreenshotToolbar, type ScreenshotToolbar } from './toolbar'
import { TextInputOverlay } from './text-input'
import { StepBadges } from './step-badges'
import { BeautifyController } from './beautify-controller'
import { Destinations } from './destinations'
import { LastFrame } from './last-frame'
import { ConfirmBox } from './confirm-box'
import { HoverPicker } from './hover-picker'
import { Photographer } from './photographer'
import { isLineTool, nextStepNumber, renderScreenshot, snapLine, type Annotation, type LineWidth, type Point, type ScreenshotTool } from './editor'
import {
  applyBeautifyChange,
  constrainToRatio,
  constrainToRatioValue,
  decodeWatermarkImage,
  placeSizeLabel,
  previewBox,
  ratioOf,
  type WatermarkImage,
} from '../../../utils/screenshot-output'
import { DEFAULT_BEAUTIFY, type BeautifySettings } from '../../../core/screenshot-options'
import { paintScreenshotDisplay } from './display'
import { buildSelector, collectEdges, expandByMargin, fitsInViewport, nudgeBox, snapPoint } from './selection'
import { permalinkForRegion } from './permalink'
import { Stitcher, type StitchFailure } from './stitcher'
import { inkToEditorAnnotations, inkToViewport, type InkStroke } from '../annotation/ink'
import type { ExtensionSettings } from '../../../core/settings'

let activeSession: ScreenshotSession | null = null

export interface EnterScreenshotOptions {
  via?: CaptureVia
  /** The block capsule's target: skip selection, straight to element capture. */
  element?: HTMLElement
  /** A section target's interval inside `element` (RV-CAP-13): the frame is the interval's union rect and the clone keeps only its children. */
  section?: BlockCandidate['range']
  /** A pending frame to confirm (Enter) or adjust, e.g. the selection menu's screenshot path ). */
  initialRect?: ViewportRect
  /** Page-annotation ink at capture time (annotate.md §1.3): drawn back onto the capture as ordinary annotations. */
  ink?: InkStroke[]
  /** The annotation layer waits for the session to end so it can come back with its ink. */
  onExit?: () => void
}

export function enterScreenshotMode(options: EnterScreenshotOptions = {}): void {
  // Idempotent: a second trigger replaces the pending session. The replaced one hands its ink and its exit callback
  // over, so an annotation layer waiting on this session stays hidden until the session that replaces it ends.
  const previous = activeSession
  const ink = options.ink ?? previous?.pendingInk ?? null
  const onExit = options.onExit ?? previous?.onSessionExit ?? null
  if (previous) previous.onSessionExit = null
  previous?.exit()
  activeSession = new ScreenshotSession(document, options.via ?? 'shortcut')
  activeSession.pendingInk = ink
  activeSession.onSessionExit = onExit
  activeSession.begin()
  if (options.element) void activeSession.captureElementTarget(options.element, options.section)
  else if (options.initialRect) activeSession.beginWithInitialRect(options.initialRect)
}

export function exitScreenshotMode(): void {
  activeSession?.exit()
  activeSession = null
}

export function isScreenshotSessionActive(): boolean {
  return activeSession !== null
}

/**
 * A notice for a session that is already open, from a trigger that must not
 * disturb it (annotate.md §1.1: an annotation request during a screenshot
 * session points at the session instead of opening anything). True when a
 * session was there to hear it.
 */
export function notifyScreenshotSession(message: string): boolean {
  if (!activeSession) return false
  activeSession.showExternalNotice(message)
  return true
}

/** Page actions killed during the capture phase (RV-CAP-05). */
const SWALLOWED_EVENT_TYPES = ['click', 'dblclick', 'auxclick', 'contextmenu', 'submit'] as const

class ScreenshotSession {
  private readonly entryId = newEntryId()
  private readonly doc: Document
  private readonly host: HTMLDivElement
  private hintEl: HTMLDivElement | null = null
  private state: 'selecting' | 'confirming' | 'capturing' | 'preview' | 'error' | 'done' = 'selecting'
  private selection: ViewportRect | null = null
  private selectionEl: HTMLDivElement | null = null
  private previewEl: HTMLElement | null = null
  private overlayEl: HTMLDivElement | null = null
  private toolbarEl: HTMLDivElement | null = null
  private toolbar: ScreenshotToolbar | null = null
  private toolbarResizeObserver: ResizeObserver | null = null
  private sourceCanvas: HTMLCanvasElement | null = null
  private elementRect: ViewportRect | null = null
  /** Permalink of what the frame covered, resolved when the shot was taken. A live timeline can recycle the post while the user annotates. */
  private capturedSourceUrl: string | null = null
  private maskBoxes: ViewportRect[] = []
  private annotations: Annotation[] = []
  /** What undo goes back to, one entry per editing step: the annotations, and the sequence badges counted in, before it (screenshot.md §1.1). */
  private history: Array<{ annotations: Annotation[]; stepSequence: number }> = []
  /** The sequence the next badge counts in; 重置计数 starts the next one. */
  private stepSequence = 0
  /** The badge the step tool last pressed: the ring and its × mark it, and Delete or Backspace removes it. */
  private readonly steps: StepBadges
  /** A badge is under the pointer, being put down or dragged; the ring waits until it is let go. */
  private tool: ScreenshotTool = null
  private color = '#e5484d'
  /** What the pen, the line and the highlighter draw at; like the colour, every screenshot starts from the default. */
  private lineWidth: LineWidth = 'medium'
  private busy = false
  private exited = false
  private notice: { message: string; error: boolean } | undefined
  /** The success bubble above the toolbar; errors are the toolbar's own notice row. */
  private readonly bubble: NoticeBubble
  private readonly textOverlay: TextInputOverlay
  /** Where on the capture the open text box was clicked. */
  private selectionCleanup: (() => void) | null = null
  private drawingCleanup: (() => void) | null = null
  private croppedCanvas: HTMLCanvasElement | null = null
  private capturedDpr = 1
  private anonymizeOn = true
  /** Which identity kinds anonymization covers, from settings (screenshot.md §3). */
  private anonymizeParts: IdentityParts = ALL_IDENTITY_PARTS
  /** The user pressed `A` before the settings arrived: their choice stands. */
  private anonymizeToggled = false
  /** Settings arrive after the session starts; every capture waits for them. */
  private settingsLoaded: Promise<void> = Promise.resolve()
  private via: CaptureVia
  private settings: ExtensionSettings | null = null
  private ratio = 'free'
  private ratioBarEl: HTMLDivElement | null = null
  private watermarkOn = true
  /** The watermark picture, decoded once when the settings arrive so that drawing it is synchronous; `null` without one, or when the browser could not read it. */
  private watermarkImage: WatermarkImage | null = null
  private beautify: BeautifySettings = { ...DEFAULT_BEAUTIFY }
  private readonly beautifyPanel: BeautifyController
  private readonly destinations: Destinations
  /** What the preview shows, and what copy and download send: the capture composed with beautify and watermark. Always a canvas of its own. */
  private displayCanvas: HTMLCanvasElement | null = null
  /** where the capture sits inside the display canvas (the padding of a beautified picture) */
  private contentOrigin: Point = { x: 0, y: 0 }
  /** the preview on screen as last laid out */
  private previewNow: ViewportRect | null = null
  // precise selection and repeatable frames (screenshot.md §1.2, §1.4)
  private readonly hover: HoverPicker
  private readonly photographer: Photographer
  private readonly confirmBox: ConfirmBox
  private frameLabel = ''
  private shiftRatio: number | null = null
  private readonly lastFrame = new LastFrame()
  /** The frame as the memory offered it: confirmed untouched, it is still the element's frame and not a place (screenshot.md §1.4). */
  /** The capture came out of the scroll stitcher (screenshot.md §1.5): the frame is stitched, not dragged or picked. */
  private stitched = false
  private stitcher: Stitcher | null = null
  /** Page-annotation ink handed over with the trigger (annotate.md §1.3); consumed when the capture is in. */
  pendingInk: InkStroke[] | null = null
  /** The annotation layer's callback, run once when this session ends for any reason. */
  onSessionExit: (() => void) | null = null
  private readonly onKeydown = (e: KeyboardEvent) => {
    if (!isUserInput(e)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (this.textOverlay.isOpen) {
        this.textOverlay.commit()
        return
      }
      if (this.beautifyPanel.isOpen) {
        this.beautifyPanel.close()
        return
      }
      if (this.stitching) {
        this.stitcher?.cancel()
        return
      }
      exitScreenshotMode()
      return
    }
    if (this.state === 'preview' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      this.undo()
      return
    }
    if (this.state === 'preview' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !this.textOverlay.isOpen) {
      e.preventDefault()
      this.runDestination(busy => this.destinations.copy(busy))
      return
    }
    if (this.state === 'preview' && (e.key === 'Delete' || e.key === 'Backspace') && !this.textOverlay.isOpen && this.steps.shown()) {
      e.preventDefault()
      this.steps.deleteSelected()
      return
    }
    // `A` works until the shot is taken: a pending frame (a released drag, the
    // selection menu, the last frame) has not been captured yet
    if ((this.state === 'selecting' || this.state === 'confirming') && (e.key === 'a' || e.key === 'A') && this.anonymizeAvailable()) {
      e.preventDefault()
      this.anonymizeOn = !this.anonymizeOn
      this.anonymizeToggled = true
      this.syncHint()
    }
    // the pending frame owns the arrows and Enter: there is no picker beside it to climb or to ask
    if (this.state === 'confirming' && this.selection) {
      const view = this.doc.defaultView!
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        this.selection = nudgeBox(this.selection, e.key as 'ArrowLeft', e.shiftKey, { width: view.innerWidth, height: view.innerHeight })
        this.paintSelection()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        void this.confirmSelection()
        return
      }
    }
    if (e.key === 'Shift' && this.state === 'selecting' && this.selection) {
      this.shiftRatio = this.selection.height > 0 ? this.selection.width / this.selection.height : null
    }
    if (this.state === 'selecting' && this.hover.isPainted && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      this.hover.climb(e.key === 'ArrowUp' ? 1 : -1)
    }
    if (this.state === 'preview' && (e.key === 'w' || e.key === 'W') && this.settings?.watermark.enabled) {
      e.preventDefault()
      this.watermarkOn = !this.watermarkOn
      this.syncStatus()
      this.refreshDisplay()
    }
    // The editor is modal for the keyboard: Tab stays inside the session's own
    // controls instead of walking the masked page, where Enter on a link would
    // navigate away and drop the shot. The text input keeps the
    // browser's own Tab so typing still behaves as usual.
    if (this.state === 'preview' && e.key === 'Tab' && !this.textOverlay.isOpen) {
      e.preventDefault()
      this.cycleFocus(!e.shiftKey)
    }
  }

  /** Focusables of the session's own UI, in document order. */
  private sessionFocusables(): HTMLElement[] {
    if (!this.host.isConnected) return []
    return Array.from(this.host.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')).filter(
      el => !el.hasAttribute('disabled') && el.offsetParent !== null,
    )
  }

  private cycleFocus(forward: boolean): void {
    const items = this.sessionFocusables()
    if (items.length === 0) return
    const current = items.indexOf(this.doc.activeElement as HTMLElement)
    const next = current < 0 ? 0 : (current + (forward ? 1 : -1) + items.length) % items.length
    items[next]!.focus()
  }

  constructor(doc: Document, via: CaptureVia) {
    this.doc = doc
    this.via = via
    this.host = doc.createElement('div')
    this.host.setAttribute(ROOT_ATTR, ROOT_VALUE)
    this.textOverlay = new TextInputOverlay({
      doc,
      previewPanel: () => this.previewEl!,
      color: () => this.color,
      commitText: (at, value, color) => this.commit([...this.annotations, { tool: 'text', start: at, text: value, color }]),
    })
    this.steps = new StepBadges({
      doc,
      inPreview: () => this.state === 'preview',
      annotations: () => this.annotations,
      tool: () => this.tool,
      color: () => this.color,
      busy: () => this.busy,
      capturedDpr: () => this.capturedDpr,
      canvasSize: () => (this.croppedCanvas ? { width: this.croppedCanvas.width, height: this.croppedCanvas.height } : null),
      displayCanvas: () => this.displayCanvas,
      contentOrigin: () => this.contentOrigin,
      canvasPoint: event => this.canvasPoint(event),
      stepSequence: () => this.stepSequence,
      commit: (annotations, stepSequence) => this.commit(annotations, stepSequence),
      redraw: annotations => this.renderEditor(annotations),
      registerDrawingCleanup: cleanup => (this.drawingCleanup = cleanup),
      stepToolButton: () => this.toolbarEl?.querySelector<HTMLElement>('[data-ann-ui="screenshot-tool-step"]') ?? null,
    })
    this.beautifyPanel = new BeautifyController({
      doc,
      host: () => this.host,
      inPreview: () => this.state === 'preview',
      beautify: () => this.beautify,
      ratioPresets: () => this.settings?.ratioPresets ?? [],
      change: patch => this.changeBeautify(patch),
      reset: () => this.resetBeautify(),
      toolbarChanged: () => this.updateToolbar(),
      toolbar: () => this.toolbarEl,
      beautifyButton: () => this.toolbarEl?.querySelector<HTMLElement>('[data-ann-ui="screenshot-beautify"]') ?? null,
      previewNow: () => this.previewNow,
      syncPanel: settings => this.beautifyPanel.sync(settings),
    })
    this.destinations = new Destinations({
      doc,
      entryId: () => this.entryId,
      via: () => this.via,
      settings: () => this.settings,
      croppedCanvas: () => this.croppedCanvas,
      displayCanvas: () => this.displayCanvas,
      beautifyEnabled: () => this.beautify.enabled,
      watermarkOn: () => this.watermarkOn,
      frameKind: () => (this.stitched ? 'stitched' : this.lastFrame.reused ? 'reused' : this.elementRect ? 'element' : 'drag'),
      sourceUrl: () => this.capturedSourceUrl ?? this.pageUrl(),
      rememberFrame: () => this.lastFrame.remember(this.doc, this.selection),
      say: (message, isError) => this.showNotice(message, isError === true),
      saved: () => {
        announceSaved(this.doc)
        exitScreenshotMode()
      },
    })
    this.confirmBox = new ConfirmBox({
      doc,
      host: () => this.host,
      selection: () => this.selection,
      setSelection: rect => (this.selection = rect),
      selectionElement: () => this.selectionEl,
      viewport: () => {
        const view = this.doc.defaultView!
        return { width: view.innerWidth, height: view.innerHeight }
      },
      confirm: () => void this.confirmSelection(),
      cancel: () => exitScreenshotMode(),
    })
    this.hover = new HoverPicker({
      doc,
      host: () => this.host,
      picking: () => this.state === 'selecting' && !this.selectionEl,
      pageElements: (x, y) => this.pageElementsFromPoint(x, y),
    })
    this.photographer = new Photographer({
      doc,
      hide: () => (this.host.style.display = 'none'),
      restore: () => (this.host.style.display = ''),
      cancelled: () => this.exited,
    })
    this.bubble = createNoticeBubble(doc, this.host, {
      toolbarBox: () => (this.toolbarEl?.isConnected ? this.toolbarEl.getBoundingClientRect() : null),
      textNode: text => this.textNode(text),
    })
  }

  begin(): void {
    const style = this.doc.createElement('style')
    // The picking hints, the size label, the editor toolbar with its rows and the
    // success bubble are one always-dark pill set over the dimmed page (visual.md
    // §2): the --annov-pill-* tokens never follow the system appearance. The
    // text box and the error card are form-style surfaces and keep the theme
    // tokens. The selection blue marks the page's content, not a surface, and
    // stays what the AGENTS notes say: #4c91ff for both appearances — the draft's
    // #3b82f6 reads worse against the dimmed page (1.29:1 vs 1.53:1 on white).
    style.textContent = sessionStyles
    this.host.appendChild(style)

    const overlay = this.doc.createElement('div')
    overlay.className = 'ann-shot-overlay'
    overlay.setAttribute(ROOT_ATTR, 'screenshot-overlay')
    this.overlayEl = overlay
    const hint = this.doc.createElement('div')
    hint.className = 'ann-shot-hint'
    this.hintEl = hint
    overlay.appendChild(hint)
    this.host.appendChild(overlay)

    this.doc.documentElement.appendChild(this.host)
    this.doc.addEventListener('keydown', this.onKeydown, true)
    this.doc.addEventListener('focus', this.onFocus, true)
    // Selecting leaves the host pointer-events:none so a click still hits the
    // page element the element path wants. Confirming adds ann-shot-modal,
    // which takes the pointer so the page underneath cannot (issue #108).
    this.doc.addEventListener('pointerdown', this.onPointerDown, true)
    this.doc.addEventListener('pointermove', this.onHoverMove, true)
    // Cancelling pointerdown does not stop the click that follows it: without
    // this swallow, picking a link or button as the element target fires the
    // page's own action (screenshot.md §2, RV-CAP-05).
    for (const type of SWALLOWED_EVENT_TYPES) {
      this.doc.addEventListener(type, this.onSwallowPageAction, true)
    }
    this.syncHint()
    this.settingsLoaded = this.loadAnonymizeDefault()
  }

  /** Kills a page action during the capture phase; the session's own UI keeps working. */
  private readonly onSwallowPageAction = (event: Event): void => {
    if (this.state === 'preview' || this.state === 'error' || this.state === 'done') return
    if (!isUserInput(event)) return
    const target = event.target
    if (target instanceof Node && this.host.contains(target)) return
    event.preventDefault()
    event.stopPropagation()
  }

  private async loadAnonymizeDefault(): Promise<void> {
    const response = await MessageUtils.sendMessage({ type: 'GET_SETTINGS' })
    if (this.exited || !response.success || !response.data) return
    this.settings = response.data
    // every capture waits for this, so no shot is taken before the defaults
    // are in: the block capsule's shot starts together with the session
    this.anonymizeParts = { avatar: response.data.anonymizeAvatars, name: response.data.anonymizeNames }
    if (!this.anonymizeToggled) this.anonymizeOn = response.data.anonymizeDefault
    this.watermarkOn = response.data.watermark.enabled
    this.beautify = { ...response.data.beautify }
    if (response.data.watermark.enabled && response.data.watermark.image) void this.loadWatermarkImage(response.data.watermark.image)
    this.syncHint()
    // a frame handed over by the selection menu is pending, not captured, and needs no picking chips
    if (this.state === 'selecting') void this.offerPicking()
  }

  /** Paints a programmatic selection (restored frame) with its size label. */
  private paintFrameSelection(): void {
    const selection = this.selection
    if (!selection) return
    const rect = this.doc.createElement('div')
    rect.className = 'ann-shot-rect'
    const size = this.doc.createElement('span')
    size.className = 'ann-shot-size'
    size.textContent = `${Math.round(selection.width)} x ${Math.round(selection.height)}`
    if (selection.y < 28) {
      size.style.bottom = 'auto'
      size.style.top = 'calc(100% + 6px)'
    }
    rect.appendChild(size)
    Object.assign(rect.style, { left: `${selection.x}px`, top: `${selection.y}px`, width: `${selection.width}px`, height: `${selection.height}px` })
    this.host.appendChild(rect)
    this.selectionEl = rect
    if (this.overlayEl) this.overlayEl.style.background = 'transparent'
  }

  /**
   * The remembered frame becomes the pending selection, where it is in the window now
   * (screenshot.md §1.4); the offer itself, its anchor and its label come from the memory.
   */
  private async restoreRememberedFrame(): Promise<void> {
    const offer = await this.lastFrame.offer(this.doc)
    // the frame arrives a worker round trip after the session opened: a pointer that is already picking its
    // own target, or a drag under way, keeps it, and the frame waits for the next trigger
    if (!offer || this.exited || this.state !== 'selecting' || this.hover.hasTarget || this.selectionEl) return
    this.selection = offer.frame
    this.frameLabel = offer.label
    this.paintFrameSelection()
    this.enterConfirming(offer.label)
  }

  /**
   * The memory has its say first, then the picking chips: a frame offered a round trip after the session opened
   * must not find the chips already on the screen beside it. Not part of `settingsLoaded` — no shot waits for it.
   */
  private async offerPicking(): Promise<void> {
    await this.restoreRememberedFrame()
    if (this.exited || this.state !== 'selecting' || this.stitching) return
    this.showRatioBar()
  }

  /**
   * Decodes the watermark picture, once per session. A preview that is already up gets it as soon as it is ready; a picture
   * the browser cannot read stays `null` and the text is written without it (screenshot.md §5).
   */
  private async loadWatermarkImage(dataUrl: string): Promise<void> {
    const image = await decodeWatermarkImage(dataUrl, this.doc)
    if (this.exited) return
    this.watermarkImage = image
    if (image && this.state === 'preview') this.refreshDisplay()
  }

  private readonly onFocus = (): void => {
    this.syncHint()
  }

  private syncHint(): void {
    if (!this.hintEl) return
    renderHintBar(this.doc, this.hintEl, {
      pending: this.state === 'confirming',
      anonymize: this.anonymizeAvailable() ? { on: this.anonymizeOn } : null,
      watermark: this.settings?.watermark.enabled ? { on: this.watermarkOn } : null,
      textNode: text => this.textNode(text),
      kbdNode: key => this.kbdNode(key),
    })
  }

  /** The anonymity/watermark state moved: the picking hint reads it, and so does the editor's status strip. */
  private syncStatus(): void {
    this.syncHint()
    this.updateToolbar()
  }

  private anonymizeAvailable(): boolean {
    return this.anonymizeParts.avatar || this.anonymizeParts.name
  }

  /** The selection bar's ratio chips: 自由 plus the presets enabled in settings (screenshot.md §1.3). */
  private showRatioBar(): void {
    if (!this.settings || this.settings.ratioPresets.length === 0) return
    this.ratioBarEl?.remove()
    this.ratioBarEl = renderRatioBar(this.doc, this.host, {
      ratio: this.ratio,
      presets: this.settings.ratioPresets,
      textNode: text => this.textNode(text),
      onRatio: id => {
        this.ratio = id
        this.showRatioBar()
      },
      onStitch: () => void this.beginStitching(),
    })
  }

  // ── scrolling long screenshot (screenshot.md §1.5) ────────────────

  private stitching = false

  private async beginStitching(): Promise<void> {
    // the button lives on the picking chips: a pending frame has none, and is let go with a click outside first
    if (this.stitching || this.state !== 'selecting') return
    // a transparent catcher holds the pointer off the page's hover styles for the whole run
    const sweeper = this.doc.createElement('div')
    sweeper.setAttribute(ROOT_ATTR, 'screenshot-hover-sweeper')
    Object.assign(sweeper.style, { position: 'fixed', inset: '0', pointerEvents: 'auto', background: 'transparent', zIndex: '2147483646' })
    this.doc.documentElement.appendChild(sweeper)
    const stitcher = new Stitcher({
      doc: this.doc,
      capture: async () => {
        // the shot photographs the screen: the session's overlay and UI hide
        // for the moment, and the cursor highlight of a recording with them
        this.host.style.display = 'none'
        this.doc.dispatchEvent(new CustomEvent('annhub:capture-hide'))
        try {
          await doubleRaf()
          // the same rate-limit-aware path the region capture takes
          const response = await requestCapture(() => this.exited)
          if (!response.success || !response.data?.dataUrl) throw new Error(response.error ?? 'capture failed')
          return response.data.dataUrl
        } finally {
          this.host.style.display = ''
          this.doc.dispatchEvent(new CustomEvent('annhub:capture-restore'))
        }
      },
    })
    this.stitcher = stitcher
    this.stitching = true
    // every ending — stitched, stalled, cancelled or discarded — scrolls the page back to here
    const startTop = this.doc.scrollingElement?.scrollTop ?? 0
    const startLeft = this.doc.scrollingElement?.scrollLeft ?? 0
    this.hover.clear()
    this.selectionEl?.remove()
    this.selectionEl = null
    this.ratioBarEl?.remove()
    this.ratioBarEl = null
    this.hintEl?.style.setProperty('display', 'none')
    let failure: StitchFailure | 'capture' | null = null
    let result: Awaited<ReturnType<Stitcher['run']>> | undefined
    try {
      result = await stitcher.run()
    } catch (error) {
      // the stitcher throws its own reason as a string; any other error is a shot that did not come back
      failure = typeof error === 'string' ? (error as StitchFailure) : 'capture'
    }
    this.stitching = false
    this.stitcher = null
    sweeper.remove()
    // every ending — stitched, stalled, cancelled, discarded or the session
    // replaced mid-run — scrolls the page back to where it started
    const scroller = this.doc.scrollingElement
    if (scroller) {
      scroller.scrollTop = startTop
      scroller.scrollLeft = startLeft
    }
    if (this.exited) return
    if (!result) {
      // nothing was stitched, or the run was discarded: back to selecting, with the reason when there is one
      this.state = 'selecting'
      this.hintEl?.style.removeProperty('display')
      this.backToPicking()
      const code = failure ?? 'scripted'
      if (code === 'zoomed') this.showExternalNotice(uiText('shot.stitch.zoom'))
      else if (code === 'capture') this.showExternalNotice(uiText('shot.error.capture'))
      else if (code !== 'cancel') this.showExternalNotice(uiText(`shot.stitch.${code}` as UiTextKey))
      return
    }
    if (result.stop !== 'bottom') this.showNotice(uiText('shot.stitch.capped'), false)
    this.state = 'capturing'
    await this.settingsLoaded
    if (this.exited) return
    // the ink on the page is screen-fixed at this point: it lands on the first
    // segment, where it was drawn (annotate.md §1.3, screenshot.md §1.5)
    this.selection = { x: 0, y: 0, width: result.widthCss, height: result.heightCss }
    this.croppedCanvas = result.canvas
    this.capturedDpr = result.dpr
    this.stitched = true
    this.lastFrame.reset()
    this.capturedSourceUrl = this.pageUrl()
    this.maskBoxes = []
    this.prepareEditor(this.consumeInkStitched(startLeft, startTop, result.widthCss, result.heightCss))
    this.state = 'preview'
    this.showPreview()
  }
  private textNode(t: string): Text {
    return this.doc.createTextNode(t)
  }
  /** A key name as a keycap on the dark pill (the draft's translucent `<kbd>`). */
  private kbdNode(t: string): HTMLElement {
    const kbd = this.doc.createElement('kbd')
    kbd.textContent = t
    return kbd
  }

  exit(): void {
    this.exited = true
    this.selectionCleanup?.()
    this.drawingCleanup?.()
    this.toolbarResizeObserver?.disconnect()
    this.toolbarResizeObserver = null
    this.toolbar = null
    this.doc.removeEventListener('keydown', this.onKeydown, true)
    this.doc.removeEventListener('focus', this.onFocus, true)
    this.doc.removeEventListener('pointerdown', this.onPointerDown, true)
    this.doc.removeEventListener('pointermove', this.onHoverMove, true)
    for (const type of SWALLOWED_EVENT_TYPES) {
      this.doc.removeEventListener(type, this.onSwallowPageAction, true)
    }
    this.clearConfirmUi()
    this.hover.clear()
    this.bubble.dispose()
    // a session replaced while its scrolling capture runs stops the stitcher:
    // otherwise it keeps scrolling and photographing an orphaned page
    this.stitcher?.cancel()
    this.stitcher = null
    this.stitching = false
    this.host.remove()
    this.selectionEl = null
    this.previewEl = null
    this.toolbarEl = null
    this.ratioBarEl = null
    this.watermarkImage = null
    this.displayCanvas = null
    this.croppedCanvas = null
    this.sourceCanvas = null
    this.state = 'done'
    const notifyExit = this.onSessionExit
    this.onSessionExit = null
    if (activeSession === this) activeSession = null
    // the annotation layer comes back with its ink once the session is over (annotate.md §1.3)
    notifyExit?.()
  }

  // ── region selection / element pick (document-level) ─────────────

  /**
   * Confirming is modal (issue #108). Selecting stays click-through so the
   * element path can see the page; the class is what the stylesheet and the
   * block capsule both read. Inline pointer-events wins over that rule while
   * a hit-test momentarily looks through the shield.
   */
  private readonly onHoverMove = (e: PointerEvent): void => {
    if (!isUserInput(e)) return
    this.hover.track(e.clientX, e.clientY)
  }

  private setConfirmShield(on: boolean): void {
    this.host.classList.toggle('ann-shot-modal', on)
    this.host.style.pointerEvents = on ? 'auto' : ''
    if (!on) return
    // A clip capsule armed during the drag would sit in the selection hole.
    for (const node of this.doc.querySelectorAll('[data-ann-ui="block-capsule"], [data-ann-ui="block-outline"]')) node.remove()
  }

  /** Confirm, cancel, handles, and the ratio / margin bars own their pointer events. */
  private isShotChrome(target: EventTarget | null): boolean {
    if (!(target instanceof Element) || !this.host.contains(target)) return false
    return Boolean(target.closest('.ann-shot-confirm-bar, .ann-shot-handle, [data-ann-ui="screenshot-ratio-bar"], .ann-shot-margin-bar, .ann-shot-toolbar, .ann-shot-preview'))
  }

  private pointerInSelection(x: number, y: number): boolean {
    const box = this.selection
    if (!box) return false
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
  }

  private pageUrl(): string {
    return this.doc.defaultView?.location.href ?? ''
  }

  /**
   * Permalink for a dragged (or element-via-region) frame. Resolved before the
   * shot, while the post is still the one on screen (capture.md §5).
   */
  private rememberRegionPermalink(rect: ViewportRect): void {
    this.capturedSourceUrl = permalinkForRegion(rect, this.pageUrl(), (x, y) => this.elementsAt(x, y))
  }

  /** Permalink for an element shot: the block itself, same rule as a block clip. */
  private rememberElementPermalink(node: Node): void {
    this.capturedSourceUrl = resolvePermalink(node, this.pageUrl())
  }

  /** Page elements under a viewport point, clamped, through the confirm shield. */
  private elementsAt(x: number, y: number): Element[] {
    const view = this.doc.defaultView
    if (!view) return []
    const maxX = Math.max(0, view.innerWidth - 1)
    const maxY = Math.max(0, view.innerHeight - 1)
    return this.pageElementsFromPoint(Math.min(Math.max(0, x), maxX), Math.min(Math.max(0, y), maxY))
  }

  /** elementsFromPoint through the confirm shield, without leaving it down. */
  private pageElementsFromPoint(x: number, y: number): Element[] {
    return pageElementsFromPoint(this.doc, this.host, x, y)
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.state !== 'selecting' && this.state !== 'confirming') return
    if (!isUserInput(e)) return
    if (this.isShotChrome(e.target)) return
    // Inside the pending frame: not a new selection, and not a click for the page.
    if (this.state === 'confirming' && this.pointerInSelection(e.clientX, e.clientY)) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.button !== 0) {
      if (this.state === 'confirming') {
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }
    e.preventDefault()
    e.stopPropagation()

    // A press outside a pending frame lets it go. A drag from here is a new frame; a click only takes the user back to
    // picking — what the pointer rests on is outlined, not captured behind their back (screenshot.md §1.2).
    const letGo = this.state === 'confirming'
    // a new drag replaces the pending selection and the frame the memory offered; a press-and-release in the
    // picking state is the click-element path and keeps its target
    this.hover.hide()
    this.setConfirmShield(false)
    this.clearConfirmUi()
    this.selectionEl?.remove()
    this.selectionEl = null
    this.state = 'selecting'
    if (letGo) this.backToPicking()
    const origin = { x: e.clientX, y: e.clientY }
    const rect = this.doc.createElement('div')
    rect.className = 'ann-shot-rect'
    const size = this.doc.createElement('span')
    size.className = 'ann-shot-size'
    rect.appendChild(size)

    const move = (ev: PointerEvent) => {
      if (!isUserInput(ev)) return
      const view = this.doc.defaultView!
      // snapping: the moving point sticks to element edges near it (screenshot.md §1.2)
      const edges = collectEdges(this.edgeRectsUnder(ev.clientX, ev.clientY), { width: view.innerWidth, height: view.innerHeight })
      const snapped = snapPoint({ x: ev.clientX, y: ev.clientY }, edges)
      this.confirmBox.paintSnapGuides(snapped)
      let raw: ViewportRect
      if (this.ratio !== 'free') {
        raw = constrainToRatio(origin, snapped, this.ratio, { width: view.innerWidth, height: view.innerHeight })
      } else if (this.shiftRatio !== null) {
        raw = constrainToRatioValue(origin, snapped, this.shiftRatio, { width: view.innerWidth, height: view.innerHeight })
      } else {
        raw = constrainToRatio(origin, snapped, 'free', { width: view.innerWidth, height: view.innerHeight })
      }
      const x0 = Math.max(0, raw.x)
      const y0 = Math.max(0, raw.y)
      const x1 = Math.min(view.innerWidth, raw.x + raw.width)
      const y1 = Math.min(view.innerHeight, raw.y + raw.height)
      this.selection = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
      this.lastFrame.reused = false
      if (this.selection.width > 0 && this.selection.height > 0 && !this.selectionEl) {
        this.host.appendChild(rect)
        this.selectionEl = rect
        if (this.overlayEl) this.overlayEl.style.background = 'transparent'
      }
      rect.style.left = `${x0}px`
      rect.style.top = `${y0}px`
      rect.style.width = `${this.selection.width}px`
      rect.style.height = `${this.selection.height}px`
      const preset = ratioOf(this.ratio)
      size.textContent = `${Math.round(this.selection.width)} x ${Math.round(this.selection.height)}${preset ? ` · ${preset.id} 🔒` : this.shiftRatio !== null ? ' 🔒' : ''}`
      size.style.bottom = y0 < 28 ? 'auto' : ''
      size.style.top = y0 < 28 ? 'calc(100% + 6px)' : ''
    }
    const up = (ev: PointerEvent) => {
      if (!isUserInput(ev)) return
      detach()
      this.confirmBox.clearSnapGuides()
      this.shiftRatio = null
      const width = Math.abs(ev.clientX - origin.x)
      const height = Math.abs(ev.clientY - origin.y)
      if (width < 4 && height < 4) {
        // A click, not a drag → element path with the hovered element and margin.
        rect.remove()
        if (this.selectionEl && this.selectionEl !== rect) this.selectionEl.remove()
        this.selectionEl = null
        this.selection = null
        if (this.overlayEl) this.overlayEl.style.background = ''
        if (letGo) this.hover.track(ev.clientX, ev.clientY)
        else this.captureHoveredElement()
        return
      }
      if (!this.selection || this.selection.width < 4 || this.selection.height < 4) {
        rect.remove()
        if (this.selectionEl && this.selectionEl !== rect) this.selectionEl.remove()
        this.selectionEl = null
        this.selection = null
        if (this.overlayEl) this.overlayEl.style.background = ''
        return
      }
      // the released selection stays adjustable before capture (screenshot.md §1.2)
      this.enterConfirming()
    }
    const detach = () => {
      this.doc.removeEventListener('pointermove', move)
      this.doc.removeEventListener('pointerup', up)
      this.selectionCleanup = null
    }
    this.selectionCleanup = detach
    this.doc.addEventListener('pointermove', move)
    this.doc.addEventListener('pointerup', up)
  }

  /**
   * A pending frame is let go (screenshot.md §1.2): its label and the memory's offer go with it, and the picking line and
   * chips are back — a new drag is under way, or the user clicked outside to choose again. The overlay dims the page
   * again until a new rect takes over that.
   */
  private backToPicking(): void {
    this.frameLabel = ''
    this.lastFrame.reset()
    if (this.overlayEl) this.overlayEl.style.background = ''
    this.syncHint()
    this.showRatioBar()
  }

  /** Element boxes under a point, for drag snapping. */
  private edgeRectsUnder(x: number, y: number): Array<{ left: number; top: number; right: number; bottom: number }> {
    const stack = this.pageElementsFromPoint(x, y)
    const rects: Array<{ left: number; top: number; right: number; bottom: number }> = []
    for (const el of stack.slice(0, 6)) {
      if (el.closest?.('[data-ann-ui]')) continue
      const box = el.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) rects.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom })
    }
    return rects
  }

  /** Re-renders the pending rect, handles, size label and bar position. */
  private paintSelection(): void {
    this.confirmBox.paint()
  }

  /** The released selection stays adjustable: handles, nudge, confirm bar. */
  private enterConfirming(label = this.frameLabel): void {
    this.state = 'confirming'
    this.frameLabel = label
    this.clearConfirmUi()
    // the pending frame owns the screen: no second candidate, no chips for the next drag, and a hint that is about it
    this.hover.clear()
    this.ratioBarEl?.remove()
    this.ratioBarEl = null
    this.syncHint()
    this.confirmBox.enter(label)
    this.setConfirmShield(true)
  }

  /** Enter confirms the pending selection (or the remembered frame). */
  private async confirmSelection(): Promise<void> {
    if (!this.selection || this.state !== 'confirming') return
    const view = this.doc.defaultView!
    // a free-dragged frame is remembered by its page position; the element's frame the memory offered, confirmed as it
    // came, is still the element's (screenshot.md §1.4)
    this.lastFrame.adopted(this.selection, { x: view.scrollX, y: view.scrollY })
    this.clearConfirmUi()
    await this.captureRegionMode()
  }

  private clearConfirmUi(): void {
    this.confirmBox.clear()
  }

  // ── element path: hover, hierarchy, margin (screenshot.md §1.2, §1.4) ──

  /**
   * Tracks the element a click would capture; paints outline + margin bar.
   * Only while choosing: a pending frame owns the screen, and a second
   * candidate drawn beside it read as two selections at once — the way to
   * another target is a click outside the frame, which is choosing again
   * (screenshot.md §1.2, §1.4).
   */
  /**
   * A click on a hovered layer: element (or a section's interval) + margin
   * goes the region path when the frame fits the window (the ring shows the
   * real page); a bigger element itself goes the clone path without margin
   * (screenshot.md §1.4).
   */
  private captureHoveredElement(): void {
    const layer = this.hover.layer()
    this.hover.clear()
    if (!layer) return
    const view = this.doc.defaultView!
    const box = candidateRect(layer)
    const frame = expandByMargin({ x: box.left, y: box.top, width: box.width, height: box.height }, this.hover.margin)
    // a section is not an element: its frame is remembered as a page place (screenshot.md §1.4)
    this.lastFrame.adoptElement(
      layer.range
        ? { kind: 'box', pageX: box.left + view.scrollX, pageY: box.top + view.scrollY, width: box.width, height: box.height }
        : {
            kind: 'element',
            selector: buildSelector(layer.element),
            margin: this.hover.margin,
            width: box.width,
            height: box.height,
            pageX: box.left + view.scrollX,
            pageY: box.top + view.scrollY,
          },
    )
    this.lastFrame.reused = false
    if (fitsInViewport(frame, { width: view.innerWidth, height: view.innerHeight })) {
      this.selection = frame
      void this.captureRegionMode()
      return
    }
    const bareFits = fitsInViewport({ x: box.left, y: box.top, width: box.width, height: box.height }, { width: view.innerWidth, height: view.innerHeight })
    if (this.hover.margin === 0 || !bareFits) {
      void this.captureElementMode(layer.element, layer.range, box)
      return
    }
    // the margin overflows the window: say so and keep the session (screenshot.md §1.4 放不下)
    this.lastFrame.reset()
    this.state = 'selecting'
    this.showNotice(uiText('shot.frameTooBig'))
  }

  // ── region mode (captureVisibleTab) ───────────────────────────────

  private async captureRegionMode(): Promise<void> {
    const selection = this.selection
    if (!selection) return
    this.rememberRegionPermalink(selection)
    this.state = 'capturing'
    this.setConfirmShield(false)
    await this.settingsLoaded
    if (this.exited) return

    // Auto-detected identity rects are computed BEFORE any DOM mutation
    // (element rects share the viewport coordinate space with the selection).
    const identity = detectIdentityRects(this.doc, this.doc.defaultView!.location.hostname, selection, this.anonymizeParts)
    // With DOM anonymization on, identity elements are covered by gray
    // placeholders during the shot — no pixelate pre-fill needed.
    const restoreAnonymize = this.anonymizeOn ? applyViewportAnonymization(this.doc, this.doc.defaultView!.location.hostname, this.anonymizeParts) : null

    // captureVisibleTab photographs the screen — the photographer hides the
    // session for the moment, waits for a settled layout and takes the cursor
    // off the page's hover styles (screenshot.md §1.4).
    let dataUrl: string | null
    try {
      dataUrl = await this.photographer.shoot()
    } catch (error) {
      if (!this.exited) this.showError(error instanceof Error ? error.message : uiText('shot.error.capture'))
      return
    } finally {
      restoreAnonymize?.()
    }
    if (this.exited || !dataUrl) return

    try {
      this.croppedCanvas = await this.cropToCanvas(dataUrl, selection)
    } catch (error) {
      if (!this.exited) this.showError(error instanceof CropError ? error.message : uiText('shot.error.crop'))
      return
    }
    if (this.exited) return

    const canvas = this.croppedCanvas
    const scaleX = canvas.width / selection.width
    const scaleY = canvas.height / selection.height
    this.maskBoxes = restoreAnonymize
      ? []
      : identity.map(r => ({
          x: (r.x - selection.x) * scaleX,
          y: (r.y - selection.y) * scaleY,
          width: r.width * scaleX,
          height: r.height * scaleY,
        }))
    this.prepareEditor(this.consumeInk(selection))
    this.state = 'preview'
    this.showPreview()
  }

  /**
   * The handed-over ink as editor annotations over the frame that was just
   * captured, in one group for undo (annotate.md §1.3): the ink is
   * stored on the page, so it lands where it shows at the capture moment
   * (annotate.md §1.2, §1.3); pinned ink already sits in viewport
   * coordinates. Strokes fully outside the frame are out, strokes crossing
   * its boundary are cut at it.
   */
  private consumeInk(frame: ViewportRect): Annotation[] {
    const ink = this.pendingInk
    this.pendingInk = null
    if (!ink || ink.length === 0) return []
    const view = this.doc.defaultView!
    return inkToEditorAnnotations(inkToViewport(ink, view.scrollX, view.scrollY), frame, this.capturedDpr || 1)
  }

  /**
   * 拼长图的墨迹 (annotate.md §1.3): the page's ink enters at its page
   * position, wherever the window was when it was drawn; ink pinned to the
   * screen has no place in the long image — no single segment would line it
   * up — so it stays out and the editor says one sentence about it.
   */
  private consumeInkStitched(startLeft: number, startTop: number, widthCss: number, heightCss: number): Annotation[] {
    const ink = this.pendingInk
    this.pendingInk = null
    if (!ink || ink.length === 0) return []
    const onPage = ink.filter(stroke => !stroke.pinned)
    if (onPage.length !== ink.length) this.showNotice(uiText('shot.stitch.pinnedInk'), false)
    if (onPage.length === 0) return []
    return inkToEditorAnnotations(onPage, { x: startLeft, y: startTop, width: widthCss, height: heightCss }, this.capturedDpr || 1)
  }

  // ── element mode (DOM clone rasterization) ────────────────────────

  /** A pending frame handed over by the caller (selection menu): confirm with Enter, adjust, or cancel. */
  beginWithInitialRect(rect: ViewportRect): void {
    if (this.state !== 'selecting') return
    const view = this.doc.defaultView!
    const clamped = intersectRects(rect, { x: 0, y: 0, width: view.innerWidth, height: view.innerHeight })
    if (!clamped || clamped.width < 4 || clamped.height < 4) return
    this.selection = clamped
    this.paintFrameSelection()
    this.enterConfirming()
  }

  /**
   * The block capsule's direct path: capture a known element without
   * selection. The element also becomes the remembered frame, like the
   * click path does (区块路径的截图也记为“上次取景框”). A section hands its
   * interval: the frame and the raster are the outlined run, not the
   * container it shares with its neighbours (RV-CAP-13).
   */
  async captureElementTarget(target: HTMLElement, section?: BlockCandidate['range']): Promise<void> {
    if (this.exited) return
    const view = this.doc.defaultView!
    const box = section ? sectionIntervalRect(target, section) : target.getBoundingClientRect()
    // the capsule's frame is remembered too; a section is a page place (screenshot.md §1.4)
    this.lastFrame.adoptElement(
      section
        ? { kind: 'box', pageX: box.left + view.scrollX, pageY: box.top + view.scrollY, width: box.width, height: box.height }
        : {
            kind: 'element',
            selector: buildSelector(target),
            margin: 0,
            width: box.width,
            height: box.height,
            pageX: box.left + view.scrollX,
            pageY: box.top + view.scrollY,
          },
    )
    this.lastFrame.reused = false
    // fits in the window: crop the real pixels, the click path without margin;
    // taller: rasterize the offscreen clone (screenshot.md §1). A zero-area box
    // has no layout to crop (jsdom): the clone path keeps the session honest
    if (
      box.width > 0 &&
      box.height > 0 &&
      fitsInViewport({ x: box.left, y: box.top, width: box.width, height: box.height }, { width: view.innerWidth, height: view.innerHeight })
    ) {
      this.selection = { x: box.left, y: box.top, width: box.width, height: box.height }
      void this.captureRegionMode()
      return
    }
    await this.captureElementMode(target, section, box)
  }

  private async captureElementMode(target: HTMLElement, section?: BlockCandidate['range'], sectionBox?: DOMRect): Promise<void> {
    this.state = 'capturing'
    this.setConfirmShield(false)
    const element = target
    this.rememberElementPermalink(element)
    await this.settingsLoaded
    if (this.exited) return
    try {
      this.croppedCanvas = await captureElement(element, {
        ...(this.anonymizeOn ? { anonymize: this.anonymizeParts } : {}),
        ...(section ? { section } : {}),
      })
    } catch {
      // the rasterizer's own message is English and means nothing to the user
      if (!this.exited) this.showError(uiText('shot.error.element'))
      return
    }
    if (this.exited) return
    this.maskBoxes = []
    // a section's frame is its interval's union rect (RV-CAP-13), the same box the outline painted
    const bounds = section && sectionBox ? sectionBox : element.getBoundingClientRect()
    this.elementRect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    this.capturedDpr = this.croppedCanvas.width / Math.max(1, bounds.width)
    this.prepareEditor(this.consumeInk({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }))
    this.state = 'preview'
    this.showPreview()
  }

  private cropToCanvas(dataUrl: string, selection: ViewportRect): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const dpr = img.width / this.doc.defaultView!.innerWidth
          this.capturedDpr = dpr
          const source = computeCropSource(selection, dpr, img.width, img.height)
          const canvas = this.doc.createElement('canvas')
          canvas.width = source.sw
          canvas.height = source.sh
          canvas.getContext('2d')!.drawImage(img, source.sx, source.sy, source.sw, source.sh, 0, 0, source.sw, source.sh)
          resolve(canvas)
        } catch (error) {
          reject(error instanceof Error ? error : new Error('crop failed'))
        }
      }
      img.onerror = () => reject(new Error(uiText('shot.error.decode')))
      img.src = dataUrl
    })
  }

  // ── in-place preview and non-destructive annotations ──────────────

  private prepareEditor(inkAnnotations: Annotation[] = []): void {
    this.sourceCanvas = this.croppedCanvas
    const canvas = this.doc.createElement('canvas')
    canvas.width = this.sourceCanvas!.width
    canvas.height = this.sourceCanvas!.height
    this.croppedCanvas = canvas
    // what the preview shows and copy sends is a canvas of its own, composed from the capture: it is never the capture
    // itself, which saving takes and every redraw starts over from
    this.displayCanvas = this.doc.createElement('canvas')
    this.annotations = []
    this.history = []
    this.stepSequence = 0
    this.steps.reset()
    // the page's ink arrives as one step of its own: one undo takes it all off again (annotate.md §1.3)
    if (inkAnnotations.length > 0) this.commit(inkAnnotations)
    this.renderEditor()
  }

  /**
   * Where the capture itself sits on screen: the selection it was cut from, or — an element was not on the screen as it
   * was captured — the room the window leaves, around where the element is.
   */
  private contentBox(): ViewportRect {
    if (this.selection) return this.selection
    const view = this.doc.defaultView!
    const source = this.sourceCanvas!
    const around = this.elementRect ?? { x: view.innerWidth / 2, y: view.innerHeight / 2, width: 0, height: 0 }
    return previewBox(around, { width: source.width / this.capturedDpr, height: source.height / this.capturedDpr }, { width: view.innerWidth, height: view.innerHeight })
  }

  /** The preview on screen: the capture where it was selected, or the beautified picture grown around it. */
  private previewRect(): ViewportRect {
    const content = this.contentBox()
    const display = this.displayCanvas
    if (!this.beautify.enabled || !display) return content
    const view = this.doc.defaultView!
    return previewBox(content, { width: display.width / this.capturedDpr, height: display.height / this.capturedDpr }, { width: view.innerWidth, height: view.innerHeight })
  }

  private showPreview(): void {
    this.selectionEl?.remove()
    this.selectionEl = null
    this.ratioBarEl?.remove()
    this.ratioBarEl = null
    this.overlayEl?.style.setProperty('background', 'transparent')
    if (this.hintEl) this.hintEl.style.display = 'none'
    this.previewEl?.remove()
    this.toolbarEl?.remove()
    this.toolbar = null

    const display = this.displayCanvas!
    const panel = this.doc.createElement('div')
    panel.className = 'ann-shot-preview'
    panel.setAttribute(ROOT_ATTR, 'screenshot-preview')
    const size = this.doc.createElement('span')
    size.className = 'ann-shot-size'
    panel.append(size, display, this.steps.ring())
    display.addEventListener('pointerdown', this.onCanvasPointerDown)
    display.addEventListener('pointermove', this.onCanvasHover)
    this.host.appendChild(panel)
    this.previewEl = panel

    this.toolbar = createScreenshotToolbar(this.doc, this.toolbarActions())
    this.toolbarEl = this.toolbar.el
    this.host.appendChild(this.toolbarEl)
    this.toolbar.update(this.toolbarState())
    this.toolbarResizeObserver = new ResizeObserver(() => {
      this.positionToolbar()
      this.positionSizeLabel()
      this.beautifyPanel.position()
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
  private layout(): void {
    const preview = this.previewEl
    const display = this.displayCanvas
    if (this.state !== 'preview' || !preview || !display) return
    const rect = this.previewRect()
    this.previewNow = rect
    Object.assign(preview.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    const size = preview.querySelector<HTMLElement>('.ann-shot-size')
    if (size) size.textContent = `${display.width} x ${display.height}`
    this.positionToolbar()
    this.positionSizeLabel()
    this.beautifyPanel.position()
    this.steps.positionRing()
  }

  /** The size label goes where the toolbar is not: above the picture, else below it, else inside its corner. */
  private positionSizeLabel(): void {
    const size = this.previewEl?.querySelector<HTMLElement>('.ann-shot-size')
    const rect = this.previewNow
    if (!size || !rect) return
    const view = this.doc.defaultView!
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
    const view = this.doc.defaultView!
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
      maskCount: this.maskBoxes.length,
      anonymize: this.anonymizeAvailable() ? this.anonymizeOn : null,
      watermark: this.settings?.watermark.enabled ? this.watermarkOn : null,
      canUndo: this.history.length > 0,
      nextStep: nextStepNumber(this.annotations, this.stepSequence),
      beautifyOpen: this.beautifyPanel.isOpen,
      busy: this.busy,
      notice: this.notice,
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
        this.maskBoxes.splice(index, 1)
        this.renderEditor()
        this.updateToolbar()
      },
      onUndo: () => this.undo(),
      onResetSteps: () => this.steps.resetCount(),
      onBeautify: () => this.beautifyPanel.toggle(),
      onCopy: () => this.runDestination(busy => this.destinations.copy(busy)),
      onDownload: () => this.runDestination(busy => this.destinations.download(busy)),
      onCancel: () => exitScreenshotMode(),
      onSave: () => this.runDestination(busy => this.destinations.save(busy)),
    }
  }

  private updateToolbar(): void {
    this.toolbar?.update(this.toolbarState())
  }

  /** One editing step: what undo goes back to is kept, and the picture is drawn anew. */
  private commit(annotations: Annotation[], stepSequence = this.stepSequence): void {
    this.history.push({ annotations: this.annotations, stepSequence: this.stepSequence })
    this.annotations = annotations
    this.stepSequence = stepSequence
    this.renderEditor()
    this.updateToolbar()
  }

  /** Steps back one editing step: an annotation drawn or written, a badge put down, dragged or deleted, the count reset. */
  private undo(): void {
    const previous = this.history.pop()
    if (!previous) return
    this.annotations = previous.annotations
    this.stepSequence = previous.stepSequence
    this.renderEditor()
    this.updateToolbar()
  }

  /** Draws the capture with its annotations — or with a draft of them while the pointer is still drawing. */
  private renderEditor(annotations: Annotation[] = this.annotations): void {
    if (!this.croppedCanvas || !this.sourceCanvas) return
    renderScreenshot(this.croppedCanvas, this.sourceCanvas, this.maskBoxes, annotations, this.capturedDpr)
    this.refreshDisplay()
  }

  /**
   * Composes the picture the preview shows — the capture with the beautify frame (background, padding, corners, shadow, ratio)
   * and the watermark — which is exactly what copy and download send. The library entry keeps the capture without either
   * (screenshot.md §4.2–4.4). Starts over from the capture every time: the frame is never drawn on a frame.
   */
  private refreshDisplay(): void {
    const content = this.croppedCanvas
    const display = this.displayCanvas
    if (!content || !display) return
    this.contentOrigin = paintScreenshotDisplay(display, content, {
      source: this.sourceCanvas ?? content,
      beautify: this.beautify,
      scale: this.capturedDpr,
      textSelection: this.via === 'menu',
      watermark: this.watermarkOn ? this.settings?.watermark : undefined,
      watermarkImage: this.watermarkImage,
    })
    this.layout()
  }

  /** A pointer position as a point of the capture: the preview may show it with padding around it, and scaled down. */
  /** Over a badge the step tool can drag, the pointer says so. */
  private readonly onCanvasHover = (e: PointerEvent): void => {
    const display = this.displayCanvas
    if (!display) return
    display.style.cursor = this.steps.hoverCursor(e)
  }

  private canvasPoint(e: PointerEvent): Point {
    const display = this.displayCanvas!
    const content = this.croppedCanvas!
    const rect = display.getBoundingClientRect()
    const x = ((e.clientX - rect.left) * display.width) / (rect.width || 1) - this.contentOrigin.x
    const y = ((e.clientY - rect.top) * display.height) / (rect.height || 1) - this.contentOrigin.y
    return { x: Math.max(0, Math.min(content.width, x)), y: Math.max(0, Math.min(content.height, y)) }
  }

  private onCanvasPointerDown = (e: PointerEvent): void => {
    if (this.state !== 'preview' || this.busy || !this.tool || !this.croppedCanvas) return
    e.preventDefault()
    e.stopPropagation()
    if (this.tool === 'text') {
      this.textOverlay.open(this.canvasPoint(e), localPoint(this.displayCanvas!, e))
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
      this.doc.removeEventListener('pointermove', move)
      this.doc.removeEventListener('pointerup', up)
      this.doc.removeEventListener('pointercancel', cleanup)
      this.drawingCleanup = null
    }
    this.drawingCleanup = cleanup
    this.doc.addEventListener('pointermove', move)
    this.doc.addEventListener('pointerup', up)
    this.doc.addEventListener('pointercancel', cleanup)
  }

  // ── step badges (screenshot.md §1.1) ──────────────────────────────

  // ── the three destinations (screenshot.md §4) ─────────────────────

  /** One destination run: the busy flag paints the toolbar, the destination does the rest. */
  private runDestination(run: (busy: (on: boolean) => void) => Promise<void>): void {
    if (!this.croppedCanvas || this.busy) return
    this.busy = true
    this.updateToolbar()
    void run(on => {
      this.busy = on
      this.updateToolbar()
    })
  }

  private changeBeautify(patch: Partial<BeautifySettings>): void {
    this.beautify = applyBeautifyChange(this.beautify, patch)
    this.beautifyPanel.sync(this.beautify)
    this.refreshDisplay()
  }

  private resetBeautify(): void {
    this.beautify = { ...(this.settings?.beautify ?? DEFAULT_BEAUTIFY) }
    this.beautifyPanel.sync(this.beautify)
    this.refreshDisplay()
  }

  showExternalNotice(message: string): void {
    this.host.querySelector(`[${ROOT_ATTR}="screenshot-external-notice"]`)?.remove()
    const el = this.doc.createElement('div')
    el.className = 'ann-shot-hint'
    el.setAttribute(ROOT_ATTR, 'screenshot-external-notice')
    el.textContent = message
    this.host.appendChild(el)
    window.setTimeout(() => el.remove(), 2600)
  }

  /**
   * Failures are states to do something about: they stay in the toolbar until
   * the next one. Successes are confirmations — they ride above the toolbar
   * as a bubble and leave on their own, so the bar never carries stale text
   * (真机反馈).
   */
  showNotice(message: string, error = false): void {
    if (error) {
      this.notice = { message, error }
      this.updateToolbar()
      return
    }
    this.notice = undefined
    this.updateToolbar()
    this.bubble.show(message)
  }

  private showError(message: string): void {
    this.previewEl?.remove()
    this.selectionEl?.remove()
    if (this.overlayEl) this.overlayEl.style.background = 'rgb(10 14 25 / 0.58)'
    const panel = this.doc.createElement('div')
    panel.className = 'ann-shot-error-panel'
    panel.setAttribute(ROOT_ATTR, 'screenshot-error')
    panel.style.pointerEvents = 'auto'
    // the theme card of the draft's “页面不允许截图” board: stop icon, title, reason, way out
    panel.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>'
    const title = this.doc.createElement('div')
    title.className = 'ann-shot-error-title'
    title.textContent = uiText('shot.failed')
    const text = this.doc.createElement('div')
    text.className = 'ann-shot-error'
    text.textContent = message
    const close = this.doc.createElement('button')
    close.textContent = uiText('common.close')
    close.onclick = () => exitScreenshotMode()
    panel.append(title, text, close)
    this.host.appendChild(panel)
    this.previewEl = panel
    this.state = 'error'
  }
}

function doubleRaf(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

/**
 * “Screenshot saved”, spoken once: the session's own DOM goes away with the
 * save, so the live region lives on the document and removes itself (保存成功
 * 读屏没有任何播报).
 */
function announceSaved(doc: Document): void {
  const el = doc.createElement('div')
  el.setAttribute(ROOT_ATTR, 'screenshot-saved-notice')
  el.setAttribute('role', 'status')
  el.textContent = uiText('shot.saved')
  Object.assign(el.style, { position: 'fixed', left: '-9999px', top: '0' })
  doc.documentElement.appendChild(el)
  window.setTimeout(() => el.remove(), 4000)
}

function localPoint(el: HTMLElement, e: PointerEvent): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
