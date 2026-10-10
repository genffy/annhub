import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getAssetMetadata, getEntries, getScreenshotPageUrl, setSettings, triggerScreenshot } from './helpers'

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
    await setSettings(page.context(), {
      watermark: { enabled: true, text: 'AnnHub', position: 'bottom-right', size: 'medium', opacity: 0.7 },
      beautify: { enabled: true, background: 'solid-white', padding: 'medium', radius: 12, shadow: true },
    })
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

    await page.locator('[data-ann-ui="screenshot-download"]').click()
    const sw = await ensureServiceWorker(page.context())
    await expect
      .poll(() =>
        sw.evaluate(async () => {
          const metrics = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
          return ['screenshot.copied', 'screenshot.downloaded'].map(name =>
            Object.values(metrics?.[name] ?? {})
              .flatMap(day => Object.keys(day.byProps))
              .some(key => key.includes('beautify=true') && key.includes('watermark=true')),
          )
        }),
      )
      .toEqual([true, true])
  })

  test('saving from a remembered frame records frame=reused (RV-CAP-09)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    const box = (await page.getByTestId('screenshot-post').boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 350, box.y + 120, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect.poll(() => getEntries(page.context())).toHaveLength(2)
    const sw = await ensureServiceWorker(page.context())
    await expect
      .poll(() =>
        sw.evaluate(async () => {
          const metrics = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
          return Object.values(metrics?.['capture.saved'] ?? {})
            .flatMap(day => Object.keys(day.byProps))
            .some(key => key.includes('frame=reused'))
        }),
      )
      .toBe(true)
  })

  test('library screenshot gallery offers thumbnail, zoom, download and delete (RV-LIB-12)', async ({ page, extensionId }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    const box = (await page.getByTestId('screenshot-post').boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 360, box.y + 120, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    await expect.poll(() => getEntries(page.context())).toHaveLength(1)
    const id = (await getEntries(page.context()))[0]!.id

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await expect(library.locator(`.row[data-entry-id="${id}"] img`)).toBeVisible()
    await library.goto(`chrome-extension://${extensionId}/library.html#/screenshots`)
    const tile = library.locator(`.screenshot-tile[data-entry-id="${id}"]`)
    await expect(tile.locator('img')).toBeVisible()
    await tile.locator('img').click()
    await expect(library.locator('.drawer-image')).toBeVisible()
    await library.locator('.drawer-image').click()
    await expect(library.getByRole('dialog', { name: '图片预览' })).toBeVisible()
    await library.getByRole('dialog', { name: '图片预览' }).getByRole('button', { name: '关闭' }).click()
    await library.locator('.drawer').getByRole('button', { name: '关闭' }).click()
    await tile.getByRole('button', { name: '下载' }).click()
    const sw = await ensureServiceWorker(page.context())
    await expect
      .poll(() =>
        sw.evaluate(() =>
          chrome.downloads.search({ limit: 10 }).then(items => items.some(item => item.state === 'complete' && item.mime === 'image/png' && item.url.startsWith('blob:'))),
        ),
      )
      .toBe(true)
    library.once('dialog', dialog => void dialog.accept())
    await tile.getByRole('button', { name: '删除' }).click()
    await expect(tile).toHaveCount(0)
    await library.close()
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
