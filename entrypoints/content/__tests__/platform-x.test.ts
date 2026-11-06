import { afterEach, expect, it } from 'vitest'
import { elementToMarkdown } from '../markdown'
import { collectMedia } from '../download-collect'
import { collectFullXArticle, extractXContent, isSemanticXPost } from '../platform-x'

function page(body: string): Element {
  document.head.innerHTML = '<base href="https://x.com/home"><title>Home / X</title>'
  document.body.innerHTML = body
  return document.querySelector('article')!
}
afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

it('assembles semantic posts and one quote, retaining line breaks and only referenced media', () => {
  const root = page(`<article>
    <a href="/alice"><img src="https://pbs.twimg.com/profile_images/avatar.jpg">Alice</a>
    <a href="/alice/status/123"><time datetime="2026-10-01T12:00:00Z">12h</time></a>
    <div style="white-space:pre-wrap">First line\nSecond <a href="/bob">@bob</a> <img alt="🙂" src="https://abs.twimg.com/emoji/v2/svg/face.svg"></div>
    <a href="/alice/status/123/photo/1"><img src="https://pbs.twimg.com/media/chart.jpg" alt="chart"></a>
    <div role="group"><button>Like 99</button><a href="/alice/status/123/analytics">500 views</a></div>
    <article><a href="/bob">Bob</a><a href="/bob/status/456"><time datetime="2026-10-02T12:00:00Z">1h</time></a><div style="white-space:pre-wrap">Quoted text</div><img src="https://pbs.twimg.com/media/quote.jpg"></article>
  </article>`)
  const result = elementToMarkdown(root, undefined, 'download')
  expect(result.platform?.meta).toMatchObject({ title: 'Alice - First line Second @bob', author: ['Alice (@alice)'], published: '2026-10-01' })
  expect(result.markdown).toContain('**Alice** [@alice](https://x.com/alice)')
  expect(result.markdown).toContain('First line  \nSecond [@bob](https://x.com/bob) 🙂')
  expect(result.markdown).toContain('> **Bob**')
  expect(result.markdown).toContain('> Quoted text')
  expect(result.markdown).not.toContain('>>')
  for (const excluded of ['avatar.jpg', 'Like 99', '500 views', '12h', 'face.svg']) expect(result.markdown).not.toContain(excluded)
  expect(collectMedia(root, result.markdown).map(item => item.url)).toEqual(['https://pbs.twimg.com/media/chart.jpg', 'https://pbs.twimg.com/media/quote.jpg'])
  expect(elementToMarkdown(root).markdown).toBe(result.markdown)
})

it('uses the post ID for a media-only title and keeps a streaming video on its source page', () => {
  const root = page(
    '<article><a href="/alice">Alice</a><a href="/alice/status/123">Today</a><video src="blob:https://x.com/video" poster="https://pbs.twimg.com/media/poster.jpg"></video></article>',
  )
  const result = elementToMarkdown(root, undefined, 'download')
  expect(result.platform?.meta.title).toBe('Alice - 123')
  expect(result.markdown).toContain('https://pbs.twimg.com/media/poster.jpg')
  expect(result.markdown).toContain('[视频](https://x.com/alice/status/123)')
  expect(result.markdown).not.toContain('blob:')
})

it('falls back when semantic anchors are absent and does not reinterpret other sites', () => {
  const root = page('<article><p>Generic body</p></article>')
  expect(elementToMarkdown(root).markdown).toBe('Generic body')
  expect(elementToMarkdown(root).platform).toBeUndefined()
  expect(extractXContent(root, 'https://example.com')).toBeUndefined()
})

it('chooses the longest outer article and preserves literal code line breaks', () => {
  page(
    '<main><article><a href="/a/status/123">date</a><div style="white-space:pre-wrap">short</div></article><article><a href="/b">Writer</a><a href="/b/status/456">date</a><h1>Long article</h1><section role="document"><p>A longer article body with enough content.</p><pre><code class="language-js">const a = 1;\nconst b = 2;</code></pre></section></article></main>',
  )
  const result = elementToMarkdown(document.querySelector('main')!, undefined, 'download')
  expect(result.platform?.sourceUrl).toBe('https://x.com/b/status/456')
  expect(result.markdown).toContain('```js\nconst a = 1;\nconst b = 2;\n```')
  expect(result.markdown).not.toContain('short')
})

it('writes one long-article title and normalizes section headings without interface text', () => {
  const root = page(
    '<article><a href="/alice">Alice</a><a href="/alice/status/123"><time datetime="2026-10-01">Today</time></a><h1>Article title</h1><img src="https://pbs.twimg.com/media/cover.jpg"><section role="document"><h3>First section</h3><p>Body <b>text</b></p><h4>Nested</h4><pre><code class="language-ts">const n = 1</code></pre><footer>More articles</footer></section><aside>Followers 999</aside></article>',
  )
  const result = elementToMarkdown(root, undefined, 'download')
  expect(result.platform?.meta.title).toBe('Article title')
  expect(result.markdown).toContain('# Article title')
  expect(result.markdown).toContain('## First section')
  expect(result.markdown).toContain('### Nested')
  expect(result.markdown).toContain('```ts\nconst n = 1')
  expect(result.markdown.match(/^# /gm)).toHaveLength(1)
  expect(result.markdown).not.toContain('More articles')
  expect(result.markdown).not.toContain('Followers')
  expect(result.markdown).not.toContain('**Alice**')
})

it('assembles the hydrated long-form read view: og title, section headings, quote block, no interface rows', () => {
  document.head.innerHTML =
    '<base href="https://x.com/khazix/status/2117776745688646139"><title>Writer on X: "Agent 系统长文" / X</title><meta property="og:title" content="Writer on X: &quot;Agent 系统长文&quot; / X">'
  document.body.innerHTML = `<main><article>
    <a href="/khazix"><img src="https://pbs.twimg.com/profile_images/avatar.jpg">数字生命卡兹克</a>
    <div>
      <article>
        <a href="/khazix/status/2117776745688646139/article/1/media/1"><img src="https://pbs.twimg.com/media/cover.jpg?format=jpg&amp;name=medium" alt="Image"></a>
        <div style="white-space:pre-wrap"><span>Agent 系统长文</span></div>
        <div style="white-space:pre-wrap">14 min read</div>
        <p>周一发了一篇我的Agent自动化系统：</p>
        <a href="/khazix/status/2117776745688646139/analytics">351K</a>
        <article>
          <a href="/khazix">数字生命卡兹克</a>
          <a href="/khazix/status/2117054043868860521"><time datetime="2026-11-02T12:00:00Z">Nov 2</time></a>
          <img src="https://abs.twimg.com/stickers/article-badge.png" alt="Article">
          <div style="white-space:pre-wrap">上一篇的引用摘要</div>
          <img src="https://pbs.twimg.com/media/quotecover.jpg?format=jpg&amp;name=medium">
        </article>
        <p>正文开篇。</p>
        <h1>1. 内核</h1>
        <p><img src="https://pbs.twimg.com/media/body.jpg?format=jpg&amp;name=large" alt="架构图"></p>
        <pre><code>const core = 1</code></pre>
        <div role="status">Want to publish your own Article? <a href="https://x.com/i/premium_sign_up">Upgrade to Plus</a></div>
        <h1>2. 插件</h1>
        <p>插件正文。</p>
      </article>
      <div style="white-space:pre-wrap"><a href="/khazix/status/2117776745688646139"><time datetime="2026-11-04T08:31:00.000Z">8:31 AM · Nov 4, 2026</time></a> · <a href="/khazix/status/2117776745688646139/analytics">351.8K Views</a></div>
      <div role="group"><button>169 Replies. Reply</button><button>285 reposts. Repost</button></div>
    </div>
  </article></main>`
  const result = elementToMarkdown(document.querySelector('main')!, undefined, 'download')
  expect(result.platform?.meta).toMatchObject({ title: 'Agent 系统长文', author: ['数字生命卡兹克 (@khazix)'], published: '2026-11-04' })
  expect(result.platform?.sourceUrl).toBe('https://x.com/khazix/status/2117776745688646139')
  expect(result.markdown).toContain('# Agent 系统长文')
  expect(result.markdown).toContain('![Image](https://pbs.twimg.com/media/cover.jpg?format=jpg&name=medium)')
  expect(result.markdown).toContain('周一发了一篇我的Agent自动化系统：')
  expect(result.markdown).toContain('> **数字生命卡兹克** [@khazix](https://x.com/khazix)')
  expect(result.markdown).toContain('> 上一篇的引用摘要')
  expect(result.markdown).toMatch(/## 1\\?\\. 内核/)
  expect(result.markdown).toContain('![架构图](https://pbs.twimg.com/media/body.jpg?format=jpg&name=large)')
  expect(result.markdown).toContain('```\nconst core = 1\n```')
  expect(result.markdown).toMatch(/## 2\\?\. 插件/)
  expect(result.markdown.match(/^# /gm)).toHaveLength(1)
  expect(result.markdown.match(/Agent 系统长文/g)).toHaveLength(1)
  for (const junk of ['8:31 AM', '351.8K', '351K', '169 Replies', '14 min read', 'Want to publish', 'article-badge', 'profile_images']) expect(result.markdown).not.toContain(junk)
  expect(collectMedia(document.querySelector('main')!, result.markdown).map(item => item.url)).toEqual([
    'https://pbs.twimg.com/media/cover.jpg?format=jpg&name=medium',
    'https://pbs.twimg.com/media/quotecover.jpg?format=jpg&name=medium',
    'https://pbs.twimg.com/media/body.jpg?format=jpg&name=large',
  ])
  document.head.innerHTML = ''
})

it('keeps the legacy long-form shape: header before the title drops, the cover follows the title', () => {
  const root = page(
    `<article>
      <a href="/khazix"><img src="https://pbs.twimg.com/profile_images/avatar.jpg">数字生命卡兹克</a>
      <a href="/khazix/status/2117776745688646139/article/1/media/1"><img src="https://pbs.twimg.com/media/cover.jpg" alt="封面"></a>
      <h1>Agent 系统长文</h1>
      <p>周一发了一篇我的Agent自动化系统：</p>
      <h2>1. 内核</h2>
      <p>内核正文。</p>
      <pre><code>const core = 1</code></pre>
      <article>
        <a href="/khazix">数字生命卡兹克</a>
        <a href="/khazix/status/2117054043868860521">Nov 2</a>
        <div style="white-space:pre-wrap">上一篇的引用摘要</div>
      </article>
    </article>`,
  )
  const result = elementToMarkdown(root, undefined, 'download')
  expect(result.platform?.meta).toMatchObject({ title: 'Agent 系统长文', author: ['数字生命卡兹克 (@khazix)'], published: '2026-11-04' })
  expect(result.markdown).toContain('# Agent 系统长文')
  expect(result.markdown).toContain('![封面](https://pbs.twimg.com/media/cover.jpg)')
  expect(result.markdown).toContain('周一发了一篇我的Agent自动化系统：')
  expect(result.markdown).toMatch(/## 1\\?\\. 内核/)
  expect(result.markdown).toContain('> **数字生命卡兹克**')
  expect(result.markdown).not.toContain('profile_images')
  expect(result.markdown.match(/^# /gm)).toHaveLength(1)
})

it('keeps the meta row and separator out of a post body', () => {
  const root = page(
    `<article>
      <a href="/alice">Alice</a>
      <div style="white-space:pre-wrap"><a href="/alice/status/123"><time datetime="2026-10-01T12:00:00Z">8:31 AM · Oct 1, 2026</time></a> · <a href="/alice/status/123/analytics">347K Views</a></div>
      <div style="white-space:pre-wrap">正文一行</div>
      <div style="white-space:pre-wrap">·</div>
    </article>`,
  )
  const result = elementToMarkdown(root, undefined, 'download')
  expect(result.markdown).toContain('**Alice**')
  expect(result.markdown).toContain('正文一行')
  for (const junk of ['8:31 AM', '347K']) expect(result.markdown).not.toContain(junk)
  expect(result.markdown).not.toMatch(/^\s*·\s*$/m)
  expect(result.platform?.meta.title).toBe('Alice - 正文一行')
})

it('does not re-extract its own assembly on the worker round trip', () => {
  const root = page('<article data-ann-platform=""><h1>Round trip title</h1><p>Body text.</p></article>')
  const result = elementToMarkdown(root, undefined, 'download')
  expect(result.platform).toBeUndefined()
  expect(result.markdown).toContain('# Round trip title')
  expect(result.markdown).toContain('Body text.')
})

it('reads the permalink page whose read view is a sibling of the byline row', () => {
  document.head.innerHTML = '<base href="https://x.com/khazix/status/2117776745688646139"><title>Writer on X: &quot;Agent 系统长文&quot; / X</title>'
  document.body.innerHTML = `<main>
    <article data-testid="tweet"><a href="/khazix">数字生命卡兹克</a><a href="/khazix">Follow</a></article>
    <article data-testid="twitterArticleReadView" role="article">
      <div><div><img src="https://pbs.twimg.com/media/cover.jpg?format=jpg&amp;name=medium" alt="Image"></div></div>
      <div>
        <div><div data-testid="twitter-article-title"><span>Agent 系统长文</span></div></div>
        <div><div role="group"><button>169 Replies. Reply</button></div></div>
        <div data-testid="twitterArticleRichTextView"><div>
          <p>周一发了一篇我的Agent自动化系统：</p>
          <article>
            <a href="/khazix/status/2117054043868860521"><time datetime="2026-11-02T12:00:00Z">Nov 2</time></a>
            <div style="white-space:pre-wrap">上一篇的引用摘要</div>
          </article>
          <h1>1. 内核</h1>
          <pre><code>const core = 1</code></pre>
        </div></div>
        <div><div role="status">Want to publish your own Article?</div></div>
      </div>
    </article>
    <div style="white-space:pre-wrap"><a href="/khazix/status/2117776745688646139"><time datetime="2026-11-04T08:31:00.000Z">8:31 AM · Nov 4, 2026</time></a></div>
  </main>`
  const result = elementToMarkdown(document.querySelector('main')!, undefined, 'download')
  expect(result.platform?.meta).toMatchObject({ title: 'Agent 系统长文', author: ['数字生命卡兹克 (@khazix)'], published: '2026-11-04' })
  expect(result.platform?.sourceUrl).toBe('https://x.com/khazix/status/2117776745688646139')
  expect(result.markdown).toContain('# Agent 系统长文')
  expect(result.markdown).toMatch(/## 1\\?\. 内核/)
  expect(result.markdown).toContain('```\nconst core = 1\n```')
  expect(result.markdown).toContain('> 上一篇的引用摘要')
  // the permalink row and the interface rows render outside the read view body
  expect(result.markdown).not.toContain('8:31 AM')
  expect(result.markdown).not.toContain('169 Replies')
  expect(result.markdown).not.toContain('Want to publish')
  document.head.innerHTML = ''
})

it('reassembles the virtualized read view into one detached article', async () => {
  document.head.innerHTML = '<base href="https://x.com/khazix/status/2117776745688646139"><title>Writer on X: &quot;Agent 系统长文&quot; / X</title>'
  document.body.innerHTML = `<article data-testid="twitterArticleReadView" role="article">
    <div><div data-testid="twitter-article-title"><span>Agent 系统长文</span></div></div>
    <div data-testid="twitterArticleRichTextView"><div>
      <p>周一发了一篇我的Agent自动化系统：</p>
      <h1>1. 内核</h1>
      <p>内核正文。</p>
    </div></div>
  </article>`
  const assembled = await collectFullXArticle(document)
  expect(assembled?.getAttribute('data-testid')).toBe('twitterArticleReadView')
  expect(assembled?.querySelector('[data-testid="twitter-article-title"]')?.textContent).toBe('Agent 系统长文')
  const blocks = [...assembled!.querySelector('[data-testid="twitterArticleRichTextView"]')!.children]
  expect(blocks.map(block => block.textContent)).toEqual(['周一发了一篇我的Agent自动化系统：', '1. 内核', '内核正文。'])
  const result = extractXContent(assembled!)
  expect(result?.meta).toMatchObject({ title: 'Agent 系统长文', published: '2026-11-04' })
  expect(result?.sourceUrl).toBe('https://x.com/khazix/status/2117776745688646139')
  document.head.innerHTML = ''
})

it('recognizes the read view as a semantic post and keeps a nested quote card out', () => {
  document.head.innerHTML = '<base href="https://x.com/khazix/status/2117776745688646139">'
  document.body.innerHTML = `<main>
    <article data-testid="twitterArticleReadView">
      <a href="/khazix/status/2117776745688646139/analytics">351K</a>
      <h1>1. 内核</h1>
      <p>正文。</p>
      <article><h1>引用标题</h1><a href="/khazix/status/2117054043868860521"><time datetime="2026-11-02T12:00:00Z">Nov 2</time></a></article>
    </article>
  </main>`
  expect(isSemanticXPost(document.querySelector('[data-testid="twitterArticleReadView"]')!)).toBe(true)
  expect(isSemanticXPost(document.querySelector('main')!.querySelector('article article')!)).toBe(false)
  document.head.innerHTML = ''
})
