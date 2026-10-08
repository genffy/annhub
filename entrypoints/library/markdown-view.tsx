/**
 * Safe Markdown rendering for the library (capture.md §3.1: rendering never
 * parses raw HTML; links are http(s) only and open in a new tab with
 * rel=noopener noreferrer; images show their alt text and an "open
 * original" link, never loading the network).
 */
import type { ReactNode } from 'react'

interface Props {
  markdown: string
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|!\[[^\]]*\]\([^)\s]+\)|==[^=]+==)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('==')) nodes.push(<mark key={key}>{token.slice(2, -2)}</mark>)
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('![')) {
      const alt = /!\[([^\]]*)\]/.exec(token)?.[1] ?? ''
      nodes.push(
        <span key={key} className="md-image-placeholder">
          [{alt}]{' '}
          <a href={safeHref(/!\[[^\]]*\]\(([^)\s]+)\)/.exec(token)?.[1])} target="_blank" rel="noopener noreferrer">
            ⧉
          </a>
        </span>,
      )
    } else if (token.startsWith('[')) {
      const label = /\[([^\]]+)\]/.exec(token)?.[1] ?? ''
      const href = safeHref(/\]\(([^)\s]+)\)/.exec(token)?.[1])
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      )
    } else if (token.startsWith('*')) nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export function MarkdownView({ markdown }: Props) {
  const lines = markdown.split('\n')
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let quote: string[] = []
  let code: { language: string; lines: string[] } | null = null
  let index = 0

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(<p key={`p-${index++}`}>{inline(paragraph.join(' '), `p${index}`)}</p>)
      paragraph = []
    }
  }
  const flushList = () => {
    if (list && list.items.length > 0) {
      const items = list.items.map((item, i) => <li key={`li-${index}-${i}`}>{inline(item, `li${index}${i}`)}</li>)
      blocks.push(list.ordered ? <ol key={`ol-${index++}`}>{items}</ol> : <ul key={`ul-${index++}`}>{items}</ul>)
    }
    list = null
  }
  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push(<blockquote key={`q-${index++}`}>{inline(quote.join(' '), `q${index}`)}</blockquote>)
      quote = []
    }
  }
  const flushCode = () => {
    if (code && code.lines.length > 0) {
      blocks.push(
        <pre key={`pre-${index++}`} data-language={code.language}>
          <code>{code.lines.join('\n')}</code>
        </pre>,
      )
    }
    code = null
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
    flushCode()
  }

  for (const raw of lines) {
    if (code) {
      if (/^\s*(```|~~~)/.test(raw)) flushCode()
      else code.lines.push(raw)
      continue
    }
    if (/^\s*(```|~~~)/.test(raw)) {
      flushAll()
      code = { language: /^(```|~~~)(\w*)/.exec(raw.trim())?.[2] ?? '', lines: [] }
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw)
    if (heading) {
      flushAll()
      const level = heading[1]!.length
      const Tag = `h${Math.min(level + 1, 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      blocks.push(<Tag key={`h-${index++}`}>{inline(heading[2]!, `h${index}`)}</Tag>)
      continue
    }
    if (/^\s*>\s?/.test(raw)) {
      flushParagraph()
      flushList()
      quote.push(raw.replace(/^\s*>\s?/, ''))
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(raw)
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(raw)
    if (bullet || ordered) {
      flushParagraph()
      flushQuote()
      const item = (bullet ?? ordered)![1]!
      if (!list || list.ordered !== Boolean(ordered)) {
        flushList()
        list = { ordered: Boolean(ordered), items: [] }
      }
      list.items.push(item)
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      // GFM table rows render as a simple monospace block in R1
      flushAll()
      paragraph.push(raw)
      continue
    }
    if (raw.trim() === '') {
      flushAll()
      continue
    }
    flushList()
    flushQuote()
    paragraph.push(raw.trim())
  }
  flushAll()
  return <div className="md-view">{blocks}</div>
}
