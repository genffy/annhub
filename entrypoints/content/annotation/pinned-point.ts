/**
 * Whether a stroke starting at a point is pinned to the window (annotate.md §1.2): the element under
 * the pointer — or an ancestor — is fixed, or a sticky bar currently stuck to the top. Pinned ink
 * keeps viewport coordinates and stays out of a scrolling capture. Moved verbatim from layer.ts.
 */
export function isPinnedPoint(doc: Document, clientX: number, clientY: number): boolean {
  const view = doc.defaultView!
  const stack = doc.elementsFromPoint(clientX, clientY)
  const target = stack.find(element => !element.closest('[data-ann-ui]'))
  if (!target) return false
  for (let node: Element | null = target; node && node !== doc.body; node = node.parentElement) {
    const style = view.getComputedStyle(node)
    if (style.position === 'fixed') return true
    if (style.position === 'sticky' && node.getBoundingClientRect().top <= 1) return true
  }
  return false
}
