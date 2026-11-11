import type { TabMessage } from '../types/messages'
import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures'
import { ensureServiceWorker, getCapturePageUrl, setSettings } from './helpers'

/** Source DOM structures with neutral text and URLs; provenance in source-pages/README.md. */
for (const name of ['encyclopedia', 'documentation', 'issue', 'x-rich-article', 'x-rendered-article'] as const) {
  test(`main-page download preserves the ${name} source structure`, async ({ page }) => {
    test.slow()
    await setSettings(page.context(), { downloadMedia: false })
    const local = `${getCapturePageUrl().replace(/capture\.html$/, '')}source-pages/${name}.html`
    if (name.startsWith('x-') || name === 'issue') {
      const html = await readFile(`e2e/source-pages/${name}.html`, 'utf8')
      const url = name === 'issue' ? 'https://github.com/sample-owner/sample-repo/issues/56' : 'https://x.com/sampleauthor/status/2013045749580259680'
      await page.route(url, route => route.fulfill({ body: html, contentType: 'text/html' }))
      await page.goto(url)
    } else await page.goto(local)
    const expected = await page.evaluate(() => ({
      formulas: [...document.querySelectorAll('math')].map(el => el.getAttribute('alttext')!),
      samples: [...document.querySelectorAll('pre')].map(el => /const sample_\d+ = \d+;/.exec(el.textContent ?? '')?.[0]).filter(Boolean),
      comments: [...document.querySelectorAll('[data-testid="markdown-body"]')].flatMap(el => {
        const text = [...el.querySelectorAll('p')].slice(-1)[0]?.textContent ?? ''
        return text.match(/Sample text \d+\./g) ?? []
      }),
    }))
    const worker = await ensureServiceWorker(page.context())
    await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(item => item.url === url)!
      await chrome.tabs.sendMessage(tab.id!, { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'popup' } satisfies TabMessage, { frameId: 0 })
    }, page.url())
    await expect(page.locator('[data-ann-ui="download-notice"]')).toContainText('已下载', { timeout: 30_000 })
    const files = await worker.evaluate(async () => (await chrome.downloads.search({})).filter(item => item.state === 'complete'))
    const documents = await Promise.all(files.filter(item => item.url.startsWith('data:text/markdown')).map(item => readFile(item.filename, 'utf8')))
    const markdown = documents.find(text => text.startsWith('---\n'))!
    expect(markdown).toBeTruthy()
    for (const formula of expected.formulas) expect(markdown).toContain(formula)
    for (const sample of expected.samples) expect(markdown).toContain(sample)
    for (const comment of expected.comments) expect(markdown).toContain(comment)
    expect(files.some(item => item.mime?.startsWith('image/'))).toBe(false)
    if (name === 'encyclopedia') {
      expect(expected.formulas.length).toBeGreaterThan(30)
      expect(markdown).toContain('[^1]:')
    }
    if (name === 'documentation') {
      expect(expected.samples.length).toBeGreaterThan(19)
      expect(markdown.match(/```python3\n/g)?.length).toBeGreaterThan(19)
    }
    if (name === 'issue') expect(markdown).not.toContain('![')
    if (name.startsWith('x-')) {
      expect(markdown.match(/^# /gm)).toHaveLength(1)
      expect(markdown.match(/^## /gm)?.length).toBeGreaterThan(2)
      expect(markdown).not.toMatch(/^[-*] *$/m)
      expect(markdown).toContain(`title: '${name === 'x-rich-article' ? 'Rich editor sample' : 'Rendered article sample'}'`)
      expect(markdown).not.toMatch(/^(markdown|json)\s*$/m)
    }
  })
}
