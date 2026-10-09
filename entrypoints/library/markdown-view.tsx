/**
 * Safe Markdown rendering with source offsets — the one shared module that
 * maps a rendered selection back to offsets in the clip's `content`
 * (entry.md §4.1, risk RK-13: the conversion lives here and nowhere else).
 *
 * Rendering never parses raw HTML; links are http(s) only and open in a new
 * tab with rel=noopener noreferrer; images show their alt text and an open
 * link, never loading the network (capture.md §3.1). Every emitted text run
 * carries its source start (`data-s`), so a DOM selection converts to a
 * [start, end) range in the source, and stored highlights render back into
 * marks at exactly those offsets.
 */
import type { ReactNode } from 'react'
import type { Highlight } from '../../learning-core/types'

export interface SourceRange {
  start: number
  end: number
}

// ── Inline tokenizer: source text → (text, source span) runs ────────────

interface Run {
  text: string
  srcStart: number
  /** Extra rendering semantics for the run. */
  kind?: 'em' | 'strong' | 'code' | 'link' | 'image' | 'mark'
  href?: string
  alt?: string
}

const INLINE = /(?<!\uE000)(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|==[^=\n]+==|\[[^\]\n]+\]\([^)\s]+\)|!\[[^\]\n]*\]\([^)\s]+\))/g

/**
 * Escaped characters (`\*`, `\#`, …) are literals, not syntax (capture.md
 * §3.1): mark them with a same-length placeholder before tokenizing so the
 * patterns above cannot open on a protected marker (lookbehind), and the
 * offsets never notice, then restore.
 */
const ESCAPED_CHAR = /\\(.)/g

/** Tokenizes one inline span of source into runs carrying source offsets. */
export function inlineRuns(source: string, srcStart: number): Run[] {
  const protectedSource = source.replace(ESCAPED_CHAR, '\uE000$1')
  const runs: Run[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((match = INLINE.exec(protectedSource)) !== null) {
    if (match.index > cursor) runs.push({ text: restore(protectedSource.slice(cursor, match.index)), srcStart: srcStart + cursor })
    const token = match[0]
    const at = srcStart + match.index
    if (token.startsWith('**')) runs.push({ text: restore(token.slice(2, -2)), srcStart: at + 2, kind: 'strong' })
    else if (token.startsWith('==')) runs.push({ text: restore(token.slice(2, -2)), srcStart: at + 2, kind: 'mark' })
    else if (token.startsWith('`')) runs.push({ text: token.slice(1, -1), srcStart: at + 1, kind: 'code' })
    else if (token.startsWith('![')) {
      const alt = /!\[([^\]]*)\]/.exec(token)?.[1] ?? ''
      const href = /!\[[^\]]*\]\(([^)\s]+)\)/.exec(token)?.[1]
      runs.push({ text: restore(alt), srcStart: at + 2, kind: 'image', href, alt })
    } else if (token.startsWith('[')) {
      const label = /\[([^\]]+)\]/.exec(token)?.[1] ?? ''
      const href = /\]\(([^)\s]+)\)/.exec(token)?.[1]
      runs.push({ text: restore(label), srcStart: at + 1, kind: 'link', href })
    } else if (token.startsWith('*')) runs.push({ text: restore(token.slice(1, -1)), srcStart: at + 1, kind: 'em' })
    cursor = match.index + token.length
  }
  if (cursor < protectedSource.length) runs.push({ text: restore(protectedSource.slice(cursor)), srcStart: srcStart + cursor })
  return runs.filter(run => run.text.length > 0)
}

function restore(text: string): string {
  return text.replace(/\uE000(.?)/g, '$1')
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

// ── Blocks: line-wise, each with its source span ─────────────────────────

interface Block {
  key: string
  kind: 'p' | 'h' | 'code' | 'quote' | 'ul' | 'ol' | 'table' | 'hr'
  level?: number
  language?: string
  lines: Array<{ source: string; srcStart: number; indent: number }>
  srcStart: number
  srcEnd: number
}

const HEAD = /^(#{1,6})\s+(.*)$/

/** Parses source into offset-carrying blocks (pure; fixtures test this). */
export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.split('\n')
  let offset = 0
  let index = 0
  let paragraph: Block | null = null
  let list: Block | null = null

  const push = (block: Block | null) => {
    if (block) blocks.push(block)
  }
  const flush = () => {
    push(paragraph)
    push(list)
    paragraph = null
    list = null
  }

  while (index < lines.length) {
    const raw = lines[index]!
    const lineStart = offset
    const lineEnd = lineStart + raw.length
    offset = lineEnd + 1
    index += 1
    const trimmed = raw.trim()

    if (trimmed === '') {
      flush()
      continue
    }
    if (/^\s*(```|~~~)/.test(raw)) {
      flush()
      const language = /^(```|~~~)(\w*)/.exec(trimmed)?.[2] ?? ''
      const codeLines: Block['lines'] = []
      while (index < lines.length && !/^\s*(```|~~~)/.test(lines[index]!)) {
        const inner = lines[index]!
        codeLines.push({ source: inner, srcStart: offset, indent: 0 })
        offset += inner.length + 1
        index += 1
      }
      if (index < lines.length) {
        offset += lines[index]!.length + 1
        index += 1
      }
      push({ key: `b${blocks.length}`, kind: 'code', language, lines: codeLines, srcStart: lineStart, srcEnd: offset })
      continue
    }
    const heading = HEAD.exec(trimmed)
    if (heading) {
      flush()
      const content = heading[2]!
      push({
        key: `b${blocks.length}`,
        kind: 'h',
        level: heading[1]!.length,
        lines: [{ source: content, srcStart: lineStart + raw.indexOf(content), indent: 0 }],
        srcStart: lineStart,
        srcEnd: lineEnd,
      })
      continue
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) {
      flush()
      push({ key: `b${blocks.length}`, kind: 'hr', lines: [], srcStart: lineStart, srcEnd: lineEnd })
      continue
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(raw)
    const ordered = /^(\s*)\d+[.)]\s+(.*)$/.exec(raw)
    if (bullet || ordered) {
      push(paragraph)
      paragraph = null
      const content = (bullet ?? ordered)![2]!
      if (!list) list = { key: `b${blocks.length}`, kind: ordered ? 'ol' : 'ul', lines: [], srcStart: lineStart, srcEnd: lineEnd }
      list.lines.push({ source: content, srcStart: lineStart + raw.indexOf(content), indent: 0 })
      list.srcEnd = lineEnd
      continue
    }
    if (/^\s*>/.test(raw)) {
      flush()
      const content = raw.replace(/^\s*>\s?/, '')
      const quote: Block =
        blocks[blocks.length - 1]?.kind === 'quote' ? (blocks.pop() as Block) : { key: `b${blocks.length}`, kind: 'quote', lines: [], srcStart: lineStart, srcEnd: lineEnd }
      quote.lines.push({ source: content, srcStart: lineStart + (raw.length - content.length), indent: 0 })
      quote.srcEnd = lineEnd
      push(quote)
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      flush()
      const table: Block =
        blocks[blocks.length - 1]?.kind === 'table' ? (blocks.pop() as Block) : { key: `b${blocks.length}`, kind: 'table', lines: [], srcStart: lineStart, srcEnd: lineEnd }
      table.lines.push({ source: raw, srcStart: lineStart, indent: 0 })
      table.srcEnd = lineEnd
      push(table)
      continue
    }
    push(list)
    list = null
    if (!paragraph) paragraph = { key: `b${blocks.length}`, kind: 'p', lines: [], srcStart: lineStart, srcEnd: lineEnd }
    paragraph.lines.push({ source: trimmed, srcStart: lineStart + (raw.length - raw.trimStart().length), indent: 0 })
    paragraph.srcEnd = lineEnd
  }
  flush()
  return blocks
}

// ── Highlight overlay: split runs against stored ranges ──────────────────

interface Piece extends Run {
  highlight?: Highlight
}

function applyHighlights(runs: Run[], highlights: Highlight[]): Piece[] {
  if (highlights.length === 0) return runs
  const sorted = [...highlights].sort((a, b) => a.start - b.start)
  const pieces: Piece[] = []
  for (const run of runs) {
    const runStart = run.srcStart
    const runEnd = runStart + run.text.length
    let cursor = runStart
    for (const highlight of sorted) {
      if (highlight.end <= cursor || highlight.start >= runEnd) continue
      const from = Math.max(cursor, highlight.start)
      const to = Math.min(runEnd, highlight.end)
      if (from > cursor) pieces.push({ ...run, text: run.text.slice(cursor - runStart, from - runStart) })
      pieces.push({ ...run, text: run.text.slice(from - runStart, to - runStart), srcStart: from, highlight })
      cursor = to
    }
    if (cursor < runEnd) pieces.push({ ...run, text: run.text.slice(cursor - runStart), srcStart: cursor })
  }
  return pieces
}

// ── React rendering ──────────────────────────────────────────────────────

function renderRun(piece: Piece, keyPrefix: string, onHighlightClick?: (highlight: Highlight, event: React.MouseEvent) => void): ReactNode {
  const { highlight } = piece
  if (piece.kind === 'image') {
    return (
      <span key={keyPrefix} className="md-image-placeholder" data-s={piece.srcStart}>
        [{piece.alt}]
        {piece.href && (
          <a href={safeHref(piece.href)} target="_blank" rel="noopener noreferrer">
            ⧉
          </a>
        )}
      </span>
    )
  }
  const inner = (
    <span
      key={keyPrefix}
      data-s={piece.srcStart}
      data-hl-src={highlight ? highlight.start : undefined}
      data-hl-id={highlight ? highlight.id : undefined}
      className={highlight ? `md-hl md-hl-${highlight.color}` : undefined}
    >
      {piece.text}
      {highlight?.note && <sup className="md-hl-note">✎</sup>}
    </span>
  )
  if (highlight && onHighlightClick) {
    return (
      <span
        key={keyPrefix}
        role="button"
        tabIndex={0}
        className="md-hl-hit"
        onClick={event => onHighlightClick(highlight, event)}
        onKeyDown={event => {
          if (event.key === 'Enter') onHighlightClick(highlight, event as unknown as React.MouseEvent)
        }}
      >
        {inner}
      </span>
    )
  }
  if (piece.kind === 'link') {
    const href = safeHref(piece.href)
    return href ? (
      <a key={keyPrefix} href={href} target="_blank" rel="noopener noreferrer" data-s={piece.srcStart}>
        {piece.text}
      </a>
    ) : (
      <span key={keyPrefix} data-s={piece.srcStart}>
        {piece.text}
      </span>
    )
  }
  if (piece.kind === 'code') {
    return (
      <code key={keyPrefix} data-s={piece.srcStart}>
        {piece.text}
      </code>
    )
  }
  if (piece.kind === 'strong' || piece.kind === 'em' || piece.kind === 'mark') {
    const Tag = piece.kind === 'strong' ? 'strong' : piece.kind === 'em' ? 'em' : 'mark'
    return <Tag key={keyPrefix}>{inner}</Tag>
  }
  return inner
}

export interface MarkdownViewProps {
  markdown: string
  highlights?: Highlight[]
  onHighlightClick?: (highlight: Highlight, event: React.MouseEvent) => void
  /** DOM class of the reading surface, used by selection conversion. */
  surfaceClass?: string
}

export function MarkdownView({ markdown, highlights = [], onHighlightClick, surfaceClass = 'md-view' }: MarkdownViewProps) {
  const nodes: ReactNode[] = []
  for (const block of parseBlocks(markdown)) {
    const runLines = (lines: Block['lines'], keyPrefix: string): ReactNode[] =>
      lines.map((line, i) => applyHighlights(inlineRuns(line.source, line.srcStart), highlights).map((piece, j) => renderRun(piece, `${keyPrefix}-${i}-${j}`, onHighlightClick)))
    switch (block.kind) {
      case 'h': {
        const Tag = `h${Math.min((block.level ?? 1) + 1, 6)}` as 'h1'
        nodes.push(<Tag key={block.key}>{runLines(block.lines, block.key)}</Tag>)
        break
      }
      case 'code':
        nodes.push(
          <pre key={block.key} data-language={block.language}>
            <code data-s={block.lines[0]?.srcStart ?? block.srcStart}>{block.lines.map(line => line.source).join('\n')}</code>
          </pre>,
        )
        break
      case 'quote':
        nodes.push(<blockquote key={block.key}>{runLines(block.lines, block.key)}</blockquote>)
        break
      case 'ul':
      case 'ol': {
        const items = block.lines.map((line, i) => <li key={`${block.key}-${i}`}>{runLines([line], `${block.key}-${i}`)}</li>)
        nodes.push(block.kind === 'ol' ? <ol key={block.key}>{items}</ol> : <ul key={block.key}>{items}</ul>)
        break
      }
      case 'table': {
        const rows = block.lines.filter(line => !/^\s*\|[\s:|-]+\|\s*$/.test(line.source))
        nodes.push(
          <pre key={block.key} className="md-table">
            <code data-s={rows[0]?.srcStart ?? block.srcStart}>{rows.map(row => row.source).join('\n')}</code>
          </pre>,
        )
        break
      }
      case 'hr':
        nodes.push(<hr key={block.key} />)
        break
      default:
        nodes.push(<p key={block.key}>{runLines(block.lines, block.key)}</p>)
    }
  }
  return <div className={surfaceClass}>{nodes}</div>
}

// ── Selection ↔ source conversion (the shared module, RK-13) ─────────────

/** The [start, end) source range of a DOM selection inside the rendered view. */
export function sourceRangeFromSelection(root: HTMLElement, selection: Selection): SourceRange | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null

  const start = offsetInSource(range.startContainer, range.startOffset, root)
  const end = offsetInSource(range.endContainer, range.endOffset, root)
  if (start === null || end === null || end <= start) return null
  return { start, end }
}

/** The rendered text of a source range, as the highlight's quote (entry.md §4.2). */
export function quoteForRange(markdown: string, range: SourceRange): string {
  return markdown.slice(range.start, range.end).replace(/\n+/g, ' ').trim()
}

function offsetInSource(node: Node, offset: number, root: HTMLElement): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const span = (node as Text).parentElement
    const base = span?.dataset.s
    if (base !== undefined && root.contains(span)) return Number(base) + offset
    return null
  }
  // element container: resolve to the first text run inside it at this offset
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let textNode: Text | null = walker.nextNode() as Text | null
  let passed = 0
  while (textNode) {
    const length = textNode.textContent?.length ?? 0
    if (passed + length >= offset) {
      const base = textNode.parentElement?.dataset.s
      if (base !== undefined) return Number(base) + Math.max(0, offset - passed)
      return null
    }
    passed += length
    textNode = walker.nextNode() as Text | null
  }
  return null
}
