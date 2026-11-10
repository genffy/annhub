/**
 * The text tool's input box: where it opens, how it closes, and how the typed text becomes a stroke.
 * Moved verbatim from layer.ts; the layer state arrives as the host.
 */
import type { Point } from '../screenshot/editor'
import { uiText } from '../ui-text'
import type { InkStroke } from './ink'

/** What the text box reads and writes on the layer: the box itself, the anchor it types at, and the commit path. */
export interface TextInputHost {
  doc: Document
  /** the layer's root element, which carries the box */
  host: HTMLDivElement
  color: string
  strokes: InkStroke[]
  textInput: HTMLTextAreaElement | null
  textAt: Point
  newStrokeId(): string
  commit(strokes: InkStroke[]): void
}

export function openTextInput(host: TextInputHost, at: Point): void {
  commitText(host)
  const view = host.doc.defaultView!
  const input = host.doc.createElement('textarea')
  input.className = 'ann-annot-text-input'
  input.setAttribute('aria-label', uiText('shot.textInput.placeholder'))
  input.placeholder = uiText('shot.textInput.placeholder')
  input.style.width = `${Math.min(210, view.innerWidth - 24)}px`
  input.style.left = `${Math.max(8, Math.min(at.x, view.innerWidth - Math.min(210, view.innerWidth - 24) - 8))}px`
  input.style.top = `${Math.max(8, Math.min(at.y, view.innerHeight - 54))}px`
  input.style.color = host.color
  input.addEventListener('keydown', event => {
    event.stopPropagation()
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      commitText(host)
    }
  })
  // clicking away closes the box like Enter and Esc do; a replaced box has nothing left to say
  input.addEventListener('blur', () => {
    if (host.textInput === input) commitText(host)
  })
  host.host.appendChild(input)
  host.textInput = input
  // the text belongs to the page where its box was opened, like every stroke; the box itself stays on the screen
  host.textAt = { x: at.x + view.scrollX, y: at.y + view.scrollY }
  input.focus()
}

/** Every close path — Enter, Esc, clicking away, another box — ends here, so typed text is never lost. */
export function commitText(host: TextInputHost): void {
  const input = host.textInput
  if (!input) return
  host.textInput = null
  const value = input.value.trim()
  input.remove()
  if (!value) return
  host.commit([...host.strokes, { id: host.newStrokeId(), tool: 'text', points: [host.textAt], text: value, color: host.color }])
}
