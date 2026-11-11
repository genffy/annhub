/**
 * Screenshot capture session — docs/product/screenshot.md. The session is the composition root:
 * it owns the state machine and wires the parts (RV-CAP-18) — the drag (drag-frame), the hover
 * picker, the confirming bar, the capture flows, the editor stage with its toolbar, badges, text
 * box and beautify panel, the stitch run, the destinations and the frame memory. Plain DOM, no
 * React (RV-CAP-16). Only the user's own input (`isUserInput`) moves it along: a page's script
 * cannot drag a region or click an element for the user.
 */

import { uiText } from '../ui-text'
import { newEntryId } from '../../../core/assets'
import { isUserInput } from '../user-input'
import { ROOT_ATTR, ROOT_VALUE } from './session-roots'
import { createNoticeBubble, type NoticeBubble } from './notice-bubble'
import type { CaptureVia } from '../../../types/messages'
import type { ViewportRect } from './crop'
import { intersectRects } from './crop'
import { sectionIntervalRect } from '../blocks'
import type { BlockCandidate } from '../blocks'
import { Destinations } from './destinations'
import { LastFrame } from './last-frame'
import { ConfirmBox } from './confirm-box'
import { HoverPicker } from './hover-picker'
import { Photographer } from './photographer'
import { EditorStage } from './editor-stage'
import { FrameDrag } from './drag-frame'
import { CaptureFlow } from './capture-flow'
import { StitchRun, stitchNotice } from './stitch-run'
import { SessionKeys } from './session-keys'
import { PageLinks } from './page-links'
import { PickingChrome } from './picking-chrome'
import { SessionPreferences } from './session-preferences'
import { PendingFrame } from './pending-frame'
import { ErrorPanel, announceSaved } from './error-panel'
import { mountSessionShell, SWALLOWED_EVENT_TYPES } from './session-boot'
import { applyBeautifyChange } from '../../../utils/screenshot-output'
import { DEFAULT_BEAUTIFY, type BeautifySettings } from '../../../core/screenshot-options'
import { buildSelector } from './selection'
import type { InkStroke } from '../annotation/ink'

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
  if (options.element) void activeSession.captureElement(options.element, options.section)
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
class ScreenshotSession {
  private readonly entryId = newEntryId()
  private readonly doc: Document
  private readonly host: HTMLDivElement
  private hintEl: HTMLDivElement | null = null
  private state: 'selecting' | 'confirming' | 'capturing' | 'preview' | 'error' | 'done' = 'selecting'
  private selection: ViewportRect | null = null
  private selectionEl: HTMLDivElement | null = null
  private overlayEl: HTMLDivElement | null = null
  private sourceCanvas: HTMLCanvasElement | null = null
  private elementRect: ViewportRect | null = null
  /** Permalink of what the frame covered, resolved when the shot was taken. A live timeline can recycle the post while the user annotates. */
  private capturedSourceUrl: string | null = null
  /** What undo goes back to, one entry per editing step: the annotations, and the sequence badges counted in, before it (screenshot.md §1.1). */
  /** The sequence the next badge counts in; 重置计数 starts the next one. */
  /** The badge the step tool last pressed: the ring and its × mark it, and Delete or Backspace removes it. */
  /** A badge is under the pointer, being put down or dragged; the ring waits until it is let go. */
  /** What the pen, the line and the highlighter draw at; like the colour, every screenshot starts from the default. */
  private busy = false
  private exited = false
  private readonly errorPanel: ErrorPanel
  private notice: { message: string; error: boolean } | undefined
  /** The success bubble above the toolbar; errors are the toolbar's own notice row. */
  private readonly bubble: NoticeBubble
  /** Where on the capture the open text box was clicked. */
  private selectionCleanup: (() => void) | null = null
  private drawingCleanup: (() => void) | null = null
  private readonly flow: CaptureFlow
  /** Which identity kinds anonymization covers, from settings (screenshot.md §3). */
  /** The user pressed `A` before the settings arrived: their choice stands. */
  /** Settings arrive after the session starts; every capture waits for them. */
  private via: CaptureVia
  private ratio = 'free'
  private readonly picking: PickingChrome
  private settingsLoadedPromise: Promise<void> = Promise.resolve()
  private readonly prefs: SessionPreferences
  /** The watermark picture, decoded once when the settings arrive so that drawing it is synchronous; `null` without one, or when the browser could not read it. */
  private readonly destinations: Destinations
  /** What the preview shows, and what copy and download send: the capture composed with beautify and watermark. Always a canvas of its own. */
  /** where the capture sits inside the display canvas (the padding of a beautified picture) */
  /** the preview on screen as last laid out */
  // precise selection and repeatable frames (screenshot.md §1.2, §1.4)
  private readonly hover: HoverPicker
  private readonly stage: EditorStage
  private readonly photographer: Photographer
  private readonly confirmBox: ConfirmBox
  private readonly links!: PageLinks
  private readonly pending: PendingFrame
  private readonly drag: FrameDrag
  private readonly lastFrame = new LastFrame()
  /** The frame as the memory offered it: confirmed untouched, it is still the element's frame and not a place (screenshot.md §1.4). */
  /** The capture came out of the scroll stitcher (screenshot.md §1.5): the frame is stitched, not dragged or picked. */
  private stitched = false
  private readonly stitchRun = new StitchRun()
  /** Page-annotation ink handed over with the trigger (annotate.md §1.3); consumed when the capture is in. */
  pendingInk: InkStroke[] | null = null
  /** The annotation layer's callback, run once when this session ends for any reason. */
  onSessionExit: (() => void) | null = null
  private keys!: SessionKeys

  private makeKeys(doc: Document): SessionKeys {
    return new SessionKeys({
      doc,
      host: () => this.host,
      state: () => this.state,
      selection: () => this.selection,
      viewport: () => {
        const view = this.doc.defaultView!
        return { width: view.innerWidth, height: view.innerHeight }
      },
      textInputOpen: () => this.stage.text.isOpen,
      closeTextInput: () => {
        if (!this.stage.text.isOpen) return false
        this.stage.text.commit()
        return true
      },
      closeBeautify: () => {
        if (!this.stage.beautify.isOpen) return false
        this.stage.beautify.close()
        return true
      },
      cancelStitch: () => {
        if (!this.stitching) return false
        this.stitchRun.cancel()
        return true
      },
      exit: () => exitScreenshotMode(),
      undo: () => this.stage.undo(),
      copy: () => {
        if (this.stage.text.isOpen) return false
        this.runDestination(busy => this.destinations.copy(busy))
        return true
      },
      deleteStep: () => {
        if (this.stage.text.isOpen || !this.stage.steps.shown()) return false
        this.stage.steps.deleteSelected()
        return true
      },
      toggleAnonymize: () => {
        if (!this.prefs.anonymizeAvailable()) return false
        this.prefs.anonymizeOn = !this.prefs.anonymizeOn
        this.prefs.anonymizeToggled = true
        this.picking.sync()
        return true
      },
      nudgeSelection: box => {
        this.selection = box
        this.confirmBox.paint()
      },
      confirmSelection: () => void this.confirmSelection(),
      noteShift: () => this.drag.noteShift(),
      climbHover: direction => {
        if (!this.hover.isPainted) return false
        this.hover.climb(direction)
        return true
      },
      toggleWatermark: () => {
        if (!this.prefs.settings?.watermark.enabled) return false
        this.prefs.watermarkOn = !this.prefs.watermarkOn
        this.syncStatus()
        this.stage.refreshDisplay()
        return true
      },
    })
  }

  private readonly onKeydown = (e: KeyboardEvent) => this.keys.onKeyDown(e)

  constructor(doc: Document, via: CaptureVia) {
    this.doc = doc
    this.via = via
    this.host = doc.createElement('div')
    this.host.setAttribute(ROOT_ATTR, ROOT_VALUE)
    this.prefs = new SessionPreferences({
      doc,
      exited: () => this.exited,
      watermarkImageLoaded: image => {
        if (image && this.state === 'preview') this.stage.refreshDisplay()
      },
      loaded: () => {
        this.picking.sync()
        // a frame handed over by the selection menu is pending, not captured, and needs no picking chips
        if (this.state === 'selecting') void this.offerPicking()
      },
    })
    this.settingsLoadedPromise = this.prefs.load()
    this.errorPanel = new ErrorPanel(doc, this.host, () => exitScreenshotMode())
    this.pending = new PendingFrame({
      doc,
      host: () => this.host,
      state: () => this.state,
      setState: state => (this.state = state),
      selection: () => this.selection,
      setSelection: rect => (this.selection = rect),
      selectionElement: () => this.selectionEl,
      setSelectionElement: el => (this.selectionEl = el),
      pageDim: dimmed => {
        if (this.overlayEl) this.overlayEl.style.background = dimmed ? '' : 'transparent'
      },
      clearHover: () => this.hover.clear(),
      clearRatioBar: () => this.picking.clearRatioBar(),
      syncHint: () => this.picking.sync(),
      setConfirmShield: on => this.setConfirmShield(on),
      confirmBox: () => this.confirmBox,
      forgetFrame: () => this.lastFrame.reset(),
      adoptFrame: selection => {
        const view = this.doc.defaultView!
        this.lastFrame.adopted(selection, { x: view.scrollX, y: view.scrollY })
      },
      captureRegion: () => void this.flow.region(),
    })
    this.links = new PageLinks(doc, this.host)
    this.picking = new PickingChrome({
      doc,
      host: () => this.host,
      hintElement: () => this.hintEl,
      pending: () => this.state === 'confirming',
      anonymize: () => (this.prefs.anonymizeAvailable() ? { on: this.prefs.anonymizeOn } : null),
      watermark: () => (this.prefs.settings?.watermark.enabled ? { on: this.prefs.watermarkOn } : null),
      ratio: () => this.ratio,
      presets: () => this.prefs.settings?.ratioPresets ?? [],
      onRatio: id => {
        this.ratio = id
        this.picking.showRatioBar()
      },
      onStitch: () => void this.beginStitching(),
    })
    this.keys = this.makeKeys(doc)
    this.stage = new EditorStage({
      doc,
      host: () => this.host,
      inPreview: () => this.state === 'preview',
      busy: () => this.busy,
      notice: () => this.notice,
      anonymize: () => (this.prefs.anonymizeAvailable() ? this.prefs.anonymizeOn : null),
      watermark: () => (this.prefs.settings?.watermark.enabled ? this.prefs.watermarkOn : null),
      selection: () => this.selection,
      source: () => this.sourceCanvas,
      elementRect: () => this.elementRect,
      clearPickingUi: () => {
        this.selectionEl?.remove()
        this.selectionEl = null
        this.picking.hide()
        this.overlayEl?.style.setProperty('background', 'transparent')
      },
      dimPageAgain: () => this.setConfirmShield(false),
      beautify: () => this.prefs.beautify,
      changeBeautify: patch => this.changeBeautify(patch),
      resetBeautify: () => this.resetBeautify(),
      ratioPresets: () => this.prefs.settings?.ratioPresets ?? [],
      paintOptions: () => ({
        watermarkOn: this.prefs.watermarkOn,
        watermark: this.prefs.settings?.watermark,
        watermarkImage: this.prefs.watermarkImage,
        via: this.via,
        dpr: this.flow.dpr,
      }),
      exit: () => exitScreenshotMode(),
      copy: () => this.runDestination(busy => this.destinations.copy(busy)),
      download: () => this.runDestination(busy => this.destinations.download(busy)),
      save: () => this.runDestination(busy => this.destinations.save(busy)),
      registerDrawingCleanup: cleanup => (this.drawingCleanup = cleanup),
    })
    this.destinations = new Destinations({
      doc,
      entryId: () => this.entryId,
      via: () => this.via,
      settings: () => this.prefs.settings,
      croppedCanvas: () => this.stage.editingCanvas,
      displayCanvas: () => this.stage.display,
      beautifyEnabled: () => this.prefs.beautify.enabled,
      watermarkOn: () => this.prefs.watermarkOn,
      frameKind: () => (this.stitched ? 'stitched' : this.lastFrame.reused ? 'reused' : this.elementRect ? 'element' : 'drag'),
      sourceUrl: () => this.capturedSourceUrl ?? this.links.url(),
      rememberFrame: () => this.lastFrame.remember(this.doc, this.selection),
      say: (message, isError) => this.showNotice(message, isError === true),
      saved: () => {
        announceSaved(this.doc)
        exitScreenshotMode()
      },
    })
    this.hover = new HoverPicker({
      doc,
      host: () => this.host,
      picking: () => this.state === 'selecting' && !this.selectionEl,
      pageElements: (x, y) => this.links.elementsAt(x, y),
    })
    this.drag = new FrameDrag({
      doc,
      host: () => this.host,
      selection: () => this.selection,
      setSelection: rect => (this.selection = rect),
      selectionElement: () => this.selectionEl,
      setSelectionElement: el => (this.selectionEl = el),
      pageDim: dimmed => {
        if (this.overlayEl) this.overlayEl.style.background = dimmed ? '' : 'transparent'
      },
      edgeRectsUnder: (x, y) => this.links.edgeRectsUnder(x, y),
      ratio: () => this.ratio,
      paintSnapGuides: snapped => this.confirmBox.paintSnapGuides(snapped),
      clearSnapGuides: () => this.confirmBox.clearSnapGuides(),
      frameReplaced: () => (this.lastFrame.reused = false),
      click: (x, y, wasConfirming) => {
        if (wasConfirming) this.hover.track(x, y)
        else this.clickHoveredLayer()
      },
      released: () => this.enterConfirming(),
      registerCleanup: cleanup => (this.selectionCleanup = cleanup),
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
    this.flow = new CaptureFlow({
      doc,
      exited: () => this.exited,
      shoot: () => this.photographer.shoot(),
      settingsLoaded: () => this.settingsLoadedPromise,
      selection: () => this.selection,
      setSelection: rect => (this.selection = rect),
      permalinkForRegion: rect => (this.capturedSourceUrl = this.links.regionPermalink(rect)),
      permalinkForElement: node => (this.capturedSourceUrl = this.links.elementPermalink(node)),
      anonymize: () => ({ on: this.prefs.anonymizeOn, parts: this.prefs.anonymizeParts }),
      fail: message => this.showError(message),
      takeInk: () => {
        const ink = this.pendingInk
        this.pendingInk = null
        return ink ?? []
      },
      say: message => this.showNotice(message),
      handOver: (capture, dpr, ink, masks, elementRect, sourceUrl) => {
        this.sourceCanvas = capture
        this.elementRect = elementRect
        this.capturedSourceUrl = sourceUrl
        this.stage.attach(capture, dpr, ink, masks)
        this.state = 'preview'
        this.stage.open()
      },
      adoptLayerFrame: (layer, box, margin) => {
        const view = this.doc.defaultView!
        this.lastFrame.adoptElement(
          layer.range
            ? { kind: 'box', pageX: box.left + view.scrollX, pageY: box.top + view.scrollY, width: box.width, height: box.height }
            : {
                kind: 'element',
                selector: buildSelector(layer.element),
                margin,
                width: box.width,
                height: box.height,
                pageX: box.left + view.scrollX,
                pageY: box.top + view.scrollY,
              },
        )
        this.lastFrame.reused = false
      },
      frameTooBig: () => {
        this.lastFrame.reset()
        this.state = 'selecting'
        this.showNotice(uiText('shot.frameTooBig'))
      },
      adoptElementFrame: (target, section) => {
        const view = this.doc.defaultView!
        const box = section ? sectionIntervalRect(target, section) : target.getBoundingClientRect()
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
      },
      beginCapture: () => {
        this.state = 'capturing'
        this.setConfirmShield(false)
      },
    })
    this.photographer = new Photographer({
      doc,
      hide: () => (this.host.style.display = 'none'),
      restore: () => (this.host.style.display = ''),
      cancelled: () => this.exited,
    })
    this.bubble = createNoticeBubble(doc, this.host, {
      toolbarBox: () => {
        const el = this.stage.toolbarElement
        return el?.isConnected ? el.getBoundingClientRect() : null
      },
      textNode: text => this.textNode(text),
    })
  }

  begin(): void {
    const shell = mountSessionShell(this.doc, this.host, {
      onKeydown: this.onKeydown,
      onFocus: this.onFocus,
      onPointerDown: this.onPointerDown,
      onHoverMove: this.onHoverMove,
      onSwallowPageAction: this.onSwallowPageAction,
    })
    this.overlayEl = shell.overlay
    this.hintEl = shell.hint
    this.picking.sync()
    this.settingsLoadedPromise = this.prefs.load()
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

  /**
   * The memory has its say first, then the picking chips: a frame offered a round trip after the session opened
   * must not find the chips already on the screen beside it. Not part of `settingsLoaded` — no shot waits for it.
   */
  private async offerPicking(): Promise<void> {
    await this.pending.restore(
      () => this.lastFrame.offer(this.doc),
      // the frame arrives a worker round trip after the session opened: a pointer that is already picking its
      // own target, or a drag under way, keeps it, and the frame waits for the next trigger
      () => !this.exited && this.state === 'selecting' && !this.hover.hasTarget && !this.selectionEl,
    )
    if (this.exited || this.state !== 'selecting' || this.stitching) return
    this.picking.showRatioBar()
  }

  private readonly onFocus = (): void => {
    this.picking.sync()
  }

  /** The anonymity/watermark state moved: the picking hint reads it, and so does the editor's status strip. */
  private syncStatus(): void {
    this.picking.sync()
    this.stage.updateToolbar()
  }

  // ── scrolling long screenshot (screenshot.md §1.5) ────────────────

  private stitching = false

  private async beginStitching(): Promise<void> {
    await this.stitchRun.begin({
      doc: this.doc,
      hideUi: () => (this.host.style.display = 'none'),
      restoreUi: () => (this.host.style.display = ''),
      exited: () => this.exited,
      alreadyRunning: () => this.stitching,
      clearPicking: () => {
        this.stitching = true
        this.hover.clear()
        this.selectionEl?.remove()
        this.selectionEl = null
        this.hintEl?.style.setProperty('display', 'none')
      },
      gaveUp: code => {
        this.stitching = false
        this.state = 'selecting'
        this.picking.unhideHint()
        this.pending.letGo()
        this.picking.showRatioBar()
        if (code !== 'cancel') this.showExternalNotice(stitchNotice(code))
      },
      capped: () => this.showNotice(uiText('shot.stitch.capped'), false),
      beginCaptureState: () => {
        this.stitching = false
        this.state = 'capturing'
      },
      settingsLoaded: () => this.settingsLoadedPromise,
      finished: async (result, startLeft, startTop) => {
        // the ink on the page is screen-fixed at this point: it lands on the first
        // segment, where it was drawn (annotate.md §1.3, screenshot.md §1.5)
        this.selection = { x: 0, y: 0, width: result.widthCss, height: result.heightCss }
        this.flow.dpr = result.dpr
        this.stitched = true
        this.lastFrame.reset()
        this.capturedSourceUrl = this.links.url()
        this.sourceCanvas = result.canvas
        this.stage.attach(result.canvas, result.dpr, this.flow.consumeInkStitched(startLeft, startTop, result.widthCss, result.heightCss), [])
        this.state = 'preview'
        this.stage.open()
      },
    })
  }

  private textNode(t: string): Text {
    return this.doc.createTextNode(t)
  }
  exit(): void {
    this.exited = true
    this.selectionCleanup?.()
    this.drawingCleanup?.()
    this.stage.close()
    this.doc.removeEventListener('keydown', this.onKeydown, true)
    this.doc.removeEventListener('focus', this.onFocus, true)
    this.doc.removeEventListener('pointerdown', this.onPointerDown, true)
    this.doc.removeEventListener('pointermove', this.onHoverMove, true)
    for (const type of SWALLOWED_EVENT_TYPES) {
      this.doc.removeEventListener(type, this.onSwallowPageAction, true)
    }
    this.confirmBox.clear()
    this.hover.clear()
    this.bubble.dispose()
    // a session replaced while its scrolling capture runs stops the stitcher:
    // otherwise it keeps scrolling and photographing an orphaned page
    this.stitchRun.cancel()
    this.stitching = false
    this.host.remove()
    this.selectionEl = null
    this.picking.clearRatioBar()
    this.prefs.watermarkImage = null
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
  private pointerInSelection(x: number, y: number): boolean {
    const box = this.selection
    if (!box) return false
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.state !== 'selecting' && this.state !== 'confirming') return
    if (!isUserInput(e)) return
    if (this.links.isShotChrome(e.target)) return
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
    this.confirmBox.clear()
    this.selectionEl?.remove()
    this.selectionEl = null
    this.state = 'selecting'
    if (letGo) {
      this.pending.letGo()
      this.picking.showRatioBar()
    }
    this.drag.begin(e, letGo)
  }

  /**
   * A pending frame is let go (screenshot.md §1.2): its label and the memory's offer go with it, and the picking line and
   * chips are back — a new drag is under way, or the user clicked outside to choose again. The overlay dims the page
   * again until a new rect takes over that.
   */
  /** Element boxes under a point, for drag snapping. */
  /** The released selection stays adjustable: handles, nudge, confirm bar. */
  private enterConfirming(label?: string): void {
    this.pending.enter(label)
  }

  /** Enter confirms the pending selection (or the remembered frame). */
  private confirmSelection(): void {
    this.pending.confirm()
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
  // ── the capture paths (screenshot.md §1) ──────────────────────────

  /** The capsule's direct path; a click on the hovered layer — the capture flow owns which road it takes. */
  captureElement(target: HTMLElement, section?: BlockCandidate['range']): Promise<void> {
    return this.flow.element(target, section)
  }

  private clickHoveredLayer(): void {
    const layer = this.hover.layer()
    const margin = this.hover.margin
    this.hover.clear()
    if (layer) this.flow.hovered(layer, margin)
  }

  /** A pending frame handed over by the caller (selection menu): confirm with Enter, adjust, or cancel. */
  beginWithInitialRect(rect: ViewportRect): void {
    if (this.state !== 'selecting') return
    const view = this.doc.defaultView!
    const clamped = intersectRects(rect, { x: 0, y: 0, width: view.innerWidth, height: view.innerHeight })
    if (!clamped || clamped.width < 4 || clamped.height < 4) return
    this.selection = clamped
    this.pending.paint()
    this.pending.enter()
  }

  /**
   * The block capsule's direct path: capture a known element without
   * selection. The element also becomes the remembered frame, like the
   * click path does (区块路径的截图也记为“上次取景框”). A section hands its
   * interval: the frame and the raster are the outlined run, not the
   * container it shares with its neighbours (RV-CAP-13).
   */
  // ── the three destinations (screenshot.md §4) ─────────────────────

  /** One destination run: the busy flag paints the toolbar, the destination does the rest. */
  private runDestination(run: (busy: (on: boolean) => void) => Promise<void>): void {
    if (!this.stage.editingCanvas || this.busy) return
    this.busy = true
    this.stage.updateToolbar()
    void run(on => {
      this.busy = on
      this.stage.updateToolbar()
    })
  }

  private changeBeautify(patch: Partial<BeautifySettings>): void {
    this.prefs.beautify = applyBeautifyChange(this.prefs.beautify, patch)
    this.stage.beautify.sync(this.prefs.beautify)
    this.stage.refreshDisplay()
  }

  private resetBeautify(): void {
    this.prefs.beautify = { ...(this.prefs.settings?.beautify ?? DEFAULT_BEAUTIFY) }
    this.stage.beautify.sync(this.prefs.beautify)
    this.stage.refreshDisplay()
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
      this.stage.updateToolbar()
      return
    }
    this.notice = undefined
    this.stage.updateToolbar()
    this.bubble.show(message)
  }

  private showError(message: string): void {
    this.errorPanel.remove()
    this.selectionEl?.remove()
    if (this.overlayEl) this.overlayEl.style.background = 'rgb(10 14 25 / 0.58)'
    this.errorPanel.show(message)
    this.state = 'error'
  }
}
