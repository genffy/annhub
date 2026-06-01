export interface MarkerConfig {
  tagName: 'mark' | 'span' | 'ruby'
  className?: string
  attributes?: Record<string, string>
  buildChildren?: (base: Element) => void
}

export function wrapRange(range: Range, markerConfig: MarkerConfig): HTMLElement | null {
  const marker = document.createElement(markerConfig.tagName)

  if (markerConfig.className) {
    marker.className = markerConfig.className
  }

  for (const [key, value] of Object.entries(markerConfig.attributes ?? {})) {
    marker.setAttribute(key, value)
  }

  try {
    range.surroundContents(marker)
  } catch {
    try {
      const fragment = range.extractContents()
      marker.appendChild(fragment)
      range.insertNode(marker)
    } catch {
      return null
    }
  }

  markerConfig.buildChildren?.(marker)
  return marker
}

export function unwrapMarker(el: Element): void {
  const parent = el.parentNode
  if (!parent) return

  if (el.tagName === 'RUBY') {
    const baseText = Array.from(el.childNodes)
      .filter(node => !(node instanceof HTMLElement && (node.tagName === 'RT' || node.tagName === 'RP')))
      .map(node => node.textContent ?? '')
      .join('')
    parent.insertBefore(document.createTextNode(baseText), el)
    parent.removeChild(el)
    return
  }

  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el)
  }
  parent.removeChild(el)
}

export function cleanupMarkers(selector: string, root: ParentNode = document): void {
  const markers = Array.from(root.querySelectorAll(selector))
  markers.forEach(marker => {
    unwrapMarker(marker)
  })
}
