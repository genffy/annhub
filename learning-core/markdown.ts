/**
 * Markdown helpers shared by search and export — one implementation, never
 * duplicated per surface (docs/v2/search.md §1, storage.md §6).
 */

// ── Code, shared by every reader of the Markdown the converter writes ──────
//
// The converter outruns the longest backtick run in a block (a fence) or in a span, so a fence is closed
// only by a fence as long as the one that opened it, and a code span only by a run of exactly its length.
// Search text, quotes, highlight write-back and the reading view all read the same text; each of them
// deciding this for itself is how they come to disagree.

export interface Fence {
  char: '`' | '~'
  length: number
}

/** A line that opens a fenced code block: three or more backticks or tildes (a backtick fence's info string has no backtick). */
export function openingFence(line: string): Fence | null {
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
  if (!match) return null
  const run = match[1]!
  if (run[0] === '`' && match[2]!.includes('`')) return null
  return { char: run[0] as Fence['char'], length: run.length }
}

/** Whether `line` ends `fence`: the same character, at least as many, and nothing else on the line. */
export function closesFence(line: string, fence: Fence): boolean {
  const match = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
  return Boolean(match && match[1]![0] === fence.char && match[1]!.length >= fence.length)
}

export interface CodeSpan {
  /** Index of the first delimiter, and one past the last. */
  start: number
  end: number
  /** The code itself, after CommonMark's one-space padding is dropped. */
  innerStart: number
  innerEnd: number
}

/** The inline code span that opens at `index`, if a run of the same number of backticks closes it on this line. */
export function codeSpanAt(line: string, index: number): CodeSpan | null {
  if (line[index] !== '`' || line[index - 1] === '`') return null
  let open = 1
  while (line[index + open] === '`') open++
  let cursor = index + open
  while (cursor < line.length) {
    if (line[cursor] !== '`') {
      cursor++
      continue
    }
    let run = 1
    while (line[cursor + run] === '`') run++
    if (run === open) {
      let innerStart = index + open
      let innerEnd = cursor
      const inner = line.slice(innerStart, innerEnd)
      if (inner.length > 1 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim()) {
        innerStart++
        innerEnd--
      }
      return { start: index, end: cursor + run, innerStart, innerEnd }
    }
    cursor += run
  }
  return null
}

/**
 * The plain text of rendered Markdown: syntax markers dropped, link and
 * image syntax reduced to their visible text. Deterministic; used for
 * search fields and list summaries.
 */
export function markdownToPlainText(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let fence: Fence | null = null
  for (const line of lines) {
    if (fence) {
      if (closesFence(line, fence)) fence = null
      else out.push(line)
      continue
    }
    const opened = openingFence(line)
    if (opened) {
      fence = opened
      continue
    }
    const cells = tableCells(line)
    if (cells === 'separator') continue
    out.push(stripInlineMarkers(cells ? cells.join(' ') : line))
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * A table row as its cells (`| a | b |` → a, b), the alignment row as 'separator', anything else as null.
 * Cells are cut at unescaped pipes only; the converter writes a pipe inside a cell as `\|`.
 */
function tableCells(line: string): string[] | 'separator' | null {
  if (!/^\s*\|.*\|\s*$/.test(line)) return null
  if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return 'separator'
  return line
    .trim()
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map(cell => cell.trim())
}

/**
 * Marks what is literal so no later rule strips from it: every character of an inline code span, and each
 * backslash-escaped character (`\*`, `\#`, `\\`, …) which stands for itself. One pass, left to right: a
 * backslash inside code is code, and an escaped backtick opens no span.
 */
const LITERAL = '\uE000'

function protectLiterals(line: string): string {
  let out = ''
  for (let i = 0; i < line.length;) {
    if (line[i] === '\\' && i + 1 < line.length) {
      out += LITERAL + line[i + 1]
      i += 2
      continue
    }
    const span = codeSpanAt(line, i)
    if (!span) {
      out += line[i]
      i++
      continue
    }
    out += [...line.slice(span.innerStart, span.innerEnd)].map(char => LITERAL + char).join('')
    i = span.end
  }
  return out
}

const LINK_LABEL = String.raw`((?:\uE000.|[^\]\uE000])*)`
const LINK_DESTINATION = String.raw`\((?:[^()]|\([^()]*\))*\)`
const IMAGE = new RegExp(String.raw`(?<!\uE000)!\[${LINK_LABEL}\]${LINK_DESTINATION}`, 'g')
const LINK = new RegExp(String.raw`(?<!\uE000)\[${LINK_LABEL}\]${LINK_DESTINATION}`, 'g')

function stripInlineMarkers(line: string): string {
  return (
    protectLiterals(line)
      // images keep their alt text; links keep their label (a destination may hold balanced parentheses;
      // an escaped bracket is text, so `\[a\](b)` is not a link)
      .replace(IMAGE, '$1')
      .replace(LINK, '$1')
      // headings and emphasis markers go. Underscores stay: this Markdown has no underscore emphasis (the
      // converter writes `*`, the reading view draws `*`), and snake_case identifiers must survive into
      // search (search.md §1). Code spans were protected above, and a backtick that opens no span is text.
      .replace(/^\s{0,3}#{1,6}\s+/g, '')
      .replace(/(?<!\uE000)(\*\*\*|\*\*|\*|==)/g, '')
      // quote markers and list bullets stay as text separators
      .replace(/^\s{0,3}>\s?/g, '')
      .replace(/^\s*[-*+]\s+/g, '')
      .replace(/^\s*\d+[.)]\s+/g, '')
      .replace(/\uE000(.?)/g, '$1')
      .trimEnd()
  )
}

/** Visible quote text for a source-offset range, shared by reading and highlight merges. */
export function quoteFromMarkdownRange(markdown: string, range: { start: number; end: number }, maxChars = 2_000): string {
  const visible: { char: string; start: number; end: number }[] = []
  const lines = markdown.split('\n')
  let lineStart = 0
  let fence: Fence | null = null
  const append = (char: string, start: number, width = 1) => visible.push({ char, start, end: start + width })

  for (const line of lines) {
    // a fence line is syntax; the lines between are code, read as written
    if (fence && closesFence(line, fence)) {
      fence = null
      lineStart += line.length + 1
      continue
    }
    if (!fence) {
      const opened = openingFence(line)
      if (opened) {
        fence = opened
        lineStart += line.length + 1
        continue
      }
    }
    const inFence = fence !== null
    if (!inFence && (/^\s*\|[\s:|-]+\|\s*$/.test(line) || /^\s*(-{3,}|\*{3,})\s*$/.test(line))) {
      lineStart += line.length + 1
      continue
    }
    const table = !inFence && /^\s*\|.*\|\s*$/.test(line)
    const marker = !inFence && !table ? /^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/.exec(line)?.[0] : undefined
    let i = marker?.length ?? 0
    while (i < line.length) {
      const at = lineStart + i
      const char = line[i]!
      if (!inFence && char === '\\' && i + 1 < line.length) {
        append(line[i + 1]!, at, 2)
        i += 2
        continue
      }
      // inline code is read as written: its stars, underscores and backslashes are the text
      const span = inFence ? null : codeSpanAt(line, i)
      if (span) {
        for (let j = span.innerStart; j < span.innerEnd; j++) append(line[j]!, lineStart + j)
        i = span.end
        continue
      }
      if (!inFence && (char === '[' || (char === '!' && line[i + 1] === '['))) {
        const labelStart = i + (char === '!' ? 2 : 1)
        let labelEnd = labelStart
        while (labelEnd < line.length && (line[labelEnd] !== ']' || line[labelEnd - 1] === '\\')) labelEnd++
        if (line.slice(labelEnd, labelEnd + 2) === '](') {
          let depth = 1
          let tokenEnd = labelEnd + 2
          while (tokenEnd < line.length && depth > 0) {
            if (line[tokenEnd] === '(') depth++
            if (line[tokenEnd] === ')') depth--
            tokenEnd++
          }
          if (depth === 0) {
            for (let j = labelStart; j < labelEnd; j++) {
              if (line[j] === '\\' && j + 1 < labelEnd) {
                append(line[j + 1]!, lineStart + j, 2)
                j++
              } else append(line[j]!, lineStart + j)
            }
            i = tokenEnd
            continue
          }
        }
      }
      if (!inFence && (line.startsWith('**', i) || line.startsWith('==', i))) {
        i += 2
        continue
      }
      // underscores are text here, as they are in the reading view: this Markdown has no underscore emphasis
      if (!inFence && char === '*') {
        i++
        continue
      }
      if (table && char === '|') {
        i++
        continue
      }
      append(char, at)
      i++
    }
    lineStart += line.length + 1
  }

  let quote = ''
  let previousEnd: number | null = null
  for (const item of visible) {
    if (item.end <= range.start || item.start >= range.end) continue
    if (previousEnd !== null && /[\n|]/.test(markdown.slice(previousEnd, item.start))) quote += ' '
    quote += item.char
    previousEnd = item.end
  }
  return quote.replace(/\s+/g, ' ').trim().slice(0, maxChars)
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
/** Splits a wrap inside a table row at every pipe so each cell wraps alone. */
function splitWrapAtPipes(markdown: string, wrap: { start: number; end: number }): { start: number; end: number }[] {
  const cells: { start: number; end: number }[] = []
  let cellStart = -1
  for (let i = wrap.start; i <= wrap.end; i++) {
    const char = markdown[i]
    if (char === '|' || i === wrap.end) {
      if (cellStart >= 0 && i > cellStart) {
        const text = markdown.slice(cellStart, i)
        const lead = text.length - text.trimStart().length
        const tail = text.length - text.trimEnd().length
        if (cellStart + lead < i - tail) cells.push({ start: cellStart + lead, end: i - tail })
      }
      cellStart = i + 1
    } else if (cellStart < 0) {
      cellStart = i
    }
  }
  return cells
}

export function blockSegments(markdown: string): BlockSegment[] {
  const segments: BlockSegment[] = []
  const lines = markdown.split('\n')
  let offset = 0
  let fence: Fence | null = null
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

    if (fence) {
      // fenced code never takes a == mark: its interior belongs to no
      // segment (storage.md §6, RV-CORE-06)
      flush(lineStart)
      if (closesFence(line, fence)) fence = null
      continue
    }
    const opened = openingFence(line)
    if (opened) {
      flush(lineStart)
      fence = opened
      continue
    }
    if (line.trim() === '') {
      flush(lineStart)
      continue
    }
    // a list item at any depth is its own block (the converter indents a nested list to its parent's content column)
    const startsBlock = /^\s*(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s)|^\s{0,3}\|/.test(line)
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
  const match = /^\s*(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)|^\s{0,3}\|\s?/.exec(text)
  return match ? match[0].length : 0
}

function trailingPunctuationLength(text: string): number {
  const match = /[\s]+([*_`]+)?$/.exec(text)
  return match ? match[0].length : 0
}

/** Single-line inline tokens a `==` wrap must not start or end inside of. */
const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|!\[[^\]\n]*\]\([^)\s]+\))/g

/** The content span of a token, relative to the token start (markers skipped). */
function innerSpanOf(token: string): { start: number; end: number } {
  if (token.startsWith('**')) return { start: 2, end: token.length - 2 }
  if (token.startsWith('*') || token.startsWith('`')) return { start: 1, end: token.length - 1 }
  const label = /^!?\[/.exec(token)![0].length
  return { start: label, end: token.lastIndexOf(']') }
}

interface TokenSpan {
  tokenStart: number
  tokenEnd: number
  contentStart: number
  contentEnd: number
}

function tokenSpans(text: string, textStart: number): TokenSpan[] {
  const spans: TokenSpan[] = []
  INLINE_TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE_TOKEN.exec(text)) !== null) {
    const inner = innerSpanOf(match[0])
    const tokenStart = textStart + match.index
    spans.push({ tokenStart, tokenEnd: tokenStart + match[0].length, contentStart: tokenStart + inner.start, contentEnd: tokenStart + inner.end })
  }
  return spans
}

/**
 * Splits a wrap at inline-token boundaries so no `==` opens or closes inside
 * bold/em/code/link syntax (RV-CORE-06): a wrap fully inside one token
 * shrinks to its content; a wrap leaving a token closes at the content edge
 * and restarts after the token; tokens fully inside a wrap pass through.
 */
function splitWrapByTokens(markdown: string, text: string, textStart: number, wrap: { start: number; end: number }): { start: number; end: number }[] {
  const tokens = tokenSpans(text, textStart)
  if (tokens.length === 0) return [wrap]

  const startTok = tokens.find(token => token.tokenStart <= wrap.start && wrap.start < token.tokenEnd)
  const endTok = tokens.find(token => token.tokenStart < wrap.end && wrap.end <= token.tokenEnd)
  if (!startTok && !endTok) return [wrap]
  if (startTok && startTok === endTok) {
    // the whole wrap lives inside one token: mark the covered content only
    const inner = { start: Math.max(wrap.start, startTok.contentStart), end: Math.min(wrap.end, startTok.contentEnd) }
    return inner.end > inner.start ? [inner] : []
  }

  const pieces: { start: number; end: number }[] = []
  let start = wrap.start
  let end = wrap.end
  if (startTok) {
    if (wrap.start < startTok.contentStart) {
      // opening in the leading marker snaps to the content
      start = startTok.contentStart
    } else if (wrap.start <= startTok.contentEnd) {
      // opens inside the content: close there, restart after the token
      if (!/^!?\[/.test(markdown.slice(startTok.tokenStart, startTok.tokenEnd))) pieces.push({ start: wrap.start, end: startTok.contentEnd })
      start = startTok.tokenEnd
    } else {
      // opening in the trailing marker starts after the token
      start = startTok.tokenEnd
    }
  }
  if (endTok) {
    if (wrap.end > endTok.contentEnd)
      end = endTok.contentEnd // trailing marker: close before it
    else if (wrap.end > endTok.contentStart)
      end = endTok.tokenStart // content of another token: close before the token
    else end = endTok.tokenStart // leading marker
  }
  if (start < end) pieces.push({ start, end })
  // boundary whitespace never belongs inside the markers
  return pieces
    .map(piece => {
      const raw = markdown.slice(piece.start, piece.end)
      const followsEmphasis = startTok && piece.start === startTok.tokenEnd && markdown[startTok.tokenStart] === '*'
      const lead = followsEmphasis && raw.trim() ? 0 : raw.length - raw.trimStart().length
      const tail = raw.length - raw.trimEnd().length
      return { start: piece.start + lead, end: piece.end - tail }
    })
    .filter(piece => piece.end > piece.start)
}

/**
 * Write highlights back into the Markdown source as `==…==`, split per
 * block so a highlight never crosses a paragraph or breaks a syntax token
 * (storage.md §6). Fenced code takes no marks; a wrap never opens or closes
 * inside bold/em/code/link tokens; a table row wraps cell by cell.
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
      const pieces = splitWrapByTokens(markdown, segText, segment.start, { start: adjustedStart, end: adjustedEnd })
      for (const piece of pieces) {
        // a table row wraps per cell: pipes never sit inside ==
        const cells = segText.trimStart().startsWith('|') ? splitWrapAtPipes(markdown, piece) : [piece]
        for (const cell of cells) {
          const last = wraps[wraps.length - 1]
          if (last && cell.start <= last.end) last.end = Math.max(last.end, cell.end)
          else wraps.push(cell)
        }
      }
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
