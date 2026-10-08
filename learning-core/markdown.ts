/**
 * Markdown helpers shared by search and export — one implementation, never
 * duplicated per surface (docs/v2/search.md §1, storage.md §6).
 */

/**
 * The plain text of rendered Markdown: syntax markers dropped, link and
 * image syntax reduced to their visible text. Deterministic; used for
 * search fields and list summaries.
 */
export function markdownToPlainText(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let inFence = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    out.push(stripInlineMarkers(line))
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function stripInlineMarkers(line: string): string {
  return line
    // images keep their alt text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // links keep their label
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // headings, emphasis, inline code fences
    .replace(/^\s{0,3}#{1,6}\s+/g, '')
    .replace(/(\*\*\*|___|\*\*|__|\*|_|`)/g, '')
    // quote markers and list bullets stay as text separators
    .replace(/^\s{0,3}>\s?/g, '')
    .replace(/^\s*[-*+]\s+/g, '')
    .replace(/^\s*\d+[.)]\s+/g, '')
    .trimEnd()
}

// ── Block segmentation for highlight write-back (storage.md §6) ─────────

export interface BlockSegment {
  start: number
  end: number
}

/**
 * Offsets a `==…==` wrapper must not cross or land inside: block boundaries
 * (blank lines, headings, fences, list items, quotes, table rows) and the
 * leading marker of a line. A highlight spanning blocks is split per block;
 * markers themselves are never broken.
 */
export function blockSegments(markdown: string): BlockSegment[] {
  const segments: BlockSegment[] = []
  const lines = markdown.split('\n')
  let offset = 0
  let inFence = false
  let current: BlockSegment | null = null

  // closes the running segment at `end` — never past the line that ends it
  const flush = (end: number) => {
    if (current) {
      current.end = end
      segments.push(current)
      current = null
    }
  }

  for (const line of lines) {
    const lineStart = offset
    const lineEnd = offset + line.length
    offset = lineEnd + 1 // +1 for the consumed '\n'

    if (/^\s*(```|~~~)/.test(line)) {
      flush(lineStart)
      inFence = !inFence
      continue
    }
    if (inFence) {
      if (!current) current = { start: lineStart, end: lineEnd }
      else current.end = lineEnd
      continue
    }
    if (line.trim() === '') {
      flush(lineStart)
      continue
    }
    const startsBlock = /^\s{0,3}(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|\|)/.test(line)
    if (startsBlock) {
      flush(lineStart)
      current = { start: lineStart, end: lineEnd }
    } else if (current) {
      current.end = lineEnd
    } else {
      current = { start: lineStart, end: lineEnd }
    }
  }
  flush(markdown.length)
  return segments.filter(segment => segment.end > segment.start)
}

/** Leading marker length a wrap must skip so `==` never breaks syntax. */
function leadingMarkerLength(text: string): number {
  const match = /^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/.exec(text)
  return match ? match[0].length : 0
}

function trailingPunctuationLength(text: string): number {
  const match = /[\s]+([*_`]+)?$/.exec(text)
  return match ? match[0].length : 0
}

/**
 * Write highlights back into the Markdown source as `==…==`, split per
 * block so a highlight never crosses a paragraph or breaks a syntax token
 * (storage.md §6).
 */
export function writeHighlightMarks(markdown: string, highlights: { start: number; end: number }[]): string {
  const sorted = [...highlights].filter(h => h.end > h.start).sort((a, b) => a.start - b.start)
  if (sorted.length === 0) return markdown
  const segments = blockSegments(markdown)

  // ranges to wrap, adjusted away from markers, merged when adjacent
  const wraps: { start: number; end: number }[] = []
  for (const highlight of sorted) {
    for (const segment of segments) {
      const start = Math.max(highlight.start, segment.start)
      const end = Math.min(highlight.end, segment.end)
      if (start >= end) continue
      const segText = markdown.slice(segment.start, segment.end)
      const adjustedStart = start === segment.start ? segment.start + leadingMarkerLength(segText) : start
      const adjustedEnd = end === segment.end ? segment.end - trailingPunctuationLength(segText) : end
      if (adjustedStart >= adjustedEnd) continue
      const last = wraps[wraps.length - 1]
      if (last && adjustedStart <= last.end) last.end = Math.max(last.end, adjustedEnd)
      else wraps.push({ start: adjustedStart, end: adjustedEnd })
    }
  }

  let result = ''
  let cursor = 0
  for (const wrap of wraps) {
    if (wrap.start < cursor) continue // defensive: never double-wrap
    result += markdown.slice(cursor, wrap.start)
    result += `==${markdown.slice(wrap.start, wrap.end)}==`
    cursor = wrap.end
  }
  result += markdown.slice(cursor)
  return result
}
