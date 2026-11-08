import { test, expect } from './fixtures'
import { readFile } from 'node:fs/promises'
import { ensureServiceWorker, getCapturePageUrl, setSettings, stopServiceWorker, triggerBlockMode } from './helpers'

/**
 * download.md §2 (the page entrances) and §4–§5 (what lands): the capsule's
 * 下载, block mode's `D`, the popup's 下载本页正文 and the unbound command all
 * produce the same folder under the browser's download directory — Markdown
 * first in the run, media files by slot name, links by the files' real
 * names. One download at a time; cancel leaves nothing behind.
 */

const ARTICLE_URL = `${getCapturePageUrl().replace(/capture\.html$/, '')}download-article.html`
/** One article, one medium whose bytes arrive slowly: the run is cancellable while it is on its way. */
const SLOW_URL = `${getCapturePageUrl().replace(/capture\.html$/, '')}download-slow.html`
/** One good picture, one that 404s, and a page-chrome picture the converter drops. */
const PARTIAL_URL = `${getCapturePageUrl().replace(/capture\.html$/, '')}download-partial.html`

function notice(page: import('@playwright/test').Page) {
  return page.locator('[data-ann-ui="download-notice"]')
}

/**
 * The run's landed downloads: what the download manager holds for this test's
 * fresh profile. Playwright's interception renames the files, so the spec
 * asserts kinds, contents and the links-to-names consistency, not the
 * AnnHub/ folder shape itself — that one is a real-machine item (roadmap.md
 * §5, download.md §9, Q-25).
 */
async function landed(page: import('@playwright/test').Page): Promise<{ mime: string; url: string; name: string; path: string }[]> {
  const worker = await ensureServiceWorker(page.context())
  return worker.evaluate(async () =>
    (await chrome.downloads.search({}))
      .filter(item => item.state === 'complete' && item.byExtensionId === chrome.runtime.id)
      .map(item => ({ mime: item.mime ?? '', url: item.url ?? '', name: (item.filename ?? '').split(/[\\/]/).pop() ?? '', path: item.filename })),
  )
}

/** Every Markdown text a run wrote: the worker encodes the folder form's Markdown as a data: URL (dataUrlOf). */
function markdownsOf(items: { mime: string; url: string }[]): string[] {
  return items
    .filter(item => item.mime === 'text/markdown' || item.url.startsWith('data:text/markdown'))
    .map(item => (item.url.startsWith('data:text/markdown') ? Buffer.from(item.url.split(',')[1] ?? '', 'base64').toString('utf8') : ''))
    .filter(text => text.length > 0 || items.length === 0)
}
/** The folder form's Markdown text, read from the file it landed as (blob: URLs carry no text). */
async function markdownFromFile(page: import('@playwright/test').Page): Promise<string> {
  const files = (await landed(page)).filter(item => item.mime === 'text/markdown' || item.url.startsWith('data:text/markdown'))
  return readFile(files[files.length - 1]!.path, 'utf8')
}

function markdownOf(items: { mime: string; url: string }[]): string {
  return markdownsOf(items)[0] ?? ''
}

/** The popup's road: the page's main article (download.md §2.3). */
async function downloadMainArticle(page: import('@playwright/test').Page, via = 'popup'): Promise<void> {
  const worker = await ensureServiceWorker(page.context())
  await worker.evaluate(
    async payload => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === payload.url)
      if (tab?.id !== undefined) await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_DOWNLOAD_MAIN', via: payload.via }, { frameId: 0 })
    },
    { url: page.url(), via },
  )
}

async function waitForDoneNotice(page: import('@playwright/test').Page, text: string): Promise<void> {
  await expect.poll(async () => notice(page).textContent(), { timeout: 20_000 }).toContain(text)
}

test.describe('page downloads (download.md §2, §4, §5)', () => {
  for (const interruption of ['worker restart', 'offscreen closure'] as const) {
    test(`an active download fails clearly after ${interruption} and retry can start again`, async ({ page }) => {
      test.slow()
      await page.goto(SLOW_URL)
      await startSlowDownload(page)
      await expect(notice(page)).toContainText('正在下载')
      if (interruption === 'worker restart') await stopServiceWorker(page.context(), page)
      else {
        const worker = await ensureServiceWorker(page.context())
        await worker.evaluate(() => chrome.offscreen.closeDocument())
      }
      await expect(notice(page)).toContainText('下载失败', { timeout: 20_000 })
      await notice(page).getByRole('button', { name: '重试' }).click()
      await expect(notice(page)).toContainText('正在下载')
      await notice(page).getByRole('button', { name: '取消' }).click()
      await expect(notice(page)).toContainText('已取消下载')
    })
  }

  test('downloads ordered figures, rectangular tables and list semantics with matching media files', async ({ page }) => {
    await page.goto(ARTICLE_URL)
    await page.locator('#post').evaluate(el => {
      el.innerHTML =
        '<h1>Structured article</h1><figure><img src="http://media.annhub.test:8173/download-media.png"><blockquote><p>Between charts</p></blockquote><img src="http://media.annhub.test:8173/download-media.png?second"><figcaption>Both charts</figcaption></figure><table><caption>Scores</caption><tr><th rowspan="2">Name</th><th colspan="2">Values</th></tr><tr><th>A</th><th>B</th></tr><tr><td>Item</td><td colspan="2"><p>First</p><p>Second</p></td></tr></table><ol start="3"><li><p>First item</p></li><li>Second item</li></ol><ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox">Pending</li></ul><dl><dt>Term</dt><dd>Definition</dd></dl><p>10<sup>8</sup> and <video src="http://media.annhub.test:8173/download-media.mp4"></video></p><aside role="note"><p>Remember <strong>this</strong></p></aside>'
    })
    await downloadMainArticle(page)
    await waitForDoneNotice(page, '已下载')
    const items = await landed(page)
    const markdown = markdownOf(items)
    expect(markdown).toContain('> Between charts')
    expect(markdown).toContain('*Both charts*')
    expect(markdown).toContain('|   | A | B |')
    expect(markdown).toContain('| Item | First / Second |   |')
    expect(markdown).toContain('3. First item\n4. Second item')
    expect(markdown).toContain('- [x] Done\n- [ ] Pending')
    expect(markdown).toContain('**Term**\n\nDefinition')
    expect(markdown).toContain('10⁸')
    expect(markdown).toContain('> Remember **this**')
    const links = [...markdown.matchAll(/\]\(assets\/([^)]+)\)/g)].map(match => match[1])
    expect(links).toHaveLength(3)
    for (const link of links) expect(items.some(item => item.name === link)).toBe(true)
  })

  test('downloads structured metadata and cover information without fetching the cover', async ({ page }) => {
    await page.goto(ARTICLE_URL)
    await page.evaluate(() => {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.textContent = JSON.stringify({ '@type': 'Article', 'author': { name: 'Structured author' }, 'datePublished': '2026-10-01', 'description': 'Structured description' })
      document.head.append(script)
      for (const [property, content] of [
        ['og:site_name', 'Example site'],
        ['og:image', 'http://media.annhub.test:8173/cover-never-fetch.png'],
      ]) {
        const meta = document.createElement('meta')
        meta.setAttribute('property', property!)
        meta.content = content!
        document.head.append(meta)
      }
      document.documentElement.lang = 'en'
    })
    await downloadMainArticle(page)
    await waitForDoneNotice(page, '已下载')
    const items = await landed(page)
    expect(markdownsOf(items)).toHaveLength(1)
    const markdown = markdownOf(items)
    expect(markdown).toContain("author:\n  - 'Structured author'")
    expect(markdown).toContain('published: 2026-10-01')
    expect(markdown).toContain("site: 'Example site'")
    expect(markdown).toContain("language: 'en'")
    expect(markdown).toContain("image: 'http://media.annhub.test:8173/cover-never-fetch.png'")
    expect(items.filter(item => item.mime === 'image/png')).toHaveLength(2)
  })

  test('downloads folded content, formulas, strike-through and footnotes in portable Markdown', async ({ page }) => {
    await page.goto(ARTICLE_URL)
    await page.locator('#post').evaluate(el => {
      el.innerHTML =
        '<h1>Research notes</h1><details><summary>Derivation</summary><p>Folded body <del>obsolete</del> costs $5 ~ today</p></details><button aria-controls="panel" aria-expanded="false">Expand</button><div id="panel" hidden aria-hidden="true"><p>Accordion text</p></div><math display="block" alttext="x^2+y^2"><mi>x</mi></math><p>Source<sup><a href="#fn1">1</a></sup></p><ol><li id="fn1"><p>Footnote <strong>text</strong></p></li></ol><div role="tabpanel" hidden>Inactive tab</div>'
    })
    await downloadMainArticle(page)
    await waitForDoneNotice(page, '已下载')
    const markdown = markdownOf(await landed(page))
    expect(markdown).toContain('Folded body ~~obsolete~~ costs \\$5 \\~ today')
    expect(markdown).toContain('Accordion text')
    expect(markdown).toContain('$$\nx^2+y^2\n$$')
    expect(markdown).toContain('Source[^1]')
    expect(markdown).toContain('[^1]: Footnote **text**')
    expect(markdown).not.toContain('Inactive tab')
  })

  test('page downloads preserve long text and comment replies beyond the clip storage limit', async ({ page }) => {
    await page.goto(ARTICLE_URL)
    await page.locator('#post').evaluate(el => {
      el.innerHTML = `<h1>Long article</h1><p>${'Long content. '.repeat(10_000)}</p><div class="comments"><p>Alice: Last comment</p><div class="reply"><p>Bob: Last reply</p><button>Reply action</button></div></div><p>ARTICLE END</p>`
    })
    await downloadMainArticle(page)
    await waitForDoneNotice(page, '已下载')
    // Read the landed file: the folder form's Markdown is a data: URL and decodes whole, but the file is the truth.
    const markdown = await markdownFromFile(page)
    expect(markdown.length).toBeGreaterThan(100_000)
    expect(markdown).toContain('Alice: Last comment')
    expect(markdown).toContain('Bob: Last reply')
    expect(markdown).toContain('ARTICLE END')
    expect(markdown).not.toContain('Reply action')
  })

  test('a Markdown past the data-URL limit still lands whole (folder form, RV-DL-02)', async ({ page }) => {
    await page.goto(ARTICLE_URL)
    // about 3.8 MB of converted Markdown on the data: URL path — the regression case for RV-DL-02: Chromium's
    // downloads API lands data: URLs of this size whole, and this stays green if that ever changes
    await page.locator('#post').evaluate(el => {
      el.innerHTML = `<h1>Very long article</h1><p>${'Very long page content. '.repeat(160_000)}</p><p>LONGPAGE END</p>`
    })
    await downloadMainArticle(page)
    await waitForDoneNotice(page, '已下载')
    const markdown = await markdownFromFile(page)
    expect(Buffer.byteLength(markdown)).toBeGreaterThan(3_000_000)
    expect(markdown).toContain('# Very long article')
    expect(markdown).toContain('LONGPAGE END')
  })

  test('a failed large srcset candidate falls back and still produces a complete download', async ({ page }) => {
    await page.goto(ARTICLE_URL)
    await page.locator('#chart').evaluate(el => {
      el.setAttribute('srcset', 'http://media.annhub.test:8173/missing-large.png 2000w, http://media.annhub.test:8173/download-media.png 640w')
    })
    await downloadMainArticle(page)
    await waitForDoneNotice(page, '已下载')
    const items = await landed(page)
    expect(items.filter(item => item.mime === 'image/png')).toHaveLength(2)
    expect(markdownsOf(items)).toHaveLength(1)
    const markdown = markdownOf(items)
    expect(markdown).not.toContain('missing-large.png')
    expect([...markdown.matchAll(/\]\(assets\/([^)]+)\)/g)]).toHaveLength(3)
  })

  test("the capsule's 下载 turns the hovered article into a Markdown folder with its media", async ({ page }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    // rest the pointer on the article: the capsule appears with the download segment — the capsule has four actions
    await page.locator('#post h1').hover()
    const capsule = page.locator('[data-ann-ui="block-capsule"]')
    await expect(capsule).toBeVisible()
    // icon-only: the name is the accessible label and the tooltip (capture.md §6.2)
    await expect(capsule.getByRole('button', { name: '下载' })).toBeVisible()
    await expect(capsule.locator('.ann-blk-sub')).toHaveCount(1)
    await capsule.getByRole('button', { name: '下载' }).click()

    await waitForDoneNotice(page, '已下载')
    const items = await landed(page)
    // media land by their response kind (download.md §4.2): two pictures, one video; the tracker and the embed stay out
    expect(items.filter(item => item.mime === 'image/png')).toHaveLength(2)
    expect(items.filter(item => item.mime === 'video/mp4')).toHaveLength(1)

    // the Markdown: frontmatter with the page's meta; media link to assets/ by the names their files landed under (§4.3)
    const markdown = markdownOf(items)
    expect(markdown).toContain("title: 'Exponential backoff, in practice'")
    expect(markdown).toContain('author:')
    expect(markdown).toContain('published: 2026-10-12')
    const assetLinks = [...markdown.matchAll(/\]\(assets\/([^)]+)\)/g)].map(match => match[1]!)
    expect(assetLinks).toHaveLength(3)
    // the 清单与链接一致 acceptance (§9): every linked file is one the browser downloaded
    for (const link of assetLinks) expect(items.some(item => item.name === link)).toBe(true)
    // the embedded player stays a link to its address (§5.2)
    expect(markdown).toContain('](https://videos.example.com/embed/talk)')

    // the run records its one local metric, without addresses or titles (download.md §7)
    const worker = await ensureServiceWorker(page.context())
    await expect
      .poll(async () => worker.evaluate(async () => JSON.stringify((await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] ?? {})), { timeout: 10_000 })
      .toContain('download.completed')
    const metrics = await worker.evaluate(async () => JSON.stringify((await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] ?? {}))
    expect(metrics).toContain('via=capsule')
    expect(metrics).toContain('result=ok')
    expect(metrics).toContain('source=page')
    expect(metrics).toContain('scope=block')
  })

  test("block mode's D downloads the keyboard's target", async ({ page }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await page.locator('#post h1').click()
    await triggerBlockMode(page)
    const status = page.locator('[data-ann-ui="block-mode-capsule"]')
    await expect(status).toBeVisible()
    // the hint names D among its actions (download.md §2.2)
    await expect(status.locator('.ann-block-mode-hint')).toContainText('D')
    await page.keyboard.press('d')
    await waitForDoneNotice(page, '已下载')
    const items = await landed(page)
    expect(items.filter(item => item.url.startsWith('data:text/markdown'))).toHaveLength(1)
  })

  /** The popup's road on the slow page: the main article, whose one medium arrives slowly. */
  async function startSlowDownload(page: import('@playwright/test').Page): Promise<void> {
    const worker = await ensureServiceWorker(page.context())
    await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === url)
      if (tab?.id !== undefined) await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'popup' }, { frameId: 0 })
    }, page.url())
  }

  test('a second download while one runs is refused with the busy notice', async ({ page }) => {
    test.slow()
    await page.goto(SLOW_URL)
    await startSlowDownload(page)
    await expect(notice(page)).toContainText('正在下载')
    // a second entrance while the first runs: the page hears 上一个还在进行 (§2.5), and the running bar keeps its cancel
    await startSlowDownload(page)
    await expect(notice(page)).toContainText('上一个下载还在进行')
    await notice(page).getByRole('button', { name: '取消' }).click()
    await expect(notice(page)).toContainText('已取消下载')
  })

  test('cancel stops the run and leaves no Markdown behind (§2.5)', async ({ page }) => {
    test.slow()
    await page.goto(SLOW_URL)
    await startSlowDownload(page)
    await expect(notice(page)).toContainText('正在下载')
    await notice(page).getByRole('button', { name: '取消' }).click()
    await expect(notice(page)).toContainText('已取消下载')
    // nothing of this run stays: no Markdown landed for it (cancel undid the run's files)
    await expect.poll(async () => (await landed(page)).filter(item => item.url.startsWith('data:text/markdown')).length, { timeout: 10_000 }).toBe(0)
  })

  test('a replacement cancelled while the slow medium is still fetching keeps the first download whole (RV-DL-01)', async ({ page }) => {
    test.slow()
    await page.goto(SLOW_URL)
    // the first download of this page completes: one Markdown, one medium on the disk
    await startSlowDownload(page)
    await waitForDoneNotice(page, '已下载')
    const first = await landed(page)
    const firstMarkdown = markdownOf(first)
    const firstMedium = first.find(item => item.mime === 'image/png')!
    expect(firstMarkdown).toContain('Slow post')

    // the same page again, cancelled while the medium is still on its way (download.md §2.5)
    await startSlowDownload(page)
    await expect(notice(page)).toContainText('正在下载')
    await notice(page).getByRole('button', { name: '取消' }).click()
    await expect(notice(page)).toContainText('已取消下载')
    const afterCancel = await landed(page)
    expect(afterCancel.filter(item => item.url.startsWith('data:text/markdown'))).toHaveLength(1)
    expect(afterCancel.filter(item => item.mime === 'image/png')).toHaveLength(1)
    expect(markdownOf(afterCancel), 'the first Markdown is untouched').toBe(firstMarkdown)
    await expect(readFile(firstMedium.path), 'the first medium is still on the disk').resolves.toBeInstanceOf(Buffer)

    // a third run of the same source completes: the new Markdown links exactly the files that landed for it
    // (the folder's on-disk shape — the sweep of the first version's files — is a real-machine item, Q-25)
    await startSlowDownload(page)
    await waitForDoneNotice(page, '已下载')
    const third = await landed(page)
    // the history is newest first: the newest Markdown is this run's
    const newestMarkdown = markdownOf([third.find(item => item.url.startsWith('data:text/markdown'))!])
    const assetLink = /!\[[^\]]*\]\(assets\/([^)]+)\)/.exec(newestMarkdown)?.[1]
    expect(assetLink).toBeTruthy()
    const linked = third.filter(item => item.name === assetLink)
    expect(linked).toHaveLength(1)
    await expect(readFile(linked[0]!.path)).resolves.toBeInstanceOf(Buffer)
    expect(linked[0]!.name, 'the replacement writes beside the old medium, never over it').not.toBe(firstMedium.name)
  })

  test("the popup's 下载本页正文 downloads the page's main article (§2.3)", async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    const popup = await page.context().newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    const button = popup.locator('[data-ann-ui="popup-download"]')
    await expect(button).toBeVisible()
    // opened as a tab, the popup itself is the active tab: the entry is honestly disabled with its reason
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('title', '此页面不能下载')
    // the button's own road: the message the popup sends to the page's top frame
    await popup.evaluate(async articleUrl => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === articleUrl)
      if (tab?.id !== undefined) await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'popup' }, { frameId: 0 })
    }, page.url())
    await popup.close()
    await waitForDoneNotice(page, '已下载')
    const items = await landed(page)
    expect(items.filter(item => item.url.startsWith('data:text/markdown')).length).toBeGreaterThan(0)
  })

  test('one media that cannot be fetched keeps its address and is listed in the README (§5.4)', async ({ page }) => {
    test.slow()
    await page.goto(PARTIAL_URL)
    await downloadMainArticle(page)
    await expect(notice(page)).toContainText('部分下载：1 项媒体未保存', { timeout: 20_000 })
    await expect(notice(page).getByRole('button', { name: '显示文件' })).toBeVisible()

    const items = await landed(page)
    const markdowns = markdownsOf(items)
    const markdown = markdowns.find(text => text.includes('title:')) ?? ''
    const readme = markdowns.find(text => text.includes('# 下载说明')) ?? ''
    // the fetched picture is a relative link to the file that landed (Playwright renames it); the missing one keeps its address
    const assetLink = /!\[\]\(assets\/([^)]+)\)/.exec(markdown)?.[1]
    expect(assetLink).toBeTruthy()
    expect(assetLink).toBe(items.find(item => item.mime === 'image/png')?.name)
    expect(markdown).toContain('/not-there.png')
    // the README lists the address and a stable reason; the page-chrome picture was never fetched
    expect(readme).toContain('/not-there.png')
    expect(readme).toContain('取回失败')
    expect(markdown).not.toContain('?share')
    expect(readme).not.toContain('?share')
    expect(items.filter(item => item.mime === 'image/png')).toHaveLength(1)
  })

  test("the settings' ZIP form lands one archive instead of the folder (§4.1)", async ({ page }) => {
    test.slow()
    await setSettings(page.context(), { downloadForm: 'zip' })
    await page.goto(ARTICLE_URL)
    await page.locator('#post h1').hover()
    const capsule = page.locator('[data-ann-ui="block-capsule"]')
    await expect(capsule).toBeVisible()
    await capsule.getByRole('button', { name: '下载' }).click()
    await waitForDoneNotice(page, '已下载')

    const items = await landed(page)
    expect(items).toHaveLength(1)
    expect(items[0]!.mime).toMatch(/zip/)
  })

  test('a controls-only page says no body was found (§2.4, Q-30)', async ({ page }) => {
    await page.goto(`${getCapturePageUrl().replace(/capture\.html$/, '')}pricing.html`)
    await page.evaluate(() => {
      document.body.innerHTML = '<nav>Navigation</nav><form><label>Search<input></label><button>Go</button></form><p hidden>Hidden content</p>'
    })
    // Q-30 permits a body fallback; only truly empty content gets this notice.
    const worker = await ensureServiceWorker(page.context())
    await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === url)
      if (tab?.id !== undefined) await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'command' }, { frameId: 0 })
    }, page.url())
    await expect(notice(page)).toContainText('没找到正文')
  })

  test('downloads a legacy layout and a plain body without article/main containers (Q-29, Q-30)', async ({ page }) => {
    await page.goto(ARTICLE_URL)
    for (const markup of [
      '<table><tr><td><h1>Legacy journal</h1><p>Learning from the web starts with keeping useful observations and their source. This journal records a complete paragraph that should survive extraction from an old table layout.</p><p>JOURNAL END</p></td></tr></table>',
      '<div><h1>Plain body</h1><p>Short standalone note.</p><p>JOURNAL END</p></div>',
    ]) {
      await page.evaluate(html => {
        document.body.innerHTML = `<nav>Menu only</nav>${html}<div style="display:none">Hidden CSS content</div>`
      }, markup)
      await downloadMainArticle(page)
      await waitForDoneNotice(page, '已下载')
      const markdown = markdownOf((await landed(page)).slice(-1))
      expect(markdown).toContain('JOURNAL END')
      expect(markdown).not.toMatch(/Menu only|Hidden CSS content/)
    }
  })
})
