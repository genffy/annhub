import { uiText, type UiTextKey } from '../ui-text'
import { ROOT_ATTR } from './session-roots'
import { StitchError, Stitcher, type StitchFailure } from './stitcher'
import { requestCapture } from './capture-rate'
import { doubleRaf } from './photographer'

/**
 * The scroll stitch (RV-CAP-18, split out of the session): the picking chips' 长图 button runs
 * the stitcher over the page, a transparent catcher holding the pointer off the page's hover
 * styles for the whole run, and every ending scrolls the page back to where it started
 * (screenshot.md §1.5). Owns the stitcher and the run; the session answers through the port.
 */
export interface StitchRunPort {
  readonly doc: Document
  /** The session host hidden for each segment's photograph. */
  hideUi(): void
  restoreUi(): void
  exited(): boolean
  /** True once another stitch is already running. */
  alreadyRunning(): boolean
  /** The picking leaves with the run: hover, selection, ratio bar, hint. */
  clearPicking(): void
  /** Nothing was stitched: back to selecting, the reason when there is one. */
  gaveUp(reason: StitchFailure | 'capture' | 'scripted'): void
  /** The run stopped before the bottom: one sentence, no error. */
  capped(): void
  /** The stitched result: the editor opens on it, the ink lands on the first segment. */
  finished(result: { canvas: HTMLCanvasElement; dpr: number; widthCss: number; heightCss: number; stop: string }, startLeft: number, startTop: number): Promise<void>
  settingsLoaded(): Promise<void>
  beginCaptureState(): void
}

export class StitchRun {
  private stitcher: Stitcher | null = null

  /** Esc cancels the run: the stitcher stops and the page comes back. */
  cancel(): void {
    this.stitcher?.cancel()
  }

  async begin(port: StitchRunPort): Promise<void> {
    const { doc } = port
    // the button lives on the picking chips: a pending frame has none, and is let go with a click outside first
    if (port.alreadyRunning()) return
    // a transparent catcher holds the pointer off the page's hover styles for the whole run
    const sweeper = doc.createElement('div')
    sweeper.setAttribute(ROOT_ATTR, 'screenshot-hover-sweeper')
    Object.assign(sweeper.style, { position: 'fixed', inset: '0', pointerEvents: 'auto', background: 'transparent', zIndex: '2147483646' })
    doc.documentElement.appendChild(sweeper)
    const stitcher = new Stitcher({
      doc,
      capture: async () => {
        // the shot photographs the screen: the session's overlay and UI hide
        // for the moment, and the cursor highlight of a recording with them
        port.hideUi()
        doc.dispatchEvent(new CustomEvent('annhub:capture-hide'))
        try {
          await doubleRaf()
          // the same rate-limit-aware path the region capture takes
          const response = await requestCapture(() => port.exited())
          if (!response.success || !response.data?.dataUrl) throw new Error(response.error ?? 'capture failed')
          return response.data.dataUrl
        } finally {
          port.restoreUi()
          doc.dispatchEvent(new CustomEvent('annhub:capture-restore'))
        }
      },
    })
    this.stitcher = stitcher
    // every ending — stitched, stalled, cancelled or discarded — scrolls the page back to here
    const startTop = doc.scrollingElement?.scrollTop ?? 0
    const startLeft = doc.scrollingElement?.scrollLeft ?? 0
    port.clearPicking()
    let failure: StitchFailure | 'capture' | null = null
    let result: Awaited<ReturnType<Stitcher['run']>> | undefined
    try {
      result = await stitcher.run()
    } catch (error) {
      // the stitcher throws its reason in a StitchError; any other error is a shot that did not come back
      failure = error instanceof StitchError ? error.code : 'capture'
    }
    this.stitcher = null
    sweeper.remove()
    // every ending — stitched, stalled, cancelled, discarded or the session
    // replaced mid-run — scrolls the page back to where it started
    const scroller = doc.scrollingElement
    if (scroller) {
      scroller.scrollTop = startTop
      scroller.scrollLeft = startLeft
    }
    if (port.exited()) return
    if (!result) {
      // nothing was stitched, or the run was discarded: back to selecting, with the reason when there is one
      port.gaveUp(failure ?? 'scripted')
      return
    }
    if (result.stop !== 'bottom') port.capped()
    port.beginCaptureState()
    await port.settingsLoaded()
    if (port.exited()) return
    await port.finished(result, startLeft, startTop)
  }
}

/** The stitch's own reason wording, by the code the run failed with. */
export function stitchNotice(code: StitchFailure | 'capture' | 'scripted'): string {
  if (code === 'zoomed') return uiText('shot.stitch.zoom')
  if (code === 'capture') return uiText('shot.error.capture')
  return uiText(`shot.stitch.${code}` as UiTextKey)
}
