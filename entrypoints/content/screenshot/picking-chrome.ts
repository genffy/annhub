import { renderHintBar } from './hint-bar'
import { renderRatioBar } from './ratio-bar'

/**
 * The picking state's own chrome (RV-CAP-18, split out of the session): the hint bar that names
 * what the pointer can do, and the ratio chips with the stitch button (screenshot.md §1.3). Owns
 * both elements and their re-reading; the session answers for the state they show.
 */
export interface PickingChromePort {
  readonly doc: Document
  /** The session host the ratio bar is appended to. */
  host(): HTMLElement
  /** The hint element, created by the session's overlay. */
  hintElement(): HTMLDivElement | null
  /** True while a frame waits for confirmation. */
  pending(): boolean
  anonymize(): { on: boolean } | null
  watermark(): { on: boolean } | null
  /** The ratio the chips lock in; the preset ids come from the settings. */
  ratio(): string | 'free'
  presets(): string[]
  onRatio(id: string | 'free'): void
  onStitch(): void
}

export class PickingChrome {
  private ratioBarEl: HTMLDivElement | null = null

  constructor(private readonly port: PickingChromePort) {}

  /** Re-reads the hint for the state the session is in. */
  sync(): void {
    const hint = this.port.hintElement()
    if (!hint) return
    renderHintBar(this.port.doc, hint, {
      pending: this.port.pending(),
      anonymize: this.port.anonymize(),
      watermark: this.port.watermark(),
      textNode: text => this.port.doc.createTextNode(text),
      kbdNode: key => {
        const kbd = this.port.doc.createElement('kbd')
        kbd.textContent = key
        return kbd
      },
    })
  }

  /** The selection bar's ratio chips: 自由 plus the presets enabled in settings (screenshot.md §1.3). */
  showRatioBar(): void {
    if (this.port.presets().length === 0) return
    this.ratioBarEl?.remove()
    this.ratioBarEl = renderRatioBar(this.port.doc, this.port.host(), {
      ratio: this.port.ratio(),
      presets: this.port.presets(),
      textNode: text => this.port.doc.createTextNode(text),
      onRatio: id => this.port.onRatio(id),
      onStitch: () => this.port.onStitch(),
    })
  }

  /** The ratio bar leaves with a pending frame or a run. */
  clearRatioBar(): void {
    this.ratioBarEl?.remove()
    this.ratioBarEl = null
  }

  hide(): void {
    this.port.hintElement()?.style.setProperty('display', 'none')
    this.clearRatioBar()
  }

  unhideHint(): void {
    this.port.hintElement()?.style.removeProperty('display')
  }
}
