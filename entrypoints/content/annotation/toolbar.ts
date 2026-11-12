/**
 * The annotation toolbar's DOM and its sync: the tool buttons, the colour swatches and the width
 * steps, plus the undo/clear/screenshot/exit actions. The layer state the controls read and write
 * arrives as the host.
 */
import { isLineTool, type LineWidth, type ScreenshotTool } from '../screenshot/editor'
import { ANNOTATION_COLORS } from '../../../core/screenshot-options'
import { isUserInput } from '../user-input'
import { uiText, type UiTextKey } from '../ui-text'
import { exitAnnotationLayer } from './layer'
import { ROOT_ATTR } from './annotation-roots'
import type { InkTool } from './layer'

/** Simple inline icons (lucide paths) — the toolbar buttons are plain DOM, not a React root. */
const ICONS: Record<string, string> = {
  pointer: '<path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/>',
  pen: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  line: '<path d="M22 2 2 22"/>',
  arrow: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  rectangle: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  ellipse: '<circle cx="12" cy="12" r="10"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  step: '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  clear: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  screenshot: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  exit: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
}

const TOOL_KEYS: ReadonlyArray<{ tool: InkTool; labelKey: string }> = [
  { tool: 'pointer', labelKey: 'annotate.tool.pointer' },
  { tool: 'pen', labelKey: 'shot.tool.pen' },
  { tool: 'highlighter', labelKey: 'shot.tool.highlighter' },
  { tool: 'line', labelKey: 'shot.tool.line' },
  { tool: 'arrow', labelKey: 'shot.tool.arrow' },
  { tool: 'rectangle', labelKey: 'shot.tool.rect' },
  { tool: 'ellipse', labelKey: 'shot.tool.ellipse' },
  { tool: 'text', labelKey: 'shot.tool.text' },
  { tool: 'step', labelKey: 'shot.tool.step' },
]

/** What the toolbar reads and writes on the layer: the live tool state and the actions behind the buttons. */
export interface ToolbarHost {
  doc: Document
  tool: InkTool
  color: string
  lineWidth: LineWidth
  setTool(tool: InkTool): void
  applyToolCursor(): void
  paint(): void
  undo(): void
  clear(): void
  startScreenshot(): void
}

export function annotationIcon(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`
}

export function buildToolbar(host: ToolbarHost): HTMLDivElement {
  const bar = host.doc.createElement('div')
  bar.className = 'ann-annot-toolbar'
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-orientation', 'vertical')
  bar.setAttribute('aria-label', uiText('annotate.toolbar'))
  bar.setAttribute(ROOT_ATTR, 'annotation-toolbar')

  for (const { tool, labelKey } of TOOL_KEYS) {
    const button = host.doc.createElement('button')
    button.type = 'button'
    button.setAttribute('data-ann-ui', `annotation-tool-${tool}`)
    button.setAttribute('aria-label', uiText(labelKey as UiTextKey))
    button.title = uiText(labelKey as UiTextKey)
    button.innerHTML = annotationIcon(tool)
    button.addEventListener('click', event => {
      if (!isUserInput(event)) return
      host.setTool(tool)
    })
    bar.appendChild(button)
  }

  const divider = host.doc.createElement('div')
  divider.className = 'ann-annot-divider'
  bar.appendChild(divider)

  for (const { value, name } of ANNOTATION_COLORS) {
    const swatch = host.doc.createElement('button')
    swatch.type = 'button'
    swatch.className = 'ann-annot-swatch'
    swatch.setAttribute('data-ann-ui', `annotation-color-${name}`)
    swatch.style.setProperty('--swatch', value)
    const label = uiText(`shot.color.${name}` as UiTextKey)
    swatch.setAttribute('aria-label', label)
    swatch.title = label
    swatch.addEventListener('click', event => {
      if (!isUserInput(event)) return
      host.color = value
      syncToolbarInto(host, bar)
      host.applyToolCursor()
      host.paint()
    })
    bar.appendChild(swatch)
  }

  const widths = host.doc.createElement('div')
  widths.className = 'ann-annot-widths'
  widths.setAttribute('data-ann-ui', 'annotation-widths')
  widths.setAttribute('role', 'group')
  widths.setAttribute('aria-label', uiText('shot.lineWidth'))
  for (const width of ['thin', 'medium', 'thick'] as const) {
    const button = host.doc.createElement('button')
    button.type = 'button'
    button.setAttribute('data-ann-ui', `annotation-width-${width}`)
    button.setAttribute('aria-label', uiText(`shot.lineWidth.${width}` as UiTextKey))
    button.title = uiText(`shot.lineWidth.${width}` as UiTextKey)
    const dot = host.doc.createElement('i')
    dot.style.width = `${{ thin: 4, medium: 7, thick: 11 }[width]}px`
    dot.style.height = dot.style.width
    button.appendChild(dot)
    button.addEventListener('click', event => {
      if (!isUserInput(event)) return
      host.lineWidth = width
      syncToolbarInto(host, bar)
    })
    widths.appendChild(button)
  }
  bar.appendChild(widths)

  const divider2 = host.doc.createElement('div')
  divider2.className = 'ann-annot-divider'
  bar.appendChild(divider2)

  const action = (name: string, labelKey: string, run: () => void, attribute: string): HTMLButtonElement => {
    const button = host.doc.createElement('button')
    button.type = 'button'
    button.setAttribute('data-ann-ui', attribute)
    button.setAttribute('aria-label', uiText(labelKey as UiTextKey))
    button.title = uiText(labelKey as UiTextKey)
    button.innerHTML = annotationIcon(name)
    button.addEventListener('click', event => {
      if (!isUserInput(event)) return
      run()
    })
    bar.appendChild(button)
    return button
  }
  action('undo', 'annotate.undo', () => host.undo(), 'annotation-undo')
  action('clear', 'annotate.clear', () => host.clear(), 'annotation-clear')
  action('screenshot', 'annotate.screenshot', () => host.startScreenshot(), 'annotation-screenshot')
  action('exit', 'annotate.exit', () => exitAnnotationLayer(), 'annotation-exit')

  syncToolbarInto(host, bar)
  return bar
}

export function syncToolbarInto(host: ToolbarHost, bar: HTMLDivElement): void {
  for (const { tool } of TOOL_KEYS) {
    bar.querySelector(`[data-ann-ui="annotation-tool-${tool}"]`)?.classList.toggle('ann-annot-active', host.tool === tool)
    const button = bar.querySelector<HTMLButtonElement>(`[data-ann-ui="annotation-tool-${tool}"]`)
    if (button) button.setAttribute('aria-pressed', String(host.tool === tool))
  }
  for (const { value, name } of ANNOTATION_COLORS) {
    bar.querySelector(`[data-ann-ui="annotation-color-${name}"]`)?.classList.toggle('ann-annot-active', host.color === value)
  }
  // The three steps always stand in the bar and go dim where they do not apply (only the pen, the highlighter
  // and the line take a width): hiding them would resize the bar on every tool change and move the buttons
  // under the pointer (annotate.md §1.1).
  const usesWidth = isLineTool(host.tool as ScreenshotTool)
  for (const width of ['thin', 'medium', 'thick'] as const) {
    const button = bar.querySelector<HTMLButtonElement>(`[data-ann-ui="annotation-width-${width}"]`)
    if (!button) continue
    button.classList.toggle('ann-annot-active', host.lineWidth === width)
    button.disabled = !usesWidth
  }
}
