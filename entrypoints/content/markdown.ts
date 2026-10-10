/**
 * Selection / element → Markdown conversion — the one implementation shared
 * by selection clips and block clips (docs/v2/capture.md §3.1).
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
import { CONTENT_MAX_CHARS } from '../../learning-core/validate'

export interface MarkdownResult {
  markdown: string
  truncated: boolean
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
  'aside',
  'iframe',
  'noscript',
  'template',
  '[role="button"]',
  '[role="toolbar"]',
  '[role="navigation"]',
  '[role="complementary"]',
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

export function isPageChrome(el: Element): boolean {
  if (el.closest?.(PAGE_CHROME_SELECTOR)) return true
  const tag = el.tagName.toLowerCase()
  if (CHROME_EXEMPT_TAGS.has(tag)) return false
  const words = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`.split(/[\s_-]+/)
  return words.some(word => CHROME_WORDS.has(word.toLowerCase()))
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

// ── Emitter ─────────────────────────────────────────────────────────────

class Emitter {
  private blocks: string[] = []
  private current = ''
  private length = 0
  truncated = false

  /** Blocks whose text starts after the budget are cut at the boundary. */
  addBlock(text: string): void {
    const block = text.trim()
    if (!block) return
    if (this.length + block.length + 2 > CONTENT_MAX_CHARS) {
      const remaining = CONTENT_MAX_CHARS - this.length
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
  doc: Document
  win: Window
  baseUrl: string
  listDepth: number
  quoteDepth: number
}

function inlineText(node: Node, ctx: Ctx): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText((node.textContent ?? '').replace(/\s+/g, ' '))
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (!isVisible(el, ctx.win) || isPageChrome(el)) return ''
  const tag = el.tagName.toLowerCase()
  const text = Array.from(el.childNodes)
    .map(child => inlineText(child, ctx))
    .join('')
  switch (tag) {
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
  const src = absoluteHttp(el.getAttribute('src') ?? el.getAttribute('data-src'), ctx.baseUrl)
  return src ? `![${alt}](${encodeDestination(src)})` : escapeText(alt)
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

const BLOCK_TAGS = new Set(['p', 'pre', 'blockquote', 'ul', 'ol', 'table', 'figure', 'hr', 'img', 'div', 'section', 'article', 'main', 'dl'])

function isBlockLevel(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  return Boolean(HEADINGS[tag]) || BLOCK_TAGS.has(tag)
}

/** Emits the block-level Markdown of `root` (its own tag included). */
function emitElement(el: Element, ctx: Ctx, out: Emitter): void {
  if (!isVisible(el, ctx.win) || isPageChrome(el)) return
  const tag = el.tagName.toLowerCase()

  if (HEADINGS[tag]) {
    const level = Math.min(HEADINGS[tag]!, 6)
    out.addBlock(`${'#'.repeat(level)} ${inlineChildren(el, ctx).trim()}`)
    return
  }
  switch (tag) {
    case 'p':
      // a <br> is a hard line break and survives as exactly two spaces + \n
      out.addBlock(inlineChildren(el, ctx).replace(/[ \t]*\n[ \t]*/g, '  \n'))
      return
    case 'pre': {
      const code = el.querySelector('code')
      const language = /language-([\w-]+)/.exec(code?.className ?? el.className ?? '')?.[1] ?? ''
      const text = (code ?? el).textContent ?? ''
      // the fence must be longer than any backtick run inside the code
      const fence = '`'.repeat(Math.max(3, (text.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0) + 1))
      out.addBlock(`${fence}${language}\n${text.replace(/\n$/, '')}\n${fence}`)
      return
    }
    case 'blockquote': {
      ctx.quoteDepth++
      const inner = new Emitter()
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
      const rows = Array.from(el.querySelectorAll('tr'))
      if (rows.length === 0) return
      const cellsOf = (tr: Element) =>
        Array.from(tr.children).map(
          cell =>
            // a cell must stay one line: hard breaks collapse to spaces
            inlineChildren(cell, ctx)
              .replace(/\s*\n\s*/g, ' ')
              .replace(/\|/g, '\\|')
              .trim() || ' ',
        )
      const header = cellsOf(rows[0]!)
      const body = rows.slice(1).map(cellsOf)
      const width = Math.max(header.length, ...body.map(row => row.length))
      const pad = (row: string[]) => [...row, ...new Array(width - row.length).fill(' ')]
      out.addBlock([`| ${pad(header).join(' | ')} |`, `| ${new Array(width).fill('---').join(' | ')} |`, ...body.map(row => `| ${pad(row).join(' | ')} |`)].join('\n'))
      return
    }
    case 'figure': {
      const img = el.querySelector('img')
      const caption = el.querySelector('figcaption')
      const parts: string[] = []
      if (img) parts.push(imageLine(img, ctx))
      if (caption?.textContent?.trim()) parts.push(`*${escapeText(caption.textContent.trim())}*`)
      if (parts.length > 0) out.addBlock(parts.join('\n\n'))
      return
    }
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
  const items = Array.from(el.children).filter(child => child.tagName.toLowerCase() === 'li')
  items.forEach((li, index) => {
    const marker = ordered ? `${index + 1}.` : '-'

    const ownParts: string[] = []
    const nestedLists: Element[] = []
    const blockChildren: Element[] = []
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        ownParts.push(escapeText((child.textContent ?? '').replace(/\s+/g, ' ')))
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const childEl = child as Element
      const childTag = childEl.tagName.toLowerCase()
      if (childTag === 'ul' || childTag === 'ol') nestedLists.push(childEl)
      else if (isBlockLevel(childEl)) blockChildren.push(childEl)
      else ownParts.push(inlineText(childEl, ctx))
    }
    const ownText = ownParts
      .join('')
      .replace(/[ \t]*\n[ \t]*/g, '  \n')
      .trim()
    lines.push(`${prefix}${marker} ${ownText}`.trimEnd())

    const nestedCtx = { ...ctx, listDepth: ctx.listDepth + 1 }
    for (const nested of nestedLists) emitList(nested, nestedCtx, lines)
    for (const block of blockChildren) {
      const blockOut = new Emitter()
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

function emitChildren(el: Element, ctx: Ctx, out: Emitter, slice?: MarkdownSlice): void {
  const children = slice ? sliceChildren(el, slice) : Array.from(el.childNodes)
  // inline siblings accumulate into one paragraph; a block child flushes it
  let buffer = ''
  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    if (text) out.addBlock(text)
    buffer = ''
  }
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      buffer += escapeText((child.textContent ?? '').replace(/\s+/g, ' '))
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
export function elementToMarkdown(root: Element, slice?: MarkdownSlice): MarkdownResult {
  const ctx: Ctx = { doc: root.ownerDocument!, win: root.ownerDocument!.defaultView!, baseUrl: root.ownerDocument!.baseURI, listDepth: 0, quoteDepth: 0 }
  const out = new Emitter()
  if (slice) emitChildren(root, ctx, out, slice)
  else emitElement(root, ctx, out)
  const result = out.finish()
  if (!result.markdown.trim()) {
    // conversion failed → plain text, still saved (capture.md §7)
    const text = slice
      ? sliceChildren(root, slice)
          .map(el => el.textContent ?? '')
          .join(' ')
      : (root.textContent ?? '')
    return { markdown: text.trim().slice(0, CONTENT_MAX_CHARS), truncated: text.length > CONTENT_MAX_CHARS }
  }
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
  const out = new Emitter()
  emitChildren(host, ctx, out)
  const result = out.finish()
  if (!result.markdown.trim()) {
    const text = range.toString()
    return { markdown: text.trim().slice(0, CONTENT_MAX_CHARS), truncated: text.length > CONTENT_MAX_CHARS }
  }
  return result
}
