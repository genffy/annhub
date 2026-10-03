import { ArrowUpRight, Check, Circle, Download, Grid2X2, Pencil, RectangleHorizontal, RotateCcw, Type, X } from 'lucide-react'
import type { ScreenshotTool } from './editor'

const tools = [
  { id: 'rectangle', label: '矩形', Icon: RectangleHorizontal },
  { id: 'ellipse', label: '椭圆', Icon: Circle },
  { id: 'arrow', label: '箭头', Icon: ArrowUpRight },
  { id: 'pen', label: '画笔', Icon: Pencil },
  { id: 'mosaic', label: '马赛克', Icon: Grid2X2 },
  { id: 'text', label: '文字', Icon: Type },
] as const

const colors = [
  { value: '#e5484d', label: '红色' },
  { value: '#f6c453', label: '黄色' },
  { value: '#147d72', label: '青色' },
  { value: '#ffffff', label: '白色' },
  { value: '#20252b', label: '黑色' },
]

interface Props {
  tool: ScreenshotTool
  color: string
  maskCount: number
  canUndo: boolean
  busy: boolean
  notice?: { message: string; error: boolean }
  onTool: (tool: ScreenshotTool) => void
  onColor: (color: string) => void
  onRemoveMask: (index: number) => void
  onUndo: () => void
  onDownload: () => void
  onCancel: () => void
  onSave: () => void
}

export function ScreenshotToolbar(props: Props) {
  return (
    <>
      <div className="ann-shot-tools" role="toolbar" aria-label="截图标注">
        <div className="ann-shot-tool-scroll">
          {tools.map(({ id, label, Icon }) => (
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
          ))}
          <span className="ann-shot-divider" />
          <div className="ann-shot-colors" aria-label="标注颜色">
            {colors.map(({ value, label }) => (
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
            ))}
          </div>
          <span className="ann-shot-divider" />
          <button type="button" title="撤销" aria-label="撤销" data-ann-ui="screenshot-undo" disabled={!props.canUndo || props.busy} onClick={props.onUndo}>
            <RotateCcw size={19} />
          </button>
          <button type="button" title="下载 PNG" aria-label="下载 PNG" data-ann-ui="screenshot-download" disabled={props.busy} onClick={props.onDownload}>
            <Download size={19} />
          </button>
        </div>
        <div className="ann-shot-actions">
          <button type="button" title="取消截图" aria-label="取消截图" data-ann-ui="screenshot-cancel" disabled={props.busy} onClick={props.onCancel}>
            <X size={21} />
          </button>
          <button
            type="button"
            title="保存到截图集"
            aria-label="保存到截图集"
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
        <div className="ann-shot-masks" aria-label="自动建议的马赛克区域">
          {Array.from({ length: props.maskCount }, (_, index) => (
            <span key={index} data-ann-ui="mask-box">
              马赛克 {index + 1}
              <button
                type="button"
                title={`移除马赛克 ${index + 1}`}
                aria-label={`移除马赛克 ${index + 1}`}
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
