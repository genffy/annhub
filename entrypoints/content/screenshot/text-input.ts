import { uiText } from '../ui-text'
import { ROOT_ATTR } from './session-roots'
import type { Point } from './editor'

/**
 * The screenshot's text box (RV-CAP-18, split out of the session): a textarea over the preview
 * whose content becomes a text annotation when it closes — Enter, Esc, clicking away and
 * opening another box all end there, so what was typed is never lost to the way it closed
 * (screenshot.md §1.1). Owns its element and position; the session answers through the port.
 */
export interface TextInputPort {
  readonly doc: Document
  /** The preview panel the box is positioned inside. */
  previewPanel(): HTMLElement
  /** The annotation colour the box takes and the text keeps. */
  color(): string
  /** Puts the committed text into the editor as one undo step. */
  commitText(at: Point, text: string, color: string): void
}

export class TextInputOverlay {
  private input: HTMLTextAreaElement | null = null
  private at: Point = { x: 0, y: 0 }

  constructor(private readonly port: TextInputPort) {}

  get isOpen(): boolean {
    return this.input !== null
  }

  open(point: Point, displayPoint: Point): void {
    this.commit()
    const doc = this.port.doc
    const input = doc.createElement('textarea')
    input.setAttribute('aria-label', uiText('shot.textInput.placeholder'))
    input.setAttribute(ROOT_ATTR, 'screenshot-text-input')
    input.placeholder = uiText('shot.textInput.placeholder')
    const panel = this.port.previewPanel().getBoundingClientRect()
    const view = doc.defaultView!
    input.style.width = `${Math.min(210, view.innerWidth - 24)}px`
    input.style.left = `${Math.max(8 - panel.left, Math.min(displayPoint.x, view.innerWidth - panel.left - Math.min(210, view.innerWidth - 24) - 8))}px`
    input.style.top = `${Math.max(8 - panel.top, Math.min(displayPoint.y, view.innerHeight - panel.top - 54))}px`
    input.style.color = this.port.color()
    input.addEventListener('keydown', event => {
      event.stopPropagation()
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        this.commit()
      }
    })
    // clicking away closes the box like Enter and Esc do; a box that was already replaced has nothing left to say
    input.addEventListener('blur', () => {
      if (this.input === input) this.commit()
    })
    this.port.previewPanel().appendChild(input)
    this.input = input
    this.at = point
    input.focus()
  }

  /** Closes the box, if one is open, and turns what was typed into an annotation. */
  commit(): void {
    const input = this.input
    if (!input) return
    // out of the field before out of the page: removing a focused element blurs it, and that blur comes back here
    this.input = null
    const value = input.value.trim()
    input.remove()
    if (!value) return
    this.port.commitText(this.at, value, this.port.color())
  }
}
