import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Highlight } from '../../../learning-core/types'
import { fold, PAGE_TEXT_CASES } from '../../../learning-core/__tests__/fixtures/page-text'
import { MarkdownView, parseBlocks, quoteForRange, renderedRuns, sourceRangeFromSelection, splitTableRow } from '../markdown-view'

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

  it('converts element-endpoint selections (triple-click, Ctrl+A) (RV-LIB-09)', () => {
    const root = mount('First paragraph.\n\nSecond paragraph.')
    const paragraphs = Array.from(root.querySelectorAll('p'))
    const selection = window.getSelection()!
    selection.removeAllRanges()
    // a triple-click shape: both endpoints are element points
    const range = document.createRange()
    range.setStart(paragraphs[1]!, 0)
    range.setEnd(paragraphs[1]!, paragraphs[1]!.childNodes.length)
    selection.addRange(range)
    // 'Second paragraph.' starts at 16 + 2 newlines = 18
    expect(sourceRangeFromSelection(root, selection)).toEqual({ start: 18, end: 35 })
  })
})

describe('quoteForRange renders the visible words (entry.md §4.2, RV-LIB-09)', () => {
  it('quotes across links and bold text without markdown syntax', () => {
    const md = 'See [the docs](https://example.com/docs) and **bold words** now.'
    const start = md.indexOf('See')
    const end = md.indexOf('now.') + 4
    expect(quoteForRange(md, { start, end })).toBe('See the docs and bold words now.')
  })

  it('quotes table cells, not pipes', () => {
    const md = ['| Name | Role |', '| --- | --- |', '| Bob | Engineer |'].join('\n')
    const start = md.indexOf('Bob')
    const end = md.indexOf('Engineer') + 'Engineer'.length
    expect(quoteForRange(md, { start, end })).toBe('Bob Engineer')
  })

  it('joins soft-wrapped lines with a space', () => {
    const md = 'first line of the paragraph\nsecond line continues'
    expect(quoteForRange(md, { start: 0, end: md.length })).toBe('first line of the paragraph second line continues')
  })

  it('caps at the quote limit', () => {
    const md = 'x'.repeat(3000)
    expect(quoteForRange(md, { start: 0, end: 3000 }).length).toBe(2000)
  })
})

describe('table row splitting', () => {
  it('splits cells with their offsets and honors escaped pipes', () => {
    const cells = splitTableRow({ source: '| Name | A \\| B | tail |' })
    expect(cells.map(cell => cell.text)).toEqual(['Name', 'A | B', 'tail'])
    // plain cells anchor exactly; an escaped pipe renders one char for two
    // source chars, so only the unescaped prefix is 1:1 with the source
    const line = '| Name | A \\| B | tail |'
    expect(line.slice(cells[0]!.start, cells[0]!.start + cells[0]!.text.length)).toBe('Name')
    expect(line.slice(cells[1]!.start, cells[1]!.start + 1)).toBe('A')
    expect(line.slice(cells[2]!.start, cells[2]!.start + cells[2]!.text.length)).toBe('tail')
  })
})

describe('renderedRuns (RK-13 shared mapping)', () => {
  it('covers the visible text with source anchors in order', () => {
    const md = ['## Head', '', 'Alpha **bold** tail.', '', '- item one'].join('\n')
    const runs = renderedRuns(md)
    expect(runs.map(run => run.text).join('')).toContain('Head')
    expect(runs.map(run => run.text).join('')).toContain('Alpha bold tail.')
    // anchors are non-decreasing and each anchor's text matches the source at that offset (for plain runs)
    for (const run of runs) {
      if (run.kind === undefined) {
        expect(md.slice(run.srcStart, run.srcStart + run.text.length)).toBe(run.text)
      }
    }
  })
})

describe('escaped source offsets and Markdown display (RV-LIB-09, RV-LIB-14)', () => {
  it('keeps every word aligned after escaped characters', () => {
    const md = 'alpha beta \\* gamma delta \\* epsilon zeta \\* eta theta iota'
    document.body.innerHTML = renderToStaticMarkup(createElement(MarkdownView, { markdown: md }))
    const root = document.querySelector<HTMLElement>('.md-view')!
    for (const word of ['beta', 'gamma', 'epsilon', 'theta']) {
      const span = Array.from(root.querySelectorAll<HTMLElement>('[data-s]')).find(node => node.textContent?.includes(word) && node.firstChild?.nodeType === Node.TEXT_NODE)!
      const text = span.firstChild as Text
      const start = text.textContent!.indexOf(word)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      const range = document.createRange()
      range.setStart(text, start)
      range.setEnd(text, start + word.length)
      selection.addRange(range)
      const source = sourceRangeFromSelection(root, selection, md)!
      expect(md.slice(source.start, source.end)).toBe(word)
      expect(quoteForRange(md, source)).toBe(word)
    }
    expect(
      renderedRuns(md)
        .map(run => run.text)
        .join(''),
    ).toBe('alpha beta * gamma delta * epsilon zeta * eta theta iota')
  })

  it('maps an endpoint inside an escape to the full source sequence', () => {
    const md = 'a \\* b'
    document.body.innerHTML = renderToStaticMarkup(createElement(MarkdownView, { markdown: md }))
    const root = document.querySelector<HTMLElement>('.md-view')!
    const escaped = Array.from(root.querySelectorAll<HTMLElement>('[data-s]')).find(node => node.textContent === '*')!
    const selection = window.getSelection()!
    selection.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(escaped)
    selection.addRange(range)
    expect(sourceRangeFromSelection(root, selection, md)).toEqual({ start: 2, end: 4 })
  })

  it('renders hard line breaks and balanced link destinations', () => {
    const md = 'line two  \nline three\n\n[the wiki](https://en.wikipedia.org/wiki/Foo_(bar))'
    const html = renderToStaticMarkup(createElement(MarkdownView, { markdown: md }))
    expect(html).toContain('<br')
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Foo_(bar)"')
    expect(html).not.toContain('the wiki</a>)')
  })

  it('separates paragraph quotes and trims a triple-click range at the last visible character', () => {
    const md = 'Alpha two three.\n\nBravo four five.'
    expect(quoteForRange(md, { start: 0, end: md.length })).toBe('Alpha two three. Bravo four five.')
    document.body.innerHTML = renderToStaticMarkup(createElement(MarkdownView, { markdown: md }))
    const root = document.querySelector<HTMLElement>('.md-view')!
    const paragraphs = root.querySelectorAll('p')
    const selection = window.getSelection()!
    selection.removeAllRanges()
    const range = document.createRange()
    range.setStart(paragraphs[0]!, 0)
    range.setEnd(paragraphs[1]!, 0)
    selection.addRange(range)
    expect(sourceRangeFromSelection(root, selection, md)).toEqual({ start: 0, end: 'Alpha two three.'.length })
  })
})

describe('highlights inside fenced code (entry.md §4.1, US-LIB-03)', () => {
  const md = 'Before the code.\n\n```ts\nconst answer = 42\nconsole.log(answer)\n```\n\nAfter the code.'
  const phrase = 'answer = 42'
  const start = md.indexOf(phrase)
  const highlight: Highlight = { id: 'hl_code', start, end: start + phrase.length, quote: phrase, color: 'yellow', createdAt: 1 }

  function mountView(highlights: Highlight[] = []): HTMLElement {
    document.body.innerHTML = `<div id="surface">${renderToStaticMarkup(createElement(MarkdownView, { markdown: md, highlights }))}</div>`
    return document.getElementById('surface')!
  }

  function selectInside(root: HTMLElement, from: { node: number; offset: number }, to: { node: number; offset: number }): Selection {
    const texts: Text[] = []
    const walker = document.createTreeWalker(root.querySelector('pre code')!, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text)
    const range = document.createRange()
    range.setStart(texts[from.node]!, from.offset)
    range.setEnd(texts[to.node]!, to.offset)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    return selection
  }

  it('draws the mark with its id and color, anchored where it was made, and keeps the code text whole', () => {
    const root = mountView([highlight])
    const mark = root.querySelector('pre code [data-hl-id="hl_code"]') as HTMLElement
    expect(mark).not.toBeNull()
    expect(mark.className).toContain('md-hl-yellow')
    expect(mark.textContent).toBe(phrase)
    expect(Number(mark.dataset.s)).toBe(start)
    expect(root.querySelector('pre code')!.textContent).toBe('const answer = 42\nconsole.log(answer)')
  })

  it('without highlights the code is one anchored run', () => {
    const root = mountView()
    expect(root.querySelectorAll('pre code [data-hl-id]')).toHaveLength(0)
    const spans = root.querySelectorAll('pre code span[data-s]')
    expect(spans).toHaveLength(1)
    expect(Number((spans[0] as HTMLElement).dataset.s)).toBe(md.indexOf('const answer'))
  })

  it('a click on the mark is wired, so it can be recolored or removed like any other', () => {
    const html = renderToStaticMarkup(createElement(MarkdownView, { markdown: md, highlights: [highlight], onHighlightClick: () => undefined }))
    expect(html).toMatch(/<pre[^>]*><code>.*<span[^>]*class="md-hl-hit"[^>]*>.*data-hl-id="hl_code"/s)
  })

  it("a selection inside code converts to the exact source range, across the mark's edges", () => {
    const root = mountView([highlight])
    // pieces: "const " | "answer = 42" (marked) | "\nconsole.log(answer)"
    const selection = selectInside(root, { node: 0, offset: 6 }, { node: 2, offset: 8 })
    const range = sourceRangeFromSelection(root, selection)
    expect(range).not.toBeNull()
    expect(md.slice(range!.start, range!.end)).toBe('answer = 42\nconsole')
  })

  it("the stored quote for a range in code is the code's own text", () => {
    expect(quoteForRange(md, { start, end: start + phrase.length })).toBe(phrase)
  })
})

describe('shared page-text fixtures: the reading view shows the words and anchors them to the source (RV-CORE-04, RK-13)', () => {
  for (const fixture of PAGE_TEXT_CASES) {
    it(fixture.name, () => {
      // what the runs say is what a reader sees
      expect(
        fold(
          renderedRuns(fixture.markdown)
            .map(run => run.text)
            .join(''),
        ),
        'rendered runs',
      ).toBe(fixture.visible)

      // every plain run points at the very same characters in the source (an escape is two source characters for one shown)
      document.body.innerHTML = `<div id="surface">${renderToStaticMarkup(createElement(MarkdownView, { markdown: fixture.markdown }))}</div>`
      for (const node of document.querySelectorAll<HTMLElement>('#surface [data-s]')) {
        const text = node.textContent ?? ''
        if (!text.trim() || node.dataset.e) continue
        const start = Number(node.dataset.s)
        expect(fixture.markdown.slice(start, start + text.length), `${fixture.name}: run at ${start}`).toBe(text)
      }
    })
  }
})
