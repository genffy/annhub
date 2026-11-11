import { isUserInput } from '../user-input'
import { nudgeBox } from './selection'

/**
 * The session's keyboard map (RV-CAP-18, split out of the session): Esc walks out of whatever is
 * open, the pending frame owns the arrows and Enter, Shift locks a ratio for the next drag, the
 * picker's arrows climb the element chain, and the editor is modal for the keyboard — Tab stays
 * inside the session's own controls (screenshot.md §1.2–§1.3). The keys only dispatch; every
 * action goes through the port.
 */
export interface SessionKeysPort {
  readonly doc: Document
  /** The session host whose focusables Tab walks. */
  host(): HTMLElement
  state(): 'selecting' | 'confirming' | 'capturing' | 'preview' | 'error' | 'done'
  /** The pending selection the arrows nudge and Enter confirms. */
  selection(): { x: number; y: number; width: number; height: number } | null
  /** True while the editor's text box has the keyboard. */
  textInputOpen(): boolean
  viewport(): { width: number; height: number }
  /** Esc closes the open one; answers whether it did. */
  closeTextInput(): boolean
  closeBeautify(): boolean
  cancelStitch(): boolean
  exit(): void
  undo(): void
  /** Cmd/Ctrl+C, only while the text box is closed; answers whether it was taken. */
  copy(): boolean
  /** Delete/Backspace on a selected badge, only while the text box is closed; answers whether it was taken. */
  deleteStep(): boolean
  toggleAnonymize(): boolean
  nudgeSelection(box: { x: number; y: number; width: number; height: number }): void
  confirmSelection(): void
  noteShift(): void
  climbHover(direction: 1 | -1): boolean
  toggleWatermark(): boolean
}

export class SessionKeys {
  constructor(private readonly port: SessionKeysPort) {}

  readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!isUserInput(e)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (this.port.closeTextInput()) return
      if (this.port.closeBeautify()) return
      if (this.port.cancelStitch()) return
      this.port.exit()
      return
    }
    if (this.port.state() === 'preview' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      this.port.undo()
      return
    }
    if (this.port.state() === 'preview' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      if (this.port.copy()) e.preventDefault()
      return
    }
    if (this.port.state() === 'preview' && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (this.port.deleteStep()) e.preventDefault()
      return
    }
    // `A` works until the shot is taken: a pending frame (a released drag, the
    // selection menu, the last frame) has not been captured yet
    if ((this.port.state() === 'selecting' || this.port.state() === 'confirming') && (e.key === 'a' || e.key === 'A') && this.port.toggleAnonymize()) {
      e.preventDefault()
      return
    }
    // the pending frame owns the arrows and Enter: there is no picker beside it to climb or to ask
    if (this.port.state() === 'confirming' && this.port.selection()) {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const box = nudgeBox(this.port.selection()!, e.key as 'ArrowLeft', e.shiftKey, this.port.viewport())
        this.port.nudgeSelection(box)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        this.port.confirmSelection()
        return
      }
    }
    if (e.key === 'Shift' && this.port.state() === 'selecting' && this.port.selection()) {
      this.port.noteShift()
    }
    if (this.port.state() === 'selecting' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (this.port.climbHover(e.key === 'ArrowUp' ? 1 : -1)) e.preventDefault()
    }
    if (this.port.state() === 'preview' && (e.key === 'w' || e.key === 'W') && this.port.toggleWatermark()) {
      e.preventDefault()
    }
    // The editor is modal for the keyboard: Tab stays inside the session's own
    // controls instead of walking the masked page, where Enter on a link would
    // navigate away and drop the shot. The text input keeps the
    // browser's own Tab so typing still behaves as usual.
    if (this.port.state() === 'preview' && e.key === 'Tab' && !this.port.textInputOpen()) {
      e.preventDefault()
      this.cycleFocus(!e.shiftKey)
    }
  }

  /** Focusables of the session's own UI, in document order. */
  private sessionFocusables(): HTMLElement[] {
    const host = this.port.host()
    if (!host.isConnected) return []
    return Array.from(host.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')).filter(
      el => !el.hasAttribute('disabled') && el.offsetParent !== null,
    )
  }

  private cycleFocus(forward: boolean): void {
    const items = this.sessionFocusables()
    if (items.length === 0) return
    const current = items.indexOf(this.port.doc.activeElement as HTMLElement)
    const next = current < 0 ? 0 : (current + (forward ? 1 : -1) + items.length) % items.length
    items[next]!.focus()
  }
}
