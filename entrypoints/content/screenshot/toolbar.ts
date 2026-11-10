import { overlayIcon, type OverlayIconName } from '../icons'
import { uiText, type UiTextKey } from '../ui-text'
import { ANNOTATION_COLORS } from '../../../core/screenshot-options'
import { isLineTool, LINE_WIDTHS, type LineWidth, type ScreenshotTool } from './editor'

/**
 * The editor toolbar, native DOM like the rest of the session shell (RV-CAP-16): the content
 * script is injected into every page at document_start, so it does not carry a React runtime
 * for these buttons. The DOM structure, class names, `aria-*`, `data-*` and keyboard focus
 * behaviour are exactly what the React component produced — the E2E suites and
 * e2e/real-chrome-scenarios.md rely on them. Stable rows only ever have attributes patched, so
 * focus survives; the rows that come and go (status, widths, steps, notice) are rebuilt and the
 * focus put back on the element with the same `data-ann-ui`.
 */

const TOOL_ICONS: Record<Exclude<ScreenshotTool, null>, OverlayIconName> = {
  rectangle: 'rectangle-horizontal',
  ellipse: 'circle',
  arrow: 'arrow-up-right',
  line: 'slash',
  pen: 'pencil',
  highlighter: 'highlighter',
  mosaic: 'grid-2x2',
  text: 'type',
  step: 'list-ordered',
}

/** The dot each width button shows, in CSS pixels across: the same three sizes whichever tool is on. */
const WIDTH_DOTS: Record<LineWidth, number> = { thin: 4, medium: 7, thick: 11 }

export interface ToolbarState {
  tool: ScreenshotTool
  color: string
  /** the width the pen, the line and the highlighter draw at */
  lineWidth: LineWidth
  maskCount: number
  /** this shot's anonymity, or null when the settings leave nothing to anonymize */
  anonymize: boolean | null
  /** this shot's watermark, or null when the settings never enabled one */
  watermark: boolean | null
  canUndo: boolean
  /** the number the step tool puts down next */
  nextStep: number
  /** whether the beautify panel is open */
  beautifyOpen: boolean
  busy: boolean
  notice?: { message: string; error: boolean }
}

export interface ToolbarActions {
  onTool: (tool: ScreenshotTool) => void
  onColor: (color: string) => void
  onLineWidth: (width: LineWidth) => void
  onRemoveMask: (index: number) => void
  onUndo: () => void
  onResetSteps: () => void
  onBeautify: () => void
  onCopy: () => void
  onDownload: () => void
  onCancel: () => void
  onSave: () => void
}

export interface ScreenshotToolbar {
  /** The root the session appends; class names and attributes are what the CSS and the E2E select on. */
  el: HTMLDivElement
  update(state: ToolbarState): void
}

export function createScreenshotToolbar(doc: Document, actions: ToolbarActions): ScreenshotToolbar {
  const el = doc.createElement('div')
  el.className = 'ann-shot-toolbar'
  el.setAttribute('data-ann-ui', 'screenshot-toolbar')

  const onOff = (on: boolean): string => uiText(on ? 'shot.on' : 'shot.off')

  const button = (dataset: string, icon: OverlayIconName | null, size: number): HTMLButtonElement => {
    const node = doc.createElement('button')
    node.type = 'button'
    node.setAttribute('data-ann-ui', dataset)
    if (icon !== null) node.append(overlayIcon(doc, icon, size))
    return node
  }
  const labelled = (node: HTMLButtonElement, label: string, title = label): HTMLButtonElement => {
    node.title = title
    node.setAttribute('aria-label', label)
    return node
  }

  // ── the tools pill: stable nodes, only attributes change ────────────────
  const tools = doc.createElement('div')
  tools.className = 'ann-shot-tools'
  tools.setAttribute('role', 'toolbar')
  tools.setAttribute('aria-label', uiText('shot.toolbar'))
  const scroll = doc.createElement('div')
  scroll.className = 'ann-shot-tool-scroll'
  tools.append(scroll)

  const toolButtons = new Map<Exclude<ScreenshotTool, null>, HTMLButtonElement>()
  for (const id of Object.keys(TOOL_ICONS) as Exclude<ScreenshotTool, null>[]) {
    const label = uiText(`shot.tool.${id === 'rectangle' ? 'rect' : id}` as UiTextKey)
    const node = labelled(button(`screenshot-tool-${id}`, TOOL_ICONS[id], 16), label)
    node.addEventListener('click', () => actions.onTool(node.getAttribute('aria-pressed') === 'true' ? null : id))
    toolButtons.set(id, node)
    scroll.append(node)
  }
  const toolDivider = doc.createElement('span')
  toolDivider.className = 'ann-shot-divider'
  scroll.append(toolDivider)

  const colors = doc.createElement('div')
  colors.className = 'ann-shot-colors'
  colors.setAttribute('aria-label', uiText('shot.colors'))
  const swatches = new Map<string, HTMLButtonElement>()
  for (const { value, name } of ANNOTATION_COLORS) {
    const label = uiText(`shot.color.${name}` as UiTextKey)
    const node = labelled(button('', null, 0), label)
    node.removeAttribute('data-ann-ui')
    node.className = 'ann-shot-swatch'
    node.style.setProperty('--swatch', value)
    node.addEventListener('click', () => actions.onColor(value))
    swatches.set(value, node)
    colors.append(node)
  }
  scroll.append(colors)
  const colorDivider = doc.createElement('span')
  colorDivider.className = 'ann-shot-divider'
  scroll.append(colorDivider)

  const undo = labelled(button('screenshot-undo', 'undo', 16), uiText('shot.tool.undo'))
  undo.addEventListener('click', () => actions.onUndo())
  const beautify = labelled(button('screenshot-beautify', 'palette', 16), uiText('shot.beautify'))
  beautify.addEventListener('click', () => actions.onBeautify())
  const copy = labelled(button('screenshot-copy', 'clipboard-copy', 16), uiText('shot.tool.copy'))
  copy.addEventListener('click', () => actions.onCopy())
  const download = labelled(button('screenshot-download', 'download', 16), uiText('shot.tool.download'))
  download.addEventListener('click', () => actions.onDownload())
  scroll.append(undo, beautify, copy, download)

  const actionRow = doc.createElement('div')
  actionRow.className = 'ann-shot-actions'
  const cancel = labelled(button('screenshot-cancel', 'x', 17), uiText('shot.tool.cancel'))
  cancel.addEventListener('click', () => actions.onCancel())
  const save = labelled(button('screenshot-save', 'check', 18), uiText('shot.tool.confirm'), `${uiText('shot.tool.confirm')} · ${uiText('shot.tool.confirmHint')}`)
  save.className = 'ann-shot-confirm'
  save.addEventListener('click', () => actions.onSave())
  actionRow.append(cancel, save)
  tools.append(actionRow)
  el.append(tools)

  // ── the rows that come and go: rebuilt with the focus put back ──────────
  const status = doc.createElement('div')
  const widths = doc.createElement('div')
  const steps = doc.createElement('div')
  const notice = doc.createElement('div')
  el.append(status, widths, steps, notice)
  let statusKey = ''
  let widthsKey = ''
  let stepsKey = ''
  let noticeKey = ''

  /**
   * Replaces a row's children and returns the focus to where it was, if that button still
   * exists. An empty key means the row is gone, the way a React conditional unmounted it: the
   * container stays but its class and attributes go with it, so nothing selects an empty box.
   */
  const rebuild = (row: HTMLDivElement, key: string, previous: string, fill: () => void): string => {
    if (key === previous) return previous
    const focused = row.contains(doc.activeElement) ? (doc.activeElement as HTMLElement).getAttribute('data-ann-ui') : null
    row.replaceChildren()
    if (key === '') {
      row.removeAttribute('class')
      row.removeAttribute('role')
      row.removeAttribute('aria-label')
      row.removeAttribute('data-ann-ui')
    } else {
      fill()
      if (focused !== null) {
        const restored = row.querySelector<HTMLElement>(`[data-ann-ui="${focused}"]`)
        restored?.focus()
      }
    }
    return key
  }

  const update = (state: ToolbarState): void => {
    for (const [id, node] of toolButtons) {
      const active = state.tool === id
      node.setAttribute('aria-pressed', String(active))
      node.className = active ? 'ann-shot-active' : ''
    }
    for (const [value, node] of swatches) {
      const active = state.color === value
      node.setAttribute('aria-pressed', String(active))
      node.className = `ann-shot-swatch${active ? ' ann-shot-swatch-active' : ''}`
    }
    undo.disabled = !state.canUndo || state.busy
    beautify.disabled = state.busy
    beautify.setAttribute('aria-expanded', String(state.beautifyOpen))
    beautify.className = state.beautifyOpen ? 'ann-shot-active' : ''
    copy.disabled = state.busy
    download.disabled = state.busy
    cancel.disabled = state.busy
    save.disabled = state.busy

    const statusVisible = state.anonymize !== null || state.watermark !== null || state.maskCount > 0
    statusKey = rebuild(status, statusVisible ? `${state.anonymize ?? ''}|${state.watermark ?? ''}|${state.maskCount}` : '', statusKey, () => {
      if (!statusVisible) return
      status.className = 'ann-shot-status'
      status.setAttribute('role', 'status')
      if (state.anonymize !== null) {
        const anonymize = doc.createElement('span')
        anonymize.textContent = uiText('shot.anonymize', { state: onOff(state.anonymize) })
        status.append(anonymize)
      }
      if (state.anonymize !== null && state.watermark !== null) {
        const sep = doc.createElement('span')
        sep.className = 'ann-shot-sep'
        sep.textContent = '·'
        status.append(sep)
      }
      if (state.watermark !== null) {
        const watermark = doc.createElement('span')
        watermark.append(`${uiText('shot.watermark', { state: onOff(state.watermark) })} `)
        const kbd = doc.createElement('kbd')
        kbd.setAttribute('aria-hidden', 'true')
        kbd.textContent = 'W'
        watermark.append(kbd)
        status.append(watermark)
      }
      if (state.maskCount > 0) {
        const sep = doc.createElement('span')
        sep.className = 'ann-shot-sep'
        sep.textContent = '·'
        const count = doc.createElement('span')
        count.textContent = uiText('shot.mask.count', { count: state.maskCount })
        const masks = doc.createElement('span')
        masks.className = 'ann-shot-masks'
        masks.setAttribute('aria-label', uiText('shot.masks'))
        for (let index = 0; index < state.maskCount; index++) {
          const box = doc.createElement('span')
          box.setAttribute('data-ann-ui', 'mask-box')
          box.textContent = uiText('shot.mask', { index: index + 1 })
          const remove = labelled(button(`mask-remove-${index + 1}`, 'x', 11), uiText('shot.mask.remove', { index: index + 1 }))
          remove.addEventListener('click', () => actions.onRemoveMask(index))
          box.append(remove)
          masks.append(box)
        }
        status.append(sep, count, masks)
      }
    })

    const widthsVisible = isLineTool(state.tool)
    widthsKey = rebuild(widths, widthsVisible ? `${state.tool}|${state.lineWidth}` : '', widthsKey, () => {
      if (!widthsVisible) return
      widths.className = 'ann-shot-widths'
      widths.setAttribute('role', 'group')
      widths.setAttribute('aria-label', uiText('shot.lineWidth'))
      widths.setAttribute('data-ann-ui', 'screenshot-line-widths')
      const label = doc.createElement('span')
      label.setAttribute('aria-hidden', 'true')
      label.textContent = uiText('shot.lineWidth')
      widths.append(label)
      for (const width of LINE_WIDTHS) {
        const text = uiText(`shot.lineWidth.${width}`)
        const node = labelled(button(`screenshot-line-width-${width}`, null, 0), text)
        const active = state.lineWidth === width
        node.setAttribute('aria-pressed', String(active))
        node.className = active ? 'ann-shot-active' : ''
        const dot = doc.createElement('i')
        dot.style.width = `${WIDTH_DOTS[width]}px`
        dot.style.height = `${WIDTH_DOTS[width]}px`
        node.append(dot)
        node.addEventListener('click', () => actions.onLineWidth(width))
        widths.append(node)
      }
    })

    const stepsVisible = state.tool === 'step'
    stepsKey = rebuild(steps, stepsVisible ? `${state.nextStep}|${state.busy}` : '', stepsKey, () => {
      if (!stepsVisible) return
      steps.className = 'ann-shot-steps'
      steps.setAttribute('data-ann-ui', 'screenshot-steps')
      const next = doc.createElement('span')
      next.setAttribute('data-ann-ui', 'screenshot-step-next')
      next.textContent = uiText('shot.step.next', { number: state.nextStep })
      const reset = button('screenshot-step-reset', 'list-restart', 13)
      reset.disabled = state.nextStep === 1 || state.busy
      reset.append(uiText('shot.step.reset'))
      reset.addEventListener('click', () => actions.onResetSteps())
      steps.append(next, reset)
    })

    noticeKey = rebuild(notice, state.notice ? `${state.notice.error}|${state.notice.message}` : '', noticeKey, () => {
      if (!state.notice) return
      notice.className = `ann-shot-notice${state.notice.error ? ' ann-shot-error' : ''}`
      notice.setAttribute('role', 'status')
      notice.append(overlayIcon(doc, 'alert', 14), state.notice.message)
    })
  }

  return { el, update }
}
