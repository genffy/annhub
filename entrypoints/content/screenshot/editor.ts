import { uiText } from '../../../utils/ui-text'
import type { ViewportRect } from './crop'
import { mosaicBlockSize, pixelateRegion } from './mosaic'

export type Point = { x: number; y: number }
export type DrawTool = 'rectangle' | 'ellipse' | 'arrow' | 'pen' | 'mosaic'
export type ScreenshotTool = DrawTool | 'text' | 'step' | null
/**
 * A numbered badge (screenshot.md §1.1). Its number is not stored: it is the badge's place among the badges of its
 * sequence, in the order they were put down, so deleting one closes the gap. 重置计数 starts the next sequence.
 */
export type StepAnnotation = { tool: 'step'; at: Point; color: string; sequence: number }
export type Annotation = { tool: DrawTool; start: Point; end: Point; points: Point[]; color: string } | { tool: 'text'; start: Point; text: string; color: string } | StepAnnotation

/** A badge is 28 CSS pixels across, rim included, and grows with the capture's pixel ratio as the strokes and the text do. */
const STEP_RADIUS = 14
const STEP_RIM = 2
const STEP_FONT = 15
/** the number's ink, which is also the rim's: dark on the light fills, white on the others */
const STEP_INK_DARK = '#20252b'
const STEP_INK_LIGHT = '#ffffff'

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

  const numbers = stepNumbers(annotations)
  for (const annotation of annotations) {
    if (annotation.tool === 'mosaic') {
      pixelate(toRect(annotation.start, annotation.end))
      continue
    }
    if (annotation.tool === 'step') {
      paintStep(ctx, annotation, numbers.get(annotation) ?? 1, scale)
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

/** A badge's radius on the capture, rim included. */
export function stepRadius(scale: number): number {
  return Math.max(STEP_RADIUS, STEP_RADIUS * scale)
}

/** Every badge's number: its place among the badges of its sequence, in the order they were put down. */
export function stepNumbers(annotations: readonly Annotation[]): Map<StepAnnotation, number> {
  const counted = new Map<number, number>()
  const numbers = new Map<StepAnnotation, number>()
  for (const annotation of annotations) {
    if (annotation.tool !== 'step') continue
    const number = (counted.get(annotation.sequence) ?? 0) + 1
    counted.set(annotation.sequence, number)
    numbers.set(annotation, number)
  }
  return numbers
}

/** The number the next badge of `sequence` gets. */
export function nextStepNumber(annotations: readonly Annotation[], sequence: number): number {
  return annotations.filter(annotation => annotation.tool === 'step' && annotation.sequence === sequence).length + 1
}

/** The badge under a point of the capture — where two overlap, the one drawn on top — or `null`. */
export function stepAt(annotations: readonly Annotation[], point: Point, scale: number): StepAnnotation | null {
  const radius = stepRadius(scale)
  for (let index = annotations.length - 1; index >= 0; index--) {
    const annotation = annotations[index]!
    if (annotation.tool === 'step' && Math.hypot(point.x - annotation.at.x, point.y - annotation.at.y) <= radius) return annotation
  }
  return null
}

/** Keeps a badge whole inside the picture: put down or dragged against an edge, it stops at the edge. */
export function clampStep(at: Point, size: { width: number; height: number }, scale: number): Point {
  const radius = stepRadius(scale)
  const clamp = (value: number, length: number) => (length < radius * 2 ? length / 2 : Math.max(radius, Math.min(length - radius, value)))
  return { x: clamp(at.x, size.width), y: clamp(at.y, size.height) }
}

/**
 * The ink of a badge's number and rim: dark on the light fills (yellow, white), white on the others. The rim sets the
 * badge off from a background of its own colour, so it reads on any background.
 */
export function stepInk(color: string): string {
  return relativeLuminance(color) > 0.4 ? STEP_INK_DARK : STEP_INK_LIGHT
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(color: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** A filled disc in the badge's colour, ringed and numbered in its ink. The context is left as it was found. */
function paintStep(ctx: CanvasRenderingContext2D, step: StepAnnotation, number: number, scale: number): void {
  const radius = stepRadius(scale)
  const rim = Math.max(STEP_RIM, STEP_RIM * scale)
  const ink = stepInk(step.color)
  const label = String(number)
  ctx.save()
  ctx.beginPath()
  ctx.arc(step.at.x, step.at.y, radius - rim / 2, 0, Math.PI * 2)
  ctx.fillStyle = step.color
  ctx.fill()
  ctx.lineWidth = rim
  ctx.strokeStyle = ink
  ctx.stroke()
  // the number fills the disc; one too wide for it — three digits and up — is set smaller until it fits
  const room = (radius - rim) * 2 * 0.8
  let fontSize = Math.max(STEP_FONT, STEP_FONT * scale)
  ctx.font = `700 ${fontSize}px sans-serif`
  const width = ctx.measureText(label).width
  if (width > room) {
    fontSize *= room / width
    ctx.font = `700 ${fontSize}px sans-serif`
  }
  // centred on the ink of the digits, not on the font's box, which sits them high or low depending on the font
  const metrics = ctx.measureText(label)
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(label, step.at.x, step.at.y + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2)
  ctx.restore()
}

function toRect(start: Point, end: Point): ViewportRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}
