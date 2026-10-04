/**
 * Screenshot capture UI chain — docs/v2/screenshot.md.
 * Plain DOM (no React). One session element per trigger (idempotent enter()).
 *
 * Region mode: drag on the page → hide session (capture must not include it)
 * → CAPTURE_VISIBLE_TAB → crop → in-place editor.
 * Element mode: a click without drag rasterizes the clicked element via
 * html-to-image (can exceed the viewport).
 * Anonymize ('A', default on): identity elements are covered with gray
 * placeholders before the shot (region: live overlays, element: clone swap).
 * Confirm saves to the screenshot library; download is a separate command.
 */

import MessageUtils from '../../../utils/message'
import type { ViewportRect } from './crop'
import { computeCropSource, CropError } from './crop'
import { detectIdentityRects } from './detect'
import { applyViewportAnonymization } from './anonymize'
import { captureElement } from './element-capture'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ScreenshotToolbar } from './toolbar'
import { renderScreenshot, type Annotation, type Point, type ScreenshotTool } from './editor'

const ROOT_ATTR = 'data-ann-ui'
const ROOT_VALUE = 'screenshot-session'
export const TRIGGER_EVENT = 'ann-screenshot-trigger'

let activeSession: ScreenshotSession | null = null

export function enterScreenshotMode(): void {
  // Idempotent: a second trigger replaces the pending session.
  activeSession?.exit()
  activeSession = new ScreenshotSession(document)
  activeSession.begin()
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
  private readonly onKeydown = (e: KeyboardEvent) => {
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
    if (this.state === 'selecting' && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      this.anonymizeOn = !this.anonymizeOn
      this.syncHint()
    }
  }

  constructor(doc: Document) {
    this.doc = doc
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
  }

  private syncHint(): void {
    if (!this.hintEl) return
    this.hintEl.innerHTML = ''
    this.hintEl.append(this.textNode('拖拽=区域截图 · 单击=元素截图 · Esc 取消 · '), this.boldNode('A'), this.textNode(` 匿名：${this.anonymizeOn ? '开' : '关'}`))
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
    this.croppedCanvas = null
    this.sourceCanvas = null
    this.state = 'done'
    if (activeSession === this) activeSession = null
  }

  // ── region selection / element pick (document-level) ─────────────

  private onPointerDown = (e: PointerEvent) => {
    if (this.state !== 'selecting') return
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
      const x0 = Math.max(0, Math.min(origin.x, ev.clientX))
      const y0 = Math.max(0, Math.min(origin.y, ev.clientY))
      const x1 = Math.min(this.doc.defaultView!.innerWidth, Math.max(origin.x, ev.clientX))
      const y1 = Math.min(this.doc.defaultView!.innerHeight, Math.max(origin.y, ev.clientY))
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
      size.textContent = `${Math.round(this.selection.width)} x ${Math.round(this.selection.height)}`
      size.style.bottom = y0 < 28 ? 'auto' : ''
      size.style.top = y0 < 28 ? 'calc(100% + 6px)' : ''
    }
    const up = (ev: PointerEvent) => {
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
        throw new Error(response.error || '截图失败')
      }
      dataUrl = response.data.dataUrl
    } catch (error) {
      if (!this.exited) this.showError(error instanceof Error ? error.message : '截图失败')
      return
    } finally {
      this.host.style.display = ''
      restoreAnonymize?.()
    }
    if (this.exited) return

    try {
      this.croppedCanvas = await this.cropToCanvas(dataUrl, selection)
    } catch (error) {
      if (!this.exited) this.showError(error instanceof CropError ? error.message : '截图裁剪失败')
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

  private async captureElementMode(target: HTMLElement): Promise<void> {
    this.state = 'capturing'
    const element = this.resolveCaptureTarget(target)
    try {
      this.croppedCanvas = await captureElement(element, { anonymize: this.anonymizeOn })
    } catch (error) {
      if (!this.exited) this.showError(error instanceof Error ? error.message : '元素截图失败')
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
      img.onerror = () => reject(new Error('截图数据解码失败'))
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
    this.overlayEl?.style.setProperty('background', 'transparent')
    if (this.hintEl) this.hintEl.style.display = 'none'
    this.previewEl?.remove()
    this.toolbarRoot?.unmount()
    this.toolbarEl?.remove()

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
    panel.append(size, this.croppedCanvas!)
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
        onDownload: () => void this.save(false),
        onCancel: () => exitScreenshotMode(),
        onSave: () => void this.save(true),
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
    input.setAttribute('aria-label', '截图文字')
    input.setAttribute(ROOT_ATTR, 'screenshot-text-input')
    input.placeholder = '输入文字'
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

  private async save(persist: boolean): Promise<void> {
    const canvas = this.croppedCanvas
    if (!canvas || this.busy) return
    this.busy = true
    this.updateToolbar()
    const iso = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `AnnHub/screenshot-${iso}.png`
    try {
      const capturedAt = Date.now()
      // runtime messaging cannot carry Blobs, so the processed PNG travels as
      // a dataUrl; the service worker converts it to a Blob before the
      // asset store persists bytes (storage.md §3.5 — dataUrl is transport
      // only, never the persisted format).
      const dataUrl = canvas.toDataURL('image/png')
      const response = await MessageUtils.sendMessage<{ downloadId?: number; screenshot?: { id: string } }>({
        type: 'SAVE_SCREENSHOT',
        data: {
          dataUrl,
          filename,
          mimeType: 'image/png',
          persist,
          download: !persist,
          sourceUrl: this.doc.defaultView!.location.href,
          sourceTitle: this.doc.title,
          capturedAt,
        },
      })
      if (!response.success) throw new Error(response.error || (persist ? '保存失败' : '下载失败'))
      if (persist) exitScreenshotMode()
      else this.showNotice('PNG 已下载')
    } catch (error) {
      this.showNotice(error instanceof Error ? error.message : '截图操作失败', true)
    } finally {
      this.busy = false
      this.updateToolbar()
    }
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
    text.textContent = `截图失败：${message}`
    const close = this.doc.createElement('button')
    close.textContent = '关闭'
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
