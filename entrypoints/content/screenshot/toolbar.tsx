import {
  ArrowUpRight,
  Check,
  Circle,
  ClipboardCopy,
  Download,
  Grid2X2,
  Highlighter,
  ListOrdered,
  ListRestart,
  Palette,
  Pencil,
  RectangleHorizontal,
  RotateCcw,
  Slash,
  Type,
  X,
} from 'lucide-react'
import { uiText } from '../../../utils/ui-text'
import { ANNOTATION_COLORS, isLineTool, LINE_WIDTHS, type LineWidth, type ScreenshotTool } from './editor'
import type { UiTextKey } from '../../../utils/ui-text'

const tools = [
  { id: 'rectangle', labelKey: 'shot.tool.rect', Icon: RectangleHorizontal },
  { id: 'ellipse', labelKey: 'shot.tool.ellipse', Icon: Circle },
  { id: 'arrow', labelKey: 'shot.tool.arrow', Icon: ArrowUpRight },
  { id: 'line', labelKey: 'shot.tool.line', Icon: Slash },
  { id: 'pen', labelKey: 'shot.tool.pen', Icon: Pencil },
  { id: 'highlighter', labelKey: 'shot.tool.highlighter', Icon: Highlighter },
  { id: 'mosaic', labelKey: 'shot.tool.mosaic', Icon: Grid2X2 },
  { id: 'text', labelKey: 'shot.tool.text', Icon: Type },
  { id: 'step', labelKey: 'shot.tool.step', Icon: ListOrdered },
] as const

/** The dot each width button shows, in CSS pixels across: the same three sizes whichever tool is on. */
const WIDTH_DOTS: Record<LineWidth, number> = { thin: 4, medium: 7, thick: 11 }

interface Props {
  tool: ScreenshotTool
  color: string
  /** the width the pen, the line and the highlighter draw at */
  lineWidth: LineWidth
  maskCount: number
  canUndo: boolean
  /** the number the step tool puts down next */
  nextStep: number
  /** whether the beautify panel is open */
  beautifyOpen: boolean
  busy: boolean
  notice?: { message: string; error: boolean }
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

export function ScreenshotToolbar(props: Props) {
  return (
    <>
      <div className="ann-shot-tools" role="toolbar" aria-label={uiText('shot.toolbar')}>
        <div className="ann-shot-tool-scroll">
          {tools.map(({ id, labelKey, Icon }) => {
            const label = uiText(labelKey)
            return (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={props.tool === id}
                className={props.tool === id ? 'ann-shot-active' : ''}
                data-ann-ui={`screenshot-tool-${id}`}
                onClick={() => props.onTool(props.tool === id ? null : id)}
              >
                <Icon size={19} strokeWidth={2} />
              </button>
            )
          })}
          <span className="ann-shot-divider" />
          <div className="ann-shot-colors" aria-label={uiText('shot.colors')}>
            {ANNOTATION_COLORS.map(({ value, name }) => {
              const label = uiText(`shot.color.${name}` as UiTextKey)
              return (
                <button
                  key={value}
                  type="button"
                  className={`ann-shot-swatch${props.color === value ? ' ann-shot-swatch-active' : ''}`}
                  title={label}
                  aria-label={label}
                  aria-pressed={props.color === value}
                  style={{ '--swatch': value } as React.CSSProperties}
                  onClick={() => props.onColor(value)}
                />
              )
            })}
          </div>
          <span className="ann-shot-divider" />
          <button
            type="button"
            title={uiText('shot.tool.undo')}
            aria-label={uiText('shot.tool.undo')}
            data-ann-ui="screenshot-undo"
            disabled={!props.canUndo || props.busy}
            onClick={props.onUndo}
          >
            <RotateCcw size={19} />
          </button>
          <button
            type="button"
            title={uiText('shot.beautify')}
            aria-label={uiText('shot.beautify')}
            aria-expanded={props.beautifyOpen}
            className={props.beautifyOpen ? 'ann-shot-active' : ''}
            data-ann-ui="screenshot-beautify"
            disabled={props.busy}
            onClick={props.onBeautify}
          >
            <Palette size={19} />
          </button>
          <button type="button" title={uiText('shot.tool.copy')} aria-label={uiText('shot.tool.copy')} data-ann-ui="screenshot-copy" disabled={props.busy} onClick={props.onCopy}>
            <ClipboardCopy size={19} />
          </button>
          <button
            type="button"
            title={uiText('shot.tool.download')}
            aria-label={uiText('shot.tool.download')}
            data-ann-ui="screenshot-download"
            disabled={props.busy}
            onClick={props.onDownload}
          >
            <Download size={19} />
          </button>
        </div>
        <div className="ann-shot-actions">
          <button
            type="button"
            title={uiText('shot.tool.cancel')}
            aria-label={uiText('shot.tool.cancel')}
            data-ann-ui="screenshot-cancel"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            <X size={21} />
          </button>
          <button
            type="button"
            title={`${uiText('shot.tool.confirm')} · ${uiText('shot.tool.confirmHint')}`}
            aria-label={uiText('shot.tool.confirm')}
            className="ann-shot-confirm"
            data-ann-ui="screenshot-save"
            disabled={props.busy}
            onClick={props.onSave}
          >
            <Check size={22} />
          </button>
        </div>
      </div>
      {isLineTool(props.tool) && (
        <div className="ann-shot-widths" role="group" aria-label={uiText('shot.lineWidth')} data-ann-ui="screenshot-line-widths">
          <span aria-hidden="true">{uiText('shot.lineWidth')}</span>
          {LINE_WIDTHS.map(width => {
            const label = uiText(`shot.lineWidth.${width}`)
            return (
              <button
                key={width}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={props.lineWidth === width}
                className={props.lineWidth === width ? 'ann-shot-active' : ''}
                data-ann-ui={`screenshot-line-width-${width}`}
                onClick={() => props.onLineWidth(width)}
              >
                <i style={{ width: WIDTH_DOTS[width], height: WIDTH_DOTS[width] }} />
              </button>
            )
          })}
        </div>
      )}
      {props.tool === 'step' && (
        <div className="ann-shot-steps" data-ann-ui="screenshot-steps">
          <span data-ann-ui="screenshot-step-next">{uiText('shot.step.next', { number: props.nextStep })}</span>
          <button type="button" data-ann-ui="screenshot-step-reset" disabled={props.nextStep === 1 || props.busy} onClick={props.onResetSteps}>
            <ListRestart size={14} aria-hidden="true" />
            {uiText('shot.step.reset')}
          </button>
        </div>
      )}
      {props.maskCount > 0 && (
        <div className="ann-shot-masks" aria-label={uiText('shot.masks')}>
          {Array.from({ length: props.maskCount }, (_, index) => (
            <span key={index} data-ann-ui="mask-box">
              {uiText('shot.mask', { index: index + 1 })}
              <button
                type="button"
                title={uiText('shot.mask.remove', { index: index + 1 })}
                aria-label={uiText('shot.mask.remove', { index: index + 1 })}
                data-ann-ui={`mask-remove-${index + 1}`}
                onClick={() => props.onRemoveMask(index)}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      {props.notice && (
        <div className={`ann-shot-notice${props.notice.error ? ' ann-shot-error' : ''}`} role="status">
          {props.notice.message}
        </div>
      )}
    </>
  )
}
