import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { getScreenshotPageUrl } from './helpers'

/**
 * The scrolling long screenshot (screenshot.md §1.5): the selection bar's
 * chip scrolls and photographs a five-screen fixture with a sticky nav and
 * lazy images — the nav appears once, the seams hold, Esc discards and
 * scrolls back, and the stitched picture edits, downloads and saves like any
 * screenshot, with frame=stitched on the metric.
 */

test.describe.configure({ timeout: 120_000 })

const SESSION = '[data-ann-ui="screenshot-session"]'
const PREVIEW = '[data-ann-ui="screenshot-preview"]'
const STITCH_BUTTON = '[data-ann-ui="shot-stitch-button"]'

const NAV: readonly [number, number, number] = [47, 111, 222]
const BLUE: readonly [number, number, number] = [59, 130, 246]

/** Reads one pixel of the preview canvas, in canvas coordinates. */
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const canvas = document.querySelector('[data-ann-ui="screenshot-preview"] canvas') as HTMLCanvasElement
      const dpr = canvas.width / (canvas.getBoundingClientRect().width || 1)
      const data = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
      return [data[0], data[1], data[2]]
    },
    { x, y },
  )
}

/** Reads one pixel of the preview canvas in its own device coordinates (the stitched image is scaled in the preview). */
async function devicePixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const canvas = document.querySelector('[data-ann-ui="screenshot-preview"] canvas') as HTMLCanvasElement
      const data = canvas.getContext('2d')!.getImageData(Math.round(x), Math.round(y), 1, 1).data
      return [data[0], data[1], data[2]]
    },
    { x, y },
  )
}

const near = (rgb: readonly number[], expected: readonly number[], tol = 30): boolean =>
  Math.abs(rgb[0] - expected[0]) <= tol && Math.abs(rgb[1] - expected[1]) <= tol && Math.abs(rgb[2] - expected[2]) <= tol

test.describe('scrolling long screenshot (screenshot.md §1.5)', () => {
  test('stitches a five-screen page: the nav appears once, the lazy images land, and the seams hold', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await page.waitForTimeout(300)
    await page.evaluate(() => window.scrollTo(0, 120)) // start mid-page, like a user who read a bit
    await triggerStitch(page)
    const preview = page.locator(PREVIEW)
    await preview.waitFor({ timeout: 60_000 })

    // the full page below the start, in device pixels of its own
    const size = await preview.evaluate(el => {
      const canvas = el.querySelector('canvas') as HTMLCanvasElement
      return { width: canvas.width, height: canvas.height }
    })
    const dpr = size.width / (await page.evaluate(() => document.documentElement.clientWidth))
    expect(size.height).toBeGreaterThan(4 * 720 * dpr * 0.9)

    // the sticky nav rode the first screen only: blue band at the top, page-white at the same band one screen down
    expect(near(await pixelAt(page, 200, Math.round(28 * dpr)), NAV)).toBe(true)
    expect(near(await pixelAt(page, 200, Math.round(28 * dpr) + Math.round(720 * dpr)), [255, 255, 255])).toBe(true)

    // the lazy images waited for and landed where they live
    expect(near(await pixelAt(page, 100, Math.round(960 * dpr)), BLUE)).toBe(true)

    // the seam between screens: the same page background above and below it (no repeated or missing band)
    const seam = Math.round((720 - 40) * dpr) // first scroll went 720-40
    const above = await pixelAt(page, 1000, seam - 3)
    const below = await pixelAt(page, 1000, seam + 3)
    expect(above).toEqual(below)
  })

  test('the stitched picture edits, downloads and saves as a screenshot with frame=stitched', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await triggerStitch(page)
    await page.locator(PREVIEW).waitFor({ timeout: 60_000 })

    // the entry saves with the stitched frame (metrics.md §9)
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator(PREVIEW)).toHaveCount(0)
    // the metrics live in the worker's storage: read them there
    const worker = await (await import('./helpers')).ensureServiceWorker(page.context())
    const saved = await worker.evaluate(async () => {
      const shape = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
      return JSON.stringify(shape['capture.saved'] ?? {})
    })
    expect(saved).toContain('stitched')
  })

  test('page ink enters the long image at its page position; ink pinned to the screen stays out with a notice', async ({ page }) => {
    const { triggerAnnotation } = await import('./helpers')
    await page.goto('http://localhost:8173/longpage.html')
    await triggerAnnotation(page)
    await page.locator('[data-ann-ui="annotation-layer"]').waitFor()
    // a stroke over the first section (page ink) and one over the sticky nav (screen-pinned)
    await drawInk(page, [300, 170], [420, 170])
    await drawInk(page, [620, 24], [760, 24])
    // the screenshot shortcut carries the ink into the session; stitch from there
    const { triggerScreenshot } = await import('./helpers')
    await triggerScreenshot(page)
    await page.locator('[data-ann-ui="screenshot-session"]').waitFor()
    await page.locator('[data-ann-ui="shot-stitch-button"]').click()
    await page.locator(PREVIEW).waitFor({ timeout: 60_000 })

    // the page ink sits where it lives on the page, not where the window was
    expect(near(await devicePixelAt(page, 340, 170), [229, 72, 77], 40)).toBe(true)
    // the pinned stroke is out, and the editor says one sentence about it
    expect(near(await devicePixelAt(page, 690, 24), [47, 111, 222], 30)).toBe(true)
    const notice = page.locator('.ann-shot-notice')
    await expect(notice).toContainText(/固定在屏幕|不进长图/)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })

  test('Esc during the stitching discards everything and scrolls the page back', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await triggerStitch(page)
    // cancel while the first screens are being taken. The progress line hides
    // for the moment of every shot, so the wait is for it to exist at all.
    await page.locator('[data-ann-ui="stitch-progress"]').waitFor({ state: 'attached' })
    await page.keyboard.press('Escape')
    // back to selecting, nothing entered the library, the page is where it was
    await expect(page.locator('[data-ann-ui="stitch-progress"]')).toHaveCount(0)
    await expect(page.locator(SESSION)).toBeVisible()
    await expect(page.locator('[data-ann-ui="shot-stitch-button"]')).toBeVisible()
    const scroll = await page.evaluate(() => window.scrollY)
    expect(scroll).toBe(0)
  })

  test('a page that only scrolls inside its own area says so instead of stitching', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerStitch(page)
    const notice = page.locator('[data-ann-ui="screenshot-external-notice"]')
    await expect(notice).toContainText(/滚动区域|拼不了/)
    // the session is intact, back to selecting
    await expect(page.locator(SESSION)).toBeVisible()
  })
})

/** Draws a red pen stroke with the annotation layer's toolbar pen. */
async function drawInk(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.locator('[data-ann-ui="annotation-tool-pen"]').click()
  await page.mouse.move(from[0], from[1])
  await page.mouse.down()
  await page.mouse.move(to[0], to[1], { steps: 6 })
  await page.mouse.up()
}

/** Opens the region selection and clicks the chip on the selection bar. */
async function triggerStitch(page: Page): Promise<void> {
  const { triggerScreenshot } = await import('./helpers')
  await triggerScreenshot(page)
  await page.locator(SESSION).waitFor()
  await page.locator(STITCH_BUTTON).waitFor()
  await page.locator(STITCH_BUTTON).click()
}
