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

  test('the ink follows the page scroll: away and back lands on the same words (annotate.md §1.2)', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    // a stroke over the first section, near the top of the page
    await drawPenStroke(page, [300, 170], [420, 170])
    expect(isRed(await pixelAt(page, CANVAS, 340, 170))).toBe(true)

    // scroll a screen down: the ink moved with the content, off this screen
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(250)
    expect(await pixelAt(page, CANVAS, 340, 170)).toEqual([0, 0, 0])
    // the stroke sits at page y 170 — on screen at -530, above this screen; a stroke drawn now sits lower
    await drawPenStroke(page, [300, 400], [420, 400])
    expect(isRed(await pixelAt(page, CANVAS, 340, 400))).toBe(true)

    // scroll back: the first stroke is on its words again, the second on its own
    await page.mouse.wheel(0, -700)
    await page.waitForTimeout(250)
    expect(isRed(await pixelAt(page, CANVAS, 340, 170))).toBe(true)
    expect(await pixelAt(page, CANVAS, 340, 400)).toEqual([0, 0, 0])
  })

  test('a screenshot after scrolling takes the ink where it shows at that moment (annotate.md §1.3)', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await drawPenStroke(page, [300, 170], [420, 170])

    // scroll so the stroke sits at viewport y 70, then take a region shot of the top band
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(250)
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-screenshot"]`).click()
    await page.locator(SESSION).waitFor()
    await page.mouse.move(100, 20)
    await page.mouse.down()
    await page.mouse.move(500, 120, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await page.locator(PREVIEW).waitFor()
    // the stroke was drawn at page y 170, on screen at 70 → in the picture at 70 - 20 = 50
    expect(isRed(await pixelAt(page, PREVIEW_CANVAS, 200, 50))).toBe(true)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })

  test('ink over an inner scrolling area ignores that area but follows the page (annotate.md §1.2)', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    // a scrollable box in the page: the stroke over it must not follow its own scrolling
    await page.evaluate(() => {
      const box = document.createElement('div')
      box.setAttribute('data-testid', 'inner-scroll')
      box.style.cssText = 'position:absolute;left:280px;top:120px;width:200px;height:100px;overflow-y:scroll;background:#fff;border:1px solid #ddd'
      box.innerHTML = `<div style="height:400px;background:linear-gradient(#fff,#eee)">line<br/>line<br/>line</div>`
      document.body.appendChild(box)
    })
    await drawPenStroke(page, [300, 140], [460, 140])
    expect(isRed(await pixelAt(page, CANVAS, 340, 140))).toBe(true)

    // the box scrolls itself: the ink stays on screen where it was drawn
    await page.evaluate(() => {
      ;(document.querySelector('[data-testid="inner-scroll"]') as HTMLElement).scrollTop = 60
    })
    await page.waitForTimeout(200)
    expect(isRed(await pixelAt(page, CANVAS, 340, 140))).toBe(true)

    // the page scrolls: the ink follows the page (the pointer leaves the box first,
    // so the wheel scrolls the page)
    await page.mouse.move(700, 600)
    await page.mouse.wheel(0, 80)
    await page.waitForTimeout(250)
    expect(await pixelAt(page, CANVAS, 340, 140)).toEqual([0, 0, 0])
    expect(isRed(await pixelAt(page, CANVAS, 340, 60))).toBe(true)
    await page.keyboard.press('Escape')
  })

  test('a step badge follows the page like the strokes do, and one on the sticky nav stays put (annotate.md §1.2)', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    // a badge over the first section, then scroll: it moves with its content
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-step"]`).click()
    await page.mouse.click(340, 170)
    await page.waitForTimeout(120)
    expect(isRed(await pixelAt(page, CANVAS, 330, 164))).toBe(true)
    // a second badge on the sticky nav: pinned to the screen
    await page.mouse.click(700, 28)
    await page.waitForTimeout(120)
    const navBadgeOnScreen = await pixelAt(page, CANVAS, 690, 22)

    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(250)
    // the section badge left this screen with its content; the nav badge did not move
    expect(await pixelAt(page, CANVAS, 330, 164)).toEqual([0, 0, 0])
    expect(await pixelAt(page, CANVAS, 690, 22)).toEqual(navBadgeOnScreen)

    // scroll back: the section badge is on its words again
    await page.mouse.wheel(0, -700)
    await page.waitForTimeout(250)
    expect(isRed(await pixelAt(page, CANVAS, 330, 164))).toBe(true)
    await page.keyboard.press('Escape')
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
