import { plainText } from './markdown'
import type { Entry, Highlight, HighlightColor } from './types'

// The rules of a highlight (docs/v2/entry.md §4), as the interactive library demo applies them. A highlight is a range
// in the clip's Markdown source, so a browser selection is converted back to source offsets before it is stored.

export const HIGHLIGHT_LIMITS = { perClip: 200, quote: 2000, note: 1000 }

/** Converts a DOM selection inside a rendered clip to a [start, end) range of its Markdown source. */
export function selectionOffsets(range: Range, root: HTMLElement, source: string): { start: number; end: number } | null {
  const spans = [...root.querySelectorAll<HTMLElement>('[data-s]')].filter(span => range.intersectsNode(span))
  if (!spans.length) return null
  const first = spans[0]!
  const last = spans[spans.length - 1]!
  const at = (span: HTMLElement, node: Node, offset: number, fallbackEnd: boolean) => {
    const base = Number(span.dataset.s)
    if (span.contains(node)) {
      if (node.nodeType === Node.TEXT_NODE) return base + offset
      return base + (offset > 0 ? (span.textContent ?? '').length : 0)
    }
    return base + (fallbackEnd ? (span.textContent ?? '').length : 0)
  }
  let start = at(first, range.startContainer, range.startOffset, false)
  let end = at(last, range.endContainer, range.endOffset, true)
  while (start < end && /\s/.test(source[start]!)) start++
  while (end > start && /\s/.test(source[end - 1]!)) end--
  return end > start ? { start, end } : null
}

export type AddResult = { highlights: Highlight[]; added: Highlight } | { error: 'quote' | 'limit' | 'note' }

/**
 * Adds a highlight. A new range that overlaps existing ones is merged with them: the union range, the id and colour of
 * the earliest, and the notes joined by a blank line. Nothing is merged when the joined note would be too long.
 */
export function addHighlight(entry: Entry, start: number, end: number, color: HighlightColor, id: string): AddResult {
  const quote = plainText(entry.content.slice(start, end))
  if (quote.length > HIGHLIGHT_LIMITS.quote) return { error: 'quote' }
  const hit = entry.highlights.filter(h => h.start < end && h.end > start)
  if (!hit.length) {
    if (entry.highlights.length >= HIGHLIGHT_LIMITS.perClip) return { error: 'limit' }
    const added: Highlight = { id, start, end, quote, color }
    return { highlights: [...entry.highlights, added].sort((a, b) => a.start - b.start), added }
  }
  const [base, ...rest] = [...hit].sort((a, b) => a.start - b.start)
  const note = hit
    .map(h => h.note)
    .filter(Boolean)
    .join('\n\n')
  if (note.length > HIGHLIGHT_LIMITS.note) return { error: 'note' }
  const mergedStart = Math.min(start, ...hit.map(h => h.start))
  const mergedEnd = Math.max(end, ...hit.map(h => h.end))
  const added: Highlight = { ...base!, start: mergedStart, end: mergedEnd, quote: plainText(entry.content.slice(mergedStart, mergedEnd)), note: note || undefined }
  const dropped = new Set(rest.map(h => h.id))
  const highlights = entry.highlights.filter(h => h.id !== base!.id && !dropped.has(h.id))
  return { highlights: [...highlights, added].sort((a, b) => a.start - b.start), added }
}

export function recolor(entry: Entry, id: string, color: HighlightColor): Highlight[] {
  return entry.highlights.map(h => (h.id === id ? { ...h, color } : h))
}

export function removeHighlight(entry: Entry, id: string): Highlight[] {
  return entry.highlights.filter(h => h.id !== id)
}
