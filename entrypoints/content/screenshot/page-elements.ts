/**
 * `elementsFromPoint` for the page under a live session: the confirm shield
 * (`ann-shot-modal`) would answer as the top element everywhere, so it is
 * lifted for the call and put back afterwards — never left down (issue #108).
 */

/** Page elements under a viewport point, through the session's confirm shield. */
export function pageElementsFromPoint(doc: Document, host: HTMLElement, x: number, y: number): Element[] {
  if (typeof doc.elementsFromPoint !== 'function') return []
  const shielded = host.classList.contains('ann-shot-modal')
  if (shielded) host.style.pointerEvents = 'none'
  try {
    return doc.elementsFromPoint(x, y)
  } finally {
    if (shielded) host.style.pointerEvents = 'auto'
  }
}
