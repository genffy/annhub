/** The preview, clipboard and downloads share one composition; saved assets keep the capture. */
import { BEAUTIFY_BACKGROUNDS, composeGeometry, paintBeautified, paintWatermark, type WatermarkImage, type WatermarkSettings } from '../../../utils/screenshot-output'
import { type BeautifySettings } from '../../../core/screenshot-options'

const backgrounds = new WeakMap<HTMLCanvasElement, string>()
const frames = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()

/** Sample the original capture, so annotations never change the colour of its surrounding paper. */
function edgeBackground(source: HTMLCanvasElement): string {
  const cached = backgrounds.get(source)
  if (cached) return cached
  const ctx = source.getContext('2d')!
  const size = Math.min(8, source.width, source.height)
  const counts = new Map<string, number>()
  for (const [x, y] of [
    [0, 0],
    [source.width - size, 0],
    [0, source.height - size],
    [source.width - size, source.height - size],
  ]) {
    const data = ctx.getImageData(x!, y!, size, size).data
    for (let i = 0; i < data.length; i += 4) {
      const color = `rgba(${data[i]}, ${data[i + 1]}, ${data[i + 2]}, ${data[i + 3]! / 255})`
      counts.set(color, (counts.get(color) ?? 0) + 1)
    }
  }
  const color = [...counts].sort((a, b) => b[1] - a[1])[0]![0]
  backgrounds.set(source, color)
  return color
}

/** Text can touch every edge of a Range: round the added paper, never the selected glyphs. */
function frameText(content: HTMLCanvasElement, source: HTMLCanvasElement, radius: number, scale: number): { canvas: HTMLCanvasElement; inset: number } {
  const inset = Math.ceil(Math.max(12, radius) * scale)
  const canvas = frames.get(content) ?? content.ownerDocument.createElement('canvas')
  frames.set(content, canvas)
  canvas.width = content.width + inset * 2
  canvas.height = content.height + inset * 2
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = edgeBackground(source)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(content, inset, inset)
  return { canvas, inset }
}

export function paintScreenshotDisplay(
  display: HTMLCanvasElement,
  content: HTMLCanvasElement,
  options: {
    source: HTMLCanvasElement
    beautify: BeautifySettings
    scale: number
    textSelection: boolean
    watermark?: WatermarkSettings
    watermarkImage: WatermarkImage | null
  },
): { x: number; y: number } {
  const { beautify, scale, watermark, watermarkImage } = options
  const framed = beautify.enabled && options.textSelection ? frameText(content, options.source, beautify.radius, scale) : { canvas: content, inset: 0 }
  const geometry = beautify.enabled ? composeGeometry(framed.canvas, beautify, scale) : null
  display.width = geometry ? geometry.canvas.width : content.width
  display.height = geometry ? geometry.canvas.height : content.height
  const ctx = display.getContext('2d')!
  if (geometry) paintBeautified(ctx, framed.canvas, geometry, beautify, scale)
  else ctx.drawImage(content, 0, 0)
  if (watermark?.enabled) paintWatermark(ctx, display, watermark, geometry !== null && !BEAUTIFY_BACKGROUNDS[beautify.background].light, watermarkImage)
  return { x: (geometry?.content.x ?? 0) + framed.inset, y: (geometry?.content.y ?? 0) + framed.inset }
}
