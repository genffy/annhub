import { test, expect } from './fixtures'
import { clearLibrary, getCapturePageUrl, getEntries, selectUntilMenu, waitForClipToast } from './helpers'

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

    // editing from the drawer persists: add a custom text property through the panel
    await drawer.getByTestId('add-property').click()
    await drawer.getByLabel('名称').fill('project')
    await drawer.getByRole('button', { name: '保存' }).click()
    await expect(drawer.locator('.prop-row', { hasText: 'project' })).toBeVisible()
    await drawer.locator('.prop-row', { hasText: 'project' }).locator('input').fill('支付重试')
    await drawer.locator('.prop-row', { hasText: 'project' }).locator('input').blur()
    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return entries.some(entry => entry.properties['project'] === '支付重试')
      })
      .toBe(true)

    // a written-then-cleared note really clears (null semantics, RV-BG-03)
    const noteBox = drawer.locator('textarea')
    await expect(noteBox).toHaveCount(1)
    await noteBox.fill('temporary note')
    await noteBox.blur()
    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return entries.find(entry => entry.properties['project'] === '支付重试')?.note
      })
      .toBe('temporary note')
    await noteBox.fill('')
    await noteBox.blur()
    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return entries.find(entry => entry.properties['project'] === '支付重试')?.note
      })
      .toBeUndefined()

    // The drawer is modal (its backdrop covers the navigation): close it, then export.
    // The application page downloads a Blob URL; the archive is not sent
    // through the service worker as a large base64 message.
    await drawer.getByRole('button', { name: '关闭' }).click()
    await expect(drawer).toHaveCount(0)
    await library.locator('.nav-export').click()
    await expect(library.locator('.nav-note').first()).toContainText('导出完成', { timeout: 20_000 })
    await expect
      .poll(async () => {
        return library.evaluate(() =>
          chrome.downloads.search({ limit: 10 }).then(items => items.some(item => (item.filename ?? '').includes('AnnHub-export') || (item.url ?? '').startsWith('blob:'))),
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

  test('a partial export lists the missing asset ID in the library (RV-LIB-12)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/screenshots`)
    await library.evaluate(
      () =>
        new Promise<void>(resolve => {
          const open = indexedDB.open('annhub')
          open.onsuccess = () => {
            const tx = open.result.transaction('entries', 'readwrite')
            tx.objectStore('entries').put({
              id: 'ent_missing_export',
              type: 'screenshot',
              content: '',
              assetId: 'asset_missing_export',
              sourceUrl: 'https://example.com/missing',
              sourceHost: 'example.com',
              properties: { title: 'Missing screenshot' },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
            tx.oncomplete = () => resolve()
          }
        }),
    )
    await library.reload()
    await library.locator('.nav-export').click()
    await expect(library.locator('.nav-note-warn')).toContainText('asset_missing_export')
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
