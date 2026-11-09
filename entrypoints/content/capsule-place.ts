/**
 * Hover-capsule placement (capture.md §6.2): prefers the block's right-top
 * corner. The top edge is straddled so a tall block can pin to the visible top
 * of the window; the left and right edges stay inside the block. Centering on
 * the corner (`right - width/2`) hangs half the capsule off the side — on a
 * timeline that half covers the sidebar (about 82px at 110% zoom). Occupied
 * corners yield to left-top, right-bottom, left-bottom, then a slide along the
 * top edge. Occupation is probed across the whole capsule box, not one point —
 * a small button inside the area still counts.
 */

/** How far the capsule sits inside the block's left and right edges. */
const CAPSULE_EDGE_INSET = 6

/** A box in window coordinates. */
export interface PlacedBox {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Places the capsule and returns the box it took. That box is the layout one:
 * the capsule's entry animation moves it 4px while it fades in, so reading its
 * rectangle back at this moment would be 4px off.
 */
export function positionCapsule(doc: Document, capsule: HTMLElement, rect: DOMRect): PlacedBox {
  const view = doc.defaultView!
  const box = { width: capsule.offsetWidth || 260, height: capsule.offsetHeight || 36 }
  const visibleTop = Math.max(rect.top, 0)
  const yTop = visibleTop - box.height / 2
  const yBottom = Math.min(rect.bottom, view.innerHeight) - box.height / 2
  // 6px inside the block, same inset as the hover-capsule mock. The right
  // edge of the capsule is `rect.right - 6`, never `rect.right + width/2`.
  const xRight = rect.right - box.width - CAPSULE_EDGE_INSET
  const xLeft = rect.left + CAPSULE_EDGE_INSET
  const corners: [number, number][] = [
    [xRight, yTop],
    [xLeft, yTop],
    [xRight, yBottom],
    [xLeft, yBottom],
  ]
  let [x, y] = corners[0]!
  for (const [cx, cy] of corners) {
    if (!capsuleAreaOccupied(doc, cx, cy, box, capsule)) {
      x = cx
      y = cy
      break
    }
  }
  if (capsuleAreaOccupied(doc, x, y, box, capsule)) {
    // all four corners taken (an X post's are): slide along the top edge
    // instead of sitting on the corner's controls
    const topY = corners[0]![1]
    const minX = Math.max(0, rect.left)
    for (let cx = corners[0]![0] - 24; cx >= minX; cx -= 24) {
      if (!capsuleAreaOccupied(doc, cx, topY, box, capsule)) {
        x = cx
        y = topY
        break
      }
    }
  }
  if (capsuleAreaOccupied(doc, x, y, box, capsule)) {
    // a sticky page header owns the whole top edge: try along the bottom edge
    // before sitting on a control
    const bottomY = corners[2]![1]
    for (let cx = corners[0]![0] - 24; cx >= Math.max(0, rect.left); cx -= 24) {
      if (!capsuleAreaOccupied(doc, cx, bottomY, box, capsule)) {
        x = cx
        y = bottomY
        break
      }
    }
  }
  let left = Math.max(0, Math.min(view.innerWidth - box.width, x))
  const top = Math.max(0, Math.min(view.innerHeight - box.height, y))
  // A viewport clamp must not push the capsule back out over the sidebar
  // when the block itself fits on screen.
  if (box.width <= rect.width && rect.left >= 0 && rect.right <= view.innerWidth) {
    left = Math.min(Math.max(left, rect.left), rect.right - box.width)
  }
  capsule.style.left = `${left}px`
  capsule.style.top = `${top}px`
  return { left, top, right: left + box.width, bottom: top + box.height }
}

/** Sample points across the would-be capsule box for page controls under it. */
function capsuleAreaOccupied(doc: Document, cx: number, cy: number, box: { width: number; height: number }, capsule: HTMLElement): boolean {
  const view = doc.defaultView!
  const clampX = (x: number) => Math.max(1, Math.min(view.innerWidth - 1, x))
  const clampY = (y: number) => Math.max(1, Math.min(view.innerHeight - 1, y))
  // dense enough that a common 30px icon button cannot fall between probes
  // the button in a code block's top-right corner falls between two sample points
  const step = 24
  const nx = Math.max(2, Math.ceil(box.width / step))
  const ny = Math.max(2, Math.ceil(box.height / step))
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const probe = doc.elementFromPoint(clampX(cx + (box.width * ix) / nx), clampY(cy + (box.height * iy) / ny))
      if (probe instanceof Element && probe !== capsule && !capsule.contains(probe) && isPageControl(probe)) return true
    }
  }
  return false
}

function isPageControl(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (['a', 'button', 'input', 'select', 'summary'].includes(tag)) return true
  return el.getAttribute('role') === 'button' || el.closest('a,button,summary,[role="button"]') !== null
}
