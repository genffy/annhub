/**
 * Screenshot output geometry — pure functions for the ratio-locked
 * selection, the watermark layout, the beautify composition and the JPEG
 * matte (docs/v2/screenshot.md §1.3, §4.2-4.4). Block-average mosaics and
 * cropping live next to the session; these are the pieces the settings and
 * the copy/download pipeline share, so they are tested against the numbers
 * in the contract.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// ── Ratio presets (screenshot.md §1.3) ───────────────────────────────────

export interface RatioPreset {
  id: string
  w: number
  h: number
}

export const RATIO_PRESETS: readonly RatioPreset[] = [
  { id: '1:1', w: 1, h: 1 },
  { id: '4:5', w: 4, h: 5 },
  { id: '3:4', w: 3, h: 4 },
  { id: '4:3', w: 4, h: 3 },
  { id: '16:9', w: 16, h: 9 },
  { id: '9:16', w: 9, h: 16 },
]

export const DEFAULT_RATIO_PRESETS = ['1:1', '4:5', '3:4', '16:9']

export function ratioOf(id: string): RatioPreset | undefined {
  return RATIO_PRESETS.find(preset => preset.id === id)
}

/**
 * Locks a dragged rectangle to a preset's ratio while keeping it inside the
 * viewport: the dragged diagonal wins where it can, then the box is clamped
 * and re-fitted.
 */
export function constrainToRatio(anchor: { x: number; y: number }, point: { x: number; y: number }, presetId: string, viewport: { width: number; height: number }): Rect {
  const preset = ratioOf(presetId)
  if (!preset) {
    return {
      x: Math.min(anchor.x, point.x),
      y: Math.min(anchor.y, point.y),
      width: Math.abs(point.x - anchor.x),
      height: Math.abs(point.y - anchor.y),
    }
  }
  return constrainToRatioValue(anchor, point, preset.w / preset.h, viewport)
}

/** The Shift lock holds an arbitrary current ratio (screenshot.md §1.2). */
export function constrainToRatioValue(anchor: { x: number; y: number }, point: { x: number; y: number }, ratio: number, viewport: { width: number; height: number }): Rect {
  const rawW = Math.abs(point.x - anchor.x)
  const rawH = Math.abs(point.y - anchor.y)
  // fit the larger dragged dimension to the ratio
  let width = rawW >= rawH * ratio ? rawW : rawH * ratio
  let height = width / ratio
  // clamp into the viewport from the anchor side
  const dirX = point.x >= anchor.x ? 1 : -1
  const dirY = point.y >= anchor.y ? 1 : -1
  const maxWidth = dirX > 0 ? viewport.width - anchor.x : anchor.x
  const maxHeight = dirY > 0 ? viewport.height - anchor.y : anchor.y
  if (width > maxWidth) {
    width = maxWidth
    height = width / ratio
  }
  if (height > maxHeight) {
    height = maxHeight
    width = height * ratio
  }
  width = Math.max(1, width)
  height = Math.max(1, height)
  return {
    x: dirX > 0 ? anchor.x : anchor.x - width,
    y: dirY > 0 ? anchor.y : anchor.y - height,
    width,
    height,
  }
}

// ── Watermark layout (screenshot.md §4.3) ────────────────────────────────

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type WatermarkSize = 'small' | 'medium' | 'large'

export interface WatermarkSettings {
  enabled: boolean
  text?: string
  image?: string // dataUrl, PNG
  position: WatermarkPosition
  size: WatermarkSize
  /** 0.2 to 1 */
  opacity: number
}

export const WATERMARK_MARGIN = 12

/** The watermark strip's box on a canvas: margin-scaled by canvas size, font by the size tier. */
export function watermarkBox(
  canvas: { width: number; height: number },
  settings: Pick<WatermarkSettings, 'position' | 'size'>,
): { x: number; y: number; fontSize: number; margin: number } {
  const base = Math.min(canvas.width, canvas.height)
  const fontSize = settings.size === 'small' ? Math.round(base * 0.028) : settings.size === 'large' ? Math.round(base * 0.056) : Math.round(base * 0.04)
  const margin = Math.max(WATERMARK_MARGIN, Math.round(base * 0.02))
  const x = settings.position.endsWith('right') ? canvas.width - margin : margin
  const y = settings.position.startsWith('top') ? margin : canvas.height - margin
  return { x, y, fontSize, margin }
}

// ── Beautify composition (screenshot.md §4.4) ────────────────────────────

export type BeautifyBackground = 'none' | 'solid-white' | 'solid-ivory' | 'grad-purple' | 'grad-blue' | 'grad-green' | 'grad-sunset' | 'grad-slate'
export type BeautifyPadding = 'small' | 'medium' | 'large'

export interface BeautifySettings {
  enabled: boolean
  background: BeautifyBackground
  padding: BeautifyPadding
  /** CSS px: 0 / 12 / 24 */
  radius: number
  shadow: boolean
  /** output canvas ratio: free keeps content + padding */
  ratio?: string
}

export const PADDING_PX: Record<BeautifyPadding, number> = { small: 24, medium: 40, large: 64 }

/**
 * The output canvas geometry: content sits centered and intact (never
 * cropped); "free" = content + padding, a preset ratio pads beyond that with
 * background, and the same inputs always produce the same output size.
 */
export function composeGeometry(
  content: { width: number; height: number },
  settings: BeautifySettings,
  scale = 1,
): { canvas: { width: number; height: number }; content: { x: number; y: number; width: number; height: number } } {
  const padding = PADDING_PX[settings.padding] * scale
  const innerW = content.width + padding * 2
  const innerH = content.height + padding * 2
  const preset = settings.ratio ? ratioOf(settings.ratio) : undefined
  let canvasW = innerW
  let canvasH = innerH
  if (preset) {
    const ratio = preset.w / preset.h
    if (innerW / innerH < ratio) canvasW = Math.round(innerH * ratio)
    else canvasH = Math.round(innerW / ratio)
  }
  return {
    canvas: { width: Math.round(canvasW), height: Math.round(canvasH) },
    content: {
      x: Math.round((canvasW - content.width) / 2),
      y: Math.round((canvasH - content.height) / 2),
      width: content.width,
      height: content.height,
    },
  }
}

export const BEAUTIFY_BACKGROUNDS: Record<BeautifyBackground, { fill: string | CanvasGradient | null; light: boolean }> = {
  'none': { fill: null, light: true },
  'solid-white': { fill: '#ffffff', light: true },
  'solid-ivory': { fill: '#f6f1e7', light: true },
  'grad-purple': { fill: 'linear-gradient(135deg, #efe9fa, #d7c9f5)', light: true },
  'grad-blue': { fill: 'linear-gradient(135deg, #e3edfa, #c6d9f2)', light: true },
  'grad-green': { fill: 'linear-gradient(135deg, #e6f3ea, #c8e3d0)', light: true },
  'grad-sunset': { fill: 'linear-gradient(135deg, #fdeee2, #f9d6c3)', light: true },
  'grad-slate': { fill: 'linear-gradient(135deg, #2a2d35, #17181c)', light: false },
}

export type DownloadFormat = 'png' | 'jpeg' | 'webp'

export function downloadMime(format: DownloadFormat): string {
  return `image/${format}`
}

export function downloadExtension(format: DownloadFormat): string {
  return format === 'jpeg' ? 'jpg' : format
}
