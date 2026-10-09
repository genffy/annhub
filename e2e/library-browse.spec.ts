import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getCapturePageUrl, getEntries, selectUntilMenu, waitForClipToast } from './helpers'

/**
 * Browsing scale and freshness (RV-LIB-02, RV-LIB-03): every entry is
 * reachable through “显示更多”, the oldest entry's tag is a filter candidate,
 * and a drawer delete updates the list DOM, not just the database.
 */

async function saveClips(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page, count: number, expectedTotal = count): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.goto(`${getCapturePageUrl()}?seed=${Date.now()}-${i}`)
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)
    await page.waitForTimeout(120)
  }
  expect(await getEntries(context)).toHaveLength(expectedTotal)
}

test.describe('library browsing (search.md §4, extension.md §2.3)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('120 entries: load more reaches the oldest, whose tag filters (RV-LIB-02)', async ({ page, extensionId }) => {
    test.setTimeout(300_000)
    await saveClips(page.context(), page, 60)

    // tag the oldest entry distinctively through the extension's own store
    const entries = await getEntries(page.context())
    const oldest = entries[0]!
    const sw = await ensureServiceWorker(page.context())
    await sw.evaluate(id => {
      return new Promise<void>(resolve => {
        const open = indexedDB.open('annhub')
        open.onsuccess = () => {
          const tx = open.result.transaction('entries', 'readwrite')
          const get = tx.objectStore('entries').get(id)
          get.onsuccess = () => {
            const entry = get.result
            entry.properties.tags = ['oldest-tag']
            tx.objectStore('entries').put(entry)
            tx.oncomplete = () => resolve()
          }
        }
      })
    }, oldest.id)

    await saveClips(page.context(), page, 60, 120) // 120 total; the oldest now sits below two pages

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await expect(library.locator('.row')).toHaveCount(50)
    await expect(library.getByTestId('list-count')).toContainText('120')

    await library.getByTestId('load-more').click()
    await expect(library.locator('.row')).toHaveCount(100)
    await library.getByTestId('load-more').click()
    await expect(library.locator('.row')).toHaveCount(120)
    await expect(library.getByTestId('load-more')).toHaveCount(0)

    // the oldest entry's unique tag is a filter candidate from the whole library
    const tagFilter = library.locator('select[aria-label*="标签"], select[aria-label*="tag"], select[aria-label*="Tag"]').first()
    await tagFilter.selectOption('oldest-tag')
    await expect(library.locator('.row')).toHaveCount(1)
    expect(library.url()).toContain('tag=oldest-tag')
    await library.close()
  })

  test('a drawer delete updates the list DOM and count immediately (RV-LIB-03)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 3)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await expect(library.locator('.row')).toHaveCount(3)
    await expect(library.getByTestId('list-count')).toContainText('3')

    await library.locator('.row').first().click()
    const drawer = library.locator('.drawer')
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: '删除' }).click()
    await drawer.getByRole('alertdialog').getByRole('button', { name: '删除' }).click()

    await expect(drawer).toHaveCount(0)
    await expect(library.locator('.row')).toHaveCount(2)
    await expect(library.getByTestId('list-count')).toContainText('2')
    expect(await getEntries(library.context())).toHaveLength(2)
    await library.close()
  })
})
