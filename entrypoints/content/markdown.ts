/**
 * Selection / element → Markdown conversion — the one implementation shared
 * by selection clips and block clips (docs/v2/capture.md §3.1).
 *
 * Keeps heading levels, paragraphs and line breaks, ordered and unordered
 * lists, quotes, inline and fenced code (with language), tables, emphasis
 * and links (resolved absolute http(s); other protocols keep their text).
 * Images keep alt text and address, never bytes. Page chrome (buttons,
 * toolbars, share bars, related lists, comment entries, ads), form
 * controls, hidden content and the extension's own UI are dropped before
 * conversion. The result never contains raw HTML; a failed conversion
 * degrades to plain text at the caller.
 */
import { CONTENT_MAX_CHARS } from '../../learning-core/validate'

export interface MarkdownResult {
  markdown: string
  truncated: boolean
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

const PAGE_CHROME_PATTERN =
  /(share|sharing|like|retweet|repost|comment|reply|related|recommend|newsletter|subscribe|signup|sign-up|promo|sponsor|advert|ads?\b|paywall|membership|toolbar|social|breadcrumb|pagination)/i

export function isPageChrome(el: Element): boolean {
  if (el.closest?.(PAGE_CHROME_SELECTOR)) return true
  const id = el.getAttribute('id') ?? ''
  const cls = el.getAttribute('class') ?? ''
  return PAGE_CHROME_PATTERN.test(`${id} ${cls}`)
}

function isVisible(el: Element, win: Window): boolean {
  if (el.hasAttribute('hidden')) return false
  const style = win.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  return true
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
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ')
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
    case 'code':
      return text.trim() ? `\`${text.trim()}\`` : ''
    case 'a': {
      const label = text.trim()
      if (!label) return ''
      const href = absoluteHttp(el.getAttribute('href'), ctx.baseUrl)
      return href ? `[${label}](${href})` : label
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
  return src ? `![${alt}](${src})` : alt
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
      out.addBlock(inlineChildren(el, ctx).replace(/\s*\n\s*/g, ' '))
      return
    case 'pre': {
      const code = el.querySelector('code')
      const language = /language-([\w-]+)/.exec(code?.className ?? el.className ?? '')?.[1] ?? ''
      const text = (code ?? el).textContent ?? ''
      out.addBlock(`\`\`\`${language}\n${text.replace(/\n$/, '')}\n\`\`\``)
      return
    }
    case 'blockquote': {
      ctx.quoteDepth++
      const inner = new Emitter()
      emitChildren(el, { ...ctx }, inner)
      const body = inner.finish().markdown || (el.textContent ?? '').trim()
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
      const items = Array.from(el.children).filter(child => child.tagName.toLowerCase() === 'li')
      const lines: string[] = []
      items.forEach((li, index) => {
        // nested lists ride along inside the li's inline text
        const marker = tag === 'ol' ? `${index + 1}.` : '-'
        const nested = new Emitter()
        for (const child of Array.from(li.children)) {
          const childTag = child.tagName.toLowerCase()
          if (childTag === 'ul' || childTag === 'ol') emitElement(child, { ...ctx, listDepth: ctx.listDepth + 1 }, nested)
        }
        const text = inlineChildren(li, ctx)
          .replace(/\s*\n\s*/g, ' ')
          .trim()
        const indent = '  '.repeat(ctx.listDepth)
        lines.push(`${indent}${marker} ${text}`.trimEnd())
        const nestedText = nested.finish().markdown
        if (nestedText) lines.push(nestedText)
      })
      out.addBlock(lines.join('\n'))
      return
    }
    case 'table': {
      const rows = Array.from(el.querySelectorAll('tr'))
      if (rows.length === 0) return
      const cellsOf = (tr: Element) => Array.from(tr.children).map(cell => inlineChildren(cell, ctx).replace(/\|/g, '\\|').trim() || ' ')
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
      if (caption?.textContent?.trim()) parts.push(`*${caption.textContent.trim()}*`)
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

function inlineChildren(el: Element, ctx: Ctx): string {
  return Array.from(el.childNodes)
    .map(node => inlineText(node, ctx))
    .join('')
}

const BLOCK_TAGS = new Set(['p', 'pre', 'blockquote', 'ul', 'ol', 'table', 'figure', 'hr', 'img', 'div', 'section', 'article', 'main', 'dl'])

function isBlockLevel(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  return Boolean(HEADINGS[tag]) || BLOCK_TAGS.has(tag)
}

function emitChildren(el: Element, ctx: Ctx, out: Emitter): void {
  // inline siblings accumulate into one paragraph; a block child flushes it
  let buffer = ''
  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    if (text) out.addBlock(text)
    buffer = ''
  }
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      buffer += (child.textContent ?? '').replace(/\s+/g, ' ')
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

// ── Public API ──────────────────────────────────────────────────────────

/** Converts an element (a block clip target) to Markdown. */
export function elementToMarkdown(root: Element): MarkdownResult {
  const ctx: Ctx = { doc: root.ownerDocument!, win: root.ownerDocument!.defaultView!, baseUrl: root.ownerDocument!.baseURI, listDepth: 0, quoteDepth: 0 }
  const out = new Emitter()
  emitElement(root, ctx, out)
  const result = out.finish()
  if (!result.markdown.trim()) {
    // conversion failed → plain text, still saved (capture.md §7)
    return { markdown: (root.textContent ?? '').trim().slice(0, CONTENT_MAX_CHARS), truncated: (root.textContent ?? '').length > CONTENT_MAX_CHARS }
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
