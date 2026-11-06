import { expect, it } from 'vitest'
import { elementToMarkdown } from '../markdown'
import { collectMedia } from '../download-collect'

function convert(body: string): string {
  document.body.innerHTML = `<article>${body}</article>`
  return elementToMarkdown(document.querySelector('article')!, undefined, 'download').markdown
}

it('keeps every figure child in order, including images, tables, quotes and caption', () => {
  const markdown = convert(
    '<figure><img src="https://example.com/a.png"><blockquote><p>Explanation</p></blockquote><img src="https://example.com/b.png"><table><tr><th>Value</th></tr><tr><td>42</td></tr></table><figcaption>Both charts</figcaption></figure>',
  )
  const parts = ['a.png', '> Explanation', 'b.png', '| Value |', '*Both charts*']
  for (let i = 1; i < parts.length; i++) expect(markdown.indexOf(parts[i]!)).toBeGreaterThan(markdown.indexOf(parts[i - 1]!))
  expect(collectMedia(document.querySelector('article')!, markdown)).toHaveLength(2)
})

it('expands table spans, retains the caption and visibly separates cell paragraphs', () => {
  const markdown = convert(
    '<table><caption>Results</caption><tr><th rowspan="2">Name</th><th colspan="2">Scores</th></tr><tr><th>A</th><th>B</th></tr><tr><td>Record</td><td colspan="2"><p>First</p><p>Second</p></td></tr></table>',
  )
  expect(markdown).toContain('Results')
  const rows = markdown.split('\n').filter(line => line.startsWith('|'))
  expect(rows).toHaveLength(4)
  expect(rows.every(row => row.split('|').length === 5)).toBe(true)
  expect(rows[2]).toBe('|   | A | B |')
  expect(rows[3]).toBe('| Record | First / Second |   |')
})

it('retains list starts, task state, definition lists and superscripts', () => {
  const markdown = convert(
    '<ol start="3"><li><p>First item</p></li><li>Second item</li></ol><ul><li><input type="checkbox" checked><p>Done</p></li><li><input type="checkbox">Pending</li></ul><dl><dt>Term</dt><dd><p>Definition</p></dd></dl><p>10<sup>8</sup> and H<sub>2</sub>O</p>',
  )
  expect(markdown).toContain('3. First item\n4. Second item')
  expect(markdown).toContain('- [x] Done\n- [ ] Pending')
  expect(markdown).toContain('**Term**\n\nDefinition')
  expect(markdown).toContain('10⁸ and H₂O')
})

it('keeps inline media and writes document callouts as quotes', () => {
  const markdown = convert(
    '<p>Demo <video src="https://example.com/demo.mp4"></video> and <iframe src="https://example.com/player" title="Player"></iframe></p><aside role="note"><p>Remember <strong>this</strong></p></aside>',
  )
  expect(markdown).toContain('](https://example.com/demo.mp4)')
  expect(markdown).toContain('[Player](https://example.com/player)')
  expect(markdown).toContain('> Remember **this**')
})
