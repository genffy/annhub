/**
 * Screenshot capture UI chain — docs/product/screenshot.md.
 * Plain DOM (no React) for the session shell; the toolbar is a small React
 * island. One session element per trigger (idempotent enter()).
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
import { screenshotFailureText, screenshotSaveErrorText, uiText } from '../../../utils/ui-text'
import { newEntryId } from '../../../learning-core/assets'
import { normalizeHost } from '../../../learning-core/normalize'
import { extractPageMeta, resolvePermalink } from '../page-meta'
import { isUserInput } from '../user-input'
import type { CaptureVia, ResponseMessage } from '../../../types/messages'
import type { ViewportRect } from './crop'
import { computeCropSource, CropError, intersectRects } from './crop'
import { ALL_IDENTITY_PARTS, detectIdentityRects, type IdentityParts } from './detect'
import { applyViewportAnonymization } from './anonymize'
import { captureElement } from './element-capture'
import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { ScreenshotToolbar } from './toolbar'
import {
  clampStep,
  isLineTool,
  nextStepNumber,
  renderScreenshot,
  snapLine,
  stepAt,
  stepNumbers,
  stepRadius,
  type Annotation,
  type LineWidth,
  type Point,
  type ScreenshotTool,
  type StepAnnotation,
} from './editor'
import {
  applyBeautifyChange,
  BEAUTIFY_BACKGROUNDS,
  composeGeometry,
  constrainToRatio,
  constrainToRatioValue,
  decodeWatermarkImage,
  DEFAULT_BEAUTIFY,
  downloadExtension,
  downloadFormatFor,
  downloadMime,
  matteOnWhite,
  paintBeautified,
  paintWatermark,
  placePanel,
  placeSizeLabel,
  previewBox,
  ratioOf,
  type BeautifySettings,
  type DownloadFormat,
  type WatermarkImage,
} from './output'
import { createBeautifyPanel, type BeautifyPanel } from './beautify-panel'
import {
  HANDLES,
  adjustHierarchy,
  boxWithinTolerance,
  buildSelector,
  collectEdges,
  elementChain,
  expandByMargin,
  fitsInViewport,
  handleAnchor,
  nudgeBox,
  pageStable,
  resizeFromHandle,
  snapPoint,
  type HandleId,
} from './selection'
import { readFrame, rememberFrame, type FrameRecord } from './frame-memory'
import { permalinkForRegion } from './permalink'
import { inkToEditorAnnotations, type InkStroke } from '../annotation/ink'
import type { ExtensionSettings } from '../../../background-service/settings-schema'

const ROOT_ATTR = 'data-ann-ui'
const ROOT_VALUE = 'screenshot-session'
/** Asking again this often, this many times, covers the whole second the browser's capture limit counts. */
const CAPTURE_RATE_RETRY_MS = 400
const CAPTURE_RATE_RETRIES = 3

let activeSession: ScreenshotSession | null = null

export interface EnterScreenshotOptions {
  via?: CaptureVia
  /** The block capsule's target: skip selection, straight to element capture. */
  element?: HTMLElement
  /** A pending frame to confirm (Enter) or adjust, e.g. the selection menu's screenshot path (真机走查 P2-5). */
  initialRect?: ViewportRect
  /** Page-annotation ink at capture time (annotate.md §1.3): drawn back onto the capture as ordinary annotations. */
  ink?: InkStroke[]
  /** The annotation layer waits for the session to end so it can come back with its ink. */
  onExit?: () => void
}

export function enterScreenshotMode(options: EnterScreenshotOptions = {}): void {
  // Idempotent: a second trigger replaces the pending session.
  activeSession?.exit()
  activeSession = new ScreenshotSession(document, options.via ?? 'shortcut')
  activeSession.pendingInk = options.ink ?? null
  activeSession.onSessionExit = options.onExit ?? null
  activeSession.begin()
  if (options.element) void activeSession.captureElementTarget(options.element)
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
  private toolbarRoot: Root | null = null
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
  private selectedStep: StepAnnotation | null = null
  /** A badge is under the pointer, being put down or dragged; the ring waits until it is let go. */
  private stepHeld = false
  private stepRingEl: HTMLDivElement | null = null
  private tool: ScreenshotTool = null
  private color = '#e5484d'
  /** What the pen, the line and the highlighter draw at; like the colour, every screenshot starts from the default. */
  private lineWidth: LineWidth = 'medium'
  private busy = false
  private exited = false
  private notice: { message: string; error: boolean } | undefined
  private textInput: HTMLTextAreaElement | null = null
  /** Where on the capture the open text box was clicked. */
  private textAt: Point = { x: 0, y: 0 }
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
  private beautifyPanel: BeautifyPanel | null = null
  /** where the beautify panel is while it is open; it stays there as long as that place is free */
  private panelSpot: { left: number; top: number } | null = null
  /** What the preview shows, and what copy and download send: the capture composed with beautify and watermark. Always a canvas of its own. */
  private displayCanvas: HTMLCanvasElement | null = null
  /** where the capture sits inside the display canvas (the padding of a beautified picture) */
  private contentOrigin: Point = { x: 0, y: 0 }
  /** the preview on screen as last laid out */
  private previewNow: ViewportRect | null = null
  // precise selection and repeatable frames (screenshot.md §1.2, §1.4)
  private hoverEl: HTMLElement | null = null
  private hoverChain: Element[] = []
  private hoverIndex = 0
  private hoverOutlineEl: HTMLDivElement | null = null
  private margin = 0
  private marginBarEl: HTMLDivElement | null = null
  private confirmBarEl: HTMLDivElement | null = null
  private handleEls: HTMLDivElement[] = []
  private frameLabelEl: HTMLDivElement | null = null
  private frameLabel = ''
  private snapXEl: HTMLDivElement | null = null
  private snapYEl: HTMLDivElement | null = null
  private shiftRatio: number | null = null
  private pendingFrameRecord: FrameRecord | null = null
  private reusedFrame = false
  /** Page-annotation ink handed over with the trigger (annotate.md §1.3); consumed when the capture is in. */
  pendingInk: InkStroke[] | null = null
  /** The annotation layer's callback, run once when this session ends for any reason. */
  onSessionExit: (() => void) | null = null
  private readonly onKeydown = (e: KeyboardEvent) => {
    if (!isUserInput(e)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (this.textInput) {
        this.commitText()
        return
      }
      if (this.beautifyPanel) {
        this.closeBeautifyPanel()
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
    if (this.state === 'preview' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !this.textInput) {
      e.preventDefault()
      void this.copyCurrent()
      return
    }
    if (this.state === 'preview' && (e.key === 'Delete' || e.key === 'Backspace') && !this.textInput && this.shownStep()) {
      e.preventDefault()
      this.deleteSelectedStep()
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
    if (this.state === 'confirming' && this.selection && !this.hoverOutlineEl) {
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
    if ((this.state === 'selecting' || this.state === 'confirming') && this.hoverOutlineEl && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      this.hoverIndex = adjustHierarchy(this.hoverChain, this.hoverIndex, e.key === 'ArrowUp' ? 1 : -1)
      this.paintHover()
    }
    if (this.state === 'preview' && (e.key === 'w' || e.key === 'W') && this.settings?.watermark.enabled) {
      e.preventDefault()
      this.watermarkOn = !this.watermarkOn
      this.syncStatus()
      this.refreshDisplay()
    }
    // The editor is modal for the keyboard: Tab stays inside the session's own
    // controls instead of walking the masked page, where Enter on a link would
    // navigate away and drop the shot (真机走查 P2-6). The text input keeps the
    // browser's own Tab so typing still behaves as usual.
    if (this.state === 'preview' && e.key === 'Tab' && !this.textInput) {
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
  }

  begin(): void {
    const style = this.doc.createElement('style')
    style.textContent = `
      [${ROOT_ATTR}="${ROOT_VALUE}"] { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"].ann-shot-modal { pointer-events: auto; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-overlay { position: absolute; inset: 0; background: rgba(22, 26, 31, 0.58); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-hint { position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
        background: #252b31; color: #fff; padding: 7px 12px; border-radius: 4px; font: 13px/1.4 -apple-system, sans-serif; pointer-events: none; white-space: nowrap; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-hint b { color: #a8dad2; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-rect { position: absolute; box-sizing: border-box; border: 2px solid #4c91ff; background: transparent; box-shadow: 0 0 0 9999px rgba(22, 26, 31, 0.58); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-size { position: absolute; left: 0; bottom: calc(100% + 6px); padding: 2px 6px; pointer-events: none; background: #252b31; color: #fff; border-radius: 3px; font: 12px/1.4 -apple-system, sans-serif; white-space: nowrap; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-preview { position: absolute; box-sizing: border-box; border: 2px solid #4c91ff; background: #fff; box-shadow: 0 0 0 9999px rgba(22, 26, 31, 0.58); pointer-events: auto; touch-action: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-preview canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-preview textarea { position: absolute; z-index: 2; min-width: 110px; min-height: 32px; padding: 4px; box-sizing: border-box; border: 1px solid #4c91ff; background: var(--annov-surface, #fff); color: var(--annov-text, #20252b); font: 16px/1.3 -apple-system, sans-serif; resize: both; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-toolbar { position: absolute; z-index: 3; box-sizing: border-box; max-width: calc(100vw - 16px); padding: 5px; border: 1px solid var(--annov-border, #d7dce1); border-radius: 5px; background: var(--annov-surface, #fff); box-shadow: 0 6px 20px rgba(0,0,0,.22); pointer-events: auto; color: var(--annov-text, #252b31); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools { display: flex; align-items: center; width: max-content; max-width: calc(100vw - 28px); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tool-scroll { display: flex; align-items: center; gap: 2px; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tool-scroll > button, [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tool-scroll > span { flex: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-actions { display: flex; align-items: center; flex: none; margin-left:  5px; padding-left: 5px; border-left: 1px solid var(--annov-border, #d7dce1); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--annov-text, #252b31); cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button:hover, [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button.ann-shot-active { background: var(--annov-tool-hover-bg, #e7f1f0); color: var(--annov-tool-hover-text, #126f65); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button:disabled { opacity: .35; cursor: default; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button.ann-shot-confirm { color: var(--annov-tool-confirm, #15805c); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-divider { width: 1px; height: 22px; margin: 0 3px; background: var(--annov-border, #d7dce1); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-colors { display: flex; gap: 2px; align-items: center; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-colors { flex: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button.ann-shot-swatch { width: 19px; height: 19px; margin: 0 2px; border: 1px solid var(--annov-input-border, #aeb6bd); border-radius: 50%; background: var(--swatch); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button.ann-shot-swatch-active { outline: 2px solid #4c91ff; outline-offset: 2px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-masks { display: flex; gap: 5px; padding: 5px 2px 1px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-masks span { display: flex; align-items: center; gap: 3px; padding: 2px 5px; background: var(--annov-chip-bg, #edf0f2); border-radius: 3px; font: 11px/1.2 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-masks button { display: grid; place-items: center; padding: 0; border: 0; background: none; cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-notice { padding: 4px 6px 2px; font: 12px/1.3 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-steps { display: flex; align-items: center; gap: 8px; padding: 5px 2px 1px; font: 12px/1.3 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-steps button { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border: 1px solid var(--annov-input-border, #aeb6bd); border-radius: 4px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-steps button:hover:not(:disabled) { background: var(--annov-tool-hover-bg, #e7f1f0); color: var(--annov-tool-hover-text, #126f65); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-steps button:disabled { opacity: .45; cursor: default; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-widths { display: flex; align-items: center; gap: 2px; padding: 5px 2px 1px; font: 12px/1.3 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-widths span { margin-right: 6px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-widths button { display: grid; place-items: center; width: 26px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-widths button:hover, [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-widths button.ann-shot-active { background: var(--annov-tool-hover-bg, #e7f1f0); color: var(--annov-tool-hover-text, #126f65); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-widths i { display: block; border-radius: 50%; background: currentColor; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-step-ring { position: absolute; z-index: 1; box-sizing: border-box; border: 2px solid #4c91ff; border-radius: 50%; pointer-events: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-step-ring button { position: absolute; top: -10px; right: -10px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: #4c91ff; color: #fff; font: 600 15px/1 -apple-system, sans-serif; cursor: pointer; pointer-events: auto; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-error-panel { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(360px, calc(100vw - 32px)); min-height: 70px; padding: 18px; border: 0; border-radius: 5px; box-shadow: 0 8px 28px rgba(0,0,0,.28); font: 14px/1.5 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-error-panel button { margin-top: 12px; padding: 5px 12px; border: 1px solid var(--annov-input-border, #cbd5e1); border-radius: 4px; background: var(--annov-surface, #fff); cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-error { color: var(--annov-danger, #b91c1c); }
    `
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
    const response = await MessageUtils.sendMessage<ExtensionSettings>({ type: 'GET_SETTINGS' })
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
    // a frame handed over by the selection menu is pending, not captured
    if (this.state === 'selecting' || this.state === 'confirming') {
      this.showRatioBar()
      void this.restoreRememberedFrame()
    }
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

  private syncHint(): void {
    if (!this.hintEl) return
    this.hintEl.innerHTML = ''
    // the segments read as one line; “ · ” keeps them from running together
    // (真机走查 P3-1：“Esc to cancelAAnonymize: on”)
    const sep = (): Text => this.textNode(' · ')
    this.hintEl.append(
      this.textNode(uiText('shot.hint')),
      // with both identity kinds switched off in settings there is nothing for `A` to do
      ...(this.anonymizeAvailable()
        ? [sep(), this.boldNode('A'), this.textNode(` ${uiText('shot.anonymize', { state: uiText(this.anonymizeOn ? 'shot.on' : 'shot.off') })}`)]
        : []),
      ...(this.settings?.watermark.enabled
        ? [sep(), this.boldNode('W'), this.textNode(` ${uiText('shot.watermark', { state: uiText(this.watermarkOn ? 'shot.on' : 'shot.off') })}`)]
        : []),
    )
  }

  private syncStatus(): void {
    this.syncHint()
  }

  private anonymizeAvailable(): boolean {
    return this.anonymizeParts.avatar || this.anonymizeParts.name
  }

  /** The selection bar's ratio chips: 自由 plus the presets enabled in settings (screenshot.md §1.3). */
  private showRatioBar(): void {
    if (!this.settings || this.settings.ratioPresets.length === 0) return
    this.ratioBarEl?.remove()
    const bar = this.doc.createElement('div')
    bar.className = 'ann-shot-ratio-bar'
    bar.setAttribute('data-ann-ui', 'screenshot-ratio-bar')
    const chip = (id: string, label: string) => {
      const button = this.doc.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.className = this.ratio === id ? 'ann-shot-ratio-active' : ''
      button.setAttribute('aria-pressed', String(this.ratio === id))
      button.addEventListener('click', event => {
        if (!isUserInput(event)) return
        this.ratio = id
        this.showRatioBar()
      })
      return button
    }
    bar.append(chip('free', uiText('shot.ratio.free')))
    for (const id of this.settings.ratioPresets) bar.append(chip(id, id))
    this.host.appendChild(bar)
    this.ratioBarEl = bar
  }
  private textNode(t: string): Text {
    return this.doc.createTextNode(t)
  }
  private boldNode(t: string): HTMLElement {
    const b = this.doc.createElement('b')
    b.textContent = t
    return b
  }

  exit(): void {
    this.exited = true
    this.selectionCleanup?.()
    this.drawingCleanup?.()
    this.toolbarResizeObserver?.disconnect()
    this.toolbarResizeObserver = null
    this.toolbarRoot?.unmount()
    this.toolbarRoot = null
    this.doc.removeEventListener('keydown', this.onKeydown, true)
    this.doc.removeEventListener('pointerdown', this.onPointerDown, true)
    this.doc.removeEventListener('pointermove', this.onHoverMove, true)
    for (const type of SWALLOWED_EVENT_TYPES) {
      this.doc.removeEventListener(type, this.onSwallowPageAction, true)
    }
    this.clearConfirmUi()
    this.clearHoverUi()
    this.host.remove()
    this.selectionEl = null
    this.previewEl = null
    this.toolbarEl = null
    this.ratioBarEl = null
    this.beautifyPanel = null
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

  private onHoverMove = (e: PointerEvent): void => {
    if (!isUserInput(e)) return
    this.trackHover(e.clientX, e.clientY)
  }

  /**
   * Confirming is modal (issue #108). Selecting stays click-through so the
   * element path can see the page; the class is what the stylesheet and the
   * block capsule both read. Inline pointer-events wins over that rule while
   * a hit-test momentarily looks through the shield.
   */
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
    if (typeof this.doc.elementsFromPoint !== 'function') return []
    const shielded = this.host.classList.contains('ann-shot-modal')
    if (shielded) this.host.style.pointerEvents = 'none'
    try {
      return this.doc.elementsFromPoint(x, y)
    } finally {
      if (shielded) this.host.style.pointerEvents = 'auto'
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.state !== 'selecting' && this.state !== 'confirming') return
    if (!isUserInput(e)) return
    if (this.isShotChrome(e.target)) return
    // Inside the pending frame: not a new selection, and not a click for the page.
    // An armed element pick is the click-element path — it keeps working even
    // inside the frame and replaces it (screenshot.md §1.2「单击元素的路径不变」).
    if (this.state === 'confirming' && this.pointerInSelection(e.clientX, e.clientY) && !this.hoverOutlineEl) {
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

    // any drag replaces a pending selection (and the remembered frame)
    this.setConfirmShield(false)
    this.clearConfirmUi()
    this.selectionEl?.remove()
    this.selectionEl = null
    this.state = 'selecting'
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
      this.paintSnapGuides(snapped)
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
      this.reusedFrame = false
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
      this.clearSnapGuides()
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
        this.captureHoveredElement()
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

  private paintSnapGuides(snapped: { snappedX: number | null; snappedY: number | null }): void {
    const view = this.doc.defaultView!
    if (snapped.snappedX !== null && !this.snapXEl) {
      const line = this.doc.createElement('div')
      line.className = 'ann-shot-snap-line ann-shot-snap-x'
      this.host.appendChild(line)
      this.snapXEl = line
    }
    if (this.snapXEl) {
      this.snapXEl.style.display = snapped.snappedX === null ? 'none' : ''
      if (snapped.snappedX !== null) this.snapXEl.style.left = `${snapped.snappedX}px`
    }
    if (snapped.snappedY !== null && !this.snapYEl) {
      const line = this.doc.createElement('div')
      line.className = 'ann-shot-snap-line ann-shot-snap-y'
      this.host.appendChild(line)
      this.snapYEl = line
    }
    if (this.snapYEl) {
      this.snapYEl.style.display = snapped.snappedY === null ? 'none' : ''
      if (snapped.snappedY !== null) this.snapYEl.style.top = `${snapped.snappedY}px`
    }
    void view
  }

  private clearSnapGuides(): void {
    this.snapXEl?.remove()
    this.snapYEl?.remove()
    this.snapXEl = null
    this.snapYEl = null
  }

  // ── pending confirmation (screenshot.md §1.2) ─────────────────────

  /** The released selection stays adjustable: handles, nudge, confirm bar. */
  private enterConfirming(label = this.frameLabel): void {
    this.state = 'confirming'
    this.frameLabel = label
    this.clearConfirmUi()
    this.clearHoverUi()
    if (!this.selectionEl || !this.selection) return

    for (const handle of HANDLES) {
      const anchor = handleAnchor(handle)
      const el = this.doc.createElement('div')
      el.className = `ann-shot-handle ann-shot-handle-${handle}`
      el.setAttribute('data-ann-ui', `shot-handle-${handle}`)
      el.style.cursor = anchor.cursor
      el.addEventListener('pointerdown', event => {
        if (!isUserInput(event) || !this.selection) return
        event.preventDefault()
        event.stopPropagation()
        this.dragHandle(handle, event)
      })
      this.selectionEl.appendChild(el)
      this.handleEls.push(el)
      void anchor
    }

    const bar = this.doc.createElement('div')
    bar.className = 'ann-shot-confirm-bar'
    bar.setAttribute('data-ann-ui', 'shot-confirm-bar')
    const confirm = this.doc.createElement('button')
    confirm.type = 'button'
    confirm.textContent = uiText('shot.confirmSelection')
    confirm.setAttribute('data-ann-ui', 'shot-confirm-btn')
    confirm.addEventListener('click', event => {
      if (isUserInput(event)) void this.confirmSelection()
    })
    const cancel = this.doc.createElement('button')
    cancel.type = 'button'
    cancel.textContent = uiText('common.cancel')
    cancel.setAttribute('data-ann-ui', 'shot-confirm-cancel')
    cancel.addEventListener('click', event => {
      if (isUserInput(event)) exitScreenshotMode()
    })
    bar.append(confirm, cancel)
    if (this.frameLabel) {
      const label = this.doc.createElement('span')
      label.className = 'ann-shot-frame-label'
      label.setAttribute('data-ann-ui', 'shot-frame-label')
      label.textContent = this.frameLabel
      bar.appendChild(label)
    }
    this.host.appendChild(bar)
    this.confirmBarEl = bar
    this.positionConfirmBar()
    this.paintSelection()
    this.setConfirmShield(true)
  }

  private positionConfirmBar(): void {
    const bar = this.confirmBarEl
    const selection = this.selection
    if (!bar || !selection) return
    const view = this.doc.defaultView!
    const width = bar.offsetWidth || 220
    let x = selection.x + selection.width - width
    x = Math.max(8, Math.min(view.innerWidth - width - 8, x))
    const below = selection.y + selection.height + 8
    const y = below + 40 <= view.innerHeight ? below : Math.max(8, selection.y - 48)
    bar.style.left = `${x}px`
    bar.style.top = `${y}px`
  }

  /** Re-renders the pending rect, handles, size label and bar position. */
  private paintSelection(): void {
    const rect = this.selectionEl
    const selection = this.selection
    if (!rect || !selection) return
    rect.style.left = `${selection.x}px`
    rect.style.top = `${selection.y}px`
    rect.style.width = `${selection.width}px`
    rect.style.height = `${selection.height}px`
    const size = rect.querySelector('.ann-shot-size') as HTMLElement | null
    if (size) size.textContent = `${Math.round(selection.width)} x ${Math.round(selection.height)}`
    this.positionConfirmBar()
  }

  private dragHandle(handle: HandleId, start: PointerEvent): void {
    const origin = { x: start.clientX, y: start.clientY }
    const base = { ...this.selection! }
    const view = this.doc.defaultView!
    const move = (ev: PointerEvent): void => {
      if (!isUserInput(ev)) return
      this.selection = resizeFromHandle(base, handle, ev.clientX - origin.x, ev.clientY - origin.y, { width: view.innerWidth, height: view.innerHeight })
      this.paintSelection()
    }
    const up = (ev: PointerEvent): void => {
      if (isUserInput(ev)) void 0
      this.doc.removeEventListener('pointermove', move)
      this.doc.removeEventListener('pointerup', up)
    }
    this.doc.addEventListener('pointermove', move)
    this.doc.addEventListener('pointerup', up)
  }

  /** Enter confirms the pending selection (or the remembered frame). */
  private async confirmSelection(): Promise<void> {
    if (!this.selection || this.state !== 'confirming') return
    const view = this.doc.defaultView!
    // a free-dragged frame is remembered by its page position (screenshot.md §1.4)
    this.pendingFrameRecord = {
      kind: 'box',
      pageX: this.selection.x + view.scrollX,
      pageY: this.selection.y + view.scrollY,
      width: this.selection.width,
      height: this.selection.height,
    }
    this.clearConfirmUi()
    await this.captureRegionMode()
  }

  private clearConfirmUi(): void {
    this.confirmBarEl?.remove()
    this.confirmBarEl = null
    this.frameLabelEl?.remove()
    this.frameLabelEl = null
    for (const el of this.handleEls) el.remove()
    this.handleEls = []
  }

  // ── element path: hover, hierarchy, margin (screenshot.md §1.2, §1.4) ──

  /**
   * Tracks the element a click would capture; paints outline + margin bar.
   * Hovering also works while a remembered frame waits for confirmation —
   * clicking elsewhere replaces that frame (screenshot.md §1.4).
   */
  private trackHover(x: number, y: number): void {
    if (this.state !== 'selecting' && this.state !== 'confirming') return
    if (this.state === 'selecting' && this.selectionEl) return
    if (typeof this.doc.elementsFromPoint !== 'function') return
    const stack = this.pageElementsFromPoint(x, y)
    // the pointer on our own chrome (margin chips, bars) keeps the hover alive
    const top = stack[0]
    if (top?.closest?.('[data-ann-ui]')) return
    const target = stack.find(el => !el.closest?.('[data-ann-ui]')) as HTMLElement | undefined
    if (!target || target === this.doc.body || target === this.doc.documentElement) {
      this.clearHoverUi()
      return
    }
    if (target !== this.hoverEl) {
      this.hoverEl = target
      this.hoverChain = elementChain(this.resolveCaptureTarget(target))
      this.hoverIndex = 0
      this.paintHover()
      return
    }
    // same element: keep the painted UI instead of rebuilding it under a click
    if (!this.hoverOutlineEl || !this.marginBarEl) this.paintHover()
  }

  private paintHover(): void {
    const el = this.hoverChain[this.hoverIndex] as HTMLElement | undefined
    if (!el) {
      this.clearHoverUi()
      return
    }
    this.hoverOutlineEl?.remove()
    const outline = this.doc.createElement('div')
    outline.className = 'ann-shot-hover-outline'
    outline.setAttribute('data-ann-ui', 'shot-hover-outline')
    const box = el.getBoundingClientRect()
    Object.assign(outline.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
    this.host.appendChild(outline)
    this.hoverOutlineEl = outline
    this.showMarginBar(box)
  }

  /** The margin bar rides the hovered element's frame (screenshot.md §1.4). */
  private showMarginBar(box: DOMRect): void {
    this.marginBarEl?.remove()
    const bar = this.doc.createElement('div')
    bar.className = 'ann-shot-margin-bar'
    bar.setAttribute('data-ann-ui', 'shot-margin-bar')
    const label = this.doc.createElement('span')
    label.className = 'ann-shot-margin-label'
    label.textContent = uiText('shot.margin')
    bar.appendChild(label)
    for (const margin of [0, 8, 16, 24, 32]) {
      const chip = this.doc.createElement('button')
      chip.type = 'button'
      chip.textContent = String(margin)
      chip.className = this.margin === margin ? 'ann-shot-ratio-active' : ''
      chip.setAttribute('data-ann-ui', `shot-margin-${margin}`)
      chip.addEventListener('click', event => {
        if (!isUserInput(event)) return
        this.margin = margin
        this.paintHover()
      })
      bar.appendChild(chip)
    }
    const custom = this.doc.createElement('input')
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
        this.paintHover()
      }
    })
    bar.appendChild(custom)
    this.host.appendChild(bar)
    this.marginBarEl = bar
    const view = this.doc.defaultView!
    const width = bar.offsetWidth || 300
    let x = box.left + box.width / 2 - width / 2
    x = Math.max(8, Math.min(view.innerWidth - width - 8, x))
    const below = box.bottom + 8
    const y = below + 40 <= view.innerHeight ? below : Math.max(8, box.top - 48)
    bar.style.left = `${x}px`
    bar.style.top = `${y}px`
  }

  private clearHoverUi(): void {
    this.hoverEl = null
    this.hoverChain = []
    this.hoverIndex = 0
    this.hoverOutlineEl?.remove()
    this.hoverOutlineEl = null
    this.marginBarEl?.remove()
    this.marginBarEl = null
  }

  /**
   * A click on a hovered element: element + margin goes the region path when
   * the frame fits the window (the ring shows the real page); a bigger
   * element itself goes the clone path without margin (screenshot.md §1.4).
   */
  private captureHoveredElement(): void {
    const el = this.hoverChain[this.hoverIndex] as HTMLElement | undefined
    const hovered = el ?? this.hoverEl
    this.clearHoverUi()
    if (!hovered) return
    const view = this.doc.defaultView!
    const box = hovered.getBoundingClientRect()
    const frame = expandByMargin({ x: box.left, y: box.top, width: box.width, height: box.height }, this.margin)
    this.pendingFrameRecord = {
      kind: 'element',
      selector: buildSelector(hovered),
      margin: this.margin,
      width: box.width,
      height: box.height,
      pageX: box.left + view.scrollX,
      pageY: box.top + view.scrollY,
    }
    this.reusedFrame = false
    if (fitsInViewport(frame, { width: view.innerWidth, height: view.innerHeight })) {
      this.selection = frame
      void this.captureRegionMode()
      return
    }
    if (this.margin === 0 || !fitsInViewport({ x: box.left, y: box.top, width: box.width, height: box.height }, { width: view.innerWidth, height: view.innerHeight })) {
      void this.captureElementMode(hovered)
      return
    }
    // the margin overflows the window: say so and keep the session (screenshot.md §1.4 放不下)
    this.pendingFrameRecord = null
    this.state = 'selecting'
    this.showNotice(uiText('shot.frameTooBig'))
  }

  /** Climb from an inline target to its nearest block ancestor for a sensible shot. */
  private resolveCaptureTarget(el: HTMLElement): HTMLElement {
    let current: HTMLElement = el
    const view = this.doc.defaultView!
    for (let depth = 0; depth < 6 && current.parentElement && current.parentElement !== this.doc.body; depth++) {
      const display = view.getComputedStyle(current).display
      if (display.startsWith('inline') && display !== 'inline-block') {
        current = current.parentElement
      } else {
        break
      }
    }
    return current
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

    // captureVisibleTab photographs the screen — our session UI must be gone.
    // The frame waits for a settled layout (max 500ms), and a transparent
    // hover-catcher takes the cursor so page hover styles clear before the
    // shot (screenshot.md §1.4).
    this.host.style.display = 'none'
    const sweeper = this.doc.createElement('div')
    sweeper.setAttribute(ROOT_ATTR, 'screenshot-hover-sweeper')
    Object.assign(sweeper.style, { position: 'fixed', inset: '0', pointerEvents: 'auto', background: 'transparent', zIndex: '2147483646' })
    this.doc.documentElement.appendChild(sweeper)
    await pageStable(this.doc.defaultView!, 500)
    await doubleRaf()
    const dropSweeper = (): void => {
      sweeper.remove()
      this.host.style.display = ''
    }
    if (this.exited) {
      dropSweeper()
      restoreAnonymize?.()
      return
    }

    let dataUrl: string
    try {
      const response = await this.requestCapture()
      if (!response.success || !response.data?.dataUrl) {
        throw new Error(screenshotFailureText(response.error, 'shot.error.capture'))
      }
      dataUrl = response.data.dataUrl
    } catch (error) {
      if (!this.exited) this.showError(error instanceof Error ? error.message : uiText('shot.error.capture'))
      dropSweeper()
      return
    } finally {
      dropSweeper()
      restoreAnonymize?.()
    }
    if (this.exited) return

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
   * captured, in one group for undo (annotate.md §1.3, D-38): strokes fully
   * outside the frame are out, strokes crossing its boundary are cut at it.
   */
  private consumeInk(frame: ViewportRect): Annotation[] {
    const ink = this.pendingInk
    this.pendingInk = null
    if (!ink || ink.length === 0) return []
    return inkToEditorAnnotations(ink, frame, this.capturedDpr || 1)
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
   * click path does (真机走查 P3-4：区块路径的截图也记为“上次取景框”).
   */
  async captureElementTarget(target: HTMLElement): Promise<void> {
    if (this.exited) return
    const element = this.resolveCaptureTarget(target)
    const view = this.doc.defaultView!
    const box = element.getBoundingClientRect()
    this.pendingFrameRecord = {
      kind: 'element',
      selector: buildSelector(element),
      margin: 0,
      width: box.width,
      height: box.height,
      pageX: box.left + view.scrollX,
      pageY: box.top + view.scrollY,
    }
    this.reusedFrame = false
    await this.captureElementMode(target)
  }

  /**
   * The browser takes two captures a second and refuses a third (`CAPTURE_RATE_LIMITED`): a shot right after two
   * others waits the second out and asks again (screenshot.md §2). The wait is here, in the page, whose timers keep
   * time; the worker's can fire seconds late.
   */
  private async requestCapture(): Promise<ResponseMessage<{ dataUrl: string }>> {
    for (let retry = 0; ; retry++) {
      const response = await MessageUtils.sendMessage<{ dataUrl: string }>({ type: 'CAPTURE_VISIBLE_TAB', requestId: `shot-${Date.now()}` })
      if (response.success || response.error !== 'CAPTURE_RATE_LIMITED' || retry === CAPTURE_RATE_RETRIES) return response
      await new Promise(resolve => setTimeout(resolve, CAPTURE_RATE_RETRY_MS))
      // cancelled while waiting: nothing more to photograph
      if (this.exited) return response
    }
  }

  private async captureElementMode(target: HTMLElement): Promise<void> {
    this.state = 'capturing'
    this.setConfirmShield(false)
    const element = this.resolveCaptureTarget(target)
    this.rememberElementPermalink(element)
    await this.settingsLoaded
    if (this.exited) return
    try {
      this.croppedCanvas = await captureElement(element, this.anonymizeOn ? { anonymize: this.anonymizeParts } : {})
    } catch {
      // the rasterizer's own message is English and means nothing to the user
      if (!this.exited) this.showError(uiText('shot.error.element'))
      return
    }
    if (this.exited) return
    this.maskBoxes = []
    const bounds = element.getBoundingClientRect()
    this.elementRect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    this.capturedDpr = this.croppedCanvas.width / Math.max(1, element.getBoundingClientRect().width)
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
    this.selectedStep = null
    // the page's ink arrives as one step of its own: one undo takes it all off again (annotate.md §1.3, D-38)
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
    this.toolbarRoot?.unmount()
    this.toolbarEl?.remove()
    this.beautifyPanel?.el.remove()
    this.beautifyPanel = null

    const display = this.displayCanvas!
    const panel = this.doc.createElement('div')
    panel.className = 'ann-shot-preview'
    panel.setAttribute(ROOT_ATTR, 'screenshot-preview')
    const size = this.doc.createElement('span')
    size.className = 'ann-shot-size'
    panel.append(size, display, this.createStepRing())
    display.addEventListener('pointerdown', this.onCanvasPointerDown)
    display.addEventListener('pointermove', this.onCanvasHover)
    this.host.appendChild(panel)
    this.previewEl = panel

    const toolbar = this.doc.createElement('div')
    toolbar.className = 'ann-shot-toolbar'
    toolbar.setAttribute(ROOT_ATTR, 'screenshot-toolbar')
    this.host.appendChild(toolbar)
    this.toolbarEl = toolbar
    this.toolbarRoot = createRoot(toolbar)
    // React 19 commits a root's first render later; without flushSync the frame
    // below can run before the buttons exist and focus stays on the page (真机走查 P2-6).
    flushSync(() => this.updateToolbar())
    this.toolbarResizeObserver = new ResizeObserver(() => {
      this.positionToolbar()
      this.positionSizeLabel()
      this.positionBeautifyPanel()
    })
    this.toolbarResizeObserver.observe(toolbar)
    this.refreshDisplay()
    requestAnimationFrame(() => {
      this.layout()
      // The editor takes the keyboard: focus starts on the toolbar, not on the
      // masked page behind it (真机走查 P2-6).
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
    this.positionBeautifyPanel()
    this.positionStepRing()
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

  private updateToolbar(): void {
    this.toolbarRoot?.render(
      createElement(ScreenshotToolbar, {
        tool: this.tool,
        color: this.color,
        lineWidth: this.lineWidth,
        maskCount: this.maskBoxes.length,
        canUndo: this.history.length > 0,
        nextStep: nextStepNumber(this.annotations, this.stepSequence),
        beautifyOpen: this.beautifyPanel !== null,
        busy: this.busy,
        notice: this.notice,
        onTool: tool => {
          this.tool = tool
          // the selection belongs to the step tool: another tool, or none, lets it go
          if (tool !== 'step') this.selectedStep = null
          if (this.displayCanvas) this.displayCanvas.style.cursor = ''
          this.positionStepRing()
          this.updateToolbar()
        },
        onColor: color => {
          this.color = color
          this.updateToolbar()
        },
        onLineWidth: width => {
          this.lineWidth = width
          this.updateToolbar()
        },
        onRemoveMask: index => {
          this.maskBoxes.splice(index, 1)
          this.renderEditor()
          this.updateToolbar()
        },
        onUndo: () => this.undo(),
        onResetSteps: () => this.resetSteps(),
        onBeautify: () => this.toggleBeautifyPanel(),
        onCopy: () => void this.copyCurrent(),
        onDownload: () => void this.downloadOnly(),
        onCancel: () => exitScreenshotMode(),
        onSave: () => void this.confirmSave(),
      }),
    )
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
    const scale = this.capturedDpr
    const geometry = this.beautify.enabled ? composeGeometry({ width: content.width, height: content.height }, this.beautify, scale) : null
    // (re)sizing a canvas clears it, which is what a redraw wants
    display.width = geometry ? geometry.canvas.width : content.width
    display.height = geometry ? geometry.canvas.height : content.height
    const ctx = display.getContext('2d')!
    if (geometry) paintBeautified(ctx, content, geometry, this.beautify, scale)
    else ctx.drawImage(content, 0, 0)
    this.contentOrigin = geometry ? { x: geometry.content.x, y: geometry.content.y } : { x: 0, y: 0 }
    const watermark = this.settings?.watermark
    if (watermark?.enabled && this.watermarkOn) {
      paintWatermark(ctx, display, watermark, geometry !== null && !BEAUTIFY_BACKGROUNDS[this.beautify.background].light, this.watermarkImage)
    }
    this.layout()
  }

  /** A pointer position as a point of the capture: the preview may show it with padding around it, and scaled down. */
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
      this.openTextInput(this.canvasPoint(e), localPoint(this.displayCanvas!, e))
      return
    }
    if (this.tool === 'step') {
      this.pressStep(e)
      return
    }
    const start = this.canvasPoint(e)
    const tool = this.tool
    const draft: Annotation = isLineTool(tool)
      ? { tool, start, end: start, points: [start], color: this.color, width: this.lineWidth }
      : { tool, start, end: start, points: [start], color: this.color }
    // the pen and the highlighter go where the pointer goes; the line goes straight to it, or with Shift held to the
    // nearest horizontal, vertical or 45° diagonal (screenshot.md §1.1)
    const follow = (ev: PointerEvent) => {
      const point = this.canvasPoint(ev)
      draft.end = draft.tool === 'line' && ev.shiftKey ? snapLine(start, point) : point
      if (draft.tool === 'pen' || draft.tool === 'highlighter') draft.points.push(draft.end)
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

  private openTextInput(point: Point, displayPoint: Point): void {
    this.commitText()
    const input = this.doc.createElement('textarea')
    input.setAttribute('aria-label', uiText('shot.textInput.placeholder'))
    input.setAttribute(ROOT_ATTR, 'screenshot-text-input')
    input.placeholder = uiText('shot.textInput.placeholder')
    const panel = this.previewEl!.getBoundingClientRect()
    const view = this.doc.defaultView!
    input.style.width = `${Math.min(210, view.innerWidth - 24)}px`
    input.style.left = `${Math.max(8 - panel.left, Math.min(displayPoint.x, view.innerWidth - panel.left - Math.min(210, view.innerWidth - 24) - 8))}px`
    input.style.top = `${Math.max(8 - panel.top, Math.min(displayPoint.y, view.innerHeight - panel.top - 54))}px`
    input.style.color = this.color
    input.addEventListener('keydown', event => {
      event.stopPropagation()
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        this.commitText()
      }
    })
    // clicking away closes the box like Enter and Esc do; a box that was already replaced has nothing left to say
    input.addEventListener('blur', () => {
      if (this.textInput === input) this.commitText()
    })
    this.previewEl!.appendChild(input)
    this.textInput = input
    this.textAt = point
    input.focus()
  }

  /**
   * Closes the text box, if one is open, and turns what was typed into an annotation. Enter, Esc, clicking away and
   * opening another box all end here, so the text is never lost to the way the box was closed.
   */
  private commitText(): void {
    const input = this.textInput
    if (!input) return
    // out of the field before out of the page: removing a focused element blurs it, and that blur comes back here
    this.textInput = null
    const value = input.value.trim()
    input.remove()
    if (!value) return
    this.commit([...this.annotations, { tool: 'text', start: this.textAt, text: value, color: this.color }])
  }

  // ── step badges (screenshot.md §1.1) ──────────────────────────────

  /**
   * The step tool on the picture: a press on a badge selects it and drags it, anywhere else the next badge follows the
   * pointer and is put down where it is let go. Each is one step for undo; a click that only selects is none.
   */
  private pressStep(e: PointerEvent): void {
    const scale = this.capturedDpr
    const size = { width: this.croppedCanvas!.width, height: this.croppedCanvas!.height }
    const start = this.canvasPoint(e)
    const pressed = stepAt(this.annotations, start, scale)
    const badge: StepAnnotation = pressed ?? { tool: 'step', at: clampStep(start, size, scale), color: this.color, sequence: this.stepSequence }
    // a pressed badge moves as far as the pointer does; a new one stays under the pointer
    const grab = pressed ? { x: start.x - pressed.at.x, y: start.y - pressed.at.y } : { x: 0, y: 0 }
    let placed = badge
    const draft = (): Annotation[] => (pressed ? this.annotations.map(annotation => (annotation === pressed ? placed : annotation)) : [...this.annotations, placed])
    const follow = (ev: PointerEvent) => {
      const point = this.canvasPoint(ev)
      placed = { ...badge, at: clampStep({ x: point.x - grab.x, y: point.y - grab.y }, size, scale) }
    }
    this.selectedStep = pressed
    this.stepHeld = true
    this.renderEditor(draft())
    const move = (ev: PointerEvent) => {
      follow(ev)
      this.renderEditor(draft())
    }
    const up = (ev: PointerEvent) => {
      cleanup()
      follow(ev)
      // a click on a badge only selects it, and a badge undo took away while it was held stays away
      if (pressed && (Math.hypot(placed.at.x - pressed.at.x, placed.at.y - pressed.at.y) < 3 || !this.annotations.includes(pressed))) {
        this.renderEditor()
        return
      }
      if (pressed) this.selectedStep = placed
      this.commit(draft())
    }
    const cancel = () => {
      cleanup()
      this.renderEditor()
    }
    const cleanup = () => {
      this.stepHeld = false
      this.doc.removeEventListener('pointermove', move)
      this.doc.removeEventListener('pointerup', up)
      this.doc.removeEventListener('pointercancel', cancel)
      this.drawingCleanup = null
    }
    this.drawingCleanup = cleanup
    this.doc.addEventListener('pointermove', move)
    this.doc.addEventListener('pointerup', up)
    this.doc.addEventListener('pointercancel', cancel)
  }

  /** Over a badge the step tool can drag, the pointer says so. */
  private onCanvasHover = (e: PointerEvent): void => {
    const display = this.displayCanvas
    if (!display || !this.croppedCanvas || this.stepHeld || this.state !== 'preview') return
    display.style.cursor = this.tool === 'step' && stepAt(this.annotations, this.canvasPoint(e), this.capturedDpr) ? 'move' : ''
  }

  /** The selected badge, while the step tool can act on it: on the picture, and not under the pointer. */
  private shownStep(): StepAnnotation | null {
    const step = this.selectedStep
    return this.tool === 'step' && step && !this.stepHeld && this.annotations.includes(step) ? step : null
  }

  /** The ring that marks the selected badge, with the × that deletes it. It sits over the picture, never on it. */
  private createStepRing(): HTMLDivElement {
    const ring = this.doc.createElement('div')
    ring.className = 'ann-shot-step-ring'
    ring.setAttribute(ROOT_ATTR, 'screenshot-step-selection')
    ring.style.display = 'none'
    const remove = this.doc.createElement('button')
    remove.type = 'button'
    remove.textContent = '×'
    remove.setAttribute(ROOT_ATTR, 'screenshot-step-delete')
    remove.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.deleteSelectedStep()
      // the button goes with its badge; the keyboard stays with the tool
      this.toolbarEl?.querySelector<HTMLElement>('[data-ann-ui="screenshot-tool-step"]')?.focus()
    })
    ring.append(remove)
    this.stepRingEl = ring
    return ring
  }

  /** Puts the ring where the selected badge is on screen: the preview may pad the capture and scale it down. */
  private positionStepRing(): void {
    const ring = this.stepRingEl
    const display = this.displayCanvas
    const step = this.shownStep()
    if (!ring) return
    if (!step || !display || this.state !== 'preview') {
      ring.style.display = 'none'
      return
    }
    const box = display.getBoundingClientRect()
    const kx = box.width / (display.width || 1)
    const ky = box.height / (display.height || 1)
    const radius = stepRadius(this.capturedDpr) * Math.max(kx, ky) + 4
    const x = (step.at.x + this.contentOrigin.x) * kx
    const y = (step.at.y + this.contentOrigin.y) * ky
    Object.assign(ring.style, { display: 'block', left: `${x - radius}px`, top: `${y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px` })
    const label = uiText('shot.step.delete', { number: stepNumbers(this.annotations).get(step) ?? 1 })
    const remove = ring.querySelector('button')!
    remove.title = label
    remove.setAttribute('aria-label', label)
  }

  /** Delete, Backspace or the ring's ×: the selected badge goes, and the badges after it in its sequence move up one. */
  private deleteSelectedStep(): void {
    const step = this.shownStep()
    if (!step || this.busy) return
    this.selectedStep = null
    this.commit(this.annotations.filter(annotation => annotation !== step))
  }

  /** 重置计数: the next badge is 1, in a sequence of its own; the badges already down keep their numbers. */
  private resetSteps(): void {
    if (this.busy || nextStepNumber(this.annotations, this.stepSequence) === 1) return
    this.commit(this.annotations, this.stepSequence + 1)
  }

  // ── the three destinations (screenshot.md §4) ─────────────────────

  /** Confirm: save the processed image as a screenshot entry, in one transaction with its asset. */
  private async confirmSave(): Promise<void> {
    const canvas = this.croppedCanvas
    if (!canvas || this.busy) return
    // `capture.saved` times the click to the committed write (metrics.md §9), not the editing that came before it
    const clickedAt = Date.now()
    this.busy = true
    this.updateToolbar()
    try {
      // runtime messaging cannot carry Blobs, so the processed PNG travels as
      // a dataUrl; the store persists bytes (dataUrl is transport only).
      const dataUrl = canvas.toDataURL('image/png')
      // the page's meta fills whichever presets the user checked for
      // screenshots (entry.md §5.4) — same extractor and fallbacks as clips
      const meta = extractPageMeta(this.doc, normalizeHost(this.doc.defaultView!.location.href))
      const response = await MessageUtils.sendMessage<{ entry: { id: string } }>({
        type: 'SAVE_SCREENSHOT',
        data: {
          id: this.entryId,
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          sourceUrl: this.capturedSourceUrl ?? this.pageUrl(),
          title: meta.title,
          ...(meta.author ? { author: meta.author } : {}),
          ...(meta.published ? { published: meta.published } : {}),
          ...(meta.description ? { description: meta.description } : {}),
          via: this.via,
          frame: this.reusedFrame ? 'reused' : this.elementRect ? 'element' : 'drag',
          startedAt: clickedAt,
        },
      })
      if (!response.success) throw new Error(screenshotSaveErrorText(response.error))
      this.rememberLastFrame()
      announceSaved(this.doc)
      exitScreenshotMode()
    } catch (error) {
      this.showNotice(error instanceof Error ? error.message : uiText('shot.error.saveFailed'), true)
    } finally {
      this.busy = false
      this.updateToolbar()
    }
  }

  /** Copy keeps the editing session (screenshot.md §4.2); `http:` pages get the download hint. */
  private async copyCurrent(): Promise<void> {
    const canvas = this.displayCanvas ?? this.croppedCanvas
    if (!canvas || this.busy) return
    this.busy = true
    this.updateToolbar()
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob || !this.doc.defaultView!.navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error(uiText('shot.copyInstead'))
      }
      await this.doc.defaultView!.navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      this.rememberLastFrame()
      this.showNotice(uiText('shot.copied'))
      void MessageUtils.sendMessage({
        type: 'RECORD_EVENT',
        name: 'screenshot.copied',
        props: { watermark: Boolean(this.settings?.watermark.enabled && this.watermarkOn), beautify: this.beautify.enabled },
      })
    } catch {
      // The clipboard API is closed on http: pages and can be rejected without
      // focus — the image and every annotation stay for download or retry.
      this.showNotice(this.doc.defaultView!.location.protocol === 'http:' ? uiText('shot.copyInstead') : uiText('shot.error.copyFailed'), true)
    } finally {
      this.busy = false
      this.updateToolbar()
    }
  }

  /** Download keeps the editing session, in the format chosen in settings (screenshot.md §4.2). */
  private async downloadOnly(): Promise<void> {
    const canvas = this.displayCanvas ?? this.croppedCanvas
    if (!canvas || this.busy) return
    this.busy = true
    this.updateToolbar()
    try {
      const format: DownloadFormat = (this.settings?.downloadFormat as DownloadFormat) ?? 'png'
      // JPEG has no alpha: whatever is transparent is painted on white first (screenshot.md §4.2)
      const output = format === 'jpeg' ? matteOnWhite(canvas, this.doc) : canvas
      const dataUrl = output.toDataURL(downloadMime(format), this.settings?.downloadQuality ?? 0.9)
      // a codec the browser cannot encode comes back as PNG bytes (screenshot.md §5):
      // download the PNG and say so, instead of failing on a name the bytes do not match
      const actual = downloadFormatFor(format, dataUrl)
      const response = await MessageUtils.sendMessage<{ downloadId: number }>({
        type: 'DOWNLOAD_IMAGE',
        dataUrl,
        extension: downloadExtension(actual),
        watermark: Boolean(this.settings?.watermark.enabled && this.watermarkOn),
        beautify: this.beautify.enabled,
      })
      if (!response.success) throw new Error(screenshotFailureText(response.error, 'shot.error.downloadFailed'))
      this.rememberLastFrame()
      this.showNotice(actual === format ? uiText('shot.downloaded') : uiText('shot.downloadedAsPng'))
    } catch (error) {
      this.showNotice(error instanceof Error ? error.message : uiText('shot.error.downloadFailed'), true)
    } finally {
      this.busy = false
      this.updateToolbar()
    }
  }

  /**
   * The beautify panel (screenshot.md §4.4): its changes show at once, 复原 goes back to the style the settings give, none of it
   * is in the undo stack, and it shapes only what is copied and downloaded.
   */
  private toggleBeautifyPanel(): void {
    if (this.beautifyPanel) this.closeBeautifyPanel()
    else this.openBeautifyPanel()
  }

  private openBeautifyPanel(): void {
    if (this.state !== 'preview') return
    const panel = createBeautifyPanel(this.doc, {
      settings: this.beautify,
      ratios: this.settings?.ratioPresets ?? [],
      onChange: patch => this.changeBeautify(patch),
      onReset: () => this.resetBeautify(),
    })
    this.host.appendChild(panel.el)
    this.beautifyPanel = panel
    this.panelSpot = null
    this.updateToolbar()
    this.positionBeautifyPanel()
    panel.focus()
  }

  /** Closes the panel and gives the keyboard back to the button that opened it. */
  private closeBeautifyPanel(): void {
    const panel = this.beautifyPanel
    if (!panel) return
    panel.el.remove()
    this.beautifyPanel = null
    this.panelSpot = null
    this.updateToolbar()
    this.toolbarEl?.querySelector<HTMLElement>('[data-ann-ui="screenshot-beautify"]')?.focus()
  }

  private changeBeautify(patch: Partial<BeautifySettings>): void {
    this.beautify = applyBeautifyChange(this.beautify, patch)
    this.beautifyPanel?.sync(this.beautify)
    this.refreshDisplay()
  }

  private resetBeautify(): void {
    this.beautify = { ...(this.settings?.beautify ?? DEFAULT_BEAUTIFY) }
    this.beautifyPanel?.sync(this.beautify)
    this.refreshDisplay()
  }

  /** Beside the picture where there is room, else under the toolbar: clear of both, inside the window. */
  private positionBeautifyPanel(): void {
    const panel = this.beautifyPanel?.el
    const toolbar = this.toolbarEl
    const preview = this.previewNow
    if (!panel || !toolbar || !preview) return
    const view = this.doc.defaultView!
    const size = panel.getBoundingClientRect()
    const bar = toolbar.getBoundingClientRect()
    const spot = placePanel(
      { width: size.width, height: size.height },
      { toolbar: { x: bar.x, y: bar.y, width: bar.width, height: bar.height }, preview },
      { width: view.innerWidth, height: view.innerHeight },
      this.panelSpot ?? undefined,
    )
    this.panelSpot = spot
    panel.style.left = `${spot.left}px`
    panel.style.top = `${spot.top}px`
  }

  /**
   * 入库 / 复制 / 下载 succeeded: the frame that produced this capture is
   * remembered for the next session on this page in this tab (screenshot.md
   * §1.4). Element frames refresh their anchor and size; cancel never writes.
   */
  private rememberLastFrame(): void {
    const record = this.pendingFrameRecord
    if (!record) return
    if (record.kind === 'element') {
      const el = this.doc.querySelector(record.selector)
      const view = this.doc.defaultView!
      if (el) {
        const box = el.getBoundingClientRect()
        record.width = box.width
        record.height = box.height
        record.pageX = box.left + view.scrollX
        record.pageY = box.top + view.scrollY
      }
    } else {
      const view = this.doc.defaultView!
      if (this.selection) {
        record.pageX = this.selection.x + view.scrollX
        record.pageY = this.selection.y + view.scrollY
      }
    }
    void rememberFrame(record)
  }

  /**
   * The remembered frame opens the session as a pending selection
   * (screenshot.md §1.4): anchored to its element when that is found within
   * 10% drift, otherwise the recorded page position with a notice; the page
   * scrolls so the frame lands fully in view.
   */
  private async restoreRememberedFrame(): Promise<void> {
    const record = await readFrame()
    // the frame arrives a worker round trip after the session opened: a pointer that
    // is already picking its own target keeps it, and the frame waits for the next trigger
    if (!record || this.exited || this.state !== 'selecting' || this.hoverEl) return
    const view = this.doc.defaultView!
    let label = `${uiText('shot.lastFrame')} · ${Math.round(record.width + (record.kind === 'element' ? record.margin * 2 : 0))} × ${Math.round(record.height + (record.kind === 'element' ? record.margin * 2 : 0))}`
    if (record.kind === 'element') {
      const el = this.doc.querySelector(record.selector)
      const box = el?.getBoundingClientRect()
      if (el && box && boxWithinTolerance({ width: box.width, height: box.height }, record)) {
        el.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
        const fresh = el.getBoundingClientRect()
        this.selection = expandByMargin({ x: fresh.left, y: fresh.top, width: fresh.width, height: fresh.height }, record.margin)
        this.pendingFrameRecord = { ...record, width: fresh.width, height: fresh.height }
      } else {
        const fallback = this.frameAtRecordedPosition(record)
        if (!fallback) return
        this.selection = fallback
        this.pendingFrameRecord = null
        label += ` · ${uiText('shot.frameNotFound')}`
      }
    } else {
      const fallback = this.frameAtRecordedPosition(record)
      if (!fallback) return
      this.selection = fallback
      this.pendingFrameRecord = null
    }
    if (!fitsInViewport(this.selection, { width: view.innerWidth, height: view.innerHeight })) {
      label += ` · ${uiText('shot.frameTooBig')}`
    }
    this.frameLabel = label
    this.reusedFrame = true
    this.paintFrameSelection()
    this.enterConfirming(label)
  }

  /**
   * Fallback when the remembered frame's anchor is gone (or the record is a
   * plain box): scroll the recorded page rect back into view — the recording
   * happened somewhere on this page — then express it as a viewport selection
   * clamped to what is visible (screenshot.md §1.4). Returns null when no
   * part of the rect can be brought on screen.
   */
  private frameAtRecordedPosition(record: FrameRecord): ViewportRect | null {
    const view = this.doc.defaultView!
    const margin = record.kind === 'element' ? record.margin : 0
    const expanded = expandByMargin({ x: record.pageX, y: record.pageY, width: record.width, height: record.height }, margin)
    // Browsers clamp these assignments to the scrollable area; jsdom no-ops.
    const scroller = this.doc.scrollingElement
    if (scroller) {
      scroller.scrollLeft = expanded.x
      scroller.scrollTop = expanded.y
    }
    const rect = { x: expanded.x - view.scrollX, y: expanded.y - view.scrollY, width: expanded.width, height: expanded.height }
    return intersectRects(rect, { x: 0, y: 0, width: view.innerWidth, height: view.innerHeight })
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
    if (this.hintEl) this.hintEl.style.display = 'none'
  }

  /**
   * A notice from outside the session — the annotation trigger pointing at
   * the session instead of opening (annotate.md §1.1). The toolbar's notice
   * only exists in the preview, so this is its own hint-style bar, in every
   * state, that leaves on its own.
   */
  showExternalNotice(message: string): void {
    this.host.querySelector(`[${ROOT_ATTR}="screenshot-external-notice"]`)?.remove()
    const el = this.doc.createElement('div')
    el.className = 'ann-shot-hint'
    el.setAttribute(ROOT_ATTR, 'screenshot-external-notice')
    el.textContent = message
    this.host.appendChild(el)
    window.setTimeout(() => el.remove(), 2600)
  }

  showNotice(message: string, error = false): void {
    this.notice = { message, error }
    this.updateToolbar()
  }

  private showError(message: string): void {
    this.previewEl?.remove()
    this.selectionEl?.remove()
    if (this.overlayEl) this.overlayEl.style.background = 'rgba(22, 26, 31, 0.58)'
    const panel = this.doc.createElement('div')
    panel.className = 'ann-shot-preview ann-shot-error-panel'
    panel.setAttribute(ROOT_ATTR, 'screenshot-error')
    panel.style.pointerEvents = 'auto'
    const text = this.doc.createElement('div')
    text.className = 'ann-shot-error'
    text.textContent = `${uiText('shot.failed')}: ${message}`
    const close = this.doc.createElement('button')
    close.textContent = uiText('common.close')
    close.onclick = () => exitScreenshotMode()
    panel.append(text, close)
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
 * save, so the live region lives on the document and removes itself (真机走查
 * P2-6：保存成功读屏没有任何播报).
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
