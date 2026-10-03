/**
 * Screenshot capture chain E2E — docs/v2/screenshot.md.
 * Covers: trigger, region and element capture, in-place annotation and undo,
 * separate PNG download and library save, anonymization, cancel and errors.
 */
import { test, expect } from './fixtures'
import { clearFragmentStoreViaServiceWorker, getFragmentsFromServiceWorker } from './helpers'

async function triggerScreenshot(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('ann-screenshot-trigger', { detail: { command: 'capture-screenshot' } }))
  })
}

async function serviceWorker(context: import('@playwright/test').BrowserContext) {
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker')
  return worker
}

/** Wrap chrome.downloads.download to record options (Playwright reroutes the real files). */
async function recordDownloads(context: import('@playwright/test').BrowserContext) {
  const sw = await serviceWorker(context)
  await sw.evaluate(() => {
    const state = self as unknown as { __annShotOpts: { filename?: string }[]; __annShotCreated: number }
    state.__annShotOpts = []
    state.__annShotCreated = 0
    const original = chrome.downloads.download.bind(chrome.downloads)
    chrome.downloads.download = ((opts: chrome.downloads.DownloadOptions, callback?: (id: number) => void) => {
      state.__annShotOpts.push({ filename: opts.filename })
      return original(opts, callback as (downloadId: number) => void)
    }) as typeof chrome.downloads.download
    chrome.downloads.onCreated.addListener(() => {
      state.__annShotCreated += 1
    })
  })
  return sw
}

async function dragRegion(page: import('@playwright/test').Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const post = page.getByTestId('screenshot-post')
  const box = await post.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + 5
  const y = box!.y + 5
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(box!.x + 480, box!.y + 160, { steps: 6 })
  await page.mouse.up()
  return { x, y, width: 480 - 5, height: 160 - 5 }
}

test.describe('Screenshot capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8173/screenshot.html')
    await page.waitForSelector('ann-selection', { state: 'attached' })
  })

  test('overlay appears on trigger and Esc cancels it', async ({ page }) => {
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-overlay"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-overlay"]')).toHaveCount(0)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
  })

  test('region drag with anonymize ON: gray placeholder, in-place preview and separate PNG download', async ({ page, context }) => {
    const sw = await recordDownloads(context)

    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-overlay"]')).toBeVisible()
    // Hint advertises the anonymize toggle, on by default.
    await expect(page.locator('[data-ann-ui="screenshot-overlay"]')).toContainText('匿名：开')

    const selection = await dragRegion(page)

    const preview = page.locator('[data-ann-ui="screenshot-preview"]')
    await expect(preview).toBeVisible({ timeout: 10_000 })
    const previewBounds = await preview.boundingBox()
    expect(previewBounds!.x).toBeCloseTo(selection.x, 0)
    expect(previewBounds!.y).toBeCloseTo(selection.y, 0)
    await expect(preview.locator('.ann-shot-size')).toContainText(' x ')
    const toolbar = page.locator('[data-ann-ui="screenshot-toolbar"]')
    await expect(toolbar).toBeVisible()
    expect((await toolbar.boundingBox())!.y).toBeGreaterThan(previewBounds!.y + previewBounds!.height)
    const canvas = preview.locator('canvas')
    await expect(canvas).toBeVisible()
    const dims = await canvas.evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }))
    expect(dims.w).toBeGreaterThan(50)
    expect(dims.h).toBeGreaterThan(50)

    // DOM anonymization covered the identity element → no pixelate boxes suggested.
    await expect(page.locator('[data-ann-ui="mask-box"]')).toHaveCount(0)

    // The identity area renders as the near-uniform gray placeholder (#d1d5db).
    // Canvas (0,0) corresponds to the SELECTION origin in viewport coordinates.
    const gray = await canvas.evaluate((el: HTMLCanvasElement, sel: typeof selection) => {
      const identity = document.querySelector('[data-testid="fixture-identity"]')!.getBoundingClientRect()
      const ctx = el.getContext('2d')!
      const scaleX = el.width / sel.width
      const scaleY = el.height / sel.height
      // Inset: placeholder corners (border-radius) and sub-pixel rounding at
      // the edges can carry neighbouring content.
      const inset = 6
      const x = Math.max(0, Math.round((identity.left - sel.x) * scaleX) + inset)
      const y = Math.max(0, Math.round((identity.top - sel.y) * scaleY) + inset)
      const w = Math.min(el.width - x, Math.round(identity.width * scaleX) - inset * 2)
      const h = Math.min(el.height - y, Math.round(identity.height * scaleY) - inset * 2)
      if (w <= 0 || h <= 0) return null
      const data = ctx.getImageData(x, y, w, h).data
      let rs = 0
      let gs = 0
      let bs = 0
      const n = w * h
      for (let i = 0; i < data.length; i += 4) {
        rs += data[i]
        gs += data[i + 1]
        bs += data[i + 2]
      }
      rs /= n
      gs /= n
      bs /= n
      let variance = 0
      for (let i = 0; i < data.length; i += 4) {
        variance += (data[i] - rs) ** 2 + (data[i + 1] - gs) ** 2 + (data[i + 2] - bs) ** 2
      }
      return { avg: [rs, gs, bs], variance: variance / n, region: { x, y, w, h } }
    }, selection)
    expect(gray).not.toBeNull()
    // Gray placeholder average ≈ (209, 213, 219) with tiny variance.
    expect(Math.abs(gray!.avg[0] - 209)).toBeLessThan(30)
    expect(Math.abs(gray!.avg[1] - 213)).toBeLessThan(30)
    expect(Math.abs(gray!.avg[2] - 219)).toBeLessThan(30)
    expect(gray!.variance).toBeLessThan(120)

    await toolbar.locator('[data-ann-ui="screenshot-download"]').click()
    await expect(preview).toBeVisible()

    const state = await sw.evaluate(() => (self as unknown as { __annShotOpts: { filename?: string }[] }).__annShotOpts)
    expect(state).toEqual([{ filename: expect.stringMatching(/^AnnHub\/screenshot-.+\.png$/) }])
    await toolbar.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(preview).toHaveCount(0, { timeout: 10_000 })
  })

  test('anonymize OFF (A key): identity pre-filled as a pixelate mask box', async ({ page }) => {
    await triggerScreenshot(page)
    await page.keyboard.press('a')
    await expect(page.locator('[data-ann-ui="screenshot-overlay"]')).toContainText('匿名：关')

    await dragRegion(page)

    const preview = page.locator('[data-ann-ui="screenshot-preview"]')
    await expect(preview).toBeVisible({ timeout: 10_000 })
    const maskBoxes = page.locator('[data-ann-ui="mask-box"]')
    await expect(maskBoxes).toHaveCount(1)
    await page.locator('[data-ann-ui="mask-remove-1"]').click()
    await expect(preview.locator('[data-ann-ui="mask-box"]')).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('element capture: single click rasterizes the clicked element (anonymized clone)', async ({ page, context }) => {
    const sw = await recordDownloads(context)

    await triggerScreenshot(page)
    // A click (no drag) on the article body captures the element via
    // html-to-image — no captureVisibleTab involved.
    await page.getByTestId('capture-body').click()

    const preview = page.locator('[data-ann-ui="screenshot-preview"]')
    await expect(preview).toBeVisible({ timeout: 15_000 })
    const dims = await preview.locator('canvas').evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }))
    expect(dims.w).toBeGreaterThan(100)
    expect(dims.h).toBeGreaterThan(20)
    // The cloned identity area was swapped to a gray placeholder.
    const gray = await preview.locator('canvas').evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d')!
      const data = ctx.getImageData(0, 0, Math.min(el.width, 400), Math.min(el.height, 40)).data
      let rs = 0
      let gs = 0
      let bs = 0
      const n = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        rs += data[i]
        gs += data[i + 1]
        bs += data[i + 2]
      }
      return [rs / n, gs / n, bs / n]
    })
    // Top strip contains the anonymized identity bar → dominated by gray.
    expect(gray[0]).toBeGreaterThan(160)
    expect(gray[1]).toBeGreaterThan(160)
    expect(gray[2]).toBeGreaterThan(160)

    await page.locator('[data-ann-ui="screenshot-download"]').click()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(preview).toHaveCount(0, { timeout: 10_000 })
    const state = await sw.evaluate(() => (self as unknown as { __annShotOpts: { filename?: string }[] }).__annShotOpts)
    expect(state).toEqual([{ filename: expect.stringMatching(/^AnnHub\/screenshot-.+\.png$/) }])
  })

  test('screenshot library: persisted save shows on the Words page and deletes', async ({ page, extensionId }) => {
    await triggerScreenshot(page)
    await dragRegion(page)
    const preview = page.locator('[data-ann-ui="screenshot-preview"]')
    await expect(preview).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(preview).toHaveCount(0, { timeout: 10_000 })

    await page.goto(`chrome-extension://${extensionId}/words.html`)
    await expect(page.getByTestId('words-page')).toBeVisible()
    await page.getByTestId('view-screenshots').click()
    const list = page.getByTestId('screenshots-list')
    await expect(list).toBeVisible({ timeout: 10_000 })
    await expect(list.getByTestId('screenshot-card')).toHaveCount(1)
    const card = list.getByTestId('screenshot-card').first()
    await expect(card.locator('img')).toBeVisible()
    await expect(card.locator('.screenshot-source')).toHaveText('localhost')

    page.on('dialog', dialog => dialog.accept())
    await card.getByTestId('screenshot-delete').click()
    await expect(list.getByTestId('screenshot-card')).toHaveCount(0)
    await expect(page.getByTestId('screenshots-empty')).toBeVisible()
  })


  test('saved screenshot converts into a visual Fragment with shared asset id', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await triggerScreenshot(page)
    await dragRegion(page)
    const preview = page.locator('[data-ann-ui="screenshot-preview"]')
    await expect(preview).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(preview).toHaveCount(0, { timeout: 10_000 })

    await page.goto(`chrome-extension://${extensionId}/words.html`)
    await expect(page.getByTestId('words-page')).toBeVisible()
    await page.getByTestId('view-screenshots').click()
    const card = page.getByTestId('screenshots-list').getByTestId('screenshot-card').first()
    await expect(card.locator('img')).toBeVisible({ timeout: 10_000 })

    await card.getByTestId('screenshot-to-fragment').click()
    const form = page.locator('[data-ann-ui="visual-form"]')
    await expect(form).toBeVisible()
    await form.getByTestId('visual-content').fill('净值曲线在加息后出现三次深回撤')
    await form.getByTestId('visual-verify').click()
    await expect(form.getByText(/已确认核对/)).toBeVisible()
    await form.getByTestId('visual-use').fill('用于下周风险复盘的图示。')
    await form.getByTestId('visual-save').click()
    await expect(form).toHaveCount(0, { timeout: 5000 })

    const fragments = await getFragmentsFromServiceWorker(context)
    expect(fragments).toHaveLength(1)
    const visual = fragments[0]
    expect(visual.kind).toBe('visual')
    expect(visual.detail.attachmentIds).toHaveLength(1)
    expect(visual.context.locator).toEqual({ type: 'image', assetId: visual.detail.attachmentIds[0] })
  })

  test('capture error surfaces the error panel', async ({ page, context }) => {
    const worker = await serviceWorker(context)
    await worker.evaluate(() => {
      const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs)
      ;(self as unknown as { __annShotRestore: () => void }).__annShotRestore = () => {
        chrome.tabs.captureVisibleTab = original
      }
      chrome.tabs.captureVisibleTab = ((_win: unknown, _opts: unknown, cb: (dataUrl?: string) => void) => {
        cb(undefined)
      }) as unknown as typeof chrome.tabs.captureVisibleTab
    })

    await triggerScreenshot(page)
    const overlay = page.locator('[data-ann-ui="screenshot-overlay"]')
    await expect(overlay).toBeVisible()
    await dragRegion(page)

    await expect(page.locator('[data-ann-ui="screenshot-error"]')).toBeVisible({ timeout: 10_000 })
    await worker.evaluate(() => (self as unknown as { __annShotRestore: () => void }).__annShotRestore())
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-error"]')).toHaveCount(0)
  })

  test('rectangle, text and mosaic edit the image; undo restores the preceding image', async ({ page }) => {
    await triggerScreenshot(page)
    await dragRegion(page)
    const preview = page.locator('[data-ann-ui="screenshot-preview"]')
    await expect(preview).toBeVisible({ timeout: 10_000 })
    const canvas = preview.locator('canvas')
    const image = () => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())
    const original = await image()
    const bounds = (await canvas.boundingBox())!

    await page.locator('[data-ann-ui="screenshot-tool-rectangle"]').click()
    await page.mouse.move(bounds.x + 30, bounds.y + 30)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 130, bounds.y + 90, { steps: 3 })
    await page.mouse.up()
    const marked = await image()
    expect(marked).not.toBe(original)
    await page.locator('[data-ann-ui="screenshot-undo"]').click()
    expect(await image()).toBe(original)

    await page.locator('[data-ann-ui="screenshot-tool-text"]').click()
    await page.mouse.click(bounds.x + 35, bounds.y + 35)
    const input = page.locator('[data-ann-ui="screenshot-text-input"]')
    await input.fill('重点')
    await input.press('Enter')
    expect(await image()).not.toBe(original)

    await page.locator('[data-ann-ui="screenshot-tool-mosaic"]').click()
    await page.mouse.move(bounds.x + 45, bounds.y + 45)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 110, bounds.y + 95, { steps: 3 })
    await page.mouse.up()
    await expect(page.locator('[data-ann-ui="screenshot-undo"]')).toBeEnabled()
    await page.keyboard.press('Escape')
  })

  test('narrow viewport keeps cancel and confirm visible beside a scrollable tool strip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await triggerScreenshot(page)
    const post = (await page.getByTestId('screenshot-post').boundingBox())!
    await page.mouse.move(post.x + 6, post.y + 6)
    await page.mouse.down()
    await page.mouse.move(post.x + 290, post.y + 180, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible({ timeout: 10_000 })
    const toolbar = page.locator('[data-ann-ui="screenshot-toolbar"]')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.locator('[data-ann-ui="screenshot-cancel"]')).toBeVisible()
    await expect(toolbar.locator('[data-ann-ui="screenshot-save"]')).toBeVisible()
    const bounds = (await toolbar.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  })
})
