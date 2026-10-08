import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getCapturePageUrl, getEntries, selectUntilMenu, waitForClipToast } from './helpers'

async function saveClipViaMenu(page: import('@playwright/test').Page, selector: string): Promise<void> {
  const menu = await selectUntilMenu(page, selector)
  await menu.locator('.ann-menu-action').nth(0).click()
  await waitForClipToast(page)
}

test.describe('the library page and the single export (extension.md §2.2, storage.md §6)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('lists saved clips, searches them, opens the drawer and exports one ZIP', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(getCapturePageUrl())
    await saveClipViaMenu(page, '#intro-p')
    await saveClipViaMenu(page, '[data-testid="section-body"]')

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html`)

    // both clips are listed with type, source and relative time
    await expect(library.locator('.row')).toHaveCount(2)
    await expect(library.locator('.row').first()).toContainText('localhost')

    // search narrows to the matching clip and writes the URL hash
    await library.locator('.search').fill('lockstep')
    await expect(library.locator('.row')).toHaveCount(1)
    expect(library.url()).toContain('q=lockstep')

    // no-result state keeps the filter and offers to clear it
    await library.locator('.search').fill('nosuchword')
    await expect(library.locator('.empty')).toContainText('没有匹配的结果')
    await library.getByRole('button', { name: '清除筛选' }).click()
    await expect(library.locator('.row')).toHaveCount(2)

    // the drawer renders the markdown, never raw HTML, and links back to the source
    await library.locator('.row', { hasText: 'Retries can amplify' }).click()
    const drawer = library.locator('.drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.md-view a[href="https://engineering.example.com/jitter"]')).toHaveCount(1)
    const link = drawer.locator('.drawer-header a[href^="http"]').first()
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    // editing from the drawer persists
    await drawer.locator('.field input').nth(1).fill('reliability')
    await drawer.locator('.field input').nth(1).blur()
    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return entries.some(entry => Array.isArray(entry.properties['tags']) && (entry.properties['tags'] as string[]).includes('reliability'))
      })
      .toBe(true)

    // the single export command runs through chrome.downloads from the
    // service worker (no page download event fires for it)
    await library.locator('.nav-export').click()
    await expect(library.locator('.nav-note').first()).toContainText('导出完成', { timeout: 20_000 })
    await expect
      .poll(async () => {
        const sw = await ensureServiceWorker(library.context())
        return sw.evaluate(() =>
          chrome.downloads.search({ limit: 10 }).then(items => items.some(item => (item.filename ?? '').includes('AnnHub-export') || (item.url ?? '').startsWith('data:'))),
        )
      })
      .toBe(true)
    await library.close()
  })

  test('the filter survives a reload from the URL hash', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    await saveClipViaMenu(page, '#intro-p')

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all?q=lockstep`)
    await expect(library.locator('.search')).toHaveValue('lockstep')
    await expect(library.locator('.row')).toHaveCount(1)
    await library.close()
  })

  test('deleting from the drawer removes the entry', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    await saveClipViaMenu(page, '#intro-p')

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html`)
    await library.locator('.row').first().click()
    await library.locator('.drawer .danger').click()
    await library.locator('.modal .danger').click()
    await expect.poll(() => getEntries(library.context())).toHaveLength(0)
    await library.close()
  })
})
