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
type Rgb = readonly [number, number, number]

const isRed = (rgb: Rgb): boolean => rgb[0] >= 200 && rgb[0] - rgb[1] >= 60 && rgb[0] - rgb[2] >= 60

/** Reads one canvas pixel (canvas coordinates = client coordinates × dpr). */
async function pixelAt(page: Page, selector: string, x: number, y: number): Promise<Rgb> {
  return page.evaluate(
    ({ selector, x, y }: { selector: string; x: number; y: number }): [number, number, number] => {
      const canvas = document.querySelector<HTMLCanvasElement>(selector)
      if (!canvas) throw new Error(`no canvas: ${selector}`)
      const dpr = canvas.width / (canvas.getBoundingClientRect().width || 1)
      const data = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
      return [data[0]!, data[1]!, data[2]!]
    },
    { selector, x, y },
  )
}

/** The share of the middle 60% of a segment that carries ink (alpha > 20): 0 none, 1 all the way. */
async function inkAlong(page: Page, selector: string, x1: number, y1: number, x2: number, y2: number): Promise<number> {
  return page.evaluate(
    ({ selector, x1, y1, x2, y2 }: { selector: string; x1: number; y1: number; x2: number; y2: number }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement
      if (!canvas) throw new Error(`no canvas: ${selector}`)
      const dpr = canvas.width / (canvas.getBoundingClientRect().width || 1)
      const ctx = canvas.getContext('2d')!
      let hit = 0
      for (let i = 20; i <= 80; i++) {
        const t = i / 100
        const data = ctx.getImageData(Math.round((x1 + (x2 - x1) * t) * dpr), Math.round((y1 + (y2 - y1) * t) * dpr), 1, 1).data
        if (data[3]! > 20) hit++
      }
      return hit / 61
    },
    { selector, x1, y1, x2, y2 },
  )
}

/** The share of the middle 60% of a segment that carries red ink — for canvases with a picture underneath, where
 *  every pixel is opaque and alpha says nothing: the ink red is rgb(229, 72, 77), antialiased edges included. */
async function redAlong(page: Page, selector: string, x1: number, y1: number, x2: number, y2: number): Promise<number> {
  return page.evaluate(
    ({ selector, x1, y1, x2, y2 }: { selector: string; x1: number; y1: number; x2: number; y2: number }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement
      if (!canvas) throw new Error(`no canvas: ${selector}`)
      const dpr = canvas.width / (canvas.getBoundingClientRect().width || 1)
      const ctx = canvas.getContext('2d')!
      let hit = 0
      for (let i = 20; i <= 80; i++) {
        const t = i / 100
        const data = ctx.getImageData(Math.round((x1 + (x2 - x1) * t) * dpr), Math.round((y1 + (y2 - y1) * t) * dpr), 1, 1).data
        if (data[0]! >= 150 && data[0]! - data[1]! >= 40 && data[0]! - data[2]! >= 40) hit++
      }
      return hit / 61
    },
    { selector, x1, y1, x2, y2 },
  )
}

/** The strongest ink within ±`spread` px of a point, as rgba — null where the square is clean. */
async function inkNear(page: Page, selector: string, x: number, y: number, spread = 2): Promise<[number, number, number, number] | null> {
  return page.evaluate(
    ({ selector, x, y, spread }: { selector: string; x: number; y: number; spread: number }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement
      if (!canvas) throw new Error(`no canvas: ${selector}`)
      const dpr = canvas.width / (canvas.getBoundingClientRect().width || 1)
      const ctx = canvas.getContext('2d')!
      let best: [number, number, number, number] | null = null
      for (let dx = -spread; dx <= spread; dx++) {
        for (let dy = -spread; dy <= spread; dy++) {
          const data = ctx.getImageData(Math.round((x + dx) * dpr), Math.round((y + dy) * dpr), 1, 1).data
          if (data[3]! > 20 && (!best || data[3]! > best[3])) best = [data[0]!, data[1]!, data[2]!, data[3]!]
        }
      }
      return best
    },
    { selector, x, y, spread },
  )
}

/** Picks a tool on the annotation toolbar, then drags the real pointer through the points, 8 steps a segment. */
async function drawWithTool(page: Page, tool: string, path: ReadonlyArray<readonly [number, number]>): Promise<void> {
  await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-${tool}"]`).click()
  await page.mouse.move(path[0]![0], path[0]![1])
  await page.mouse.down()
  for (const point of path.slice(1)) await page.mouse.move(point[0], point[1], { steps: 8 })
  await page.mouse.up()
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

  test('the toolbar draws its every control itself, and auto-erase cycles off → 3 s → 8 s → off', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await expect(page.locator(TOOLBAR)).toBeVisible()

    const shapes = await page.locator(TOOLBAR).evaluate(bar => ({ selects: bar.querySelectorAll('select').length }))
    expect(shapes.selects, 'no native select in the toolbar').toBe(0)

    const erase = page.locator('[data-ann-ui="annotation-auto-erase"]')
    const eraseBox = await erase.boundingBox()
    expect(Math.min(eraseBox!.width, eraseBox!.height), 'the auto-erase button is a 32px target like its neighbours').toBeGreaterThanOrEqual(32)
    await expect(erase).toHaveAccessibleName('自动擦除：关')
    await expect(erase).toHaveAttribute('aria-pressed', 'false')
    await erase.click()
    await expect(erase).toHaveAccessibleName('自动擦除：3 秒')
    await expect(erase).toHaveAttribute('aria-pressed', 'true')
    await erase.click()
    await expect(erase).toHaveAccessibleName('自动擦除：8 秒')
    await erase.click()
    await expect(erase).toHaveAccessibleName('自动擦除：关')
    await triggerAnnotation(page)
    await expect(page.locator(LAYER)).toHaveCount(0)
  })

  // The window-edge toolbar is one of the always-dark pills (visual.md §2): it looks the
  // same whatever the system appearance is, and its icons (≥ 3:1) and its chip's words (≥ 4.5)
  // read on the dark ground.
  test('the toolbar is one always-dark pill in both appearances, and its icons and chip read on it', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    const reading = () =>
      page.evaluate(() => {
        const parse = (value: string): [number, number, number] | null => {
          const m = /^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[,/ ]+[\d.]+)?\)$/.exec(value.trim())
          return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
        }
        const luminance = (c: [number, number, number]) => {
          const f = (v: number) => {
            const s = v / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
        }
        const between = (front: string, back: string): number => {
          const a = parse(front)
          const b = parse(back)
          if (!a || !b) throw new Error(`unreadable colour: ${front} over ${back}`)
          const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)]
          return (hi + 0.05) / (lo + 0.05)
        }
        const bar = document.querySelector('[data-ann-ui="annotation-toolbar"]') as HTMLElement
        const pill = getComputedStyle(bar).backgroundColor
        return {
          pill,
          text: getComputedStyle(bar).color,
          iconContrast: between(getComputedStyle(bar.querySelector('[data-ann-ui="annotation-tool-pen"]')!).color, pill),
          chipContrast: between(getComputedStyle(document.querySelector('[data-ann-ui="annotation-auto-erase"]')!).color, pill),
        }
      })
    const seen: Record<string, Awaited<ReturnType<typeof reading>>> = {}
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await triggerAnnotation(page)
      await page.locator(LAYER).waitFor()
      await page.locator(TOOLBAR).waitFor()
      seen[scheme] = await reading()
      expect(seen[scheme].iconContrast, `the icons read on the pill (${scheme})`).toBeGreaterThanOrEqual(3)
      expect(seen[scheme].chipContrast, `the auto-erase chip's words read on the pill (${scheme})`).toBeGreaterThanOrEqual(4.5)
      await triggerAnnotation(page)
      await expect(page.locator(LAYER)).toHaveCount(0)
    }
    expect(seen.dark!.pill, 'the toolbar does not follow the system appearance').toBe(seen.light!.pill)
    expect(seen.dark!.text).toBe(seen.light!.text)
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

  test('a pen and highlighter V carries no chord from its start to its end, drawing or done (annotate.md §1.2)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()

    // two Vs, one per tool, in their own bands of the window
    const bands: ReadonlyArray<{ tool: 'pen' | 'highlighter'; top: number }> = [
      { tool: 'pen', top: 150 },
      { tool: 'highlighter', top: 430 },
    ]
    for (const { tool, top } of bands) {
      const start: [number, number] = [300, top]
      const mid: [number, number] = [400, top + 130]
      const end: [number, number] = [500, top]
      await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-${tool}"]`).click()
      await page.mouse.move(start[0], start[1])
      await page.mouse.down()
      await page.mouse.move(mid[0], mid[1], { steps: 12 })
      await page.mouse.move(end[0], end[1], { steps: 12 })
      // while the pointer is still down: only the arms are on the canvas
      expect(await inkAlong(page, CANVAS, start[0], start[1], end[0], end[1]), `${tool}: no chord while drawing`).toBe(0)
      expect(await inkAlong(page, CANVAS, start[0], start[1], mid[0], mid[1]), `${tool}: the arm carries ink`).toBeGreaterThanOrEqual(0.95)
      await page.mouse.up()
      expect(await inkAlong(page, CANVAS, start[0], start[1], end[0], end[1]), `${tool}: no chord after release`).toBe(0)
    }
    await page.keyboard.press('Escape')
  })

  test('a fast drag takes the samples the browser folded into its moves: the circle closes (annotate.md §1.2)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-pen"]`).click()

    // 24 moves fired back-to-back through CDP without waiting: the page sees a few pointermove
    // events whose coalesced lists hold the rest
    const cdp = await page.context().newCDPSession(page)
    const centre = { x: 640, y: 360 }
    const radius = 120
    const around = (step: number): { x: number; y: number } => ({
      x: Math.round(centre.x + radius * Math.cos((2 * Math.PI * step) / 24)),
      y: Math.round(centre.y + radius * Math.sin((2 * Math.PI * step) / 24)),
    })
    const start = around(0)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 })
    await Promise.all(
      Array.from({ length: 24 }, (_, step) => {
        const point = around(step + 1)
        return cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'left', buttons: 1 })
      }),
    )
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 })

    // 48 points around the circle — the 24 samples and the arc midpoints between them — each carries ink nearby
    const covered = await page.evaluate(
      ({ selector, cx, cy, r }: { selector: string; cx: number; cy: number; r: number }) => {
        const canvas = document.querySelector(selector) as HTMLCanvasElement
        const dpr = canvas.width / (canvas.getBoundingClientRect().width || 1)
        const ctx = canvas.getContext('2d')!
        let hit = 0
        for (let index = 0; index < 48; index++) {
          const angle = (2 * Math.PI * index) / 48
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          let found = false
          for (let dx = -2; dx <= 2 && !found; dx++) {
            for (let dy = -2; dy <= 2 && !found; dy++) {
              if (ctx.getImageData(Math.round((x + dx) * dpr), Math.round((y + dy) * dpr), 1, 1).data[3]! > 20) found = true
            }
          }
          if (found) hit++
        }
        return hit / 48
      },
      { selector: CANVAS, cx: centre.x, cy: centre.y, r: radius },
    )
    expect(covered).toBeGreaterThanOrEqual(0.95)
    await page.keyboard.press('Escape')
  })

  test('sparse samples come out round: a right-angle corner is cut, the ends stay put (annotate.md §1.2)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-pen"]`).click()
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-width-thin"]`).click()

    // one move per segment: three samples, one right angle
    await page.mouse.move(300, 200)
    await page.mouse.down()
    await page.mouse.move(400, 200)
    await page.mouse.move(400, 300)
    await page.mouse.up()

    expect(await pixelAt(page, CANVAS, 400, 200), 'the corner itself stays clean').toEqual([0, 0, 0])
    expect(await inkNear(page, CANVAS, 375, 212), 'the curve passes inside the corner').not.toBeNull()
    expect(await inkNear(page, CANVAS, 310, 200), 'near the start, on the first sample').not.toBeNull()
    expect(await inkNear(page, CANVAS, 400, 290), 'near the end, on the last sample').not.toBeNull()
    await page.keyboard.press('Escape')
  })

  test('a stroke started on the sticky nav stays where it was pressed, through further scrolling (annotate.md §1.2)', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    // scroll first, in pointer mode, so the nav is stuck to the top
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(250)
    await drawPenStroke(page, [600, 28], [760, 28])

    expect(isRed(await pixelAt(page, CANVAS, 680, 28)), 'the ink sits where it was pressed').toBe(true)
    expect(await pixelAt(page, CANVAS, 680, 328), 'not a scroll below it').toEqual([0, 0, 0])
    // keep scrolling: pinned ink does not move
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(250)
    expect(isRed(await pixelAt(page, CANVAS, 680, 28))).toBe(true)
    await page.keyboard.press('Escape')
  })

  test('a touch drag draws without scrolling the page; the pointer tool hands touch back to the browser (annotate.md §1.2)', async ({ page }) => {
    await page.goto('http://localhost:8173/longpage.html')
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-pen"]`).click()

    // a picked tool opts the canvas out of touch panning
    const whileDrawing = await page.evaluate((selector: string) => getComputedStyle(document.querySelector(selector)!).touchAction, CANVAS)
    expect(whileDrawing).toBe('none')

    const seen: string[] = []
    await page.evaluate(() => {
      const seen = [] as string[]
      ;(window as unknown as { __pointerEvents: string[] }).__pointerEvents = seen
      for (const type of ['pointerdown', 'pointercancel', 'pointerup']) {
        document.addEventListener(type, event => seen.push(`${type}:${(event as PointerEvent).pointerType}`), true)
      }
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true })
    const from = { x: 300, y: 300 }
    const to = { x: 500, y: 300 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
    for (let step = 1; step <= 12; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * step) / 12, y: from.y, id: 1 }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    seen.push(...(await page.evaluate(() => (window as unknown as { __pointerEvents: string[] }).__pointerEvents)))

    expect(seen).toContain('pointerdown:touch')
    expect(seen, 'the browser did not take the touch back as a pan').not.toContain('pointercancel:touch')
    expect(await page.evaluate(() => window.scrollY), 'the page did not scroll').toBe(0)
    expect(await inkAlong(page, CANVAS, from.x, from.y, to.x, to.y)).toBeGreaterThanOrEqual(0.9)

    // back on the pointer tool the canvas leaves touch to the browser again
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-pointer"]`).click()
    const asPointer = await page.evaluate((selector: string) => getComputedStyle(document.querySelector(selector)!).touchAction, CANVAS)
    expect(asPointer).not.toBe('none')
    await page.keyboard.press('Escape')
  })

  test('Ctrl/Cmd+Z undoes a stroke while a tool is picked; the pointer tool leaves the key to the page (annotate.md §1.2)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()

    await drawPenStroke(page, [200, 150], [320, 150])
    await drawPenStroke(page, [200, 250], [320, 250])
    expect(isRed(await pixelAt(page, CANVAS, 235, 150))).toBe(true)

    await page.keyboard.press('Control+z')
    expect(isRed(await pixelAt(page, CANVAS, 235, 150)), 'the first stroke stays').toBe(true)
    expect(await pixelAt(page, CANVAS, 235, 250), 'the second is gone').toEqual([0, 0, 0])
    await page.keyboard.press('Meta+z')
    expect(await pixelAt(page, CANVAS, 235, 150), 'the first is gone too').toEqual([0, 0, 0])

    // with the pointer tool picked the key belongs to the page: the ink stays
    await drawPenStroke(page, [200, 350], [320, 350])
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-pointer"]`).click()
    await page.keyboard.press('Control+z')
    expect(isRed(await pixelAt(page, CANVAS, 235, 350))).toBe(true)
    await page.keyboard.press('Escape')
  })

  test('a highlighter stroke is no deeper where it runs over itself (screenshot.md §1.1)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    // one stroke crossing its own way: down-right, up, then down-left across the first leg
    await drawWithTool(page, 'highlighter', [
      [300, 200],
      [440, 300],
      [440, 200],
      [300, 300],
    ])

    const crossing = await inkNear(page, CANVAS, 370, 250, 3)
    const single = await inkNear(page, CANVAS, 335, 225, 3)
    expect(crossing, 'the legs really cross here').not.toBeNull()
    expect(single).not.toBeNull()
    expect(Math.abs(crossing![3] - single![3]), 'the crossing is no deeper than a single pass').toBeLessThanOrEqual(4)
    await page.keyboard.press('Escape')
  })

  test('ink cut into the editor keeps its shape: the V has no chord there either (annotate.md §1.3)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    // a pen V, then the region (240,150)→(560,370) around it into the editor
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-pen"]`).click()
    await page.mouse.move(300, 200)
    await page.mouse.down()
    await page.mouse.move(400, 330, { steps: 12 })
    await page.mouse.move(500, 200, { steps: 12 })
    await page.mouse.up()
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-screenshot"]`).click()
    await page.locator(SESSION).waitFor()
    await page.mouse.move(240, 150)
    await page.mouse.down()
    await page.mouse.move(560, 370, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await page.locator(PREVIEW).waitFor()

    // viewport (x, y) is preview (x - 240, y - 150): the chord's band carries no red, the arm does
    // (the preview canvas has the picture underneath, so red is what says ink here, not alpha)
    expect(await redAlong(page, PREVIEW_CANVAS, 100, 50, 220, 50)).toBe(0)
    expect(await redAlong(page, PREVIEW_CANVAS, 60, 50, 160, 180)).toBeGreaterThanOrEqual(0.9)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })
})
