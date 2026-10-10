import { ArrowUpRight, Check, Circle, ClipboardCopy, Download, Grid2X2, Palette, Pencil, RectangleHorizontal, RotateCcw, Type, X } from 'lucide-react'
import { uiText } from '../../../utils/ui-text'
import type { ScreenshotTool } from './editor'

const tools = [
  { id: 'rectangle', labelKey: 'shot.tool.rect', Icon: RectangleHorizontal },
  { id: 'ellipse', labelKey: 'shot.tool.ellipse', Icon: Circle },
  { id: 'arrow', labelKey: 'shot.tool.arrow', Icon: ArrowUpRight },
  { id: 'pen', labelKey: 'shot.tool.pen', Icon: Pencil },
  { id: 'mosaic', labelKey: 'shot.tool.mosaic', Icon: Grid2X2 },
  { id: 'text', labelKey: 'shot.tool.text', Icon: Type },
] as const

const colors = [
  { value: '#e5484d', name: 'red' },
  { value: '#f6c453', name: 'yellow' },
  { value: '#147d72', name: 'teal' },
  { value: '#ffffff', name: 'white' },
  { value: '#20252b', name: 'black' },
] as const

interface Props {
  tool: ScreenshotTool
  color: string
  maskCount: number
  canUndo: boolean
  /** whether the beautify panel is open */
  beautifyOpen: boolean
  busy: boolean
  notice?: { message: string; error: boolean }
  onTool: (tool: ScreenshotTool) => void
  onColor: (color: string) => void
  onRemoveMask: (index: number) => void
  onUndo: () => void
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
            {colors.map(({ value, name }) => {
              const label = uiText(`shot.color.${name}`)
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
            title={uiText('shot.tool.confirm')}
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
