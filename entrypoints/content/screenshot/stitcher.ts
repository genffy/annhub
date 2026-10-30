/**
 * The scrolling long screenshot's driver — screenshot.md §1.5.
 *
 * Runs inside a screenshot session: the page scrolls screen by screen, each
 * screen waits up to a second for its images, and every shot hides the
 * extension's UI (and the cursor highlight of a live recording) so nothing
 * of AnnHub lands in the picture. Pinned elements — fixed ones, and sticky
 * ones currently stuck to the top edge — are photographed on the first
 * screen only, hidden from the second on, and looked for again before every
 * shot, so a header that shrinks into a sticky bar is caught as it appears.
 *
 * Stop conditions live in stitch.ts; what this class adds is the browser:
 * actual scroll positions, the zoom guards (a layout zoom or a pinch in the
 * middle discards everything), the first scroll that never moves (a page
 * that took the scrolling over) and a stall partway (a dialog locking the
 * scroller), which keeps what was stitched.
 */
import { uiText } from '../../../utils/ui-text'
import {
  STITCH_CAPS,
  STITCH_OVERLAP_CSS,
  bytesPerPixelFromSegment,
  canvasOffsets,
  estimateEntryBytes,
  expectedSegmentCount,
  stitchStopCondition,
  stitchedHeightPx,
  type StitchStop,
} from './stitch'

export type StitchFailure = 'inner-scroll' | 'pinched' | 'zoomed' | 'scripted' | 'cancel'

export interface StitchResult {
  canvas: HTMLCanvasElement
  /** The device pixel ratio the shots came at, from the first shot's own width. */
  dpr: number
  widthCss: number
  heightCss: number
  /** Why the stitching ended where it did: 'bottom' is the finished case, the caps kept what there was. */
  stop: StitchStop | 'stalled'
  /** The scroll position to restore. */
  scrollTop: number
  scrollLeft: number
}

export interface StitcherOptions {
  /** CAPTURE_VISIBLE_TAB through the session's rate-limit-aware path. */
  capture: () => Promise<string>
  doc: Document
}

/** Elements pinned to the window right now: fixed always, sticky when stuck at the top edge. */
function pinnedElements(doc: Document): HTMLElement[] {
  const view = doc.defaultView
  if (!view) return []
  const pinned: HTMLElement[] = []
  for (const element of doc.body.querySelectorAll<HTMLElement>('*')) {
    if (element.closest('[data-ann-ui]')) continue
    const rect = element.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > view.innerHeight || rect.height === 0) continue
    const style = view.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    if (style.position === 'fixed') {
      pinned.push(element)
      continue
    }
    if (style.position === 'sticky' && rect.top <= 1) pinned.push(element)
  }
  return pinned
}

/** Waits for the images of the current screen, at most a second (screenshot.md §1.5). */
async function waitForImages(doc: Document, timeoutMs: number): Promise<void> {
  const view = doc.defaultView
  if (!view) return
  const pending = [...doc.images].filter(image => {
    if (image.complete) return false
    const rect = image.getBoundingClientRect()
    return rect.bottom > 0 && rect.top < view.innerHeight && rect.width > 0
  })
  if (pending.length === 0) return
  await new Promise<void>(resolve => {
    const done = window.setTimeout(resolve, timeoutMs)
    let waiting = pending.length
    const settle = () => {
      if (--waiting <= 0) {
        window.clearTimeout(done)
        resolve()
      }
    }
    for (const image of pending) {
      image.addEventListener('load', settle, { once: true })
      image.addEventListener('error', settle, { once: true })
    }
  })
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('decode failed'))
    image.src = dataUrl
  })
}

export class Stitcher {
  private readonly doc: Document
  private readonly capture: () => Promise<string>
  private cancelled = false
  private progressEl: HTMLDivElement | null = null

  constructor(options: StitcherOptions) {
    this.doc = options.doc
    this.capture = options.capture
  }

  cancel(): void {
    this.cancelled = true
  }

  /** The page's own scroller and whether it scrolls at all. */
  private scroller(): { scroller: Element; scrollable: boolean } | null {
    const scroller = this.doc.scrollingElement
    const view = this.doc.defaultView
    if (!scroller || !view) return null
    return { scroller, scrollable: scroller.scrollHeight > view.innerHeight + 1 }
  }

  private showProgress(): void {
    const el = this.doc.createElement('div')
    el.className = 'ann-shot-hint'
    el.setAttribute('data-ann-ui', 'stitch-progress')
    el.style.zIndex = '10'
    this.doc.documentElement.appendChild(el)
    this.progressEl = el
  }

  private syncProgress(done: number, total: number): void {
    if (!this.progressEl) return
    this.progressEl.textContent = `${uiText('shot.stitch.progress', { done, total })} · ${uiText('shot.stitch.esc')}`
  }

  /**
   * Scrolls, photographs and assembles. Throws a `StitchFailure` before
   * anything was captured (nothing to discard) or when the run must be
   * discarded (cancel, zoom change).
   */
  async run(): Promise<StitchResult> {
    const view = this.doc.defaultView!
    const parts = this.scroller()
    if (!parts) throw 'inner-scroll' as StitchFailure
    const { scroller, scrollable } = parts
    if (!scrollable) throw 'inner-scroll' as StitchFailure
    const visual = view.visualViewport
    if (visual && (visual.scale < 0.99 || visual.scale > 1.01)) throw 'pinched' as StitchFailure

    const scrollTop = scroller.scrollTop
    const scrollLeft = scroller.scrollLeft
    // the visible page width, scrollbar excluded — its thumb would sit differently in every segment (D-42)
    const widthCss = Math.max(1, this.doc.documentElement.clientWidth)
    const step = Math.max(1, view.innerHeight - STITCH_OVERLAP_CSS)
    const startDpr = view.devicePixelRatio || 1
    const startScale = visual?.scale ?? 1

    const positions: number[] = [scroller.scrollTop]
    const segments: HTMLImageElement[] = []
    let bytesPerPixel = 0.35
    let stop: StitchStop | 'stalled' | null

    this.showProgress()
    try {
      for (let index = 0; ; index++) {
        // the pinned elements ride the first screen only; afterwards they are
        // found again before every shot and hidden (screenshot.md §1.5)
        const pinned = index === 0 ? [] : pinnedElements(this.doc)
        let dataUrl: string
        try {
          await waitForImages(this.doc, 1000)
          for (const element of pinned) element.style.visibility = 'hidden'
          await doubleRaf()
          // the shot photographs the screen: the progress and the session's own
          // UI hide for the moment, like every other extension surface
          this.progressEl?.style.setProperty('display', 'none')
          try {
            dataUrl = await this.capture()
          } finally {
            this.progressEl?.style.removeProperty('display')
          }
        } finally {
          for (const element of pinned) element.style.visibility = ''
        }
        const image = await decode(dataUrl)
        segments.push(image)
        if (index === 0) {
          // one extra encode on the first segment weights the entry-size cap by the page's own content
          bytesPerPixel = bytesPerPixelFromSegment(await this.pngBytes(firstSegmentCanvas(this.doc, image)), image.width, image.height)
        }

        const offsets = canvasOffsets(positions, positions[0]!, startDpr)
        const heightPx = stitchedHeightPx(
          offsets,
          segments.map(segment => segment.height),
        )
        const atBottom = scroller.scrollTop + view.innerHeight >= scroller.scrollHeight - 2
        stop = stitchStopCondition({
          atBottom,
          segmentCount: segments.length,
          widthPx: segments[0]!.width,
          stitchedHeightPx: heightPx,
          estimatedEntryBytes: estimateEntryBytes(bytesPerPixel, segments[0]!.width, heightPx),
        })
        if (stop || this.cancelled) break

        const expected = scroller.scrollTop + step
        scroller.scrollTop = expected
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        const actual = scroller.scrollTop
        positions.push(actual)
        const screens = expectedSegmentCount(scroller.scrollHeight - positions[0]! - view.innerHeight, step) + 1
        this.syncProgress(segments.length, Math.max(screens, segments.length + 1))
        if (Math.abs(actual - expected) > 2) {
          // the first scroll going nowhere is a page that took the scrolling over;
          // later on it is a scroller a dialog locked — keep what there is
          if (index === 0) throw 'scripted' as StitchFailure
          stop = 'stalled'
          break
        }
        // a zoom change or a pinch in the middle discards the whole run
        if ((view.devicePixelRatio || 1) !== startDpr || (visual && Math.abs(visual.scale - startScale) > 0.01)) {
          throw 'zoomed' as StitchFailure
        }
      }
    } finally {
      this.progressEl?.remove()
      this.progressEl = null
    }
    if (this.cancelled) throw 'cancel' as StitchFailure

    const first = segments[0]!
    const dpr = first.width / widthCss
    const offsets = canvasOffsets(positions, positions[0]!, dpr)
    const heightPx = stitchedHeightPx(
      offsets,
      segments.map(segment => segment.height),
    )
    // the last segment may take the picture past the browser's canvas edge; the stop condition counts it, so the edge is clamped here
    const height = Math.max(1, Math.min(heightPx, STITCH_CAPS.maxHeightPx))
    const canvas = this.doc.createElement('canvas')
    canvas.width = first.width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    segments.forEach((segment, index) => ctx.drawImage(segment, 0, offsets[index]!))
    return { canvas, dpr, widthCss, heightCss: height / dpr, stop: stop ?? 'stalled', scrollTop, scrollLeft }
  }

  async pngBytes(canvas: HTMLCanvasElement): Promise<number> {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    return blob?.size ?? 0
  }
}

/** A segment drawn onto its own canvas, for weighing the page's content once. */
function firstSegmentCanvas(doc: Document, image: HTMLImageElement): HTMLCanvasElement {
  const canvas = doc.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  return canvas
}

function doubleRaf(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}
