import { beforeEach, describe, expect, it } from 'vitest'
import { elementToMarkdown, escapeText, isPageChrome } from '../markdown'

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
    expect(convert('<p>1. not ordered</p>')).toBe('\\1. not ordered')
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
