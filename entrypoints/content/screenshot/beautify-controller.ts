import { createBeautifyPanel, type BeautifyPanel } from './beautify-panel'
import { placePanel } from '../../../utils/screenshot-output'
import type { ViewportRect } from './crop'
import type { BeautifySettings } from '../../../core/screenshot-options'

/**
 * The beautify panel's lifecycle (RV-CAP-18, split out of the session): opening and closing it,
 * keeping it beside the picture where there is room, and giving the keyboard back to the button
 * that opened it (screenshot.md §4.4). Owns the panel element and its spot; the style itself and
 * the redraw stay with the editor, which the port answers.
 */
export interface BeautifyControllerPort {
  readonly doc: Document
  /** The session host the panel is appended to. */
  host(): HTMLElement
  /** True while the preview editor is the session's state. */
  inPreview(): boolean
  beautify(): BeautifySettings
  ratioPresets(): string[]
  /** Applies a change and redraws; the controller syncs the panel afterwards. */
  change(patch: Partial<BeautifySettings>): void
  /** 复原: back to the style the settings give. */
  reset(): void
  /** The toolbar's pressed state depends on whether the panel is open. */
  toolbarChanged(): void
  toolbar(): HTMLDivElement | null
  /** The beautify button that reclaims the keyboard on close. */
  beautifyButton(): HTMLElement | null
  previewNow(): ViewportRect | null
  /** The panel shows the style the editor now has. */
  syncPanel(settings: BeautifySettings): void
}

export class BeautifyController {
  private panel: BeautifyPanel | null = null
  /** where the panel is while it is open; it stays there as long as that place is free */
  private spot: { left: number; top: number } | null = null

  constructor(private readonly port: BeautifyControllerPort) {}

  get isOpen(): boolean {
    return this.panel !== null
  }

  toggle(): void {
    if (this.panel) this.close()
    else this.open()
  }

  private open(): void {
    if (!this.port.inPreview()) return
    const panel = createBeautifyPanel(this.port.doc, {
      settings: this.port.beautify(),
      ratios: this.port.ratioPresets(),
      onChange: patch => this.port.change(patch),
      onReset: () => this.port.reset(),
    })
    this.port.host().appendChild(panel.el)
    this.panel = panel
    this.spot = null
    this.port.toolbarChanged()
    this.position()
    panel.focus()
  }

  /** Closes the panel and gives the keyboard back to the button that opened it. */
  close(): void {
    const panel = this.panel
    if (!panel) return
    panel.el.remove()
    this.panel = null
    this.spot = null
    this.port.toolbarChanged()
    this.port.beautifyButton()?.focus()
  }

  /** Beside the picture where there is room, else under the toolbar: clear of both, inside the window. */
  position(): void {
    const panel = this.panel?.el
    const toolbar = this.port.toolbar()
    const preview = this.port.previewNow()
    if (!panel || !toolbar || !preview) return
    const view = this.port.doc.defaultView!
    const size = panel.getBoundingClientRect()
    const bar = toolbar.getBoundingClientRect()
    const spot = placePanel(
      { width: size.width, height: size.height },
      { toolbar: { x: bar.x, y: bar.y, width: bar.width, height: bar.height }, preview },
      { width: view.innerWidth, height: view.innerHeight },
      this.spot ?? undefined,
    )
    this.spot = spot
    panel.style.left = `${spot.left}px`
    panel.style.top = `${spot.top}px`
  }

  /** The style changed (or went back to the settings): the panel shows it. */
  sync(settings: BeautifySettings): void {
    this.panel?.sync(settings)
  }
}
