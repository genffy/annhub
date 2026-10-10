import { test, expect } from './fixtures'
import { clearLibrary, getCapturePageUrl, getEntries, selectUntilMenu, stopServiceWorker, waitForClipToast } from './helpers'

test.describe('service worker cold start (RV-BG-01)', () => {
  test('a save retried after worker restart keeps one stable entry (RV-BG-10)', async ({ page, extensionId }) => {
    await clearLibrary(page.context())
    await page.goto(`chrome-extension://${extensionId}/sample.html`)
    const message = {
      type: 'SAVE_CLIP',
      requestId: 'stable-request',
      draft: { id: 'ent_cold_retry_test', content: 'One stable saved body.', sourceUrl: 'https://example.com/retry', properties: { title: 'Retry' }, via: 'menu' },
    }
    const first = await page.evaluate(payload => chrome.runtime.sendMessage(payload), message)
    expect(first.success).toBe(true)
    await stopServiceWorker(page.context(), page)
    const second = await page.evaluate(payload => chrome.runtime.sendMessage(payload), message)
    expect(second).toMatchObject({ success: true, data: { entry: { id: 'ent_cold_retry_test' } } })
    expect(await getEntries(page.context())).toHaveLength(1)
  })

  test('a stopped worker answers the next save without the retry backoff', async ({ page }) => {
    test.setTimeout(60_000)
    await clearLibrary(page.context())
    await page.goto(getCapturePageUrl())

    await stopServiceWorker(page.context(), page)

    const menu = await selectUntilMenu(page, '#intro-p')
    const started = Date.now()
    await menu.locator('.ann-menu-action').nth(0).click()
    const toast = await waitForClipToast(page)
    await expect(toast).toContainText('已剪藏')

    // Before the fix, the first message after a cold start hit a 1s retry
    // backoff (measured ≈1.6s); a warm dispatch saves in well under a second.
    expect(Date.now() - started).toBeLessThan(1500)

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
  })
})
