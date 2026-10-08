/**
 * Precise selection and repeatable frames — the pure helpers behind
 * screenshot.md §1.2 and §1.4. The session wires them into pointer and
 * keyboard flow; everything here is deterministic and unit-tested:
 *
 * - drag points snap to element edges within a threshold;
 * - the pending selection nudges by arrow keys (1px, Shift 10px) and
 *   resizes through its eight handles;
 * - an element + margin frame is the element's outer box expanded outward,
 *   and must fit the window (bigger elements go the element path instead);
 * - the remembered frame anchors to an element (selector + size tolerance)
 *   or to page coordinates, lives in sessionStorage for this tab and this
 *   page, and clears on navigation;
 * - a capture waits for two consecutive frames of unchanged layout
 *   (max 500ms) so repeated frames of the same element rasterize
 *   identically.
 */
import type { ViewportRect } from './crop'

export { type ViewportRect }

// ── Snapping (screenshot.md §1.2) ────────────────────────────────────────

export interface Viewport {
  width: number
  height: number
}

/** Candidate snap edges: element boxes under the point plus the viewport itself. */
export function collectEdges(rects: Array<{ left: number; top: number; right: number; bottom: number }>, viewport: Viewport): { xs: number[]; ys: number[] } {
  const xs = new Set<number>([0, viewport.width / 2, viewport.width])
  const ys = new Set<number>([0, viewport.height / 2, viewport.height])
  for (const rect of rects) {
    xs.add(rect.left)
    xs.add(rect.right)
    ys.add(rect.top)
    ys.add(rect.bottom)
  }
  return { xs: [...xs], ys: [...ys] }
}

export interface SnappedPoint {
  x: number
  y: number
  snappedX: number | null
  snappedY: number | null
}

/** Snaps a drag point to the nearest candidate edge within the threshold. */
export function snapPoint(point: { x: number; y: number }, edges: { xs: number[]; ys: number[] }, threshold = 8): SnappedPoint {
  const nearest = (candidates: number[], value: number): number | null => {
    let best: number | null = null
    let bestDistance = threshold
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - value)
      if (distance <= bestDistance) {
        best = candidate
        bestDistance = distance
      }
    }
    return best
  }
  const snappedX = nearest(edges.xs, point.x)
  const snappedY = nearest(edges.ys, point.y)
  return { x: snappedX ?? point.x, y: snappedY ?? point.y, snappedX, snappedY }
}

// ── Nudge and handles (screenshot.md §1.2) ───────────────────────────────

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

/** Moves the pending selection 1px (Shift: 10px), clamped to the viewport. */
export function nudgeBox(box: ViewportRect, key: ArrowKey, big: boolean, viewport: Viewport): ViewportRect {
  const delta = big ? 10 : 1
  const moves: Record<ArrowKey, [number, number]> = {
    ArrowLeft: [-delta, 0],
    ArrowRight: [delta, 0],
    ArrowUp: [0, -delta],
    ArrowDown: [0, delta],
  }
  const [dx, dy] = moves[key]
  const x = Math.max(0, Math.min(viewport.width - box.width, box.x + dx))
  const y = Math.max(0, Math.min(viewport.height - box.height, box.y + dy))
  return { ...box, x, y }
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLES: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Anchor positions (percent of the box) for painting the eight handles. */
export function handleAnchor(handle: HandleId): { x: number; y: number; cursor: string } {
  const cursors: Record<HandleId, string> = {
    nw: 'nwse-resize',
    n: 'ns-resize',
    ne: 'nesw-resize',
    e: 'ew-resize',
    se: 'nwse-resize',
    s: 'ns-resize',
    sw: 'nesw-resize',
    w: 'ew-resize',
  }
  const xs: Record<'w' | 'n' | 'e', number> = { w: 0, n: 0.5, e: 1 }
  const ys: Record<'n' | 'm' | 's', number> = { n: 0, m: 0.5, s: 1 }
  const [v, h] = [handle[0]!, handle[1]!] as ['n' | 's' | 'e' | 'w', 'w' | 'n' | 'e' | 's']
  const x = handle === 'n' || handle === 's' ? 0.5 : handle.includes('w') ? 0 : 1
  const y = handle === 'e' || handle === 'w' ? 0.5 : handle.includes('n') ? 0 : 1
  void v
  void h
  void xs
  void ys
  return { x, y, cursor: cursors[handle] }
}

/** Resizes the box from one handle by the pointer delta, clamped to the viewport. */
export function resizeFromHandle(box: ViewportRect, handle: HandleId, dx: number, dy: number, viewport: Viewport, minSize = 8): ViewportRect {
  const { x, y } = box
  const x1 = x + box.width
  const y1 = y + box.height
  let left = x
  let top = y
  let right = x1
  let bottom = y1
  if (handle.includes('w')) left = Math.min(right - minSize, Math.max(0, x + dx))
  if (handle.includes('e')) right = Math.max(left + minSize, Math.min(viewport.width, x1 + dx))
  if (handle.includes('n')) top = Math.min(bottom - minSize, Math.max(0, y + dy))
  if (handle.includes('s')) bottom = Math.max(top + minSize, Math.min(viewport.height, y1 + dy))
  const width = right - left
  const height = bottom - top
  return { x: left, y: top, width, height }
}

// ── Element + margin frames (screenshot.md §1.4) ──────────────────────────

export const MARGIN_CHOICES: readonly number[] = [0, 8, 16, 24, 32]

/** The frame = the element's outer box expanded by the margin on all sides. */
export function expandByMargin(rect: ViewportRect, margin: number): ViewportRect {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + margin * 2, height: rect.height + margin * 2 }
}

/** A frame must fit the window; a bigger element itself goes the element path. */
export function fitsInViewport(box: ViewportRect, viewport: Viewport): boolean {
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height
}

// ── Element hierarchy for ↑/↓ (screenshot.md §1.2) ───────────────────────

/** The visible ancestor chain from `el` up to (excluding) body. */
export function elementChain(el: Element): Element[] {
  const chain: Element[] = []
  let cursor: Element | null = el
  while (cursor && cursor !== document.body && cursor !== document.documentElement) {
    chain.push(cursor)
    cursor = cursor.parentElement
  }
  return chain
}

/**
 * Moves one level in the chain, skipping elements whose outer box equals the
 * current one (a wrapper adds nothing to the frame).
 */
export function adjustHierarchy(chain: Element[], index: number, direction: 1 | -1): number {
  const sameBox = (a: Element, b: Element): boolean => {
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    return Math.abs(ra.x - rb.x) < 0.5 && Math.abs(ra.y - rb.y) < 0.5 && Math.abs(ra.width - rb.width) < 0.5 && Math.abs(ra.height - rb.height) < 0.5
  }
  let next = index + direction
  while (next >= 0 && next < chain.length && sameBox(chain[next]!, chain[index]!)) {
    next += direction
  }
  return Math.max(0, Math.min(chain.length - 1, next))
}

// ── Selector anchoring and tolerance (screenshot.md §1.4) ────────────────

/** A structural nth-of-type path that re-finds the element after scrolling or re-render. */
export function buildSelector(el: Element): string {
  const parts: string[] = []
  let cursor: Element | null = el
  while (cursor && cursor !== document.body && cursor !== document.documentElement) {
    const tag = cursor.tagName.toLowerCase()
    const parent: Element | null = cursor.parentElement
    if (!parent) {
      parts.unshift(tag)
      break
    }
    const siblings = Array.from(parent.children).filter((child: Element) => child.tagName === cursor!.tagName)
    const index = siblings.indexOf(cursor) + 1
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
    cursor = parent
  }
  return parts.join(' > ')
}

/** Box drift check: a re-found element counts as the same one within 10%. */
export function boxWithinTolerance(a: { width: number; height: number }, b: { width: number; height: number }, tolerance = 0.1): boolean {
  return Math.abs(a.width - b.width) / Math.max(1, b.width) <= tolerance && Math.abs(a.height - b.height) / Math.max(1, b.height) <= tolerance
}

// ── Frame memory: this tab, this page (screenshot.md §1.4) ────────────────

export type FrameRecord =
  | { kind: 'element'; selector: string; margin: number; width: number; height: number; pageX: number; pageY: number; path: string }
  | { kind: 'box'; pageX: number; pageY: number; width: number; height: number; path: string }

const STORAGE_KEY = 'annhub.frame'

/** Remembers the frame for the next session on this page in this tab. */
export function rememberFrame(record: FrameRecord): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // private modes can refuse; the feature degrades to no memory
  }
}

/**
 * The remembered frame for this page, or null. A record left by another page
 * of the same origin is discarded — the memory is per page.
 */
export function readFrame(): FrameRecord | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const record = JSON.parse(raw) as FrameRecord
    if (record.path !== location.pathname + location.search) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return record
  } catch {
    return null
  }
}

/** Clears the memory; wired to pagehide so any navigation drops it. */
export function clearFrame(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to clear */
  }
}

// ── Stability wait (screenshot.md §1.4) ───────────────────────────────────

/**
 * Resolves once two consecutive animation frames show an unchanged layout
 * signature, or after `timeoutMs` at the latest. Repeated captures of the
 * same element then rasterize from a settled page.
 */
export function pageStable(win: Window, timeoutMs = 500): Promise<void> {
  return new Promise(resolve => {
    const started = win.performance.now()
    const signature = (): string => {
      const doc = win.document
      return `${win.scrollX}:${win.scrollY}:${doc.documentElement.scrollHeight}:${doc.body.getBoundingClientRect().height}`
    }
    let previous = signature()
    const raf: (cb: () => void) => void = typeof win.requestAnimationFrame === 'function' ? cb => win.requestAnimationFrame(cb) : cb => win.setTimeout(cb, 16)
    const tick = (): void => {
      if (win.performance.now() - started >= timeoutMs) {
        resolve()
        return
      }
      const current = signature()
      if (current === previous) {
        resolve()
        return
      }
      previous = current
      raf(tick)
    }
    raf(tick)
  })
}
