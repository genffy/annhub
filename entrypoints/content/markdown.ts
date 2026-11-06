/**
 * Selection / element → Markdown conversion — the one implementation shared
 * by selection clips and block clips (docs/product/capture.md §3.1).
 *
 * Keeps heading levels, paragraphs and line breaks, ordered and unordered
 * lists (nested to the parent's content column), quotes, inline and fenced
 * code (with language), tables, emphasis and links (resolved absolute
 * http(s); other protocols keep their text). Images keep alt text and
 * address, never bytes. Page chrome (buttons, toolbars, share bars, related
 * lists, comment entries, ads), form controls, hidden content and the
 * extension's own UI are dropped before conversion — chrome is decided by
 * whole class/id words, never substrings, and semantic containers (article,
 * main, pre, table, figure…) are exempt from class heuristics. Text that
 * would otherwise read as Markdown is escaped (`\*`, `\#` …); the renderer
 * and the plain-text conversion unescape those sequences. The result never
 * contains raw HTML; a failed conversion degrades to plain text at the
 * caller.
 */
import { collectFootnotes, formulaMarkdown, scriptText, type Footnotes } from './markdown-special'
import { tableMarkdown } from './markdown-table'
import { codeLanguage, preText } from './markdown-code'
import { extractXContent, type PlatformContent } from './platform-x'
import { CONTENT_MAX_CHARS } from '../../core/validate'
import { resolveAudioSource, resolveImageSource, resolveVideoPoster, resolveVideoSource } from './media-source'

export interface MarkdownResult {
  markdown: string
  truncated: boolean
  platform?: Pick<PlatformContent, 'meta' | 'sourceUrl'>
}

/** A sibling run of a container: `from` (inclusive) to `to` (exclusive). */
export interface MarkdownSlice {
  from: Element
  to: Element | null
}

const PAGE_CHROME_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  'form',
  'svg',
  'canvas',
  'audio',
  'video',
  'nav',
  'aside:not([role="note"]):not(.admonition):not(.callout)',
  'iframe',
  'noscript',
  'template',
  '[role="button"]',
  '[role="toolbar"]',
  '[role="navigation"]',
  '[role="complementary"]',
  // Wiki protection badges and sister-site promotions are page UI, not article figures.
  '.mw-indicator',
  '.sistersitebox',
  '[aria-hidden="true"]',
  '[data-ann-ui]',
].join(',')

/**
 * Chrome is matched on whole class/id words (split on whitespace, `-` and
 * `_`), so `thread`, `lazyload`, `broadcast` and friends never lose their
 * content — only exact words like `share`, `ads`, `pagination` do.
 */
const CHROME_WORDS = new Set([
  'share',
  'shares',
  'sharing',
  'like',
  'likes',
  'retweet',
  'repost',
  'comment',
  'comments',
  'reply',
  'replies',
  'related',
  'recommend',
  'newsletter',
  'subscribe',
  'signup',
  'promo',
  'sponsor',
  'sponsored',
  'advert',
  'advertisement',
  'adverts',
  'ad',
  'ads',
  'paywall',
  'membership',
  'toolbar',
  'social',
  'breadcrumb',
  'breadcrumbs',
  'pagination',
])

/** Semantic containers carry content; their own id/class is not chrome evidence. */
const CHROME_EXEMPT_TAGS = new Set(['article', 'main', 'section', 'pre', 'table', 'figure', 'blockquote'])

export function isPageChrome(el: Element, download = false, expanded?: Set<Element>, tagsOnly = false): boolean {
  const selector = expanded?.size ? PAGE_CHROME_SELECTOR.replace('[aria-hidden="true"],', '') : PAGE_CHROME_SELECTOR
  if (el.closest?.(selector)) return true
  const hidden = el.closest('[aria-hidden="true"]')
  if (hidden && !expanded?.has(hidden)) return true
  if (tagsOnly) return false
  const tag = el.tagName.toLowerCase()
  if (CHROME_EXEMPT_TAGS.has(tag)) return false
  const words = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`.split(/[\s_-]+/)
  return words.some(word => CHROME_WORDS.has(word.toLowerCase()) && !(download && /^(comments?|repl(?:y|ies))$/i.test(word)))
}

function isVisible(el: Element, win: Window): boolean {
  if (el.hasAttribute('hidden')) return false
  const style = win.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  return true
}

// ── Text escaping ───────────────────────────────────────────────────────

const ALWAYS_ESCAPED = /[*`<>[\]]/g
const LINE_START_MARKER = /(^|\n)(#{1,6} |- |\+ |>\s?|\d+[.)] )/g
// underscores escape at word boundaries only (CommonMark intraword `_` is
// literal), so `user_id` stays readable while `__init__` survives verbatim
const UNDERSCORE_CLOSER = /(\w)_(?![\w_])/g

/**
 * Escapes text-node content so literal characters cannot read as Markdown
 * (capture.md §3.1): inline `*` backtick `[` `]` `<`, line-start
 * heading/list/quote markers, and boundary underscores. Word-internal `_`
 * needs nothing — CommonMark does not treat it as emphasis there.
 */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/==/g, '=\\=')
    .replace(ALWAYS_ESCAPED, '\\$&')
    .replace(/(^|[^\w])(_+)/g, (_match, pre: string, run: string) => `${pre}${run.replace(/_/g, '\\_')}`)
    .replace(UNDERSCORE_CLOSER, '$1\\_')
    .replace(LINE_START_MARKER, (_match, pre: string, marker: string) => `${pre}${/^\d/.test(marker) ? marker.replace(/[.)]/, '\\$&') : `\\${marker}`}`)
}

/** Encodes the characters that would break the `[label](url)` form. */
function encodeDestination(href: string): string {
  return href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20')
}

// ── Page furniture that survives class-based detection ───────────────────
//
// Edit links, view counts, video durations, Medium's sign-in and subscribe
// boxes: none of them carry chrome classes, so whole blocks and link labels
// that are nothing but these phrases are dropped by text (页面界面残留).

const UI_BLOCK_PATTERNS: RegExp[] = [
  /^\[?edit\]?$/i,
  /^edit this page$/i,
  /^was this helpful\??$/i,
  /^view quotes$/i,
  /^\d[\d.,]*\s*[kmb]?\s*views$/i,
  /^\d+:\d{2}(?::\d{2})?$/,
  // Medium's byline: the reading time alone, or glued to the date it sits next to
  // ("3 min readDec 12, 2018") or to a separator dot ("4 min read·Apr 6").
  /^\d+\s*min\s*read($|(?=\S))/i,
  /^remember me for faster sign in$/i,
  /^(sign in|sign up|log in|create account|get started)$/i,
  /^get .{0,80} stories in your inbox$/i,
  /^written by$/i,
  /^share this article$/i,
]

function isUiCruft(block: string): boolean {
  const text = block
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#{1,6}\s+/, '') // a heading that says nothing but the phrase is still furniture
  return UI_BLOCK_PATTERNS.some(pattern => pattern.test(text))
}

const UI_LINK_PATTERNS: RegExp[] = [
  /^\[?edit\]?$/i,
  /^edit this page$/i,
  /^was this helpful\??$/i,
  /^view quotes$/i,
  /^share$/i,
  /^copy link$/i,
  /^\d[\d.,]*\s*[kmb]( views)?$/i,
  /^\d[\d.,]*\s*views$/i,
  /^\d+\s*min\s*read/i,
]

function isUiLinkLabel(label: string): boolean {
  return UI_LINK_PATTERNS.some(pattern => pattern.test(label))
}

// ── Emitter ─────────────────────────────────────────────────────────────

class Emitter {
  private blocks: string[] = []
  private current = ''
  private length = 0
  truncated = false

  constructor(private readonly maxChars = CONTENT_MAX_CHARS) {}

  /** Blocks whose text starts after the budget are cut at the boundary. */
  addBlock(text: string): void {
    if (this.truncated) return
    const block = text.trim()
    if (!block) return
    if (isUiCruft(block)) return
    if (this.length + block.length + 2 > this.maxChars) {
      const remaining = this.maxChars - this.length - (this.current ? 2 : 0)
      if (remaining > 0) {
        const slice = block.slice(0, remaining)
        const boundary = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf('。'))
        this.current = this.current ? `${this.current}\n\n${boundary > 0 ? slice.slice(0, boundary + 1) : slice}` : boundary > 0 ? slice.slice(0, boundary + 1) : slice
        this.length = this.current.length
      }
      this.truncated = true
      return
    }
    this.current = this.current ? `${this.current}\n\n${block}` : block
    this.length = this.current.length
  }

  finish(): MarkdownResult {
    if (this.current) this.blocks.push(this.current)
    return { markdown: this.blocks.join('\n\n'), truncated: this.truncated }
  }
}

// ── Node walking ────────────────────────────────────────────────────────

const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }

interface Ctx {
  tagsOnly?: boolean
  download?: boolean
  footnotes?: Footnotes
  expanded?: Set<Element>
  doc: Document
  win: Window
  baseUrl: string
  listDepth: number
  quoteDepth: number
}

/** Only panels explicitly controlled by a collapsed disclosure are expanded for downloads. */
export function expandedPanels(doc: Document): Set<Element> {
  const panels = new Set<Element>()
  for (const control of doc.querySelectorAll('[aria-expanded="false"][aria-controls]')) {
    for (const id of (control.getAttribute('aria-controls') ?? '').split(/\s+/)) {
      const panel = doc.getElementById(id)
      if (panel && panel.getAttribute('role') !== 'tabpanel') panels.add(panel)
    }
  }
  return panels
}

function visibleFor(el: Element, ctx: Ctx): boolean {
  if (ctx.download && ctx.expanded?.has(el)) return true
  const details = el.parentElement?.closest('details:not([open])')
  if (!ctx.download && details && !details.querySelector(':scope > summary')?.contains(el)) return false
  return isVisible(el, ctx.win)
}

function escaped(text: string, ctx: Ctx): string {
  const value = escapeText(text)
  return ctx.download ? value.replace(/[$~]/g, '\\$&') : value
}

function inlineText(node: Node, ctx: Ctx): string {
  if (node.nodeType === Node.TEXT_NODE) return escaped((node.textContent ?? '').replace(/\s+/g, ' '), ctx)
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (el.matches('video, audio, iframe') && visibleFor(el, ctx) && (!el.parentElement || !isPageChrome(el.parentElement, ctx.download, ctx.expanded, ctx.tagsOnly)))
    return mediaLine(el, ctx) ?? ''
  if (!visibleFor(el, ctx) || isPageChrome(el, ctx.download, ctx.expanded, ctx.tagsOnly)) return ''
  if (ctx.footnotes?.definitions.includes(el)) return ''
  if (ctx.download && el.matches('a[role="doc-backlink"], a.footnote-backref')) return ''
  const reference = ctx.footnotes?.references.get(el)
  if (reference) return `[^${reference}]`
  const formula = formulaMarkdown(el, Boolean(ctx.download))
  if (formula !== undefined) return formula
  const tag = el.tagName.toLowerCase()
  const text = Array.from(el.childNodes)
    .map(child => inlineText(child, ctx))
    .join('')
  switch (tag) {
    case 'sup':
    case 'sub':
      return scriptText(text, tag)
    case 'del':
    case 's':
    case 'strike':
      return ctx.download && text.trim() ? `~~${text.trim()}~~` : text
    case 'strong':
    case 'b': {
      const t = text.trim()
      return t ? `**${t}**` : ''
    }
    case 'em':
    case 'i': {
      const t = text.trim()
      return t ? `*${t}*` : ''
    }
    case 'code': {
      // code-span content is literal: use the raw text, never escaped
      const t = (el.textContent ?? '').trim()
      if (!t) return ''
      // a run of backticks in the content needs a longer fence
      const ticks = '`'.repeat((t.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0) + 1)
      const padding = t.startsWith('`') || t.endsWith('`') ? ' ' : ''
      return `${ticks}${padding}${t}${padding}${ticks}`
    }
    case 'a': {
      const label = text.trim()
      if (!label) return ''
      if (isUiLinkLabel(label)) return ''
      const href = absoluteHttp(el.getAttribute('href'), ctx.baseUrl)
      return href ? `[${label}](${encodeDestination(href)})` : label
    }
    case 'img':
      return imageLine(el, ctx)
    case 'br':
      return '  \n'
    default:
      return text
  }
}

function imageLine(el: Element, ctx: Ctx): string {
  const alt = (el.getAttribute('alt') ?? '').trim()
  const src = resolveImageSource(el, ctx.baseUrl)
  return src ? `![${alt}](${encodeDestination(src)})` : escapeText(alt)
}

/**
 * The one line a media element contributes: a direct http(s) video or audio
 * address is written with the image syntax a Markdown folder download links
 * through (download.md §4.3, §5.2); a video without one keeps its poster as
 * the picture; an embedded player stays as a plain link to its address.
 */
function mediaLine(el: Element, ctx: Ctx): string | undefined {
  const tag = el.tagName.toLowerCase()
  const title = (el.getAttribute('title') ?? '').trim()
  if (tag === 'iframe') {
    const href = absoluteHttp(el.getAttribute('src'), ctx.baseUrl)
    const label = title || (href ? safeLinkLabel(href) : '')
    return href ? `[${label || href}](${encodeDestination(href)})` : undefined
  }
  if (tag === 'video' || tag === 'audio') {
    const direct = tag === 'video' ? resolveVideoSource(el, ctx.baseUrl) : resolveAudioSource(el, ctx.baseUrl)
    if (direct) return `![${title}](${encodeDestination(direct)})`
    if (tag === 'video') {
      const poster = resolveVideoPoster(el, ctx.baseUrl)
      if (poster) return `![${title}](${encodeDestination(poster)})`
    }
    return undefined
  }
  return undefined
}

/** A readable label for an embed the page did not title: its host, not a raw URL. */
function safeLinkLabel(href: string): string {
  try {
    return new URL(href).hostname
  } catch {
    return href
  }
}

function absoluteHttp(href: string | null | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined
  try {
    const url = new URL(href, baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.href
  } catch {
    return undefined
  }
}

// video, audio and iframe are block content here (download.md §5.2): each stands on its own line as a media link
const BLOCK_TAGS = new Set([
  'p',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'table',
  'figure',
  'hr',
  'img',
  'video',
  'audio',
  'iframe',
  'div',
  'section',
  'article',
  'main',
  'dl',
  'details',
  'summary',
  'figcaption',
])

function isBlockLevel(el: Element): boolean {
  if (el.matches('[role="note"], .admonition, .callout')) return true
  if (el.matches('.katex-display, .mwe-math-element-display, math[display="block"], mjx-container[display="true"], script[type*="mode=display"]')) return true
  const tag = el.tagName.toLowerCase()
  if (tag === 'span' && el.querySelector('p,pre,div,section,table,ul,ol,blockquote,h1,h2,h3,h4,h5,h6')) return true
  return Boolean(HEADINGS[tag]) || BLOCK_TAGS.has(tag)
}

/** Emits the block-level Markdown of `root` (its own tag included). */
function emitElement(el: Element, ctx: Ctx, out: Emitter): void {
  const tag = el.tagName.toLowerCase()
  const callout = ctx.download && el.matches('[role="note"], .admonition, .callout')
  if (ctx.footnotes?.definitions.includes(el)) return
  const formula = formulaMarkdown(el, Boolean(ctx.download))
  if (formula !== undefined) {
    if (!visibleFor(el, ctx) || isPageChrome(el, ctx.download, ctx.expanded, ctx.tagsOnly)) return
    out.addBlock(formula)
    return
  }
  // media embeds are content, not chrome (download.md §5.2): what has an address
  // becomes a line before the chrome rules drop it — only a chrome ancestor disqualifies it
  if (tag === 'video' || tag === 'audio' || tag === 'iframe') {
    if (!visibleFor(el, ctx) || (el.parentElement && isPageChrome(el.parentElement, ctx.download, ctx.expanded, ctx.tagsOnly))) return
    const line = mediaLine(el, ctx)
    if (line) out.addBlock(line)
    return
  }
  if (!visibleFor(el, ctx) || (!callout && isPageChrome(el, ctx.download, ctx.expanded, ctx.tagsOnly))) return

  if (HEADINGS[tag]) {
    const level = Math.min(HEADINGS[tag]!, 6)
    out.addBlock(`${'#'.repeat(level)} ${inlineChildren(el, ctx).trim()}`)
    return
  }
  switch (callout ? 'blockquote' : tag) {
    case 'p':
      // a <br> is a hard line break and survives as exactly two spaces + \n
      out.addBlock(inlineChildren(el, ctx).replace(/[ \t]*\n[ \t]*/g, '  \n'))
      return
    case 'pre': {
      const code = el.querySelector('code')
      const language = codeLanguage(el)
      const text = preText(code ?? el)
      // the fence must be longer than any backtick run inside the code
      const fence = '`'.repeat(Math.max(3, (text.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0) + 1))
      out.addBlock(`${fence}${language}\n${text.replace(/\n$/, '')}\n${fence}`)
      return
    }
    case 'blockquote': {
      ctx.quoteDepth++
      const inner = new Emitter(ctx.download ? Infinity : CONTENT_MAX_CHARS)
      emitChildren(el, { ...ctx }, inner)
      const body = inner.finish().markdown || escapeText((el.textContent ?? '').trim())
      ctx.quoteDepth--
      out.addBlock(
        body
          .split('\n')
          .map(line => `> ${line}`)
          .join('\n'),
      )
      return
    }
    case 'ul':
    case 'ol': {
      const lines: string[] = []
      emitList(el, ctx, lines)
      out.addBlock(lines.join('\n'))
      return
    }
    case 'table': {
      const caption = el.querySelector(':scope > caption')
      if (caption) out.addBlock(inlineChildren(caption, ctx))
      out.addBlock(
        tableMarkdown(el, cell =>
          Array.from(cell.childNodes)
            .map(node => {
              const text = inlineText(node, ctx)
              return node instanceof Element && node.matches('p, div, li') ? `\n${text}\n` : text
            })
            .join('')
            .trim()
            .replace(/\s*\n+\s*/g, ctx.download ? ' / ' : ' '),
        ),
      )
      return
    }
    case 'figure':
      emitChildren(el, ctx, out)
      return
    case 'figcaption':
      out.addBlock(`*${inlineChildren(el, ctx).trim()}*`)
      return
    case 'dl':
      for (const child of el.children) {
        if (child.matches('dt')) out.addBlock(`**${inlineChildren(child, ctx).trim()}**`)
        else if (child.matches('dd')) emitChildren(child, ctx, out)
      }
      return
    case 'hr':
      out.addBlock('---')
      return
    case 'img':
      out.addBlock(imageLine(el, ctx))
      return
    default:
      emitChildren(el, ctx, out)
  }
}

/** Lists: nested lists indent to the parent item's content column; a nested list is never folded into the parent item's text. */
function emitList(el: Element, ctx: Ctx, lines: string[]): void {
  const ordered = el.tagName.toLowerCase() === 'ol'
  const indentUnit = ordered ? '   ' : '  '
  const prefix = indentUnit.repeat(ctx.listDepth)
  const items = Array.from(el.children).filter(child => child.tagName.toLowerCase() === 'li' && !ctx.footnotes?.definitions.includes(child))
  items.forEach((li, index) => {
    const start = Number(el.getAttribute('start')) || 1
    const marker = ordered ? `${start + index}.` : '-'

    const ownParts: string[] = []
    const checkbox = li.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (ctx.download && checkbox && checkbox.closest('li') === li) ownParts.push(checkbox.checked ? '[x] ' : '[ ] ')
    const nestedLists: Element[] = []
    const blockChildren: Element[] = []
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        ownParts.push(escaped((child.textContent ?? '').replace(/\s+/g, ' '), ctx))
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const childEl = child as Element
      const childTag = childEl.tagName.toLowerCase()
      if (childTag === 'ul' || childTag === 'ol') nestedLists.push(childEl)
      else if (isBlockLevel(childEl)) blockChildren.push(childEl)
      else ownParts.push(inlineText(childEl, ctx))
    }
    if (
      !ownParts
        .join('')
        .replace(/^\[[x ]\]\s*/, '')
        .trim() &&
      blockChildren[0]?.matches('p,div') &&
      !blockChildren[0].querySelector('p,pre,table,ul,ol,blockquote,h1,h2,h3,h4,h5,h6')
    )
      ownParts.push(inlineChildren(blockChildren.shift()!, ctx))
    const ownText = ownParts
      .join('')
      .replace(/[ \t]*\n[ \t]*/g, '  \n')
      .trim()
    lines.push(`${prefix}${marker} ${ownText}`.trimEnd())

    const nestedCtx = { ...ctx, listDepth: ctx.listDepth + 1 }
    for (const nested of nestedLists) emitList(nested, nestedCtx, lines)
    for (const block of blockChildren) {
      const blockOut = new Emitter(ctx.download ? Infinity : CONTENT_MAX_CHARS)
      emitElement(block, nestedCtx, blockOut)
      const text = blockOut.finish().markdown
      if (text) for (const line of text.split('\n')) lines.push(`${prefix}${indentUnit}${line}`)
    }
  })
}

function inlineChildren(el: Element, ctx: Ctx): string {
  return Array.from(el.childNodes)
    .map(node => inlineText(node, ctx))
    .join('')
}

/**
 * Walks into open shadow roots when a host carries no light-DOM children:
 * its rendered content lives in the shadow tree (MDN's code examples — 整篇
 * Markdown 丢掉全部代码). Hosts with light children keep
 * them; walking both would double-project slotted content.
 */
function expandShadowHosts(nodes: Node[]): Node[] {
  const result: Node[] = []
  for (const node of nodes) {
    if (node instanceof Element && node.shadowRoot && node.childNodes.length === 0) {
      result.push(...expandShadowHosts(Array.from(node.shadowRoot.childNodes)))
    } else {
      result.push(node)
    }
  }
  return result
}

function emitChildren(el: Element, ctx: Ctx, out: Emitter, slice?: MarkdownSlice): void {
  const children = expandShadowHosts(slice ? sliceChildren(el, slice) : Array.from(el.childNodes))
  // inline siblings accumulate into one paragraph; a block child flushes it
  let buffer = ''
  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    if (text) out.addBlock(text)
    buffer = ''
  }
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      buffer += escaped((child.textContent ?? '').replace(/\s+/g, ' '), ctx)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const childEl = child as HTMLElement
    if (isBlockLevel(childEl)) {
      flush()
      emitElement(childEl, ctx, out)
    } else {
      buffer += inlineText(childEl, ctx)
    }
  }
  flush()
}

/** Element children of `parent` from `slice.from` up to (exclusive) `slice.to`. */
function sliceChildren(parent: Element, slice: MarkdownSlice): Element[] {
  const children = Array.from(parent.children)
  const from = children.indexOf(slice.from)
  if (from < 0) return []
  if (!slice.to) return children.slice(from)
  const to = children.indexOf(slice.to)
  return to > from ? children.slice(from, to) : children.slice(from)
}

// ── Public API ──────────────────────────────────────────────────────────

/** Converts an element (a block clip target) to Markdown; `slice` clips it to a sibling run. */
export function elementToMarkdown(root: Element, slice?: MarkdownSlice, purpose: 'clip' | 'download' = 'clip'): MarkdownResult {
  const platform = slice ? undefined : extractXContent(root)
  if (platform) root = platform.element
  const ctx: Ctx = {
    download: purpose === 'download',
    footnotes: purpose === 'download' ? collectFootnotes(root) : undefined,
    expanded: purpose === 'download' ? expandedPanels(root.ownerDocument) : undefined,
    doc: root.ownerDocument!,
    win: root.ownerDocument!.defaultView ?? window,
    baseUrl: root.ownerDocument!.baseURI,
    listDepth: 0,
    quoteDepth: 0,
  }
  const out = new Emitter(ctx.download ? Infinity : CONTENT_MAX_CHARS)
  if (slice) emitChildren(root, ctx, out, slice)
  else emitElement(root, ctx, out)
  let result = out.finish()
  if (ctx.download && !result.markdown.trim()) {
    const retry = new Emitter(Infinity)
    const relaxed = { ...ctx, tagsOnly: true }
    if (slice) emitChildren(root, relaxed, retry, slice)
    else emitElement(root, relaxed, retry)
    result = retry.finish()
  }
  if (ctx.footnotes && result.markdown.trim()) {
    ctx.footnotes.definitions.forEach((definition, index) => {
      if (!result.markdown.includes(`[^${index + 1}]`)) return
      const body = new Emitter(Infinity)
      emitChildren(definition, { ...ctx, footnotes: undefined }, body)
      const text = body.finish().markdown
      result.markdown += `\n\n[^${index + 1}]: ${text.replace(/\n/g, '\n    ')}`
    })
  }
  if (!result.markdown.trim()) {
    // conversion failed → plain text, still saved (capture.md §7)
    const text = slice
      ? sliceChildren(root, slice)
          .map(el => el.textContent ?? '')
          .join(' ')
      : (root.textContent ?? '')
    return { markdown: text.trim().slice(0, ctx.download ? Infinity : CONTENT_MAX_CHARS), truncated: !ctx.download && text.length > CONTENT_MAX_CHARS }
  }
  if (platform) result.platform = { meta: platform.meta, sourceUrl: platform.sourceUrl }
  return result
}

/**
 * Converts a selection to Markdown: walks the range fragment so partial
 * paragraphs at the edges keep their inline formatting.
 */
export function selectionToMarkdown(range: Range): MarkdownResult {
  const doc = range.startContainer.ownerDocument ?? document
  const ctx: Ctx = { doc, win: doc.defaultView!, baseUrl: doc.baseURI, listDepth: 0, quoteDepth: 0 }
  const fragment = range.cloneContents()
  const host = doc.createElement('div')
  host.appendChild(fragment)
  const out = new Emitter(ctx.download ? Infinity : CONTENT_MAX_CHARS)
  emitChildren(host, ctx, out)
  const result = out.finish()
  if (!result.markdown.trim()) {
    const text = range.toString()
    return { markdown: text.trim().slice(0, ctx.download ? Infinity : CONTENT_MAX_CHARS), truncated: !ctx.download && text.length > CONTENT_MAX_CHARS }
  }
  return result
}
