import { afterEach, expect, it, vi } from 'vitest'
import { downloadSnapshot, extractedDownloadBody } from '../download-snapshot'
import { elementToMarkdown } from '../markdown'
import { extractDownloadPage } from '../../offscreen/download-extract'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function extract(html: string, hasArticle = true): Promise<string> {
  document.body.innerHTML = html
  const root = document.querySelector('article') ?? document.body
  const snapshot = downloadSnapshot(root, hasArticle)
  const result = await extractDownloadPage({ type: 'DOWNLOAD_EXTRACT', html: snapshot, url: 'https://example.com/post', hasArticle })
  return elementToMarkdown(extractedDownloadBody(result, 'https://example.com/post'), undefined, 'download').markdown
}

it('finds a legacy table-layout article without semantic containers or network access', async () => {
  const fetch = vi.fn(() => {
    throw new Error('Unexpected network access')
  })
  vi.stubGlobal('fetch', fetch)
  const markdown = await extract(
    '<nav>Menu only</nav><table><tr><td><h1>Legacy journal</h1><p>A long journal entry about learning in the browser. This is the content that a person came here to read, with a second sentence to make the article recognizable.</p><p>Last journal paragraph.</p></td></tr></table>',
    false,
  )
  expect(markdown).toContain('Legacy journal')
  expect(markdown).toContain('Last journal paragraph')
  expect(markdown).not.toContain('Menu only')
  expect(fetch).not.toHaveBeenCalled()
})

it('removes invisible content before extraction but retains disclosures, comments and code', async () => {
  const markdown = await extract(
    '<article><h1>Notes</h1><p>Visible introduction.</p><div style="display:none">Hidden CSS text</div><details><summary>More</summary><p>Folded detail</p></details><button aria-expanded="false" aria-controls="folded">Expand</button><div id="folded" hidden aria-hidden="true"><p>Folded panel</p></div><div role="tabpanel" hidden>Inactive tab</div><pre><code class="language-ts">const first = 1;\nconst last = 2;</code></pre><div class="comments"><p>Alice: A comment</p><div class="reply"><p>Bob: A reply</p></div></div></article>',
  )
  expect(markdown).toContain('Folded detail')
  expect(markdown).toContain('Folded panel')
  expect(markdown).toContain('Alice: A comment')
  expect(markdown).toContain('Bob: A reply')
  expect(markdown).toContain('const first = 1;\nconst last = 2;')
  expect(markdown).not.toMatch(/Hidden CSS text|Inactive tab|Expand/)
})

it('preserves portable formula, task, footnote and embedded media semantics after standardization', async () => {
  const markdown = await extract(
    '<article><h1>Research</h1><p>Text<sup><a href="#fn1">1</a></sup></p><math display="block" alttext="x^2+y^2"><mi>x</mi></math><ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox">Pending</li></ul><video src="https://example.com/movie.mp4"></video><ol><li id="fn1"><p>Footnote <strong>text</strong></p></li></ol></article>',
  )
  expect(markdown).toContain('$$\nx^2+y^2\n$$')
  expect(markdown).toContain('- [x] Done\n- [ ] Pending')
  expect(markdown).toContain('https://example.com/movie.mp4')
  expect(markdown).toContain('Text[^1]')
  expect(markdown).toContain('[^1]: Footnote **text**')
})

it('does not turn an empty controls-only page into a download', async () => {
  expect(await extract('<nav>Navigation</nav><form><label>Search<input></label><button>Go</button></form><div hidden>Invisible article</div>', false)).toBe('')
})

it('excludes wiki page indicators and sister-site promotions while retaining article figures', async () => {
  const markdown = await extract(
    '<article><div class="mw-indicators"><div class="mw-indicator"><a href="/protection"><img src="https://example.com/protection.png" width="20" height="20" alt="Page protection"></a></div></div><h1>Research</h1><p>Article introduction with an illustrated explanation.</p><figure><img src="https://example.com/diagram.png" width="500" height="300" alt="Article diagram"><figcaption>Explanation of the diagram</figcaption></figure><div class="side-box sistersitebox"><img src="https://example.com/logo.png" alt="Sister site logo"><a href="https://related.example.com">Related site promotion</a></div><p>The final article paragraph.</p></article>',
  )
  expect(markdown).toContain('![Article diagram](https://example.com/diagram.png)')
  expect(markdown).toContain('Explanation of the diagram')
  expect(markdown).toContain('The final article paragraph.')
  expect(markdown).not.toMatch(/protection|Page protection|logo\.png|Sister site|Related site promotion|related\.example/)
})

it('keeps visible wiki formulas whose TeX source lives in a transparent accessibility twin', async () => {
  const markdown = await extract(
    '<article><h1>Math</h1><p>Inline <span class="mwe-math-element mwe-math-element-inline"><span class="mwe-math-mathml-a11y" style="opacity:0"><math alttext="x^2"><mi>x</mi></math></span><img src="https://example.com/equation.svg" alt="x squared"></span></p><span class="mwe-math-element mwe-math-element-display"><span style="opacity:0"><math alttext="a+b"><mi>a</mi></math></span><img src="https://example.com/block.svg" alt="a plus b"></span><span class="mwe-math-element" hidden><math alttext="secret"><mi>x</mi></math></span></article>',
  )
  expect(markdown).toContain('Inline $x^2$')
  expect(markdown).toContain('$$\na+b\n$$')
  expect(markdown).not.toMatch(/equation\.svg|block\.svg|x squared|a plus b|secret/)
})

it('freezes the browser-selected image candidate without loading its URL in a live document', () => {
  document.body.innerHTML =
    '<article><picture><source srcset="https://example.com/wide.png 1000w, https://example.com/small.png 400w"><img src="https://example.com/fallback.png"></picture></article>'
  Object.defineProperty(document.querySelector('img'), 'currentSrc', { value: 'https://example.com/small.png' })
  const snapshot = downloadSnapshot(document.querySelector('article')!, true)
  expect(snapshot).toContain('src="https://example.com/wide.png"')
  expect(snapshot).not.toContain('srcset=')
  expect(extractedDownloadBody(snapshot, 'https://example.com/post').ownerDocument.defaultView).toBeNull()
})

it('preserves shadow-root examples, visual code lines and externally declared language metadata', async () => {
  document.body.innerHTML =
    '<article><h1>Code examples</h1><example-code></example-code><div class="highlight-python3"><div class="highlight"><pre>print(1)</pre></div></div></article>'
  const shadow = document.querySelector('example-code')!.attachShadow({ mode: 'open' })
  shadow.innerHTML = '<pre><code class="language-ts"><span style="display:block">const first = 1;</span><span style="display:block">const last = 2;</span></code></pre>'
  const html = await extractDownloadPage({
    type: 'DOWNLOAD_EXTRACT',
    html: downloadSnapshot(document.querySelector('article')!, true),
    url: 'https://example.com/post',
    hasArticle: true,
  })
  const markdown = elementToMarkdown(extractedDownloadBody(html, 'https://example.com/post'), undefined, 'download').markdown
  expect(markdown).toContain('```ts\nconst first = 1;\nconst last = 2;\n```')
  expect(markdown).toContain('```python3\nprint(1)\n```')
})
