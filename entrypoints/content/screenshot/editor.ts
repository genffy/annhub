import { uiText } from '../../../utils/ui-text'
import type { ViewportRect } from './crop'
import { mosaicBlockSize, pixelateRegion } from './mosaic'

export type Point = { x: number; y: number }
export type DrawTool = 'rectangle' | 'ellipse' | 'arrow' | 'pen' | 'mosaic'
export type ScreenshotTool = DrawTool | 'text' | null
export type Annotation = { tool: DrawTool; start: Point; end: Point; points: Point[]; color: string } | { tool: 'text'; start: Point; text: string; color: string }

export function renderScreenshot(target: HTMLCanvasElement, source: HTMLCanvasElement, masks: ViewportRect[], annotations: Annotation[], scale: number): void {
  const ctx = target.getContext('2d')
  if (!ctx) throw new Error(uiText('shot.error.edit'))
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(source, 0, 0)

  const pixelate = (rect: ViewportRect) => {
    if (rect.width < 2 || rect.height < 2) return
    const image = ctx.getImageData(0, 0, target.width, target.height)
    pixelateRegion(image, rect, mosaicBlockSize(scale))
    ctx.putImageData(image, 0, 0)
  }
  masks.forEach(pixelate)

  for (const annotation of annotations) {
    if (annotation.tool === 'mosaic') {
      pixelate(toRect(annotation.start, annotation.end))
      continue
    }
    ctx.strokeStyle = annotation.color
    ctx.fillStyle = annotation.color
    ctx.lineWidth = Math.max(2, 3 * scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (annotation.tool === 'text') {
      const fontSize = Math.max(18, 18 * scale)
      ctx.font = `600 ${fontSize}px sans-serif`
      annotation.text.split('\n').forEach((line, index) => {
        ctx.fillText(line, annotation.start.x, annotation.start.y + fontSize * (index + 1), target.width - annotation.start.x)
      })
      continue
    }
    const { start, end } = annotation
    if (annotation.tool === 'rectangle') {
      const rect = toRect(start, end)
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
    } else if (annotation.tool === 'ellipse') {
      const rect = toRect(start, end)
      ctx.beginPath()
      ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (annotation.tool === 'arrow') {
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const head = Math.max(10, 12 * scale)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.moveTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(end.x, end.y)
      ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    } else if (annotation.tool === 'pen' && annotation.points.length > 1) {
      ctx.beginPath()
      ctx.moveTo(annotation.points[0].x, annotation.points[0].y)
      annotation.points.slice(1).forEach(point => ctx.lineTo(point.x, point.y))
      ctx.stroke()
    }
  }
}

function toRect(start: Point, end: Point): ViewportRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}
