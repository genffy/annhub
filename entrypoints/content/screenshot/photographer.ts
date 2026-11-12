import { ROOT_ATTR } from './session-roots'
import { pageStable } from './selection'
import { requestCapture } from './capture-rate'
import { screenshotFailureText } from '../ui-text'
import { dispatchCaptureVisibility } from './capture-visibility'

/**
 * Takes the photo for a capture (RV-CAP-18, split out of the session): captureVisibleTab
 * photographs the screen, so the session's UI hides for the moment — a transparent sweeper takes
 * the cursor so page hover styles clear, the layout is given up to 500 ms to settle, and the
 * cursor highlight of a live recording hides with the rest (screenshot.md §1.4). Owns the
 * sweeper; the hide and the ask go through the port so the stitch run can share them.
 */
export interface PhotographerPort {
  readonly doc: Document
  /** Hides the session's UI (and its recording cursor) for the moment of the shot. */
  hide(): void
  /** Brings the session's UI back. */
  restore(): void
  /** True once the session is gone; the ask gives up. */
  cancelled: () => boolean
}

export class Photographer {
  constructor(private readonly port: PhotographerPort) {}

  /**
   * One screen photograph with the session hidden: the layout is given up to 500 ms to settle
   * first, and a session that ended in that time is not asked at all. Resolves with the data
   * URL, `null` for the ended session, or rejects with the wording the notice shows. The
   * sweeper and the hidden UI are always restored.
   */
  async shoot(): Promise<string | null> {
    const { doc } = this.port
    this.port.hide()
    dispatchCaptureVisibility(doc, 'annhub:capture-hide')
    const sweeper = doc.createElement('div')
    sweeper.setAttribute(ROOT_ATTR, 'screenshot-hover-sweeper')
    Object.assign(sweeper.style, { position: 'fixed', inset: '0', pointerEvents: 'auto', background: 'transparent', zIndex: '2147483646' })
    doc.documentElement.appendChild(sweeper)
    await pageStable(doc.defaultView!, 500)
    await doubleRaf()
    const dropSweeper = (): void => {
      sweeper.remove()
      this.port.restore()
      dispatchCaptureVisibility(doc, 'annhub:capture-restore')
    }
    if (this.port.cancelled()) {
      dropSweeper()
      return null
    }
    try {
      const response = await requestCapture(this.port.cancelled)
      if (!response.success || !response.data?.dataUrl) {
        throw new Error(screenshotFailureText(response.error, 'shot.error.capture'))
      }
      return response.data.dataUrl
    } finally {
      dropSweeper()
    }
  }
}

/** The page gets these frames to settle before the shot reads it. */
export function doubleRaf(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}
