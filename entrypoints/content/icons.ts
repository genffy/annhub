/**
 * The lucide line icons the page overlays draw inline (visual.md §3), so their
 * colour can follow the overlay tokens instead of baking a stroke colour into
 * a data URI the way the selection menu's ::before icons must.
 */
const SVG_NS = 'http://www.w3.org/2000/svg'

const ICON_PATHS = {
  'bookmark': [['path', { d: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z' }]],
  'scan': [
    ['path', { d: 'M3 7V5a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M17 3h2a2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }],
    ['path', { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }],
    ['path', { d: 'M7 12h10' }],
  ],
  'undo': [
    ['path', { d: 'M9 14 4 9l5-5' }],
    ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11' }],
  ],
  'alert': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['line', { x1: '12', y1: '8', x2: '12', y2: '12' }],
    ['line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }],
  ],
  'x': [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  'arrow-up-right': [
    ['path', { d: 'M7 7h10v10' }],
    ['path', { d: 'M7 17 17 7' }],
  ],
  'chevron-up': [['path', { d: 'm18 15-6-6-6 6' }]],
  'download': [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '7 10 12 15 17 10' }],
    ['line', { x1: '12', y1: '15', x2: '12', y2: '3' }],
  ],
  'check': [['path', { d: 'M20 6 9 17l-5-5' }]],
  'ellipsis': [
    ['circle', { cx: '12', cy: '12', r: '1' }],
    ['circle', { cx: '19', cy: '12', r: '1' }],
    ['circle', { cx: '5', cy: '12', r: '1' }],
  ],
  // The screenshot toolbar's tool and action icons (RV-CAP-16): the same lucide outlines the
  // React component drew, as inline SVG so the overlay tokens keep colouring them.
  'circle': [['circle', { cx: '12', cy: '12', r: '10' }]],
  'clipboard-copy': [
    ['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }],
    ['path', { d: 'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2' }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v4' }],
    ['path', { d: 'M21 14H11' }],
    ['path', { d: 'm15 10-4 4 4 4' }],
  ],
  'grid-2x2': [
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M3 12h18' }],
    ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }],
  ],
  'highlighter': [
    ['path', { d: 'm9 11-6 6v3h9l3-3' }],
    ['path', { d: 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4' }],
  ],
  'list-ordered': [
    ['path', { d: 'M11 5h10' }],
    ['path', { d: 'M11 12h10' }],
    ['path', { d: 'M11 19h10' }],
    ['path', { d: 'M4 4h1v5' }],
    ['path', { d: 'M4 9h2' }],
    ['path', { d: 'M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02' }],
  ],
  'list-restart': [
    ['path', { d: 'M21 5H3' }],
    ['path', { d: 'M7 12H3' }],
    ['path', { d: 'M7 19H3' }],
    ['path', { d: 'M12 18a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L11 14' }],
  ],
  'palette': [
    ['path', { d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' }],
    ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
  ],
  'pencil': [
    ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
    ['path', { d: 'm15 5 4 4' }],
  ],
  'rectangle-horizontal': [['rect', { width: '20', height: '12', x: '2', y: '6', rx: '2' }]],
  'slash': [['path', { d: 'M22 2 2 22' }]],
  'type': [
    ['path', { d: 'M12 4v16' }],
    ['path', { d: 'M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2' }],
    ['path', { d: 'M9 20h6' }],
  ],
} as const

export type OverlayIconName = keyof typeof ICON_PATHS

/** `size` is the square edge in CSS pixels, the lucide `size` prop the toolbar used (RV-CAP-16). */
export function overlayIcon(doc: Document, name: OverlayIconName, size?: number): SVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  if (size !== undefined) {
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
  }
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const [tag, attrs] of ICON_PATHS[name]) {
    const part = doc.createElementNS(SVG_NS, tag)
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value)
    svg.appendChild(part)
  }
  return svg
}
