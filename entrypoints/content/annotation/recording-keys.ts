/**
 * The recording-time single keys (annotate.md §3.1): tools, the five colours, the width steps, undo,
 * clear and Esc. They act only while the layer is open and the focus is not in an input or editable
 * area — the rest of the time the key belongs to the page. Moved verbatim from layer.ts; the layer
 * state arrives as the host.
 */
import { type LineWidth } from '../screenshot/editor'
import { ANNOTATION_COLORS } from '../../../core/screenshot-options'
import type { InkTool } from './layer'
import { exitAnnotationLayer } from './layer'

/** What the single keys read and write on the layer. */
export interface RecordingKeysHost {
  doc: Document
  recordingMode: boolean
  hiddenForScreenshot: boolean
  tool: InkTool
  color: string
  lineWidth: LineWidth
  textInput: HTMLTextAreaElement | null
  setTool(tool: InkTool): void
  syncToolbar(): void
  applyToolCursor(): void
  paint(): void
  undo(): void
  clear(): void
  commitText(): void
}

export function handleRecordingKey(host: RecordingKeysHost, event: KeyboardEvent): boolean {
  // the keys belong to the recording-time layer only; a chord belongs to the browser (Ctrl+R reloads, Cmd+P prints)
  if (!host.recordingMode || host.hiddenForScreenshot) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  const active = host.doc.activeElement
  if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return false
  const key = event.key
  const lower = key.toLowerCase()
  const tools: Record<string, InkTool> = { p: 'pen', h: 'highlighter', l: 'line', a: 'arrow', r: 'rectangle', o: 'ellipse', t: 'text', n: 'step', v: 'pointer' }
  const tool = tools[lower]
  if (tool) {
    host.setTool(tool)
    return true
  }
  if (key >= '1' && key <= '5') {
    const swatch = ANNOTATION_COLORS[Number(key) - 1]
    if (!swatch) return false
    host.color = swatch.value
    host.syncToolbar()
    host.applyToolCursor()
    host.paint()
    return true
  }
  if (key === '[' || key === ']') {
    const widths: LineWidth[] = ['thin', 'medium', 'thick']
    const index = widths.indexOf(host.lineWidth)
    host.lineWidth = widths[Math.max(0, Math.min(widths.length - 1, index + (key === ']' ? 1 : -1)))]!
    host.syncToolbar()
    return true
  }
  if (lower === 'z') {
    host.undo()
    return true
  }
  if (lower === 'e') {
    host.clear()
    return true
  }
  if (key === 'Escape') {
    if (host.textInput) {
      host.commitText()
      return true
    }
    exitAnnotationLayer()
    return true
  }
  return false
}
