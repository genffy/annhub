/** A pointer position in an element's own coordinates (RV-CAP-18, moved with the editor stage). */
export function localPoint(el: HTMLElement, e: PointerEvent): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
