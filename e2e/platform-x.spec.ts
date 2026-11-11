import type { TabMessage } from '../types/messages'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { ensureServiceWorker, getEntries, triggerBlockMode, waitForClipToast } from './helpers'

// The fixture origin is mobile.x.com, not x.com: Chrome preloads HSTS for
// x.com, so an http://x.com navigation is upgraded to https before Playwright's
// route can match, and the https page would auto-upgrade the http fixture media
// to an address the http-only test server cannot serve. mobile.x.com passes the
// platform rules (capture.md §3.2) and stays on http end to end.
// The page's own image loads are answered by a route, not the network: the
// fixture media maps to loopback and Private Network Access blocks page
// subresources to it from a public origin, whose console errors would fail the
// pageErrors guard. The offscreen media fetch is an extension request these
// routes never see and keeps using the mapped fixture server.
async function routeFixtureMedia(page: Page): Promise<void> {
  await page.route('http://media.annhub.test:8173/**', route => route.fulfill({ path: fileURLToPath(new URL('./download-media.png', import.meta.url)), contentType: 'image/png' }))
}

test('X semantic posts share content and metadata between block clipping and downloading', async ({ page }) => {
  await routeFixtureMedia(page)
  await page.route('http://mobile.x.com/home', route => route.fulfill({ path: fileURLToPath(new URL('./x-platform.html', import.meta.url)), contentType: 'text/html' }))
  await page.goto('http://mobile.x.com/home')
  await page.locator('#post').focus()
  await triggerBlockMode(page)
  await expect(page.locator('[data-ann-ui="block-mode-capsule"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await waitForClipToast(page)
  const [entry] = await getEntries(page.context())
  expect(entry!.properties.title).toBe('Alice - First line Second line with @bob')
  expect(entry!.properties.author).toEqual(['Alice (@alice)'])
  expect(entry!.properties.published).toBe('2026-10-01')
  expect(entry!.sourceUrl).toBe('http://mobile.x.com/alice/status/123')
  expect(entry!.content).toContain('First line  \nSecond line with [@bob]')
  expect(entry!.content).toContain('> **Bob**')
  expect(entry!.content).not.toContain('500 views')

  const worker = await ensureServiceWorker(page.context())
  await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({})).find(item => item.url === 'http://mobile.x.com/home')!
    await chrome.tabs.sendMessage(tab.id!, { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'popup' } satisfies TabMessage, { frameId: 0 })
  })
  await expect(page.locator('[data-ann-ui="download-notice"]')).toContainText('已下载', { timeout: 20_000 })
  const files = await worker.evaluate(async () => (await chrome.downloads.search({})).filter(item => item.state === 'complete'))
  const markdownFile = files.find(item => item.url.startsWith('data:text/markdown'))!
  const markdown = await readFile(markdownFile.filename, 'utf8')
  expect(markdown).toContain("title: 'Alice - First line Second line with @bob'")
  expect(markdown).toContain("source: 'http://mobile.x.com/alice/status/123'")
  expect(markdown).toContain('First line  \nSecond line with [@bob]')
  expect(markdown).toContain('> **Bob**')
  expect(files.filter(item => item.mime === 'image/png')).toHaveLength(2)
  expect([...markdown.matchAll(/\]\(assets\/([^)]+)\)/g)]).toHaveLength(2)
  expect(await getEntries(page.context())).toHaveLength(1)
})

test('downloads the X long article as one title, section headings and a quote block', async ({ page }) => {
  await routeFixtureMedia(page)
  await page.route('http://mobile.x.com/writer/status/2013045749580259680', route =>
    route.fulfill({ path: fileURLToPath(new URL('./x-article.html', import.meta.url)), contentType: 'text/html' }),
  )
  await page.goto('http://mobile.x.com/writer/status/2013045749580259680')

  const worker = await ensureServiceWorker(page.context())
  await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({})).find(item => item.url === 'http://mobile.x.com/writer/status/2013045749580259680')!
    await chrome.tabs.sendMessage(tab.id!, { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'popup' } satisfies TabMessage, { frameId: 0 })
  })
  await expect(page.locator('[data-ann-ui="download-notice"]')).toContainText('已下载', { timeout: 20_000 })
  const files = await worker.evaluate(async () => (await chrome.downloads.search({})).filter(item => item.state === 'complete'))
  const markdownFile = files.find(item => item.url.startsWith('data:text/markdown'))!
  const markdown = await readFile(markdownFile.filename, 'utf8')
  expect(markdown).toContain("title: 'Agent 系统长文'")
  expect(markdown).toContain("author:\n  - 'Writer (@writer)'")
  expect(markdown).toContain('published: 2026-11-04')
  expect(markdown.match(/^# /gm)).toHaveLength(1)
  expect(markdown).toContain('# Agent 系统长文')
  expect(markdown).toMatch(/## 1\\?\. 内核/)
  expect(markdown).toMatch(/## 2\\?\. 万物皆插件/)
  expect(markdown).toContain('> **Writer** [@writer](http://mobile.x.com/writer)')
  expect(markdown).toContain('> 上一篇的引用摘要。')
  expect(markdown).toContain('```\nconst core = 1\n```')
  for (const junk of ['8:31 AM', '351.8K', '351K', '14 min read', 'Want to publish', 'article-badge', 'profile_images', '169 Replies']) expect(markdown).not.toContain(junk)
  expect(files.filter(item => item.mime === 'image/png')).toHaveLength(3)
  expect([...markdown.matchAll(/\]\(assets\/([^)]+)\)/g)]).toHaveLength(3)
  // 下载不建条目（download.md §1）
  expect(await getEntries(page.context())).toHaveLength(0)
})
