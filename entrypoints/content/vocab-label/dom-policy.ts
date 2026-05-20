const MARKER_ATTR = 'data-ann-vocab'

const HIDDEN_SELECTOR = [
  '[hidden]',
  '[aria-hidden="true"]',
  '.sr-only',
  '.visually-hidden',
  '[class*="sr-only"]',
].join(',')

const INTERACTIVE_TEXT_SELECTOR = [
  'a[href]',
  'button',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[contenteditable="true"]',
].join(',')

const STRICT_INTERACTIVE_TEXT_SELECTOR = [
  'a[href]',
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[contenteditable="true"]',
].join(',')

const SKIP_SELECTOR = [
  HIDDEN_SELECTOR,
  'script',
  'style',
  'textarea',
  'input',
  'select',
  'code',
  'pre',
  'svg',
  'canvas',
  'video',
  'audio',
  'iframe',
  'noscript',
  'math',
  'kbd',
  'samp',
  'var',
  'ann-selection',
  `[${MARKER_ATTR}]`,
  '[translate="no"]',
  '.notranslate',
].join(',')

const X_TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]'

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'SECTION',
  'TABLE',
  'TFOOT',
  'UL',
])

const INLINE_TAGS = new Set([
  'ABBR',
  'ACRONYM',
  'B',
  'BDO',
  'BDI',
  'BIG',
  'BR',
  'CITE',
  'DEL',
  'EM',
  'FONT',
  'I',
  'INS',
  'MARK',
  'Q',
  'RUBY',
  'S',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'TIME',
  'U',
])

const SHORT_UI_LABELS = new Set([
  'like',
  'dislike',
  'repost',
  'quote',
  'comment',
  'commit',
  'reply',
  'share',
  'bookmark',
  'follow',
  'following',
  'subscribe',
  'more',
  'view',
  'views',
])

const SKIP_TEXT_PATTERNS = [
  /^(?:(?:https?|ftp|file):\/\/|www\.)[^\s]+$/i,
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  /^(?:[a-zA-Z]:\\|\/|\\)(?:[\w\-. ]+[\\/])*[\w\-. ]*\.?[\w\-. ]*$/,
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  /^v?\d+(?:\.\d+){1,3}$/i,
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
  /^({{[^}]+}}|\${[^}]+}|__\w+__|%\w+)$/,
  /^(?:\.|#)[\w-]+$|^#(?:[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  /^@[\w.-]+$/,
  /^&\w+;$/,
  /^\[\d+\]$/,
  /^\d{1,2}:\d{2}(?::\d{2})?$/,
  /^[^\s\\/:]+?\.[a-zA-Z0-9]{2,5}$/,
]

let displayCache = new WeakMap<Element, boolean>()

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function isShortUiLabel(text: string): boolean {
  const normalized = normalizeInlineText(text).toLowerCase()
  if (!normalized || normalized.length > 24) return false
  return SHORT_UI_LABELS.has(normalized)
}

export function isSkippableText(text: string): boolean {
  const normalized = normalizeInlineText(text)
  if (!normalized) return true
  if (normalized.length === 1 && !/[a-zA-Z]/.test(normalized)) return true
  if (!Number.isNaN(Number(normalized)) && Number.isFinite(Number(normalized))) return true
  return SKIP_TEXT_PATTERNS.some(pattern => pattern.test(normalized))
}

export function isVocabMarkerElement(node: Node | null): node is Element {
  return node instanceof Element && node.hasAttribute(MARKER_ATTR)
}

export function isWithinVocabMarker(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement ?? null
  return Boolean(element?.closest(`[${MARKER_ATTR}]`))
}

export function shouldSkipElement(el: Element): boolean {
  if (el.closest(SKIP_SELECTOR)) return true
  if (el.closest(STRICT_INTERACTIVE_TEXT_SELECTOR)) return true

  const interactive = el.closest(INTERACTIVE_TEXT_SELECTOR)
  if (interactive) {
    const isXQuotedTweetText = Boolean(
      el.closest(X_TWEET_TEXT_SELECTOR) &&
      interactive.getAttribute('role') === 'link' &&
      !el.closest('a[href]'),
    )
    if (!isXQuotedTweetText) return true
  }

  if (el instanceof HTMLElement && el.isContentEditable) return true
  return false
}

export function shouldSkipTextNode(node: Node, contentRoot?: Element, restrictToFeedArticles = false): boolean {
  if (!node.parentElement) return true

  const el = node.parentElement

  if (contentRoot && !contentRoot.contains(el)) return true
  if (restrictToFeedArticles && !el.closest('article, [role="article"]')) return true
  if (shouldSkipElement(el)) return true
  if (isShortUiLabel(node.textContent || '')) return true
  if (isSkippableText(node.textContent || '')) return true

  return false
}

export function hasDirectTextNode(el: Element | DocumentFragment): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && /\S/.test(child.textContent || '')) {
      return true
    }
  }
  return false
}

export function isBlockLikeElement(el: Element): boolean {
  const tagName = el.tagName.toUpperCase()
  if (INLINE_TAGS.has(tagName)) return false
  if (BLOCK_TAGS.has(tagName)) return true

  const cached = displayCache.get(el)
  if (typeof cached === 'boolean') return cached

  let isBlock = false
  try {
    isBlock = !window.getComputedStyle(el).display.startsWith('inline')
  } catch {
    isBlock = false
  }

  displayCache.set(el, isBlock)
  return isBlock
}

export function findNearestRescanContainer(startNode: Node, contentRoot: Element): Element | null {
  const startElement = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode instanceof Element ? startNode : null
  if (!startElement || !contentRoot.contains(startElement) || shouldSkipElement(startElement)) return null

  let current: Element | null = startElement
  while (current && current !== contentRoot && current !== document.body) {
    if (shouldSkipElement(current)) return null
    if (isBlockLikeElement(current) && hasDirectTextNode(current)) {
      return current
    }
    current = current.parentElement
  }

  return contentRoot.contains(startElement) ? contentRoot : null
}

export function clearDomPolicyCaches(): void {
  displayCache = new WeakMap<Element, boolean>()
}
