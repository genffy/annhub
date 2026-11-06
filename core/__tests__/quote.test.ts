import { describe, expect, it } from 'vitest'
import { quoteFromMarkdownRange } from '../markdown'

describe('source-offset quote shared by reading and merge (RV-CORE-09)', () => {
  it.each([
    ['strong and link', 'See **brave** [the docs](https://example.com/x) now', 'See brave the docs now'],
    ['escaped literals', 'alpha \\* beta =\\= gamma \\\\ delta', 'alpha * beta == gamma \\ delta'],
    ['table cells', '| Name | Role |\n| --- | --- |\n| Bob | Engineer |', 'Name Role Bob Engineer'],
    ['paragraphs', 'First paragraph.\n\nSecond paragraph.', 'First paragraph. Second paragraph.'],
  ])('%s', (_label, markdown, expected) => {
    expect(quoteFromMarkdownRange(markdown, { start: 0, end: markdown.length })).toBe(expected)
  })

  it('keeps only the selected part of a link label, never its destination', () => {
    const markdown = 'See [the docs](https://example.com/path) now'
    const start = markdown.indexOf('docs')
    expect(quoteFromMarkdownRange(markdown, { start, end: markdown.length })).toBe('docs now')
  })
})
