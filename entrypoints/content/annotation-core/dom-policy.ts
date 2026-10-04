const HIGHLIGHT_MARKER_ATTR = 'data-highlight-id'

const HIDDEN_SELECTOR = ['[hidden]', '[aria-hidden="true"]', '.sr-only', '.visually-hidden', '[class*="sr-only"]'].join(',')

/** Controls whose text is a label, not content: a highlight must not wrap it. */
const INTERACTIVE_SKIP_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[contenteditable="true"]',
].join(',')

const COMMON_SKIP_SELECTOR = [
  HIDDEN_SELECTOR,
  'script',
  'style',
  'textarea',
  'input',
  'select',
  'svg',
  'canvas',
  'video',
  'audio',
  'iframe',
  'noscript',
  'math',
  'ann-selection',
  `[${HIGHLIGHT_MARKER_ATTR}]`,
].join(',')

export function isWithinAnnotationMarker(node: Node | null): boolean {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return Boolean(element?.closest(`[${HIGHLIGHT_MARKER_ATTR}]`))
}

/** Whether a highlight may not be placed inside this element (extension UI, markers, controls, editable text). */
export function shouldSkipElement(el: Element): boolean {
  if (el.closest(COMMON_SKIP_SELECTOR)) return true
  if (el.closest(INTERACTIVE_SKIP_SELECTOR)) return true
  return el instanceof HTMLElement && el.isContentEditable === true
}

export function isAnnotatableTextNode(node: Node): boolean {
  const el = node.parentElement
  return Boolean(el) && !shouldSkipElement(el as Element) && Boolean(node.textContent?.trim())
}
