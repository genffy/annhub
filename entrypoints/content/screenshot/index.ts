/**
 * Screenshot capture UI chain — docs/v2/screenshot.md.
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
import { uiText } from '../../../utils/ui-text'
import { isUserInput } from '../user-input'
import type { CaptureVia } from '../../../types/messages'
import type { ViewportRect } from './crop'
import { computeCropSource, CropError } from './crop'
import { detectIdentityRects } from './detect'
import { applyViewportAnonymization } from './anonymize'
import { captureElement } from './element-capture'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ScreenshotToolbar } from './toolbar'
import { renderScreenshot, type Annotation, type Point, type ScreenshotTool } from './editor'
import {
  BEAUTIFY_BACKGROUNDS,
  composeGeometry,
  constrainToRatio,
  downloadExtension,
  downloadMime,
  ratioOf,
  watermarkBox,
  type BeautifySettings,
  type DownloadFormat,
} from './output'
import type { ExtensionSettings } from '../../../background-service/settings-schema'

const ROOT_ATTR = 'data-ann-ui'
const ROOT_VALUE = 'screenshot-session'

let activeSession: ScreenshotSession | null = null

export interface EnterScreenshotOptions {
  via?: CaptureVia
  /** The block capsule's target: skip selection, straight to element capture. */
  element?: HTMLElement
}

export function enterScreenshotMode(options: EnterScreenshotOptions = {}): void {
  // Idempotent: a second trigger replaces the pending session.
  activeSession?.exit()
  activeSession = new ScreenshotSession(document, options.via ?? 'shortcut')
  activeSession.begin()
  if (options.element) void activeSession.captureElementTarget(options.element)
}

export function exitScreenshotMode(): void {
  activeSession?.exit()
  activeSession = null
}

export function isScreenshotSessionActive(): boolean {
  return activeSession !== null
}

class ScreenshotSession {
  private readonly doc: Document
  private readonly host: HTMLDivElement
  private hintEl: HTMLDivElement | null = null
  private state: 'selecting' | 'capturing' | 'preview' | 'error' | 'done' = 'selecting'
  private selection: ViewportRect | null = null
  private selectionEl: HTMLDivElement | null = null
  private previewEl: HTMLElement | null = null
  private overlayEl: HTMLDivElement | null = null
  private toolbarEl: HTMLDivElement | null = null
  private toolbarRoot: Root | null = null
  private toolbarResizeObserver: ResizeObserver | null = null
  private sourceCanvas: HTMLCanvasElement | null = null
  private elementRect: ViewportRect | null = null
  private maskBoxes: ViewportRect[] = []
  private annotations: Annotation[] = []
  private tool: ScreenshotTool = null
  private color = '#e5484d'
  private busy = false
  private exited = false
  private notice: { message: string; error: boolean } | undefined
  private textInput: HTMLTextAreaElement | null = null
  private selectionCleanup: (() => void) | null = null
  private drawingCleanup: (() => void) | null = null
  private croppedCanvas: HTMLCanvasElement | null = null
  private capturedDpr = 1
  private anonymizeOn = true
  private via: CaptureVia
  private settings: ExtensionSettings | null = null
  private ratio = 'free'
  private ratioBarEl: HTMLDivElement | null = null
  private watermarkOn = true
  private beautify: BeautifySettings = { enabled: false, background: 'solid-white', padding: 'medium', radius: 12, shadow: true }
  private beautifyPanelEl: HTMLDivElement | null = null
  private displayCanvas: HTMLCanvasElement | null = null
  private readonly onKeydown = (e: KeyboardEvent) => {
    if (!isUserInput(e)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (this.textInput) {
        this.textInput.remove()
        this.textInput = null
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
    if (this.state === 'selecting' && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      this.anonymizeOn = !this.anonymizeOn
      this.syncHint()
    }
    if (this.state === 'preview' && (e.key === 'w' || e.key === 'W') && this.settings?.watermark.enabled) {
      e.preventDefault()
      this.watermarkOn = !this.watermarkOn
      this.syncStatus()
      this.refreshDisplay()
    }
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
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-overlay { position: absolute; inset: 0; background: rgba(22, 26, 31, 0.58); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-hint { position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
        background: #252b31; color: #fff; padding: 7px 12px; border-radius: 4px; font: 13px/1.4 -apple-system, sans-serif; pointer-events: none; white-space: nowrap; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-hint b { color: #a8dad2; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-rect { position: absolute; box-sizing: border-box; border: 2px solid #4c91ff; background: transparent; box-shadow: 0 0 0 9999px rgba(22, 26, 31, 0.58); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-size { position: absolute; left: 0; bottom: calc(100% + 6px); padding: 2px 6px; background: #252b31; color: #fff; border-radius: 3px; font: 12px/1.4 -apple-system, sans-serif; white-space: nowrap; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-preview { position: absolute; box-sizing: border-box; border: 2px solid #4c91ff; background: #fff; box-shadow: 0 0 0 9999px rgba(22, 26, 31, 0.58); pointer-events: auto; touch-action: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-preview canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-preview textarea { position: absolute; z-index: 2; min-width: 110px; min-height: 32px; padding: 4px; box-sizing: border-box; border: 1px solid #4c91ff; background: #fff; color: #20252b; font: 16px/1.3 -apple-system, sans-serif; resize: both; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-toolbar { position: absolute; z-index: 3; box-sizing: border-box; max-width: calc(100vw - 16px); padding: 5px; border: 1px solid #d7dce1; border-radius: 5px; background: #fff; box-shadow: 0 6px 20px rgba(0,0,0,.22); pointer-events: auto; color: #252b31; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools { display: flex; align-items: center; width: max-content; max-width: calc(100vw - 28px); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tool-scroll { display: flex; align-items: center; gap: 2px; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tool-scroll > button, [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tool-scroll > span { flex: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-actions { display: flex; align-items: center; flex: none; margin-left: 5px; padding-left: 5px; border-left: 1px solid #d7dce1; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #252b31; cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button:hover, [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button.ann-shot-active { background: #e7f1f0; color: #126f65; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button:disabled { opacity: .35; cursor: default; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button.ann-shot-confirm { color: #15805c; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-divider { width: 1px; height: 22px; margin: 0 3px; background: #d7dce1; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-colors { display: flex; gap: 2px; align-items: center; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-colors { flex: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button.ann-shot-swatch { width: 19px; height: 19px; margin: 0 2px; border: 1px solid #aeb6bd; border-radius: 50%; background: var(--swatch); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-tools button.ann-shot-swatch-active { outline: 2px solid #4c91ff; outline-offset: 2px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-masks { display: flex; gap: 5px; padding: 5px 2px 1px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-masks span { display: flex; align-items: center; gap: 3px; padding: 2px 5px; background: #edf0f2; border-radius: 3px; font: 11px/1.2 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-masks button { display: grid; place-items: center; padding: 0; border: 0; background: none; cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-notice { padding: 4px 6px 2px; font: 12px/1.3 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-error-panel { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(360px, calc(100vw - 32px)); min-height: 70px; padding: 18px; border: 0; border-radius: 5px; box-shadow: 0 8px 28px rgba(0,0,0,.28); font: 14px/1.5 -apple-system, sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-error-panel button { margin-top: 12px; padding: 5px 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-shot-error { color: #b91c1c; }
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
    // The host is pointer-events:none so pointer events keep hitting real page
    // elements — that is how the click-to-capture-element mode knows its target.
    this.doc.addEventListener('pointerdown', this.onPointerDown, true)
    this.syncHint()
    void this.loadAnonymizeDefault()
  }

  private async loadAnonymizeDefault(): Promise<void> {
    const response = await MessageUtils.sendMessage<ExtensionSettings>({ type: 'GET_SETTINGS' })
    if (!response.success || !response.data) return
    this.settings = response.data
    if (this.state === 'selecting') {
      this.anonymizeOn = response.data.anonymizeDefault
      this.watermarkOn = response.data.watermark.enabled
      this.beautify = { ...response.data.beautify }
      this.syncHint()
      this.showRatioBar()
    }
  }

  private syncHint(): void {
    if (!this.hintEl) return
    this.hintEl.innerHTML = ''
    this.hintEl.append(
      this.textNode(uiText('shot.hint')),
      this.boldNode('A'),
      this.textNode(uiText('shot.anonymize', { state: uiText(this.anonymizeOn ? 'shot.on' : 'shot.off') })),
      ...(this.settings?.watermark.enabled ? [this.boldNode('W'), this.textNode(uiText('shot.watermark', { state: uiText(this.watermarkOn ? 'shot.on' : 'shot.off') }))] : []),
    )
  }

  private syncStatus(): void {
    this.syncHint()
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
    this.host.remove()
    this.selectionEl = null
    this.previewEl = null
    this.toolbarEl = null
    this.ratioBarEl = null
    this.beautifyPanelEl = null
    this.displayCanvas = null
    this.croppedCanvas = null
    this.sourceCanvas = null
    this.state = 'done'
    if (activeSession === this) activeSession = null
  }

  // ── region selection / element pick (document-level) ─────────────

  private onPointerDown = (e: PointerEvent) => {
    if (this.state !== 'selecting') return
    if (!isUserInput(e)) return
    if (e.target instanceof Node && this.host.contains(e.target)) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const origin = { x: e.clientX, y: e.clientY }
    const target = e.target as HTMLElement | null
    const rect = this.doc.createElement('div')
    rect.className = 'ann-shot-rect'
    const size = this.doc.createElement('span')
    size.className = 'ann-shot-size'
    rect.appendChild(size)

    const move = (ev: PointerEvent) => {
      if (!isUserInput(ev)) return
      const view = this.doc.defaultView!
      const raw = constrainToRatio(origin, { x: ev.clientX, y: ev.clientY }, this.ratio, { width: view.innerWidth, height: view.innerHeight })
      const x0 = Math.max(0, raw.x)
      const y0 = Math.max(0, raw.y)
      const x1 = Math.min(view.innerWidth, raw.x + raw.width)
      const y1 = Math.min(view.innerHeight, raw.y + raw.height)
      this.selection = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
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
      size.textContent = `${Math.round(this.selection.width)} x ${Math.round(this.selection.height)}${preset ? ` · ${preset.id} 🔒` : ''}`
      size.style.bottom = y0 < 28 ? 'auto' : ''
      size.style.top = y0 < 28 ? 'calc(100% + 6px)' : ''
    }
    const up = (ev: PointerEvent) => {
      if (!isUserInput(ev)) return
      detach()
      const width = Math.abs(ev.clientX - origin.x)
      const height = Math.abs(ev.clientY - origin.y)
      if (width < 4 && height < 4) {
        // A click, not a drag → element capture of the clicked element.
        rect.remove()
        this.selectionEl = null
        this.selection = null
        if (this.overlayEl) this.overlayEl.style.background = ''
        if (target) void this.captureElementMode(target)
        return
      }
      if (!this.selection || this.selection.width < 4 || this.selection.height < 4) {
        rect.remove()
        this.selectionEl = null
        this.selection = null
        if (this.overlayEl) this.overlayEl.style.background = ''
        return
      }
      void this.captureRegionMode()
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
    this.state = 'capturing'

    // Auto-detected identity rects are computed BEFORE any DOM mutation
    // (element rects share the viewport coordinate space with the selection).
    const identity = detectIdentityRects(this.doc, this.doc.defaultView!.location.hostname, selection)
    // With DOM anonymization on, identity elements are covered by gray
    // placeholders during the shot — no pixelate pre-fill needed.
    const restoreAnonymize = this.anonymizeOn ? applyViewportAnonymization(this.doc, this.doc.defaultView!.location.hostname) : null

    // captureVisibleTab photographs the screen — our session UI must be gone.
    this.host.style.display = 'none'
    await doubleRaf()
    if (this.exited) {
      restoreAnonymize?.()
      return
    }

    let dataUrl: string
    try {
      const response = await MessageUtils.sendMessage<{ dataUrl: string }>({
        type: 'CAPTURE_VISIBLE_TAB',
        requestId: `shot-${Date.now()}`,
      })
      if (!response.success || !response.data?.dataUrl) {
        throw new Error(response.error || uiText('shot.error.capture'))
      }
      dataUrl = response.data.dataUrl
    } catch (error) {
      if (!this.exited) this.showError(error instanceof Error ? error.message : uiText('shot.error.capture'))
      return
    } finally {
      this.host.style.display = ''
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
    this.prepareEditor()
    this.state = 'preview'
    this.showPreview()
  }

  // ── element mode (DOM clone rasterization) ────────────────────────

  /** The block capsule's direct path: capture a known element without selection. */
  async captureElementTarget(target: HTMLElement): Promise<void> {
    if (this.exited) return
    await this.captureElementMode(target)
  }

  private async captureElementMode(target: HTMLElement): Promise<void> {
    this.state = 'capturing'
    const element = this.resolveCaptureTarget(target)
    try {
      this.croppedCanvas = await captureElement(element, { anonymize: this.anonymizeOn })
    } catch (error) {
      if (!this.exited) this.showError(error instanceof Error ? error.message : uiText('shot.error.element'))
      return
    }
    if (this.exited) return
    this.maskBoxes = []
    const bounds = element.getBoundingClientRect()
    this.elementRect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    this.capturedDpr = this.croppedCanvas.width / Math.max(1, element.getBoundingClientRect().width)
    this.prepareEditor()
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

  private prepareEditor(): void {
    this.sourceCanvas = this.croppedCanvas
    const canvas = this.doc.createElement('canvas')
    canvas.width = this.sourceCanvas!.width
    canvas.height = this.sourceCanvas!.height
    this.croppedCanvas = canvas
    this.annotations = []
    this.renderEditor()
  }

  private previewRect(): ViewportRect {
    const view = this.doc.defaultView!
    if (this.selection) return this.selection
    const source = this.sourceCanvas!
    const bounds = this.elementRect
    const ratio = Math.min((view.innerWidth - 32) / source.width, (view.innerHeight - 116) / source.height, 1)
    const width = Math.max(1, source.width * ratio)
    const height = Math.max(1, source.height * ratio)
    const centerX = bounds ? bounds.x + bounds.width / 2 : view.innerWidth / 2
    const centerY = bounds ? bounds.y + bounds.height / 2 : view.innerHeight / 2
    return {
      x: Math.max(8, Math.min(view.innerWidth - width - 8, centerX - width / 2)),
      y: Math.max(26, Math.min(view.innerHeight - height - 64, centerY - height / 2)),
      width,
      height,
    }
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
    this.beautifyPanelEl?.remove()
    this.beautifyPanelEl = null

    this.refreshDisplay()
    const rect = this.previewRect()
    const panel = this.doc.createElement('div')
    panel.className = 'ann-shot-preview'
    panel.setAttribute(ROOT_ATTR, 'screenshot-preview')
    Object.assign(panel.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    const size = this.doc.createElement('span')
    size.className = 'ann-shot-size'
    size.textContent = `${this.croppedCanvas!.width} x ${this.croppedCanvas!.height}`
    if (rect.y < 28) {
      size.style.bottom = 'auto'
      size.style.top = 'calc(100% + 6px)'
    }
    panel.append(size, this.displayCanvas!)
    this.croppedCanvas!.addEventListener('pointerdown', this.onCanvasPointerDown)
    this.host.appendChild(panel)
    this.previewEl = panel

    const toolbar = this.doc.createElement('div')
    toolbar.className = 'ann-shot-toolbar'
    toolbar.setAttribute(ROOT_ATTR, 'screenshot-toolbar')
    this.host.appendChild(toolbar)
    this.toolbarEl = toolbar
    this.toolbarRoot = createRoot(toolbar)
    this.updateToolbar()
    this.toolbarResizeObserver = new ResizeObserver(() => this.positionToolbar(rect))
    this.toolbarResizeObserver.observe(toolbar)
    requestAnimationFrame(() => this.positionToolbar(rect))
  }

  private positionToolbar(rect: ViewportRect): void {
    const toolbar = this.toolbarEl
    if (!toolbar || !toolbar.isConnected) return
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
        maskCount: this.maskBoxes.length,
        canUndo: this.annotations.length > 0,
        busy: this.busy,
        notice: this.notice,
        onTool: tool => {
          this.tool = tool
          this.updateToolbar()
        },
        onColor: color => {
          this.color = color
          this.updateToolbar()
        },
        onRemoveMask: index => {
          this.maskBoxes.splice(index, 1)
          this.renderEditor()
          this.updateToolbar()
        },
        onUndo: () => this.undo(),
        onBeautify: () => this.toggleBeautifyPanel(),
        onCopy: () => void this.copyCurrent(),
        onDownload: () => void this.downloadOnly(),
        onCancel: () => exitScreenshotMode(),
        onSave: () => void this.confirmSave(),
      }),
    )
  }

  private undo(): void {
    if (this.annotations.pop()) {
      this.renderEditor()
      this.updateToolbar()
    }
  }

  private renderEditor(draft?: Annotation): void {
    if (!this.croppedCanvas || !this.sourceCanvas) return
    renderScreenshot(this.croppedCanvas, this.sourceCanvas, this.maskBoxes, draft ? [...this.annotations, draft] : this.annotations, this.capturedDpr)
    this.refreshDisplay(true)
  }

  /**
   * The composed output preview: beautify canvas (background, padding,
   * radius, shadow) with the watermark on top — exactly what copy and
   * download will produce. The library entry keeps the un-composed content
   * (screenshot.md §4.2-4.4).
   */
  private refreshDisplay(inPlace = false): void {
    const content = this.croppedCanvas
    if (!content) return
    let out: HTMLCanvasElement = content
    if (this.beautify.enabled) {
      const geo = composeGeometry({ width: content.width, height: content.height }, this.beautify)
      const canvas = this.doc.createElement('canvas')
      canvas.width = geo.canvas.width
      canvas.height = geo.canvas.height
      const ctx = canvas.getContext('2d')!
      const background = BEAUTIFY_BACKGROUNDS[this.beautify.background]
      if (background.fill) {
        ctx.fillStyle = background.fill as string
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      if (this.beautify.shadow) {
        ctx.save()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
        ctx.shadowBlur = Math.round(canvas.width * 0.03)
        ctx.shadowOffsetY = Math.round(canvas.width * 0.008)
        this.roundedRect(ctx, geo.content.x, geo.content.y, geo.content.width, geo.content.height, this.beautify.radius)
        ctx.fillStyle = 'rgba(255,255,255,0.001)'
        ctx.fill()
        ctx.restore()
      }
      if (this.beautify.radius > 0) {
        this.roundedRect(ctx, geo.content.x, geo.content.y, geo.content.width, geo.content.height, this.beautify.radius)
        ctx.save()
        ctx.clip()
        ctx.drawImage(content, geo.content.x, geo.content.y)
        ctx.restore()
      } else {
        ctx.drawImage(content, geo.content.x, geo.content.y)
      }
      out = canvas
    }
    if (this.settings?.watermark.enabled && this.watermarkOn) {
      const canvas = this.doc.createElement('canvas')
      canvas.width = out.width
      canvas.height = out.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(out, 0, 0)
      const wm = this.settings.watermark
      const box = watermarkBox({ width: canvas.width, height: canvas.height }, wm)
      ctx.globalAlpha = wm.opacity
      ctx.fillStyle = '#20252b'
      ctx.font = `${box.fontSize}px -apple-system, system-ui, sans-serif`
      ctx.textAlign = wm.position.endsWith('right') ? 'right' : 'left'
      ctx.textBaseline = wm.position.startsWith('top') ? 'top' : 'bottom'
      if (wm.text) ctx.fillText(wm.text, box.x, box.y)
      ctx.globalAlpha = 1
      out = canvas
    }
    if (inPlace && this.displayCanvas && this.previewEl?.contains(this.displayCanvas)) {
      // keep the element identity when only pixels changed
      const ctx = this.displayCanvas.getContext('2d')!
      this.displayCanvas.width = out.width
      this.displayCanvas.height = out.height
      ctx.drawImage(out, 0, 0)
      return
    }
    this.displayCanvas = out
    if (this.previewEl) {
      const old = this.previewEl.querySelector('canvas')
      old?.remove()
      const size = this.previewEl.querySelector('.ann-shot-size')
      size?.after(out)
      out.addEventListener('pointerdown', this.onCanvasPointerDown)
    }
  }

  private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + width, y, x + width, y + height, r)
    ctx.arcTo(x + width, y + height, x, y + height, r)
    ctx.arcTo(x, y + height, x, y, r)
    ctx.arcTo(x, y, x + width, y, r)
    ctx.closePath()
  }

  private canvasPoint(e: PointerEvent): Point {
    const canvas = this.croppedCanvas!
    const p = localPoint(canvas, e)
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(canvas.width, (p.x * canvas.width) / rect.width)),
      y: Math.max(0, Math.min(canvas.height, (p.y * canvas.height) / rect.height)),
    }
  }

  private onCanvasPointerDown = (e: PointerEvent): void => {
    if (this.state !== 'preview' || this.busy || !this.tool || !this.croppedCanvas) return
    e.preventDefault()
    e.stopPropagation()
    if (this.tool === 'text') {
      this.openTextInput(this.canvasPoint(e), localPoint(this.croppedCanvas, e))
      return
    }
    const start = this.canvasPoint(e)
    const draft: Annotation = { tool: this.tool, start, end: start, points: [start], color: this.color }
    const move = (ev: PointerEvent) => {
      draft.end = this.canvasPoint(ev)
      if (draft.tool === 'pen') draft.points.push(draft.end)
      this.renderEditor(draft)
    }
    const up = (ev: PointerEvent) => {
      cleanup()
      draft.end = this.canvasPoint(ev)
      if (draft.tool === 'pen') draft.points.push(draft.end)
      if (Math.hypot(draft.end.x - start.x, draft.end.y - start.y) < 3 && draft.points.length < 3) {
        this.renderEditor()
        return
      }
      this.annotations.push(draft)
      this.renderEditor()
      this.updateToolbar()
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
    this.textInput?.remove()
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
    const commit = () => {
      if (this.textInput !== input) return
      const value = input.value.trim()
      input.remove()
      this.textInput = null
      if (value) {
        this.annotations.push({ tool: 'text', start: point, text: value, color: this.color })
        this.renderEditor()
        this.updateToolbar()
      }
    }
    input.addEventListener('keydown', event => {
      event.stopPropagation()
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        commit()
      }
    })
    input.addEventListener('blur', commit)
    this.previewEl!.appendChild(input)
    this.textInput = input
    input.focus()
  }

  // ── the three destinations (screenshot.md §4) ─────────────────────

  /** Confirm: save the processed image as a screenshot entry, in one transaction with its asset. */
  private async confirmSave(): Promise<void> {
    const canvas = this.croppedCanvas
    if (!canvas || this.busy) return
    this.busy = true
    this.updateToolbar()
    try {
      // runtime messaging cannot carry Blobs, so the processed PNG travels as
      // a dataUrl; the store persists bytes (dataUrl is transport only).
      const dataUrl = canvas.toDataURL('image/png')
      const response = await MessageUtils.sendMessage<{ entry: { id: string } }>({
        type: 'SAVE_SCREENSHOT',
        data: {
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          sourceUrl: this.doc.defaultView!.location.href,
          title: this.doc.title || this.doc.defaultView!.location.hostname,
          via: this.via,
          frame: this.elementRect ? 'element' : 'drag',
        },
      })
      if (!response.success) throw new Error(response.error || uiText('shot.error.saveFailed'))
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
      this.showNotice(uiText('shot.copied'))
      void MessageUtils.sendMessage({ type: 'RECORD_EVENT', name: 'screenshot.copied', props: { watermark: false, beautify: false } })
    } catch {
      // The clipboard API is closed on http: pages and can be rejected without
      // focus — the image and every annotation stay for download or retry.
      this.showNotice(this.doc.defaultView!.location.protocol === 'http:' ? uiText('shot.copyInstead') : uiText('shot.error.copyFailed'), true)
    } finally {
      this.busy = false
      this.updateToolbar()
    }
  }

  /** Download keeps the editing session; R1 always downloads PNG (formats are R2). */
  private async downloadOnly(): Promise<void> {
    const canvas = this.displayCanvas ?? this.croppedCanvas
    if (!canvas || this.busy) return
    this.busy = true
    this.updateToolbar()
    try {
      // JPEG has no alpha: the transparent beautify background matts to white (screenshot.md §4.2)
      let dataUrl: string
      const format: DownloadFormat = (this.settings?.downloadFormat as DownloadFormat) ?? 'png'
      if (format === 'jpeg' && this.beautify.background === 'none') {
        const matted = this.doc.createElement('canvas')
        matted.width = canvas.width
        matted.height = canvas.height
        const ctx = matted.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, matted.width, matted.height)
        ctx.drawImage(canvas, 0, 0)
        dataUrl = matted.toDataURL(downloadMime(format), this.settings?.downloadQuality ?? 0.9)
      } else {
        dataUrl = canvas.toDataURL(downloadMime(format), this.settings?.downloadQuality ?? 0.9)
      }
      const response = await MessageUtils.sendMessage<{ downloadId: number }>({ type: 'DOWNLOAD_IMAGE', dataUrl, extension: downloadExtension(format) })
      if (!response.success) throw new Error(response.error || uiText('shot.error.downloadFailed'))
      this.showNotice(uiText('shot.downloaded'))
    } catch (error) {
      this.showNotice(error instanceof Error ? error.message : uiText('shot.error.downloadFailed'), true)
    } finally {
      this.busy = false
      this.updateToolbar()
    }
  }

  /** The beautify panel (screenshot.md §4.4): immediate preview, 复原, never in the undo stack, copy/download only. */
  private toggleBeautifyPanel(): void {
    if (this.beautifyPanelEl) {
      this.beautifyPanelEl.remove()
      this.beautifyPanelEl = null
      return
    }
    const panel = this.doc.createElement('div')
    panel.className = 'ann-shot-beautify'
    panel.setAttribute('data-ann-ui', 'screenshot-beautify')
    const row = (
      labelKey: 'shot.beautify.background' | 'shot.beautify.padding' | 'shot.beautify.radius' | 'shot.beautify.shadow' | 'shot.beautify.ratio',
      control: HTMLElement,
    ) => {
      const rowEl = this.doc.createElement('label')
      rowEl.className = 'ann-shot-beautify-row'
      const label = this.doc.createElement('span')
      label.textContent = uiText(labelKey)
      rowEl.append(label, control)
      panel.appendChild(rowEl)
    }
    const select = (options: Array<{ value: string; label: string }>, value: string, onChange: (value: string) => void) => {
      const selectEl = this.doc.createElement('select')
      for (const option of options) {
        const optionEl = this.doc.createElement('option')
        optionEl.value = option.value
        optionEl.textContent = option.label
        if (option.value === value) optionEl.selected = true
        selectEl.appendChild(optionEl)
      }
      selectEl.addEventListener('change', event => {
        onChange((event.target as HTMLSelectElement).value)
        this.refreshDisplay(true)
      })
      return selectEl
    }
    row(
      'shot.beautify.background',
      select(
        [
          { value: 'none', label: uiText('settings.background.none') },
          { value: 'solid-white', label: 'A' },
          { value: 'solid-ivory', label: 'B' },
          { value: 'grad-purple', label: '1' },
          { value: 'grad-blue', label: '2' },
          { value: 'grad-green', label: '3' },
          { value: 'grad-sunset', label: '4' },
          { value: 'grad-slate', label: '5' },
        ],
        this.beautify.background,
        value => {
          this.beautify.enabled = value !== 'none' || this.beautify.enabled
          this.beautify.background = value as BeautifySettings['background']
          if (value !== 'none') this.beautify.enabled = true
        },
      ),
    )
    row(
      'shot.beautify.padding',
      select(
        [
          { value: 'small', label: '24' },
          { value: 'medium', label: '40' },
          { value: 'large', label: '64' },
        ],
        this.beautify.padding,
        value => {
          this.beautify.padding = value as BeautifySettings['padding']
        },
      ),
    )
    row(
      'shot.beautify.radius',
      select(
        [
          { value: '0', label: '0' },
          { value: '12', label: '12' },
          { value: '24', label: '24' },
        ],
        String(this.beautify.radius),
        value => {
          this.beautify.radius = Number(value)
        },
      ),
    )
    const shadowCheck = this.doc.createElement('input')
    shadowCheck.type = 'checkbox'
    shadowCheck.checked = this.beautify.shadow
    shadowCheck.addEventListener('change', event => {
      this.beautify.shadow = (event.target as HTMLInputElement).checked
      this.refreshDisplay(true)
    })
    row('shot.beautify.shadow', shadowCheck)
    const enabledCheck = this.doc.createElement('input')
    enabledCheck.type = 'checkbox'
    enabledCheck.checked = this.beautify.enabled
    enabledCheck.setAttribute('aria-label', uiText('settings.beautify'))
    enabledCheck.addEventListener('change', event => {
      this.beautify.enabled = (event.target as HTMLInputElement).checked
      this.refreshDisplay(true)
    })
    row('shot.beautify.shadow', enabledCheck)
    const reset = this.doc.createElement('button')
    reset.type = 'button'
    reset.textContent = uiText('shot.beautify.reset')
    reset.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.beautify = { ...(this.settings?.beautify ?? { enabled: false, background: 'solid-white', padding: 'medium', radius: 12, shadow: true }) }
      this.refreshDisplay(true)
      panel.remove()
      this.beautifyPanelEl = null
    })
    panel.appendChild(reset)
    this.host.appendChild(panel)
    this.beautifyPanelEl = panel
    void row
  }

  private showNotice(message: string, error = false): void {
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

function localPoint(el: HTMLElement, e: PointerEvent): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
