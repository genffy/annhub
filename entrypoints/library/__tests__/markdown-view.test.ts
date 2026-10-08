import { describe, expect, it } from 'vitest'
import { parseBlocks, sourceRangeFromSelection } from '../markdown-view'

/**
 * RK-13: rendered-selection ↔ source-offset conversion lives in one shared
 * module; these fixtures pin it. jsdom selections are built with Range APIs,
 * the way the reading view itself does it.
 */

const MD = [
  'First paragraph plain text.',
  '',
  '## A heading',
  '',
  'Keep **bold** and [a link](https://x.example) here.',
  '',
  '- one item',
  '- two item',
  '',
  '```ts',
  'const x = 1',
  '```',
].join('\n')

describe('parseBlocks offsets', () => {
  it('covers the source with block spans in document order', () => {
    const blocks = parseBlocks(MD)
    expect(blocks[0]).toMatchObject({ kind: 'p' })
    expect(blocks.map(block => block.kind)).toEqual(['p', 'h', 'p', 'ul', 'code'])
    // each block's span lies inside the source and runs are ordered
    let previousEnd = -1
    for (const block of blocks) {
      expect(block.srcStart).toBeGreaterThanOrEqual(previousEnd)
      previousEnd = block.srcEnd
    }
  })

  it('maps inline runs back to the exact source text', () => {
    const blocks = parseBlocks(MD)
    const paragraph = blocks[2]!
    const line = paragraph.lines[0]!
    // rendering reassembles the plain text; bold/link labels keep their source spans
    const runsText = line.source
    expect(MD.slice(line.srcStart, line.srcStart + runsText.length)).toBe(runsText)
  })
})

describe('sourceRangeFromSelection', () => {
  function mount(markdown: string): HTMLElement {
    document.body.innerHTML = '<div id="surface"></div>'
    const root = document.getElementById('surface')!
    // a minimal offset-carrying render: one span per text run, data-s set
    let html = ''
    let cursor = 0
    for (const line of markdown.split('\n')) {
      if (line.trim() === '') {
        cursor += line.length + 1
        continue
      }
      html += `<p><span data-s="${cursor}">${line.replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch] ?? ch)}</span></p>`
      cursor += line.length + 1
    }
    root.innerHTML = html
    return root
  }

  function select(root: HTMLElement, from: number, to: number): Selection {
    const selection = window.getSelection()!
    selection.removeAllRanges()
    const range = document.createRange()
    const spans = Array.from(root.querySelectorAll('span[data-s]')) as HTMLElement[]
    const locate = (absolute: number) => {
      const span = spans.find(el => Number(el.dataset.s) <= absolute && absolute <= Number(el.dataset.s) + (el.textContent?.length ?? 0))!
      return { node: span.firstChild!, offset: absolute - Number(span.dataset.s) }
    }
    const a = locate(from)
    const b = locate(to)
    range.setStart(a.node, a.offset)
    range.setEnd(b.node, b.offset)
    selection.addRange(range)
    return selection
  }

  it('converts a selection within one run', () => {
    const root = mount('First paragraph plain text.')
    const selection = select(root, 6, 14)
    expect(sourceRangeFromSelection(root, selection)).toEqual({ start: 6, end: 14 })
  })

  it('converts a selection spanning two rendered paragraphs', () => {
    const root = mount('First paragraph.\n\nSecond paragraph.')
    const selection = select(root, 6, 26)
    expect(sourceRangeFromSelection(root, selection)).toEqual({ start: 6, end: 26 })
  })

  it('returns null for a collapsed selection or one outside the surface', () => {
    const root = mount('One paragraph only.')
    const selection = select(root, 4, 4)
    expect(sourceRangeFromSelection(root, selection)).toBeNull()

    document.body.appendChild(document.createTextNode('outside'))
    const outside = window.getSelection()!
    outside.removeAllRanges()
    const range = document.createRange()
    range.setStart(document.body.lastChild!, 0)
    range.setEnd(document.body.lastChild!, 3)
    outside.addRange(range)
    expect(sourceRangeFromSelection(root, outside)).toBeNull()
  })
})
