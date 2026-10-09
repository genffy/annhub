import { describe, expect, it } from 'vitest'
import { blockSegments, markdownToPlainText, writeHighlightMarks } from '../markdown'

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

  it('leaves code fences intact; a fence is one block so the wrap stays inside it', () => {
    const fenced = ['text', '', '```js', 'let a = 1;', 'let b = 2;', '```'].join('\n')
    const start = fenced.indexOf('let a')
    const end = fenced.indexOf('let b') + 'let b = 2;'.length
    const out = writeHighlightMarks(fenced, [{ start, end }])
    expect(out).toContain('```js')
    expect(out).toContain('==let a = 1;\nlet b = 2;==')
    expect(out).not.toContain('==```')
  })

  it('returns the source untouched for empty input', () => {
    expect(writeHighlightMarks(md, [])).toBe(md)
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
