import { beforeEach, describe, expect, it } from 'vitest'
import { elementToMarkdown, escapeText, isPageChrome } from '../markdown'
import { markdownToPlainText } from '../../../learning-core/markdown'
import { fold, PAGE_TEXT_CASES } from '../../../learning-core/__tests__/fixtures/page-text'

/**
 * DOM → Markdown conversion fixtures (capture.md §3.1, RV-CAP-02). jsdom has
 * no layout but full CSSOM defaults, so visibility checks behave.
 */

let doc: Document

beforeEach(() => {
  // the jsdom global document has a defaultView; detached documents do not
  document.body.innerHTML = ''
  doc = document
})

function convert(html: string): string {
  const host = doc.createElement('div')
  host.innerHTML = html
  return elementToMarkdown(host).markdown
}

describe('page chrome detection matches whole words, never substrings', () => {
  it('drops the chrome classes', () => {
    for (const cls of [
      'share-bar',
      'social-share',
      'related-posts',
      'newsletter-signup',
      'subscribe-box',
      'ad-slot',
      'ads',
      'comments',
      'comment-list',
      'breadcrumb',
      'pagination',
      'paywall',
    ]) {
      const el = doc.createElement('div')
      el.className = cls
      doc.body.appendChild(el)
      expect(isPageChrome(el), cls).toBe(true)
      el.remove()
    }
  })

  it('keeps the content classes that merely contain chrome substrings', () => {
    for (const cls of [
      'thread',
      'lazyload',
      'post-head',
      'pad',
      'download',
      'unlike',
      'shared-notes',
      'socialist-history',
      'commentary',
      'spread',
      'ahead',
      'reload',
      'broadcast',
    ]) {
      const el = doc.createElement('div')
      el.className = cls
      doc.body.appendChild(el)
      expect(isPageChrome(el), cls).toBe(false)
      el.remove()
    }
  })

  it('keeps an <img class="lazyload"> (word match, not substring)', () => {
    const html = convert('<div><img class="lazyload" src="https://img.example/a.png" alt="chart" /><p>Body text here.</p></div>')
    expect(html).toContain('![chart](https://img.example/a.png)')
  })

  it('semantic containers are exempt from class heuristics', () => {
    const article = doc.createElement('article')
    article.className = 'share' // a wrapper class on a semantic container is not chrome evidence
    doc.body.appendChild(article)
    expect(isPageChrome(article)).toBe(false)
  })
})

describe('lists', () => {
  it('nests child lists under the parent item, once each', () => {
    const html = convert('<ul><li>parent<ul><li>child one</li><li>child two</li></ul></li><li>sibling</li></ul>')
    expect(html.split('\n')).toEqual(['- parent', '  - child one', '  - child two', '- sibling'])
  })

  it('indents ordered child lists to the content column', () => {
    const html = convert('<ol><li>step<ol><li>sub step</li></ol></li></ol>')
    expect(html.split('\n')).toEqual(['1. step', '   1. sub step'])
  })
})

describe('line breaks', () => {
  it('a <br> is a hard break inside paragraphs and list items', () => {
    expect(convert('<p>line one<br>line two</p>')).toBe('line one  \nline two')
    expect(convert('<ul><li>first<br>second</li></ul>')).toBe('- first  \nsecond')
  })

  it('a <br> inside a table cell collapses to one line', () => {
    const html = convert('<table><tr><th>Name</th><th>Note</th></tr><tr><td>Bob</td><td>first line<br>second line</td></tr></table>')
    const rows = html.split('\n')
    expect(rows).toHaveLength(3)
    expect(rows[2]).toBe('| Bob | first line second line |')
  })
})

describe('text escaping (capture.md §3.1)', () => {
  it('escapes literal markdown characters', () => {
    expect(convert('<p>Use * for pointers; 2*3*4.</p>')).toBe('Use \\* for pointers; 2\\*3\\*4.')
    expect(convert('<p># not a heading</p>')).toBe('\\# not a heading')
    expect(convert('<p>- not a list</p>')).toBe('\\- not a list')
    expect(convert('<p>1. not ordered</p>')).toBe('1\\. not ordered')
    expect(convert('<p>&gt; not a quote</p>')).toBe('\\> not a quote')
    expect(convert('<p>brackets [x] and &lt;tags&gt;</p>')).toBe('brackets \\[x\\] and \\<tags\\>')
    expect(convert('<p>a `tick</p>')).toBe('a \\`tick')
  })

  it('leaves word-internal underscores alone but escapes boundary runs', () => {
    expect(escapeText('user_id and MAX_RETRIES')).toBe('user_id and MAX_RETRIES')
    expect(convert('<p>call __init__ once</p>')).toContain('\\_\\_init')
    expect(convert('<p>call __init__ once</p>')).not.toMatch(/(?<!\\)\*\*|\*\*init/)
  })

  it('real emphasis still converts', () => {
    expect(convert('<p>very <b>bold</b> and <i>italic</i></p>')).toBe('very **bold** and *italic*')
  })

  it('round trips ordered markers, literal highlight marks and backslashes', () => {
    for (const text of ['1. First step', '10. ten', '1) paren', 'if a == b and c == d', 'path \\_name and \\*']) {
      const element = document.createElement('p')
      element.textContent = text
      const markdown = elementToMarkdown(element).markdown
      expect(markdownToPlainText(markdown)).toBe(text)
    }
    expect(convert('<p>if a == b</p>')).toBe('if a =\\= b')
    expect(convert('<p>path \\_name</p>')).toContain('\\\\')
  })
})

describe('code', () => {
  it('inline code containing backticks uses a longer fence', () => {
    expect(convert('<p>run <code>a`b</code> now</p>')).toBe('run ``a`b`` now')
  })

  it('a fence outruns the longest backtick run in the block', () => {
    const html = convert('<pre><code>code with ``` inside\nsecond line</code></pre>')
    expect(html.split('\n')).toEqual(['````', 'code with ``` inside', 'second line', '````'])
  })
})

describe('links', () => {
  it('percent-encodes parentheses so the inline form stays parseable', () => {
    expect(convert('<p><a href="https://example.com/Foo_(bar)">docs</a></p>')).toBe('[docs](https://example.com/Foo_%28bar%29)')
  })
})

describe('block slices (heading-bounded sections)', () => {
  it('converts only the sibling run', () => {
    const host = doc.createElement('div')
    host.innerHTML = `<h2>Alpha</h2><p>Alpha body text here.</p><h2>Beta</h2><p>Beta body text here.</p>`
    doc.body.appendChild(host)
    const from = host.children[0]!
    const to = host.children[2]!
    const markdown = elementToMarkdown(host, { from, to }).markdown
    expect(markdown).toContain('Alpha body')
    expect(markdown).not.toContain('Beta body')
  })
})

describe('shared page-text fixtures: the converter writes the pinned Markdown and search reads the words back (RV-CORE-04)', () => {
  for (const fixture of PAGE_TEXT_CASES) {
    it(fixture.name, () => {
      expect(convert(fixture.html), 'converted Markdown').toBe(fixture.markdown)
      expect(fold(markdownToPlainText(fixture.markdown)), 'plain text').toBe(fixture.visible)
    })
  }
})

describe('page furniture that class detection cannot see (真机走查 P2-3)', () => {
  it('drops edit/help/share UI links wherever they appear', () => {
    const md = convert(`
      <p>Intro paragraph with real content.</p>
      <p><a href="/edit">Edit this page</a></p>
      <p><a href="/e">[edit]</a></p>
      <p><a href="/feedback">Was this helpful?</a></p>
      <p><a href="/q">View quotes</a></p>
    `)
    expect(md).toContain('Intro paragraph')
    expect(md).not.toContain('Edit this page')
    expect(md).not.toContain('[edit]')
    expect(md).not.toContain('Was this helpful')
    expect(md).not.toContain('View quotes')
  })

  it('drops view-count and duration blocks and links (X)', () => {
    const md = convert(`
      <article data-testid="tweet"><p>The post body says something real.</p>
        <a href="/analytics">6.3M Views</a><a href="/analytics">10M</a><span>0:03</span>
      </article>
    `)
    expect(md).toContain('post body')
    expect(md).not.toContain('6.3M Views')
    expect(md).not.toContain('10M')
    expect(md).not.toContain('0:03')
  })

  it('drops Medium sign-in and subscribe blocks', () => {
    const md = convert(`
      <p>Article closing paragraph.</p>
      <div><span>Remember me for faster sign in</span></div>
      <div><h3>Get Dan Abramov’s stories in your inbox</h3></div>
    `)
    expect(md).toContain('closing paragraph')
    expect(md).not.toContain('faster sign in')
    expect(md).not.toContain('stories in your inbox')
  })
})

describe('highlighted code blocks', () => {
  it('recovers the lines when each line is its own span (Docusaurus/Prism)', () => {
    const md = convert(`
      <pre><code class="language-js"><span class="token-line"><span>const a = 1</span></span><span class="token-line"><span>const b = 2</span></span></code></pre>
    `)
    expect(md).toContain('const a = 1\nconst b = 2')
  })

  it('keeps ordinary pre text untouched', () => {
    expect(convert('<pre><code>plain\nlines</code></pre>')).toContain('plain\nlines')
  })

  it('a figure carrying code instead of a picture still yields the code (Overreacted)', () => {
    const md = convert(`
      <figure><pre><code class="language-js">useEffect(() => {})</code></pre><figcaption>The effect hook</figcaption></figure>
    `)
    expect(md).toContain('useEffect')
    expect(md).toContain('The effect hook')
  })
})

describe('open shadow roots carry content (MDN, 真机走查 P2-3)', () => {
  it('converts the code inside an empty host element', () => {
    const host = doc.createElement('div')
    const shadowHost = doc.createElement('div')
    host.appendChild(shadowHost)
    host.insertAdjacentHTML('beforeend', '<p>After the example.</p>')
    const shadow = shadowHost.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<pre><code class="language-js">fetch(url)</code></pre>'
    const md = elementToMarkdown(host).markdown
    expect(md).toContain('fetch(url)')
    expect(md).toContain('After the example.')
  })
})
