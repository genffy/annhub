import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { extractDownloadPage } from '../../offscreen/download-extract'
import { downloadSnapshot, extractedDownloadBody } from '../download-snapshot'
import { elementToMarkdown } from '../markdown'
import { extractXContent } from '../platform-x'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

function load(name: string, url: string): void {
  const html = readFileSync(`e2e/source-pages/${name}.html`, 'utf8')
  document.documentElement.innerHTML = html
  const base = document.createElement('base')
  base.href = url
  document.head.prepend(base)
}

async function download(root: Element): Promise<string> {
  const html = await extractDownloadPage({ type: 'DOWNLOAD_EXTRACT', html: downloadSnapshot(root, true), hasArticle: true, url: document.baseURI })
  return elementToMarkdown(extractedDownloadBody(html, document.baseURI), undefined, 'download').markdown
}

it('keeps every formula and local reference in the encyclopedia structure', async () => {
  load('encyclopedia', 'https://en.wikipedia.org/wiki/Quadratic_formula')
  const formulas = [...document.querySelectorAll('math')].map(el => el.getAttribute('alttext')!)
  expect(formulas.length).toBeGreaterThan(30)
  const markdown = await download(document.body)
  for (const formula of formulas) expect(markdown).toContain(formula)
  expect(markdown).toMatch(/\[\^1\]:/)
}, 30_000)

it('keeps all Sphinx code samples with their declared language', async () => {
  load('documentation', 'https://docs.python.org/3/tutorial/controlflow.html')
  const count = document.querySelectorAll('pre').length
  expect(count).toBeGreaterThan(19)
  const markdown = await download(document.querySelector('[role="main"]')!)
  expect(markdown.match(/```python3\n/gm)?.length).toBe(document.querySelectorAll('.highlight-python3 pre').length)
  for (let index = 1; index <= count; index++) expect(markdown).toContain(`const sample_${index} = ${index};`)
  expect(markdown).toContain(`const sample_${count} = ${count};`)
}, 30_000)

it('keeps the issue body and every comment from the source DOM', async () => {
  load('issue', 'https://github.com/kepano/defuddle/issues/56')
  const bodies = [...document.querySelectorAll('[data-testid="markdown-body"]')]
  expect(bodies.length).toBeGreaterThan(2)
  const endings = bodies.map(el => [...el.querySelectorAll('p')].slice(-1)[0]?.textContent?.trim()).filter(Boolean)
  const markdown = await download(document.querySelector('main')!)
  for (const ending of endings) for (const text of ending!.match(/Sample text \d+\./g) ?? []) expect(markdown).toContain(text)
  expect(markdown).not.toContain('![')
  for (const time of document.querySelectorAll('.react-issue-comment relative-time')) expect(markdown).toContain(time.getAttribute('datetime')!.slice(0, 10))
}, 30_000)

it('retains an expanded 21-comment thread with per-comment authors and dates', async () => {
  load('issue', 'https://github.com/sample-owner/sample-repo/issues/56')
  const seed = document.querySelector('[data-wrapper-timeline-id]')!
  document.querySelectorAll('[data-wrapper-timeline-id]').forEach(node => {
    if (node !== seed) node.remove()
  })
  for (let index = 1; index <= 21; index++) {
    const comment = seed.cloneNode(true) as Element
    comment.setAttribute('data-wrapper-timeline-id', `comment-${index}`)
    comment.querySelector('.markdown-body')!.innerHTML = `<p>Comment body ${index}.</p>`
    comment.querySelector('relative-time')!.setAttribute('datetime', '2026-10-01T00:00:00Z')
    const author = comment.querySelector('a[data-testid="avatar-link"]')
    author?.setAttribute('href', `/sample-author-${index}`)
    seed.parentElement!.append(comment)
  }
  seed.remove()
  const markdown = await download(document.querySelector('main')!)
  for (let index = 1; index <= 21; index++) expect(markdown).toContain(`Comment body ${index}.`)
  expect(markdown.match(/2026-10-01/g)).toHaveLength(21)
  expect(markdown).not.toContain('![')
}, 30_000)

it.each([
  ['x-rich-article', 'Rich editor sample'],
  ['x-rendered-article', 'Rendered article sample'],
])(
  'extracts the %s long article after test attributes are removed',
  async (name, title) => {
    load(name!, 'https://x.com/sampleauthor/status/2013045749580259680')
    const platform = extractXContent(document.querySelector('article')!)
    expect(platform?.meta.title).toBe(title)
    const markdown = await download(platform!.element)
    expect(markdown.match(/^# /gm)).toHaveLength(1)
    expect(markdown.match(/^## /gm)?.length).toBeGreaterThan(2)
    expect(markdown.match(/^```(?:markdown|json)$/gm)).toHaveLength(4)
    expect(markdown).not.toMatch(/^[-*] *$/m)
    expect(markdown).not.toMatch(/^(markdown|json)\s*$/m)
    expect(markdown).toContain('const sample_4 = 4;')
  },
  30_000,
)
