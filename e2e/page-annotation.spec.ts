import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { getScreenshotPageUrl, triggerAnnotation, triggerBlockMode, triggerScreenshot } from './helpers'

/**
 * The page-annotation layer (annotate.md §1): the layer rides the top of the
 * page with a toolbar on the window edge; a tool picks up ink in viewport
 * coordinates; the screenshot button hands the ink to the editor — one undo
 * step — and the layer comes back with its ink when the session ends; exiting
 * clears everything. The selection menu stays off the page while the layer is
 * open; the block-mode shortcut points at the layer instead of starting.
 */

test.describe.configure({ timeout: 60_000 })

const LAYER = '[data-ann-ui="annotation-layer"]'
const CANVAS = '[data-ann-ui="annotation-canvas"]'
const TOOLBAR = '[data-ann-ui="annotation-toolbar"]'
const NOTICE = '[data-ann-ui="annotation-notice"]'
const SESSION = '[data-ann-ui="screenshot-session"]'
const PREVIEW = '[data-ann-ui="screenshot-preview"]'
const PREVIEW_CANVAS = `${PREVIEW} canvas`
const MENU = '[data-ann-ui="selection-menu"]'
const CONFIRM_BAR = '[data-ann-ui="shot-confirm-bar"]'
const BLOCK_OVERLAY = '[data-ann-ui="block-mode-overlay"]'

/** Red-dominant over the white page, antialiased edges included; the ink red is rgb(229, 72, 77). */
const isRed = (rgb: readonly number[]): boolean => rgb[0] >= 200 && rgb[0] - rgb[1] >= 60 && rgb[0] - rgb[2] >= 60

/** Reads one canvas pixel (canvas coordinates = client coordinates × dpr). */
async function pixelAt(page: Page, selector: string, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ selector, x, y }: { selector: string; x: number; y: number }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null
      if (!canvas) throw new Error(`no canvas: ${selector}`)
      const dpr = canvas.width / (canvas.getBoundingClientRect().width || 1)
      const data = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
      return [data[0], data[1], data[2]]
    },
    { selector, x, y },
  )
}

/** The paragraph's middle line, as a drag path across real text. */
async function textDrag(page: Page): Promise<{ from: [number, number]; to: [number, number] }> {
  const box = await page.locator('[data-testid="capture-body"]').evaluate(el => {
    const rect = (el as HTMLElement).getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width }
  })
  return { from: [box.x + 30, box.y + 30], to: [box.x + box.width - 30, box.y + 30] }
}

/** Draws a red pen stroke with the real pointer after picking the tool on the toolbar. */
async function drawPenStroke(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-pen"]`).click()
  await page.mouse.move(from[0], from[1])
  await page.mouse.down()
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * step) / 8, from[1] + ((to[1] - from[1]) * step) / 8)
  }
  await page.mouse.up()
}

test.describe('page annotation layer', () => {
  test('opens from the popup path, draws ink at the pointer, and exits without a trace', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    const layer = page.locator(LAYER)
    await layer.waitFor()
    await expect(page.locator(TOOLBAR)).toBeVisible()
    // pointer mode starts blank
    const before = await pixelAt(page, CANVAS, 235, 150)
    expect(before).toEqual([0, 0, 0])

    await drawPenStroke(page, [200, 150], [320, 150])
    const mid = await pixelAt(page, CANVAS, 235, 150)
    expect(isRed(mid)).toBe(true)

    // the trigger toggles: the second call exits and nothing of the layer remains
    await triggerAnnotation(page)
    await expect(page.locator(LAYER)).toHaveCount(0)

    // reopening starts from the defaults: no ink, and the toolbar is back
    await triggerAnnotation(page)
    await layer.waitFor()
    expect(await pixelAt(page, CANVAS, 235, 150)).toEqual([0, 0, 0])
    await triggerAnnotation(page)
    await expect(page.locator(LAYER)).toHaveCount(0)
  })

  test('the selection menu stays off the page while the layer is open', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()

    // drag a text selection; the menu must not appear over the ink
    const { from, to } = await textDrag(page)
    await page.mouse.move(from[0], from[1])
    await page.mouse.down()
    await page.mouse.move(to[0], to[1], { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    await expect(page.locator(MENU)).toHaveCount(0)

    // exit: the page is the page again; a fresh selection makes the menu appear
    await page.keyboard.press('Escape')
    await expect(page.locator(LAYER)).toHaveCount(0)
    // collapse the earlier selection first: a drag inside a live selection
    // does not reselect (pre-existing selection-menu behavior)
    await page.mouse.click(20, 20)
    await page.waitForTimeout(150)
    await page.mouse.move(from[0], from[1])
    await page.mouse.down()
    await page.mouse.move(to[0], to[1], { steps: 6 })
    await page.mouse.up()
    await expect(page.locator(MENU).first()).toBeVisible()
  })

  test('ink rides into the editor in one undo step and the layer comes back with it', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()

    // a red horizontal pen stroke the region will cover
    await drawPenStroke(page, [200, 150], [320, 150])

    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-screenshot"]`).click()
    await page.locator(SESSION).waitFor()
    // the layer is off the page while the session owns it
    await expect(page.locator(LAYER)).toBeHidden()

    // drag a region around the stroke and confirm it
    await page.mouse.move(140, 100)
    await page.mouse.down()
    await page.mouse.move(380, 200, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator(CONFIRM_BAR)).toBeVisible()
    await page.keyboard.press('Enter')
    await page.locator(PREVIEW).waitFor()
    // the stroke sat at (200..320, 150) viewport; the region started at (140, 100) → in the picture at (60, 50)
    const inkInPreview = await pixelAt(page, PREVIEW_CANVAS, 60, 50)
    expect(isRed(inkInPreview)).toBe(true)

    // one undo takes all the ink off
    await page.keyboard.press('Control+z')
    const afterUndo = await pixelAt(page, PREVIEW_CANVAS, 60, 50)
    expect(afterUndo[0]).toBeGreaterThan(200)

    // cancel: the layer returns with its ink
    await page.keyboard.press('Escape')
    await expect(page.locator(SESSION)).toHaveCount(0)
    await expect(page.locator(LAYER)).toBeVisible()
    expect(isRed(await pixelAt(page, CANVAS, 235, 150))).toBe(true)

    // exit clears the page
    await page.keyboard.press('Escape')
    await expect(page.locator(LAYER)).toHaveCount(0)
  })

  test('clear empties the ink and the next step badge is 1 again; undo brings both back', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()

    // put two step badges down
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-step"]`).click()
    await page.mouse.click(180, 140)
    await page.waitForTimeout(150)
    const badgeBefore = await pixelAt(page, CANVAS, 170, 134) // the disc, clear of the white digit
    expect(isRed(badgeBefore)).toBe(true)
    await page.mouse.click(260, 200)
    await page.waitForTimeout(150)

    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-clear"]`).click()
    await page.waitForTimeout(150)
    expect(await pixelAt(page, CANVAS, 170, 134)).toEqual([0, 0, 0])

    // undo brings the ink and the count back: the next badge counts in as 3
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-undo"]`).click()
    await page.waitForTimeout(150)
    expect(isRed(await pixelAt(page, CANVAS, 170, 134))).toBe(true)
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-step"]`).click()
    await page.mouse.click(340, 240)
    await page.waitForTimeout(150)
    expect(isRed(await pixelAt(page, CANVAS, 330, 234))).toBe(true)
    // clicking the badge selects it: the ring marks it and reads its number, 3
    await page.mouse.click(340, 240)
    await page.waitForTimeout(150)
    const ring = page.locator('[data-ann-ui="annotation-step-selection"]')
    await expect(ring).toBeVisible()
    await expect(ring.locator('button')).toHaveAttribute('aria-label', /3/)
  })

  test('block mode points at the layer instead of starting, and stays available after exit', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()

    // the block-mode shortcut while the layer is open: a notice, no mode
    await triggerBlockMode(page)
    await expect(page.locator(NOTICE)).toBeVisible()
    await expect(page.locator(NOTICE)).toContainText('批注')
    await expect(page.locator(BLOCK_OVERLAY)).toHaveCount(0)

    // exit the layer; block mode enters as usual afterwards
    await page.keyboard.press('Escape')
    await expect(page.locator(LAYER)).toHaveCount(0)
    await triggerBlockMode(page)
    await page.locator(BLOCK_OVERLAY).waitFor()
    await page.keyboard.press('Escape')
    await expect(page.locator(BLOCK_OVERLAY)).toHaveCount(0)
  })

  test('a screenshot session points at itself when the annotation trigger arrives', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    // start a screenshot session first
    await triggerScreenshot(page)
    await page.locator(SESSION).waitFor()
    // drag a pending region so the session has state to protect
    await page.mouse.move(140, 100)
    await page.mouse.down()
    await page.mouse.move(380, 200, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator(CONFIRM_BAR)).toBeVisible()

    await triggerAnnotation(page)
    const notice = page.locator('[data-ann-ui="screenshot-external-notice"]')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('截图')
    // the pending selection is untouched
    await expect(page.locator(CONFIRM_BAR)).toBeVisible()
    await expect(page.locator(LAYER)).toHaveCount(0)
  })
})
