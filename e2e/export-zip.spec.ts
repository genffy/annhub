/**
 * 导出内容 E2E — the single user export (storage.md §7): Markdown + saved
 * image ZIP, generated with no Desktop involved. Verifies the download lands
 * with the documented name and non-trivial size; the ZIP's internal structure
 * is covered byte-level by learning-core unit tests.
 */
import { test, expect } from './fixtures'
import { navigateToFragmentPage, clearFragmentStoreViaServiceWorker, setCaptureConfigViaServiceWorker, captureFragmentViaUi } from './helpers'

test.describe('导出内容 (Markdown ZIP)', () => {
  test('generates a downloadable ZIP without Desktop', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    await navigateToFragmentPage(page)
    await captureFragmentViaUi(page, { kind: 'concept', use: '用于导出验收。' })

    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 10_000 })

    // 唯一导出命令藏在「更多」菜单里（PRD §5.1）
    await page.getByTestId('more-menu').click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-content').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^AnnHub-export-\d{4}-\d{2}-\d{2}\.zip$/)
    const path = await download.path()
    const { stat } = await import('node:fs/promises')
    const info = await stat(path!)
    expect(info.size).toBeGreaterThan(500) // README + one fragment markdown + central directory
  })
})
