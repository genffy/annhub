import { uiText } from '../ui-text'
import { computeCropSource, CropError, type ViewportRect } from './crop'
import { captureElement } from './element-capture'
import { expandByMargin, fitsInViewport } from './selection'
import { candidateRect, sectionIntervalRect, type BlockCandidate } from '../blocks'
import { inkToEditorAnnotations, inkToViewport, type InkStroke } from '../annotation/ink'
import { detectIdentityRects, type IdentityParts } from './detect'
import { applyViewportAnonymization } from './anonymize'
import type { Annotation } from './editor'

/**
 * The capture flows (RV-CAP-18, split out of the session): the region path — hide, photograph,
 * crop to the frame — and the element path that rasterizes an offscreen clone; each hands the
 * editor its picture together with the page's ink and the identity masks (screenshot.md §1).
 * Owns the crop and the ink hand-over; the session answers for its state through the port.
 */
export interface CaptureFlowPort {
  readonly doc: Document
  exited(): boolean
  /** The session's photograph: hides the UI, waits for the page, returns the data URL or null. */
  shoot(): Promise<string | null>
  settingsLoaded(): Promise<void>
  /** The frame being captured. */
  selection(): ViewportRect | null
  /** The element path sets the element's box as the frame the region path crops. */
  setSelection(rect: ViewportRect): void
  permalinkForRegion(rect: ViewportRect): void
  permalinkForElement(node: Node): void
  /** DOM anonymization on, and the parts of the identity it covers. */
  anonymize(): { on: boolean; parts: IdentityParts }
  /** Shows the capture's failure panel. */
  fail(message: string): void
  /** The page's ink handed over from the annotation layer, consumed once. */
  takeInk(): InkStroke[]
  say(message: string): void
  /** Applies what a capture produced: the editor opens on it. */
  handOver(capture: HTMLCanvasElement, dpr: number, ink: Annotation[], masks: ViewportRect[], elementRect: ViewportRect | null, sourceUrl: string | null): void
  /** The frame the memory adopts for an element capture. */
  adoptElementFrame(target: HTMLElement, section?: BlockCandidate['range']): void
  /** The hovered layer's frame with its margin (a section is a page place). */
  adoptLayerFrame(layer: BlockCandidate, box: DOMRect, margin: number): void
  /** The margin overflows the window: the frame is not remembered and the session stays. */
  frameTooBig(): void
  /** Sets the session state without a capture: the modal shield and 'capturing'. */
  beginCapture(): void
}

export class CaptureFlow {
  /** The capture's device pixel ratio, read by the ink hand-over and the editor. */
  dpr = 1

  constructor(private readonly port: CaptureFlowPort) {}

  /** Enter confirms the pending frame: the region path crops the photograph to it. */
  async region(): Promise<void> {
    const selection = this.port.selection()
    if (!selection) return
    this.port.permalinkForRegion(selection)
    this.port.beginCapture()
    await this.port.settingsLoaded()
    if (this.port.exited()) return

    // Auto-detected identity rects are computed BEFORE any DOM mutation
    // (element rects share the viewport coordinate space with the selection).
    const identity = detectIdentityRects(this.port.doc, this.port.doc.defaultView!.location.hostname, selection, this.port.anonymize().parts)
    // With DOM anonymization on, identity elements are covered by gray
    // placeholders during the shot — no pixelate pre-fill needed.
    const anonymize = this.port.anonymize().on ? applyViewportAnonymization(this.port.doc, this.port.doc.defaultView!.location.hostname, this.port.anonymize().parts) : null

    let dataUrl: string | null
    try {
      dataUrl = await this.port.shoot()
    } catch (error) {
      if (!this.port.exited()) this.port.fail(error instanceof Error ? error.message : uiText('shot.error.capture'))
      return
    } finally {
      anonymize?.()
    }
    if (this.port.exited() || !dataUrl) return

    let capture: HTMLCanvasElement
    try {
      capture = await this.cropToCanvas(dataUrl, selection)
    } catch (error) {
      if (!this.port.exited()) this.port.fail(error instanceof CropError ? error.message : uiText('shot.error.crop'))
      return
    }
    if (this.port.exited()) return

    const scaleX = capture.width / selection.width
    const scaleY = capture.height / selection.height
    const masks = anonymize
      ? []
      : identity.map(r => ({
          x: (r.x - selection.x) * scaleX,
          y: (r.y - selection.y) * scaleY,
          width: r.width * scaleX,
          height: r.height * scaleY,
        }))
    this.port.handOver(capture, this.dpr, this.consumeInk(selection), masks, null, null)
  }

  /**
   * The block capsule's direct path: capture a known element without selection. The element
   * also becomes the remembered frame, like the click path does (区块路径的截图也记为“上次取景框”).
   * A section hands its interval: the frame and the raster are the outlined run, not the
   * container it shares with its neighbours (RV-CAP-13).
   */
  async element(target: HTMLElement, section?: BlockCandidate['range']): Promise<void> {
    if (this.port.exited()) return
    const view = this.port.doc.defaultView!
    const box = section ? sectionIntervalRect(target, section) : target.getBoundingClientRect()
    // the capsule's frame is remembered too; a section is a page place (screenshot.md §1.4)
    this.port.adoptElementFrame(target, section)
    // fits in the window: crop the real pixels, the click path without margin;
    // taller: rasterize the offscreen clone (screenshot.md §1). A zero-area box
    // has no layout to crop (jsdom): the clone path keeps the session honest
    if (
      box.width > 0 &&
      box.height > 0 &&
      fitsInViewport({ x: box.left, y: box.top, width: box.width, height: box.height }, { width: view.innerWidth, height: view.innerHeight })
    ) {
      this.port.setSelection({ x: box.left, y: box.top, width: box.width, height: box.height })
      await this.region()
      return
    }
    await this.clone(target, section, box)
  }

  /**
   * A click on a hovered layer: element (or a section's interval) + margin goes the region path
   * when the frame fits the window (the ring shows the real page); a bigger element itself goes
   * the clone path without margin (screenshot.md §1.4). The frame is remembered either way.
   */
  hovered(layer: BlockCandidate, margin: number): void {
    const view = this.port.doc.defaultView!
    const box = candidateRect(layer)
    const frame = expandByMargin({ x: box.left, y: box.top, width: box.width, height: box.height }, margin)
    // a section is not an element: its frame is remembered as a page place (screenshot.md §1.4)
    this.port.adoptLayerFrame(layer, box, margin)
    if (fitsInViewport(frame, { width: view.innerWidth, height: view.innerHeight })) {
      this.port.setSelection(frame)
      void this.region()
      return
    }
    const bareFits = fitsInViewport({ x: box.left, y: box.top, width: box.width, height: box.height }, { width: view.innerWidth, height: view.innerHeight })
    if (margin === 0 || !bareFits) {
      void this.element(layer.element, layer.range)
      return
    }
    // the margin overflows the window: say so and keep the session (screenshot.md §1.4 放不下)
    this.port.frameTooBig()
  }

  /** The element path's clone rasterization. */
  private async clone(target: HTMLElement, section: BlockCandidate['range'] | undefined, sectionBox: DOMRect): Promise<void> {
    this.port.beginCapture()
    this.port.permalinkForElement(target)
    await this.port.settingsLoaded()
    if (this.port.exited()) return
    let capture: HTMLCanvasElement
    try {
      capture = await captureElement(target, {
        ...(this.port.anonymize().on ? { anonymize: this.port.anonymize().parts } : {}),
        ...(section ? { section } : {}),
      })
    } catch {
      // the rasterizer's own message is English and means nothing to the user
      if (!this.port.exited()) this.port.fail(uiText('shot.error.element'))
      return
    }
    if (this.port.exited()) return
    // a section's frame is its interval's union rect (RV-CAP-13), the same box the outline painted
    const bounds = section && sectionBox ? sectionBox : target.getBoundingClientRect()
    const dpr = capture.width / Math.max(1, bounds.width)
    this.port.handOver(
      capture,
      dpr,
      this.consumeInk({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }),
      [],
      { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      null,
    )
  }

  private cropToCanvas(dataUrl: string, selection: ViewportRect): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const dpr = img.width / this.port.doc.defaultView!.innerWidth
          this.dpr = dpr
          const source = computeCropSource(selection, dpr, img.width, img.height)
          const canvas = this.port.doc.createElement('canvas')
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

  /**
   * The handed-over ink as editor annotations over the frame that was just captured, in one
   * group for undo (annotate.md §1.3): the ink is stored on the page, so it lands where it
   * shows at the capture moment (annotate.md §1.2, §1.3); pinned ink already sits in viewport
   * coordinates. Strokes fully outside the frame are out, strokes crossing its boundary are
   * cut at it.
   */
  private consumeInk(frame: ViewportRect): Annotation[] {
    const ink = this.port.takeInk()
    if (ink.length === 0) return []
    const view = this.port.doc.defaultView!
    return inkToEditorAnnotations(inkToViewport(ink, view.scrollX, view.scrollY), frame, this.dpr || 1)
  }

  /**
   * 拼长图的墨迹 (annotate.md §1.3): the page's ink enters at its page position, wherever the
   * window was when it was drawn; ink pinned to the screen has no place in the long image — no
   * single segment would line it up — so it stays out and the editor says one sentence about it.
   */
  consumeInkStitched(startLeft: number, startTop: number, widthCss: number, heightCss: number): Annotation[] {
    const ink = this.port.takeInk()
    if (ink.length === 0) return []
    const onPage = ink.filter(stroke => !stroke.pinned)
    if (onPage.length !== ink.length) this.port.say(uiText('shot.stitch.pinnedInk'))
    if (onPage.length === 0) return []
    return inkToEditorAnnotations(onPage, { x: startLeft, y: startTop, width: widthCss, height: heightCss }, this.dpr || 1)
  }
}
