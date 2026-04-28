export function isWithinViewportWindowByRect(rect: Pick<DOMRect, 'top' | 'bottom'>, viewportHeight: number, expansionRatio = 0.5): boolean {
  const topBound = -viewportHeight * expansionRatio
  const bottomBound = viewportHeight * (1 + expansionRatio)
  return rect.bottom >= topBound && rect.top <= bottomBound
}

export function isElementWithinViewportWindow(el: Element, expansionRatio = 0.5): boolean {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  if (viewportHeight <= 0) return true
  return isWithinViewportWindowByRect(el.getBoundingClientRect(), viewportHeight, expansionRatio)
}
