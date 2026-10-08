import { test, expect } from './fixtures'
import { clearLibrary, getEntries, getCapturePageUrl, selectText, selectUntilMenu, waitForClipToast } from './helpers'

test.describe('selection clip (capture.md §6.1, extension.md §2.1)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('the menu offers exactly clip and screenshot, in that order, and clips in one click', async ({ page }) => {
    test.slow()
    await page.goto(`${getCapturePageUrl()}?token=abc&utm_source=rss`)
    const menu = await selectUntilMenu(page, '#intro-p')

    const actions = menu.locator('.ann-menu-action')
    await expect(actions).toHaveCount(2)
    await expect(actions.nth(0)).toHaveText(/剪藏/)
    await expect(actions.nth(1)).toHaveText(/截图/)

    await actions.nth(0).click()
    const toast = await waitForClipToast(page)
    await expect(toast).toContainText('已剪藏')
    await expect(toast.getByRole('button', { name: '撤销' })).toBeVisible()
    await expect(toast.getByRole('button', { name: '编辑' })).toBeVisible()

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.type).toBe('clip')
    // markdown conversion kept emphasis and resolved the link absolutely
    expect(entry.content).toContain('**base × 2^n**')
    expect(entry.content).toContain('https://engineering.example.com/jitter')
    expect(entry.content).toContain('random factor between 0 and 1')
    // context contains the selection's sentence
    expect(entry.context).toContain('saturated')
    // Q-13: token-shaped query params never survive the save
    expect(entry.sourceUrl).not.toContain('token=')
    expect(entry.sourceUrl).toContain('utm_source=rss')
    // type presets attached the page title
    expect(entry.properties['title']).toBe('Backoff and retry — capture fixture')
  })

  test('undo deletes the entry that was just saved', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    const toast = await waitForClipToast(page)
    await toast.getByRole('button', { name: '撤销' }).click()
    await expect(page.locator('[data-ann-ui="clip-toast"] .ann-clip-toast-undone')).toBeVisible()
    await expect.poll(() => getEntries(page.context())).toHaveLength(0)
  })

  test('the quick edit bubble edits title, tags and note on the saved entry', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    const toast = await waitForClipToast(page)
    await toast.getByRole('button', { name: '编辑' }).click()

    const bubble = page.locator('[data-ann-ui="clip-edit"]')
    await expect(bubble).toBeVisible()
    await bubble.locator('input').nth(1).fill('retry, backoff')
    await bubble.locator('input').nth(2).fill('对照复盘文档')
    await bubble.getByRole('button', { name: '完成' }).click()
    await expect(bubble).not.toBeVisible()

    await expect
      .poll(() => getEntries(page.context()), { timeout: 15_000 })
      .toMatchObject([
        expect.objectContaining({
          type: 'clip',
          note: '对照复盘文档',
          properties: expect.objectContaining({ tags: ['retry', 'backoff'] }),
        }),
      ])
  })

  test('a whitespace-only selection never shows the menu', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    await page.waitForLoadState('networkidle')
    await selectText(page, '#blank-target')
    await page.waitForTimeout(600)
    await expect(page.locator('[data-ann-ui="selection-menu"]')).toHaveCount(0)
  })
})
