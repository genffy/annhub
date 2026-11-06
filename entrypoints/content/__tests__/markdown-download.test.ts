import { expect, it } from 'vitest'
import { elementToMarkdown } from '../markdown'
import { CONTENT_MAX_CHARS } from '../../../core/validate'

it('retries using tag and role filters before falling back to plain text', () => {
  document.body.innerHTML = '<article><div class="related"><p>Actual <strong>body</strong></p><button>Share</button></div></article>'
  expect(elementToMarkdown(document.querySelector('article')!, undefined, 'download').markdown).toBe('Actual **body**')
})

it('expands disclosures for downloads but keeps hidden tab panels out', () => {
  document.body.innerHTML =
    '<article><p>Visible</p><details><summary>Details</summary><p>Closed detail body</p></details><button aria-controls="panel" aria-expanded="false">Expand</button><div id="panel" hidden aria-hidden="true"><p>Accordion body</p></div><button aria-controls="tab" aria-expanded="false">Tab</button><div id="tab" role="tabpanel" hidden><p>Inactive tab</p></div></article>'
  const article = document.querySelector('article')!
  const download = elementToMarkdown(article, undefined, 'download').markdown
  expect(download).toContain('Closed detail body')
  expect(download).toContain('Accordion body')
  expect(download).not.toContain('Inactive tab')
  const clip = elementToMarkdown(article).markdown
  expect(clip).not.toContain('Closed detail body')
  expect(clip).not.toContain('Accordion body')
})

it('renders TeX once, uses download syntax and escapes literal dollar and tilde characters', () => {
  document.body.innerHTML =
    '<article><p>Cost $5 ~ today <del>old</del> <span class="katex"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math><span aria-hidden="true">duplicate x</span></span></p><math display="block" alttext="a+b"><mi>a</mi><mo>+</mo><mi>b</mi></math></article>'
  const article = document.querySelector('article')!
  const download = elementToMarkdown(article, undefined, 'download').markdown
  expect(download).toContain('Cost \\$5 \\~ today ~~old~~')
  expect(download).toContain('$x^2$')
  expect(download).toContain('$$\na+b\n$$')
  expect(download).not.toContain('duplicate')
  const clip = elementToMarkdown(article).markdown
  expect(clip).toContain('`x^2`')
  expect(clip).toContain('```latex\na+b\n```')
  expect(clip).not.toContain('~~old~~')
})

it('writes references and formatted definitions once, retaining broken references as links', () => {
  document.body.innerHTML =
    '<article><p>Text<sup><a href="#fn1">1</a></sup> again<sup><a href="#fn1">1</a></sup><sup><a href="#fn-missing">2</a></sup></p><ol><li id="fn1"><p>Footnote <strong>body</strong><a class="footnote-backref" href="#ref">Back</a></p></li></ol></article>'
  const article = document.querySelector('article')!
  const download = elementToMarkdown(article, undefined, 'download').markdown
  expect(download).toContain('Text[^1] again[^1]')
  expect(download).toContain('[^1]: Footnote **body**')
  expect(download.match(/Footnote/g)).toHaveLength(1)
  expect(download).not.toContain('Back')
  expect(download).toContain('#fn-missing)')
  expect(elementToMarkdown(article).markdown).toContain('#fn1)')
})

it('reads MathJax source once and retains readable math without TeX as code', () => {
  document.body.innerHTML = '<article><p><span class="MathJax">Rendered</span><script type="math/tex">x+1</script> then <math><mi>y</mi><mo>+</mo><mn>2</mn></math></p></article>'
  const download = elementToMarkdown(document.querySelector('article')!, undefined, 'download').markdown
  expect(download).toBe('$x+1$ then `y+2`')
})

it('downloads long content including nested quotes without applying the storage cap', () => {
  document.body.innerHTML = `<article><blockquote><p>${'Long content. '.repeat(10_000)}</p><p>QUOTE END</p></blockquote><p>ARTICLE END</p></article>`
  const article = document.querySelector('article')!
  const download = elementToMarkdown(article, undefined, 'download')
  expect(download.markdown.length).toBeGreaterThan(CONTENT_MAX_CHARS)
  expect(download.truncated).toBe(false)
  expect(download.markdown).toContain('QUOTE END')
  expect(download.markdown).toContain('ARTICLE END')
  const clip = elementToMarkdown(article)
  expect(clip.markdown.length).toBeLessThanOrEqual(CONTENT_MAX_CHARS)
  expect(clip.truncated).toBe(true)
})

it('retains comment and reply content for downloads while excluding action controls', () => {
  document.body.innerHTML =
    '<article><p>Original post</p><div class="comments"><p>Alice · Monday</p><p>First comment</p><div class="reply"><p>Bob · Tuesday</p><p>Reply content</p><button>Reply</button></div><form>Write a comment</form></div></article>'
  const article = document.querySelector('article')!
  const download = elementToMarkdown(article, undefined, 'download').markdown
  expect(download).toContain('Alice · Monday')
  expect(download).toContain('Bob · Tuesday')
  expect(download).toContain('Reply content')
  expect(download).not.toContain('Write a comment')
  expect(elementToMarkdown(article).markdown).toBe('Original post')
})
