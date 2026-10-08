import { test, expect } from './fixtures'
import { clearLibrary, getAssetMetadata, getEntries, getScreenshotPageUrl, triggerScreenshot } from './helpers'

test.describe('screenshot capture (screenshot.md §1, §2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('a dragged region saves a screenshot entry and its PNG asset together', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()

    const post = page.getByTestId('screenshot-post')
    const box = (await post.boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 400, box.y + 150, { steps: 6 })
    await page.mouse.up()
    // a released drag waits for confirmation (screenshot.md §1.2)
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'screenshot', content: '', sourceHost: 'localhost' })
    expect(String(entries[0]!.properties['title'])).toContain('Screenshot Capture Fixture')

    const assets = await getAssetMetadata(page.context())
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({ mimeType: 'image/png' })
    expect(assets[0]!.width).toBeGreaterThan(100)
    // the entry references exactly the saved asset
    expect(entries[0]!.assetId).toBe(assets[0]!.id)
  })

  test('a click without a drag captures the clicked element instead', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)

    const body = page.getByTestId('capture-body')
    const box = (await body.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]!.type).toBe('screenshot')
    const assets = await getAssetMetadata(page.context())
    expect(assets).toHaveLength(1)
  })

  test('copy puts the PNG on the clipboard and keeps the session open', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    const post = page.getByTestId('screenshot-post')
    const box = (await post.boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 380, box.y + 130, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()

    await page.locator('[data-ann-ui="screenshot-copy"]').click()
    await expect(page.locator('.ann-shot-notice')).toContainText('已复制')
    // the session stays for more editing or a save (screenshot.md §4)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()

    const clipboard = await page.evaluate(() => navigator.clipboard.read().then(items => items[0]!.types))
    expect(clipboard).toContain('image/png')
  })

  test('Esc cancels the session and leaves nothing behind', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(0)
  })

  test('a synthetic keypress the page dispatched cannot start a session', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true, bubbles: true }))
    })
    await page.waitForTimeout(400)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
  })
})
