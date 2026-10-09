import { createElement } from 'react'
import type { ReactNode } from 'react'
import { ImageIcon } from 'lucide-react'
import type { Highlight } from './types'
import { Ic } from './parts'

// A tiny Markdown renderer for the product windows (docs/design/v2/js/md.js). Every run of text carries `data-s`, its
// offset in the Markdown source, because a highlight is a range in the source (entry.md §4) and a browser selection
// has to be converted back to one. Raw HTML is never parsed.

interface Block {
  k: 'h' | 'ol' | 'ul' | 'code' | 'q' | 'p'
  lv?: number
  s?: number
  e?: number
  items?: { s: number; e: number }[]
  lines?: { s: number; e: number }[]
}

type Inline =
  | { k: 'text'; s: number; e: number }
  | { k: 'b'; s: number; e: number }
  | { k: 'code'; s: number; e: number }
  | { k: 'a'; s: number; e: number; url: string }
  | { k: 'img'; alt: string; url: string }

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  let fence: Block | null = null
  let at = 0
  for (const t of src.split('\n')) {
    const lineAt = at
    at += t.length + 1
    if (fence) {
      if (/^```\s*$/.test(t)) fence = null
      else fence.lines!.push({ s: lineAt, e: lineAt + t.length })
      continue
    }
    if (/^```(\S*)\s*$/.test(t)) {
      fence = { k: 'code', lines: [] }
      blocks.push(fence)
      cur = null
      continue
    }
    if (!t.trim()) {
      cur = null
      continue
    }
    let m: RegExpExecArray | null
    if ((m = /^(#{1,4})\s+/.exec(t))) {
      blocks.push({ k: 'h', lv: m[1]!.length, s: lineAt + m[0].length, e: lineAt + t.length })
      cur = null
    } else if ((m = /^\d+\.\s+/.exec(t))) {
      if (!cur || cur.k !== 'ol') blocks.push((cur = { k: 'ol', items: [] }))
      cur.items!.push({ s: lineAt + m[0].length, e: lineAt + t.length })
    } else if ((m = /^[-*]\s+/.exec(t))) {
      if (!cur || cur.k !== 'ul') blocks.push((cur = { k: 'ul', items: [] }))
      cur.items!.push({ s: lineAt + m[0].length, e: lineAt + t.length })
    } else if ((m = /^>\s?/.exec(t))) {
      if (!cur || cur.k !== 'q') blocks.push((cur = { k: 'q', lines: [] }))
      cur.lines!.push({ s: lineAt + m[0].length, e: lineAt + t.length })
    } else {
      if (!cur || cur.k !== 'p') blocks.push((cur = { k: 'p', lines: [] }))
      cur.lines!.push({ s: lineAt, e: lineAt + t.length })
    }
  }
  return blocks
}

function parseInline(src: string, from: number, to: number): Inline[] {
  const out: Inline[] = []
  const seg = src.slice(from, to)
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g
  let p = from
  let m: RegExpExecArray | null
  while ((m = re.exec(seg))) {
    const ms = from + m.index
    if (ms > p) out.push({ k: 'text', s: p, e: ms })
    if (m[1] !== undefined) out.push({ k: 'img', alt: m[1], url: m[2]! })
    else if (m[3] !== undefined) out.push({ k: 'a', url: m[4]!, s: ms + 1, e: ms + 1 + m[3].length })
    else if (m[5] !== undefined) out.push({ k: 'code', s: ms + 1, e: ms + 1 + m[5].length })
    else out.push({ k: 'b', s: ms + 2, e: ms + 2 + m[6]!.length })
    p = ms + m[0].length
  }
  if (p < to) out.push({ k: 'text', s: p, e: to })
  return out
}

export interface MarkdownLabels {
  /** "Image" fallback alt text */
  image: string
  imageUnsaved: string
  openOriginal: string
  /** Screen-reader name of a highlight, given its colour name. */
  highlight: (colorName: string) => string
}

export interface MarkdownProps {
  source: string
  highlights?: Highlight[]
  /** Highlight drawn with the brand outline. */
  activeId?: string
  /** A browser selection, drawn statically in a picture. */
  selection?: { start: number; end: number } | null
  /** Drawn anchored above the selection (the colour toolbar of the reading view). Must be phrasing content. */
  selectionOverlay?: ReactNode
  labels: MarkdownLabels
  colorNames?: Record<string, string>
  /** Makes highlights focusable and clickable (only in client components). */
  onHighlight?: (id: string) => void
  className?: string
}

export function Markdown({ source, highlights = [], activeId, selection, selectionOverlay, labels, colorNames = {}, onHighlight, className = '' }: MarkdownProps) {
  const marks = highlights.filter(h => h.end > h.start).sort((a, b) => a.start - b.start)
  const sel = selection && selection.end > selection.start ? selection : null

  // [s, e) cut at every highlight and selection boundary; each cut piece decides for itself what it sits in.
  const pieces = (s: number, e: number, keyBase: string): ReactNode[] => {
    const cuts = new Set([s, e])
    for (const h of [...marks.map(m => ({ s: m.start, e: m.end })), ...(sel ? [{ s: sel.start, e: sel.end }] : [])]) {
      if (h.s > s && h.s < e) cuts.add(h.s)
      if (h.e > s && h.e < e) cuts.add(h.e)
    }
    const pts = [...cuts].sort((a, b) => a - b)
    const out: ReactNode[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const h = marks.find(m => m.start <= a && m.end >= b)
      let seg: ReactNode = (
        <span key={`${keyBase}-${i}`} data-s={a}>
          {source.slice(a, b)}
        </span>
      )
      if (sel && sel.start <= a && sel.end >= b) {
        // the overlay hangs on the piece that starts where the selection starts, so it is attached exactly once
        const overlay = selectionOverlay && a === sel.start ? <span className="ah-over ah-over-above">{selectionOverlay}</span> : null
        seg = (
          <span key={`${keyBase}-s${i}`} className={`ah-selm${overlay ? ' ah-anchor' : ''}`}>
            {seg}
            {overlay}
          </span>
        )
      }
      if (h) {
        out.push(
          <mark
            key={`${keyBase}-m${i}`}
            className={`ah-hlm ah-c-${h.color}${activeId === h.id ? ' is-on' : ''}`}
            data-hid={h.id}
            aria-label={labels.highlight(colorNames[h.color] ?? h.color)}
            {...(onHighlight
              ? {
                  tabIndex: 0,
                  role: 'button',
                  onClick: () => onHighlight(h.id),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onHighlight(h.id)
                    }
                  },
                }
              : {})}
          >
            {seg}
          </mark>,
        )
        if (b === h.end && h.note) out.push(<i key={`${keyBase}-n${i}`} className="ah-hln" aria-hidden="true" />)
      } else {
        out.push(seg)
      }
    }
    return out
  }

  const inline = (s: number, e: number, keyBase: string): ReactNode[] =>
    parseInline(source, s, e).map((t, i) => {
      const key = `${keyBase}-i${i}`
      if (t.k === 'text') return <span key={key}>{pieces(t.s, t.e, key)}</span>
      if (t.k === 'b') return <b key={key}>{pieces(t.s, t.e, key)}</b>
      if (t.k === 'code') return <code key={key}>{pieces(t.s, t.e, key)}</code>
      if (t.k === 'a') {
        return (
          <a key={key} href={t.url} target="_blank" rel="noopener noreferrer">
            {pieces(t.s, t.e, key)}
          </a>
        )
      }
      return (
        <span key={key} className="inline-flex items-center gap-1.5 rounded-[7px] border border-dashed border-line-2 px-2 text-[0.85em] text-fg-3">
          <Ic icon={ImageIcon} size={13} />
          {t.alt || labels.image}
          <small className="text-fg-4">{labels.imageUnsaved}</small>
        </span>
      )
    })

  return (
    <div className={`ah-md ${className}`}>
      {parseBlocks(source).map((b, bi) => {
        const key = `b${bi}`
        // A clip's own headings stay below the headings of the window that shows it (which sit under the page's h2).
        if (b.k === 'h') return createElement(`h${Math.min(6, Math.max(2, b.lv!) + 2)}`, { key }, inline(b.s!, b.e!, key))
        if (b.k === 'ol' || b.k === 'ul') {
          return createElement(
            b.k,
            { key },
            b.items!.map((it, ii) => <li key={ii}>{inline(it.s, it.e, `${key}-${ii}`)}</li>),
          )
        }
        if (b.k === 'code') {
          return (
            <pre key={key}>
              <code>
                {b.lines!.map((l, li) => (
                  <span key={li}>
                    {pieces(l.s, l.e, `${key}-${li}`)}
                    {'\n'}
                  </span>
                ))}
              </code>
            </pre>
          )
        }
        if (b.k === 'q') {
          return <blockquote key={key}>{b.lines!.map((l, li) => inline(l.s, l.e, `${key}-${li}`))}</blockquote>
        }
        return (
          <p key={key}>
            {b.lines!.map((l, li) => (
              <span key={li}>{inline(l.s, l.e, `${key}-${li}`)} </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

/** Source range of the first occurrence of `quote`, for drawing a static selection. */
export function rangeOf(source: string, quote: string): { start: number; end: number } {
  const start = source.indexOf(quote)
  if (start < 0) throw new Error(`Quote not found in source: ${quote}`)
  return { start, end: start + quote.length }
}

/** Markdown without its syntax: the one-line summary a list row shows (docs/v2/search.md §1). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/^```\S*\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
}
