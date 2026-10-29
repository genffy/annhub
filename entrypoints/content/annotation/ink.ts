/**
 * Page-annotation ink model — docs/product/annotate.md §1.
 *
 * Strokes live in viewport CSS coordinates at draw time (annotate.md §1.2:
 * ink stays where it was drawn on screen). The conversions here are the one
 * place that turns ink into editor annotations (annotate.md §1.3): strokes
 * fully inside the frame keep their native editor shape, strokes fully
 * outside are dropped, and strokes crossing the boundary are cut at it — a
 * cut rectangle is no longer a rectangle, so cut strokes travel as plain
 * polylines with their widths in pixels.
 */
import type { Annotation, LineWidth, Point, StepAnnotation } from '../screenshot/editor'

export type InkTool = 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'text' | 'step'

export interface InkStroke {
  id: string
  tool: InkTool
  /** pen/highlighter: the trace; shapes: [start, end]; text and step: the anchor. Viewport CSS px at draw time. */
  points: Point[]
  color: string
  /** What the pen, the line and the highlighter draw at (screenshot.md §1.1). */
  width?: LineWidth
  text?: string
  /** Step badges: which 重置计数 group they count in, like the editor's StepAnnotation. */
  sequence?: number
}

export type Rect = { x: number; y: number; width: number; height: number }

/** The shapes' line, in CSS pixels, as the editor paints it (editor.ts SHAPE_WIDTH grown with the ratio). */
const SHAPE_WIDTH_CSS = 3

function inside(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
}

/**
 * Liang–Barsky: where the segment from `a` to `b` crosses the rect, or null
 * when it lies entirely outside. Endpoints inside come back unchanged.
 */
export function clipSegment(a: Point, b: Point, rect: Rect): [Point, Point] | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  if (!clip(-dx, a.x - rect.x)) return null
  if (!clip(dx, rect.x + rect.width - a.x)) return null
  if (!clip(-dy, a.y - rect.y)) return null
  if (!clip(dy, rect.y + rect.height - a.y)) return null
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ]
}

/** The runs of a polyline that lie inside the rect; a stroke that never enters comes back empty. */
export function clipPolyline(points: readonly Point[], rect: Rect): Point[][] {
  const runs: Point[][] = []
  let run: Point[] = []
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!
    const previous = points[index - 1]
    if (inside(point, rect)) {
      if (previous && !inside(previous, rect)) {
        const crossed = clipSegment(previous, point, rect)
        if (crossed) run.push(crossed[0])
      }
      run.push(point)
    } else if (run.length > 0) {
      const crossed = previous ? clipSegment(previous, point, rect) : null
      if (crossed) run.push(crossed[1])
      if (run.length > 1) runs.push(run)
      run = []
    }
  }
  if (run.length > 1) runs.push(run)
  return runs
}

const toCanvas = (point: Point, frame: Rect, scale: number): Point => ({ x: (point.x - frame.x) * scale, y: (point.y - frame.y) * scale })

const shapePixelWidth = (scale: number): number => Math.max(2, SHAPE_WIDTH_CSS * scale)

/** An ellipse as a closed polyline of `steps` points, in the CSS coordinates of its bounding box. */
function ellipsePoints(a: Point, b: Point, steps = 72): Point[] {
  const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2
    return { x: cx + (rect.width / 2) * Math.cos(angle), y: cy + (rect.height / 2) * Math.sin(angle) }
  })
}

/** The two head strokes of an arrow, from its tip backwards, in CSS coordinates. */
function arrowHeadLines(start: Point, end: Point, head: number): [Point, Point][] {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  return [
    [{ x: end.x - head * Math.cos(angle - Math.PI / 6), y: end.y - head * Math.sin(angle - Math.PI / 6) }, end],
    [{ x: end.x - head * Math.cos(angle + Math.PI / 6), y: end.y - head * Math.sin(angle + Math.PI / 6) }, end],
  ]
}

const polyline = (points: Point[], color: string, pixelWidth: number): Annotation => ({ tool: 'polyline', points, color, pixelWidth })

/**
 * Ink at capture time → editor annotations over the captured frame, in the
 * capture's pixel coordinates (annotate.md §1.3): `frame` is the viewport
 * rectangle the capture covers, `scale` its device pixel ratio.
 */
export function inkToEditorAnnotations(strokes: readonly InkStroke[], frame: Rect, scale: number): Annotation[] {
  const out: Annotation[] = []
  for (const stroke of strokes) {
    const points = stroke.points
    if (points.length === 0) continue
    switch (stroke.tool) {
      case 'pen':
      case 'highlighter': {
        const runs = inside(points[0]!, frame) && points.every(point => inside(point, frame)) ? [points] : clipPolyline(points, frame)
        for (const run of runs) {
          const scaled = run.map(point => toCanvas(point, frame, scale))
          out.push({ tool: stroke.tool, start: scaled[0]!, end: scaled[scaled.length - 1]!, points: scaled, color: stroke.color, width: stroke.width ?? 'medium' })
        }
        break
      }
      case 'line': {
        const [a, b] = [points[0]!, points[1] ?? points[0]!]
        const clipped = clipSegment(a, b, frame)
        if (!clipped) break
        const [start, end] = clipped.map(point => toCanvas(point, frame, scale)) as [Point, Point]
        out.push({ tool: 'line', start, end, points: [start, end], color: stroke.color, width: stroke.width ?? 'medium' })
        break
      }
      case 'rectangle': {
        const [a, b] = [points[0]!, points[1] ?? points[0]!]
        if (inside(a, frame) && inside(b, frame)) {
          const start = toCanvas(a, frame, scale)
          const end = toCanvas(b, frame, scale)
          out.push({ tool: 'rectangle', start, end, points: [start, end], color: stroke.color })
          break
        }
        const edges: [Point, Point][] = [
          [a, { x: b.x, y: a.y }],
          [{ x: b.x, y: a.y }, b],
          [b, { x: a.x, y: b.y }],
          [{ x: a.x, y: b.y }, a],
        ]
        for (const [from, to] of edges) {
          const clipped = clipSegment(from, to, frame)
          if (clipped)
            out.push(
              polyline(
                clipped.map(point => toCanvas(point, frame, scale)),
                stroke.color,
                shapePixelWidth(scale),
              ),
            )
        }
        break
      }
      case 'ellipse': {
        const a = points[0]!
        const b = points[1] ?? points[0]!
        if (inside(a, frame) && inside(b, frame)) {
          const start = toCanvas(a, frame, scale)
          const end = toCanvas(b, frame, scale)
          out.push({ tool: 'ellipse', start, end, points: [start, end], color: stroke.color })
          break
        }
        const runs = clipPolyline(ellipsePoints(a, b), frame)
        for (const run of runs)
          out.push(
            polyline(
              run.map(point => toCanvas(point, frame, scale)),
              stroke.color,
              shapePixelWidth(scale),
            ),
          )
        break
      }
      case 'arrow': {
        const [a, b] = [points[0]!, points[1] ?? points[0]!]
        if (inside(a, frame) && inside(b, frame)) {
          const start = toCanvas(a, frame, scale)
          const end = toCanvas(b, frame, scale)
          out.push({ tool: 'arrow', start, end, points: [start, end], color: stroke.color })
          break
        }
        // the head's size follows the editor's: it grows with the capture's ratio, so it is laid out in canvas pixels
        const head = Math.max(10, 12 * scale)
        const headCss = head / scale
        for (const segment of [[a, b] as [Point, Point], ...arrowHeadLines(a, b, headCss)]) {
          const clipped = clipSegment(segment[0], segment[1], frame)
          if (clipped)
            out.push(
              polyline(
                clipped.map(point => toCanvas(point, frame, scale)),
                stroke.color,
                shapePixelWidth(scale),
              ),
            )
        }
        break
      }
      case 'text': {
        // a text annotation travels whole: its anchor inside the frame keeps it, otherwise it is out
        if (!inside(points[0]!, frame)) break
        out.push({ tool: 'text', start: toCanvas(points[0]!, frame, scale), text: stroke.text ?? '', color: stroke.color })
        break
      }
      case 'step': {
        if (!inside(points[0]!, frame)) break
        const step: StepAnnotation = { tool: 'step', at: toCanvas(points[0]!, frame, scale), color: stroke.color, sequence: stroke.sequence ?? 0 }
        out.push(step)
        break
      }
    }
  }
  return out
}

/** Ink for the wire (a message payload): a copy the sender can keep mutating without touching the session's strokes. */
export function snapshotInk(strokes: readonly InkStroke[]): InkStroke[] {
  return strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }))
}
