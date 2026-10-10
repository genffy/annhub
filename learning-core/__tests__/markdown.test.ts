import { describe, expect, it } from 'vitest'
import { blockSegments, closesFence, codeSpanAt, markdownToPlainText, openingFence, quoteFromMarkdownRange, writeHighlightMarks } from '../markdown'
import { fold, PAGE_TEXT_CASES } from './fixtures/page-text'

describe('markdownToPlainText (search.md §1)', () => {
  it('drops syntax markers but keeps the visible text', () => {
    const md = [
      '## Heading',
      '',
      'A **bold** word and *italics* and `code`.',
      '',
      '- one',
      '- two',
      '',
      '> quoted line',
      '',
      '[label](https://example.com) and ![alt text](https://img)',
      '',
      '```ts',
      'const x = 1',
      '```',
    ].join('\n')
    const plain = markdownToPlainText(md)
    expect(plain).toContain('Heading')
    expect(plain).toContain('A bold word and italics and code.')
    expect(plain).toContain('one')
    expect(plain).toContain('quoted line')
    expect(plain).toContain('label and alt text')
    expect(plain).toContain('const x = 1')
    expect(plain).not.toContain('**')
    expect(plain).not.toContain('](https://')
  })

  it('keeps literal identifiers findable (RV-CORE-04)', () => {
    // the capture pipeline escapes emphasis-capable literals (RV-CAP-02);
    // intraword underscores are CommonMark-safe and stay unescaped
    const plain = markdownToPlainText('See user_id, \\_\\_init\\_\\_, a\\*b\\*c, snake_case_name, C++ and #hashtag — plus 2\\*3\\*4 and `MAX_RETRIES` code.')
    expect(plain).toContain('user_id')
    expect(plain).toContain('__init__')
    expect(plain).toContain('a*b*c')
    expect(plain).toContain('snake_case_name')
    expect(plain).toContain('C++')
    expect(plain).toContain('#hashtag')
    expect(plain).toContain('2*3*4')
    expect(plain).toContain('MAX_RETRIES')
    // syntax markers themselves stay unfindable
    expect(plain).not.toContain('](https://')
    expect(markdownToPlainText('a **bold** span')).not.toContain('**')
  })
})

describe('writeHighlightMarks (storage.md §6)', () => {
  const md = ['Intro paragraph with tail.', '', '## Section', '', 'First line of section body.', 'Second line same paragraph.', '', '- item one', '- item two'].join('\n')

  it('wraps a within-paragraph range', () => {
    const start = md.indexOf('tail')
    const out = writeHighlightMarks(md, [{ start, end: start + 4 }])
    expect(out).toContain('with ==tail==.')
  })

  it('splits a highlight that crosses blocks instead of spanning them', () => {
    const start = md.indexOf('Intro')
    const end = md.indexOf('Section') + 'Section'.length
    const out = writeHighlightMarks(md, [{ start, end }])
    expect(out).toContain('==Intro paragraph with tail.==')
    expect(out).toContain('## ==Section==')
    // no single wrap ever spans a blank line
    for (const match of out.matchAll(/==(?:[^=]|=(?!=)*?)==/gs)) {
      expect(match[0]).not.toContain('\n\n')
    }
  })

  it('does not break the heading marker itself when the range starts at line start', () => {
    const sectionLine = md.indexOf('## Section')
    const out = writeHighlightMarks(md, [{ start: sectionLine, end: sectionLine + 10 }])
    expect(out).toContain('## ==Section==')
    expect(out).not.toContain('==##')
  })

  it('keeps continuation lines of one paragraph inside a single wrap', () => {
    const start = md.indexOf('First line')
    const end = md.indexOf('Second line') + 'Second line same paragraph.'.length
    const out = writeHighlightMarks(md, [{ start, end }])
    expect(out).toContain('==First line of section body.\nSecond line same paragraph.==')
  })

  it('fenced code takes no == marks at all (RV-CORE-06)', () => {
    const fenced = ['text before', '', '```js', 'let a = 1;', 'let b = 2;', '```', '', 'text after'].join('\n')
    const start = fenced.indexOf('let a')
    const end = fenced.indexOf('let b') + 'let b = 2;'.length
    const out = writeHighlightMarks(fenced, [{ start, end }])
    expect(out).toContain('```js')
    expect(out).not.toContain('==let')
    // code stays pristine
    expect(out).toContain('\nlet a = 1;\nlet b = 2;\n')
  })

  it('never opens or closes a wrap inside bold or link tokens (RV-CORE-06)', () => {
    const bold = 'Hello **brave new** world'
    const out1 = writeHighlightMarks(bold, [{ start: bold.indexOf('brave'), end: bold.indexOf('world') }])
    // the span ended before 'world'; its only content was the bold text
    expect(out1).toBe('Hello **==brave new==** world')

    const partial = 'Hello **brave new** world'
    const out2 = writeHighlightMarks(partial, [{ start: partial.indexOf('new'), end: partial.indexOf('new') + 3 }])
    expect(out2).toBe('Hello **brave ==new==** world')

    // a wrap leaving a token closes at the content edge and restarts after it
    const leaving = 'Hello **brave new** world'
    const out2b = writeHighlightMarks(leaving, [{ start: leaving.indexOf('brave'), end: leaving.length }])
    expect(out2b).toBe('Hello **==brave new==**== world==')

    const link = 'See [the docs](https://example.com) now'
    const out3 = writeHighlightMarks(link, [{ start: link.indexOf('docs'), end: link.indexOf('docs') + 4 }])
    expect(out3).toBe('See [the ==docs==](https://example.com) now')

    // a wrap starting inside a link but running past it skips to the token's end
    const crossing = 'See [the docs](https://example.com) now'
    const out4 = writeHighlightMarks(crossing, [{ start: crossing.indexOf('docs'), end: crossing.length }])
    expect(out4).toBe('See [the docs](https://example.com) ==now==')
  })

  it('wraps table rows cell by cell, never across pipes (RV-CORE-06)', () => {
    const table = ['| Name | Role |', '| --- | --- |', '| Bob | Engineer |'].join('\n')
    const bob = table.indexOf('Bob')
    const out = writeHighlightMarks(table, [{ start: bob, end: bob + 3 }])
    expect(out).toContain('| ==Bob== |')
  })

  it('returns the source untouched for empty input', () => {
    expect(writeHighlightMarks(md, [])).toBe(md)
  })
})

describe('writeHighlightMarks in deeply nested lists (storage.md §6)', () => {
  const md = ['- level one', '  - level two', '    - level three', '      - level four', '        - level five'].join('\n')

  it('never lets one ==wrap== run across list items, at any depth', () => {
    const start = md.indexOf('three')
    const end = md.indexOf('five') + 'five'.length
    const marked = writeHighlightMarks(md, [{ start, end }])
    for (const line of marked.split('\n')) {
      const marks = line.match(/==/g)?.length ?? 0
      expect(marks % 2, line).toBe(0)
    }
    // the visible words are all still there, in order, and each item carries its own piece
    expect(marked.replace(/==/g, '')).toBe(md)
    expect(marked).toContain('==three==')
    expect(marked).toContain('==level four==')
    expect(marked).toContain('==level five==')
  })

  it('keeps the list marker out of the wrap at depth, too', () => {
    const lineStart = md.lastIndexOf('\n') + 1
    const marked = writeHighlightMarks(md, [{ start: lineStart, end: md.length }])
    expect(marked.split('\n').slice(-1)[0]).toBe('        - ==level five==')
  })
})

describe('blockSegments', () => {
  it('produces ordered non-overlapping segments covering the text', () => {
    const segments = blockSegments('a\n\nb\nb\n\n# h')
    let previous = -1
    for (const segment of segments) {
      expect(segment.start).toBeGreaterThan(previous)
      expect(segment.end).toBeGreaterThan(segment.start)
      previous = segment.start
    }
  })
})

/** `==` marks in a line, skipping backslash escapes (`=\\=` is two equals signs of text, not a mark). */
function markCount(line: string): number {
  let marks = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') i++
    else if (line[i] === '=' && line[i + 1] === '=') {
      marks++
      i++
    }
  }
  return marks
}

/** The text with its unescaped `==` marks taken out. */
function withoutMarks(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') out += text[i++]! + (text[i] ?? '')
    else if (text[i] === '=' && text[i + 1] === '=') i++
    else out += text[i]
  }
  return out
}

describe('shared page-text fixtures: every reader of the Markdown gives the words back (RV-CORE-04)', () => {
  for (const fixture of PAGE_TEXT_CASES) {
    it(fixture.name, () => {
      expect(fold(markdownToPlainText(fixture.markdown)), 'search text').toBe(fixture.visible)
      expect(fold(quoteFromMarkdownRange(fixture.markdown, { start: 0, end: fixture.markdown.length }, 10_000)), 'quote of the whole text').toBe(fixture.visible)
    })
  }

  it('writing a highlight over everything adds marks in pairs and changes nothing else, and code takes none', () => {
    for (const fixture of PAGE_TEXT_CASES) {
      const marked = writeHighlightMarks(fixture.markdown, [{ start: 0, end: fixture.markdown.length }])
      expect(markCount(marked) % 2, `${fixture.name}: marks come in pairs`).toBe(0)
      expect(withoutMarks(marked), `${fixture.name}: only marks were added`).toBe(fixture.markdown)
      // fenced code takes none
      if (fixture.markdown.includes('```')) expect(marked, fixture.name).toContain('````\n```ts\nlet x = 1\n````')
    }
  })
})

describe('code fences and code spans (CommonMark, as the converter writes them)', () => {
  it('a fence is closed only by a fence as long as the one that opened it', () => {
    const fence = openingFence('````')!
    expect(fence).toEqual({ char: '`', length: 4 })
    expect(closesFence('```', fence)).toBe(false)
    expect(closesFence('````', fence)).toBe(true)
    expect(closesFence('`````', fence)).toBe(true)
    expect(closesFence('~~~~', fence)).toBe(false)
    expect(closesFence('```` text', fence)).toBe(false)
    expect(openingFence('```ts')).toEqual({ char: '`', length: 3 })
    expect(openingFence('   ~~~~  rust')).toEqual({ char: '~', length: 4 })
    // an inline run of backticks is not a fence
    expect(openingFence('```x``` and more')).toBeNull()
    expect(openingFence('plain text')).toBeNull()
  })

  it('text after a block that holds a shorter fence is still text', () => {
    const markdown = ['````', '```ts', 'let x = 1', '````', '', 'after 2 \\* 3'].join('\n')
    expect(markdownToPlainText(markdown)).toBe('```ts\nlet x = 1\n\nafter 2 * 3')
  })

  it('an unclosed fence runs to the end of the text', () => {
    expect(markdownToPlainText('```\nstill code\n\nand more')).toBe('still code\n\nand more')
  })

  it('a code span ends at a run of exactly its own length', () => {
    expect(codeSpanAt('run ``a`b`` now', 4)).toMatchObject({ start: 4, end: 11, innerStart: 6, innerEnd: 9 })
    expect(codeSpanAt('`one` and `two`', 0)).toMatchObject({ start: 0, end: 5, innerStart: 1, innerEnd: 4 })
    // one padding space on each side is not code
    expect(codeSpanAt('`` `x` ``', 0)).toMatchObject({ innerStart: 3, innerEnd: 6 })
    // no closing run of the same length: not a span
    expect(codeSpanAt('a ``b` c', 2)).toBeNull()
    // the middle of a run is not an opening
    expect(codeSpanAt('``a``', 1)).toBeNull()
    expect(codeSpanAt('not code', 0)).toBeNull()
  })

  it('an escaped backtick opens no span, and code keeps its own backslashes', () => {
    expect(markdownToPlainText('a \\`b\\` c')).toBe('a `b` c')
    expect(markdownToPlainText('see `C:\\tmp\\x` here')).toBe('see C:\\tmp\\x here')
  })
})
