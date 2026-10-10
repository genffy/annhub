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

/** The corner radii the panel and the settings offer, in CSS px. */
export const BEAUTIFY_RADII: readonly number[] = [0, 12, 24]

/** The style a session starts from when the settings say nothing else (extension.md §2.5: beautify off; the rest is the initial style). */
export const DEFAULT_BEAUTIFY: BeautifySettings = { enabled: false, background: 'solid-white', padding: 'medium', radius: 12, shadow: true }

/** The style after the panel changes `patch`. Changing anything but the switch itself turns beautify on, so the change is seen at once. */
export function applyBeautifyChange(current: BeautifySettings, patch: Partial<BeautifySettings>): BeautifySettings {
  return { ...current, ...patch, enabled: patch.enabled ?? true }
}

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

/** How a background is painted: not at all (the canvas stays transparent), a flat colour, or a two-stop gradient along a CSS angle. */
export type BackgroundPaint = { kind: 'none' } | { kind: 'solid'; color: string } | { kind: 'gradient'; angle: number; from: string; to: string }

/** The eight backgrounds in the order the panel and the settings page list them (screenshot.md §4.4: none, two solids, five gradients). */
export const BEAUTIFY_BACKGROUND_IDS: readonly BeautifyBackground[] = ['none', 'solid-white', 'solid-ivory', 'grad-purple', 'grad-blue', 'grad-green', 'grad-sunset', 'grad-slate']

export const BEAUTIFY_BACKGROUNDS: Record<BeautifyBackground, { paint: BackgroundPaint; /** whether dark text reads on it (the watermark's colour follows) */ light: boolean }> = {
  'none': { paint: { kind: 'none' }, light: true },
  'solid-white': { paint: { kind: 'solid', color: '#ffffff' }, light: true },
  'solid-ivory': { paint: { kind: 'solid', color: '#f6f1e7' }, light: true },
  'grad-purple': { paint: { kind: 'gradient', angle: 135, from: '#efe9fa', to: '#d7c9f5' }, light: true },
  'grad-blue': { paint: { kind: 'gradient', angle: 135, from: '#e3edfa', to: '#c6d9f2' }, light: true },
  'grad-green': { paint: { kind: 'gradient', angle: 135, from: '#e6f3ea', to: '#c8e3d0' }, light: true },
  'grad-sunset': { paint: { kind: 'gradient', angle: 135, from: '#fdeee2', to: '#f9d6c3' }, light: true },
  'grad-slate': { paint: { kind: 'gradient', angle: 135, from: '#2a2d35', to: '#17181c' }, light: false },
}

/** A background as CSS, for the swatches of the panel and the settings page (a canvas cannot take this string: see `paintBackground`). */
export function backgroundCss(id: BeautifyBackground): string {
  const paint = BEAUTIFY_BACKGROUNDS[id].paint
  if (paint.kind === 'solid') return paint.color
  if (paint.kind === 'gradient') return `linear-gradient(${paint.angle}deg, ${paint.from}, ${paint.to})`
  return 'transparent'
}

/**
 * The start and end of a CSS-style gradient line across a `width` × `height` box: through the centre, at `angle` degrees
 * clockwise from "up", long enough that the box's corners take the first and last colour (so 135° runs corner to corner).
 */
export function gradientLine(width: number, height: number, angle: number): { x0: number; y0: number; x1: number; y1: number } {
  const radians = (angle * Math.PI) / 180
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2
  const cx = width / 2
  const cy = height / 2
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half }
}

type FillContext = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect' | 'createLinearGradient'>

/**
 * Paints a background over the whole canvas. A canvas does not understand CSS gradient strings — given one, `fillStyle`
 * ignores it and the fill stays black — so a gradient is built from its stops on the canvas itself.
 */
export function paintBackground(ctx: FillContext, width: number, height: number, id: BeautifyBackground): void {
  const paint = BEAUTIFY_BACKGROUNDS[id].paint
  if (paint.kind === 'none') return
  if (paint.kind === 'solid') {
    ctx.fillStyle = paint.color
  } else {
    const line = gradientLine(width, height, paint.angle)
    const gradient = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1)
    gradient.addColorStop(0, paint.from)
    gradient.addColorStop(1, paint.to)
    ctx.fillStyle = gradient
  }
  ctx.fillRect(0, 0, width, height)
}

type ComposeContext = FillContext &
  Pick<
    CanvasRenderingContext2D,
    'save' | 'restore' | 'beginPath' | 'moveTo' | 'arcTo' | 'closePath' | 'clip' | 'fill' | 'drawImage' | 'shadowColor' | 'shadowBlur' | 'shadowOffsetX' | 'shadowOffsetY'
  >

/** A rounded rectangle path; the radius never exceeds half of the shorter side. */
export function roundedRectPath(ctx: Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'arcTo' | 'closePath'>, rect: Rect, radius: number): void {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2))
  ctx.beginPath()
  ctx.moveTo(rect.x + r, rect.y)
  ctx.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, r)
  ctx.arcTo(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, r)
  ctx.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, r)
  ctx.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, r)
  ctx.closePath()
}

/**
 * Draws the beautified picture: background, the content's shadow, then the content itself with rounded corners. `scale`
 * is the device pixel ratio the content was captured at — padding, radius and shadow are CSS pixels (screenshot.md §4.4).
 * The shadow is cast by a shape drawn out of sight and moved back by the shadow offset, so no opaque shape ends up under
 * the content: what is transparent in the content stays see-through to the shadow and the background.
 */
export function paintBeautified(
  ctx: ComposeContext,
  content: CanvasImageSource,
  geometry: { canvas: { width: number; height: number }; content: Rect },
  settings: BeautifySettings,
  scale: number,
): void {
  paintBackground(ctx, geometry.canvas.width, geometry.canvas.height, settings.background)
  const radius = settings.radius * scale
  if (settings.shadow) {
    const padding = PADDING_PX[settings.padding] * scale
    const blur = Math.round(Math.min(20 * scale, padding * 0.6))
    const lift = Math.round(Math.min(8 * scale, padding * 0.25))
    const away = geometry.canvas.width + blur * 4 + 16
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.32)'
    ctx.shadowBlur = blur
    ctx.shadowOffsetX = away
    ctx.shadowOffsetY = lift
    ctx.fillStyle = '#000000'
    roundedRectPath(ctx, { ...geometry.content, x: geometry.content.x - away }, radius)
    ctx.fill()
    ctx.restore()
  }
  ctx.save()
  roundedRectPath(ctx, geometry.content, radius)
  ctx.clip()
  ctx.drawImage(content, geometry.content.x, geometry.content.y)
  ctx.restore()
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

/** What the size label takes above a picture: its own height and its gap to the picture's edge, with a little to spare. */
export const SIZE_LABEL_ROOM = 28

/** Room a preview leaves around itself: the size label above, the toolbar (and its notice) below. */
export const PREVIEW_RESERVE = { top: SIZE_LABEL_ROOM, bottom: 90, side: 16 }

/**
 * Where a picture of `natural` CSS pixels sits on screen while it is shown around `around` (the selection, or the element
 * that was captured): centred on it, scaled down to fit when it is bigger than the window leaves room for, and moved
 * back into that room. The composed beautify picture is bigger than the selection, so it grows around what was selected
 * (screenshot.md §4.4: the preview shrinks, copy and download keep the full pixels).
 */
export function previewBox(around: Rect, natural: { width: number; height: number }, viewport: { width: number; height: number }, reserve = PREVIEW_RESERVE): Rect {
  const room = { width: Math.max(1, viewport.width - reserve.side * 2), height: Math.max(1, viewport.height - reserve.top - reserve.bottom) }
  const fit = Math.min(1, room.width / natural.width, room.height / natural.height)
  const width = natural.width * fit
  const height = natural.height * fit
  return {
    x: clamp(around.x + around.width / 2 - width / 2, reserve.side, Math.max(reserve.side, viewport.width - reserve.side - width)),
    y: clamp(around.y + around.height / 2 - height / 2, reserve.top, Math.max(reserve.top, viewport.height - reserve.bottom - height)),
    width,
    height,
  }
}

const PANEL_EDGE = 8

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export type SizeLabelSpot = 'above' | 'below' | 'inside'

/**
 * Where the picture's size label goes: above its top-left corner; where the window leaves no room there, or the toolbar
 * is, below it; and where neither is free, inside the corner, which nothing else can cover.
 */
export function placeSizeLabel(preview: Rect, label: { width: number; height: number }, toolbar: Rect | null, viewport: { width: number; height: number }, gap = 6): SizeLabelSpot {
  const free = (y: number): boolean => {
    const spot = { x: preview.x, y, width: label.width, height: label.height }
    return y >= 0 && y + label.height <= viewport.height && preview.x + label.width <= viewport.width && !(toolbar && overlaps(spot, toolbar))
  }
  if (free(preview.y - gap - label.height)) return 'above'
  if (free(preview.y + preview.height + gap)) return 'below'
  return 'inside'
}

/**
 * Where the beautify panel goes: beside the preview where there is room (right, then left), else under the toolbar, else
 * above the preview — always inside the window and clear of both. Only when the window leaves no such place does it
 * cover part of the preview, never the toolbar. A place the panel already has stays while it is still valid, so the panel
 * does not jump about as the preview grows and shrinks under the user's hand.
 */
export function placePanel(
  panel: { width: number; height: number },
  around: { toolbar: Rect; preview: Rect },
  viewport: { width: number; height: number },
  current?: { left: number; top: number },
  gap = 10,
): { left: number; top: number } {
  const { toolbar, preview } = around
  const inside = (left: number, top: number): boolean =>
    left >= PANEL_EDGE && top >= PANEL_EDGE && left + panel.width <= viewport.width - PANEL_EDGE && top + panel.height <= viewport.height - PANEL_EDGE
  const box = (left: number, top: number): Rect => ({ x: left, y: top, width: panel.width, height: panel.height })
  const clear = (left: number, top: number): boolean => inside(left, top) && !overlaps(box(left, top), toolbar) && !overlaps(box(left, top), preview)
  if (current && clear(current.left, current.top)) return current

  const alongside = clamp(preview.y, PANEL_EDGE, Math.max(PANEL_EDGE, viewport.height - panel.height - PANEL_EDGE))
  const flush = clamp(toolbar.x + toolbar.width - panel.width, PANEL_EDGE, Math.max(PANEL_EDGE, viewport.width - panel.width - PANEL_EDGE))
  const candidates = [
    { left: preview.x + preview.width + gap, top: alongside },
    { left: preview.x - gap - panel.width, top: alongside },
    { left: flush, top: toolbar.y + toolbar.height + gap },
    { left: flush, top: preview.y - gap - panel.height },
  ]
  const free = candidates.find(candidate => clear(candidate.left, candidate.top))
  if (free) return free

  // no free place: stay on screen and off the toolbar, over the preview's corner if need be
  const left = clamp(preview.x + preview.width - panel.width, PANEL_EDGE, Math.max(PANEL_EDGE, viewport.width - panel.width - PANEL_EDGE))
  const top = clamp(preview.y, PANEL_EDGE, Math.max(PANEL_EDGE, viewport.height - panel.height - PANEL_EDGE))
  if (!overlaps(box(left, top), toolbar)) return { left, top }
  const aboveToolbar = clamp(toolbar.y - gap - panel.height, PANEL_EDGE, Math.max(PANEL_EDGE, viewport.height - panel.height - PANEL_EDGE))
  return { left, top: aboveToolbar }
}

// ── Watermark painting (screenshot.md §4.3) ──────────────────────────────

type TextContext = Pick<CanvasRenderingContext2D, 'globalAlpha' | 'fillStyle' | 'font' | 'textAlign' | 'textBaseline' | 'fillText'>

/** The watermark text in its corner of `canvas`; `onDark` picks the light ink for a background the dark one would vanish on. */
export function paintWatermark(ctx: TextContext, canvas: { width: number; height: number }, settings: WatermarkSettings, onDark: boolean): void {
  if (!settings.text) return
  const box = watermarkBox(canvas, settings)
  ctx.globalAlpha = settings.opacity
  ctx.fillStyle = onDark ? '#f4f5f7' : '#20252b'
  ctx.font = `${box.fontSize}px -apple-system, system-ui, sans-serif`
  ctx.textAlign = settings.position.endsWith('right') ? 'right' : 'left'
  ctx.textBaseline = settings.position.startsWith('top') ? 'top' : 'bottom'
  ctx.fillText(settings.text, box.x, box.y)
  ctx.globalAlpha = 1
}

export type DownloadFormat = 'png' | 'jpeg' | 'webp'

export function downloadMime(format: DownloadFormat): string {
  return `image/${format}`
}

export function downloadExtension(format: DownloadFormat): string {
  return format === 'jpeg' ? 'jpg' : format
}

/**
 * JPEG has no alpha (screenshot.md §4.2): anything transparent in the canvas — a transparent beautify
 * background, rounded corners, an element captured without a background of its own — would come out black.
 * Painted on white first, an opaque canvas is unchanged. Whatever the settings say, a JPEG always goes
 * through here.
 */
export function matteOnWhite(source: HTMLCanvasElement, doc: Document): HTMLCanvasElement {
  const matted = doc.createElement('canvas')
  matted.width = source.width
  matted.height = source.height
  const ctx = matted.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, matted.width, matted.height)
  ctx.drawImage(source, 0, 0)
  return matted
}
