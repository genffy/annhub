import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { getScreenshotPageUrl, triggerAnnotation } from './helpers'

/**
 * Recording-time annotation and cursor highlight (annotate.md §3): the
 * toolbar stays off the page because the tab capture films everything, so
 * the tools run on the single keys the popup lists; the highlight and the
 * ripple ride the pointer, never block a click, and both end with the
 * recording. The lifecycle message arrives exactly as the worker broadcasts
 * it — the same road, so the test exercises the real listener.
 */

test.describe.configure({ timeout: 60_000 })

const LAYER = '[data-ann-ui="annotation-layer"]'
const TOOLBAR = '[data-ann-ui="annotation-toolbar"]'
const CANVAS = '[data-ann-ui="annotation-canvas"]'
const HIGHLIGHT = '[data-ann-ui="cursor-highlight"]'
const HIGHLIGHT_SHAPE = '[data-ann-ui="cursor-highlight-shape"]'

/** Yellow-dominant over the white page, antialiased edges included; the ink yellow is rgb(246, 196, 83). */
const isYellow = (rgb: readonly number[]): boolean => rgb[0] >= 200 && rgb[1] >= 150 && rgb[2] <= 140 && rgb[0] - rgb[2] >= 60

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

async function startRecording(page: Page, cursor = true): Promise<void> {
  await page.evaluate(() => undefined)
  const worker = await (await import('./helpers')).ensureServiceWorker(page.context())
  const url = page.url()
  await worker.evaluate(
    async payload => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === payload.url)
      await chrome.tabs.sendMessage(tab!.id!, payload.message, { frameId: 0 })
    },
    { url, message: { type: 'RECORDING_LIFECYCLE', active: true, cursorHighlight: { enabled: cursor, shape: 'ring', color: '#e5484d' } } },
  )
}

async function stopRecording(page: Page): Promise<void> {
  const worker = await (await import('./helpers')).ensureServiceWorker(page.context())
  const url = page.url()
  await worker.evaluate(
    async payload => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === payload.url)
      await chrome.tabs.sendMessage(tab!.id!, { type: 'RECORDING_LIFECYCLE', active: false }, { frameId: 0 })
    },
    { url },
  )
}

test.describe('recording-time annotation and cursor highlight (annotate.md §3)', () => {
  test('the layer opens toolbar-less while recording, and the single keys run the tools', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await startRecording(page)
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    // the toolbar would be filmed: it is hidden while the recording runs
    await expect(page.locator(TOOLBAR)).toBeHidden()

    // press P (pen, red) and draw: the stroke lands on the layer canvas
    await page.keyboard.press('p')
    await page.mouse.move(200, 150)
    await page.mouse.down()
    await page.mouse.move(320, 150, { steps: 8 })
    await page.mouse.up()
    const red = await pixelAt(page, CANVAS, 235, 150)
    expect(red[0]).toBeGreaterThan(180)
    expect(red[0] - red[1]).toBeGreaterThan(60)

    // press 2 (yellow) and draw below: the colour followed the key
    await page.keyboard.press('2')
    await page.mouse.move(200, 220)
    await page.mouse.down()
    await page.mouse.move(320, 220, { steps: 8 })
    await page.mouse.up()
    expect(isYellow(await pixelAt(page, CANVAS, 235, 220))).toBe(true)

    // Z undoes one stroke; V is the pointer; Esc leaves the layer
    await page.keyboard.press('z')
    expect(await pixelAt(page, CANVAS, 235, 220)).toEqual([0, 0, 0])
    await page.keyboard.press('v')
    await page.keyboard.press('Escape')
    await expect(page.locator(LAYER)).toHaveCount(0)
  })

  test('the cursor highlight follows the pointer, never blocks a click, and ends with the recording', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await startRecording(page)
    const highlight = page.locator(HIGHLIGHT_SHAPE)
    await expect(highlight).toBeHidden() // not yet: the pointer has not moved on the page

    await page.mouse.move(400, 300)
    await expect(highlight).toBeVisible()
    const at = await highlight.evaluate(el => {
      const rect = (el as HTMLElement).getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    })
    expect(Math.abs(at.x + 13 - 400)).toBeLessThanOrEqual(2)
    expect(Math.abs(at.y + 13 - 300)).toBeLessThanOrEqual(2)

    // pointer-events: none — the page element under the cursor is the hit target
    const hit = await page.evaluate(() => document.elementFromPoint(400, 300)?.tagName)
    expect(hit).not.toBe('DIV')
    expect(hit).toBe('P')

    // stopping the recording takes the highlight with it (annotate.md §3.3)
    await stopRecording(page)
    await expect(page.locator(HIGHLIGHT)).toHaveCount(0)
    // and the layer opened now shows its toolbar again (§3.1: 不录制时照常显示)
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await expect(page.locator(TOOLBAR)).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('a layer that was open before the recording collapses its toolbar, and it comes back after', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await expect(page.locator(TOOLBAR)).toBeVisible()

    await startRecording(page)
    await expect(page.locator(TOOLBAR)).toBeHidden()
    // single keys still reach the collapsed layer
    await page.keyboard.press('p')
    await page.mouse.move(180, 180)
    await page.mouse.down()
    await page.mouse.move(260, 180, { steps: 5 })
    await page.mouse.up()
    const red = await pixelAt(page, CANVAS, 220, 180)
    expect(red[0]).toBeGreaterThan(180)
    expect(red[0] - red[1]).toBeGreaterThan(60)

    await stopRecording(page)
    await expect(page.locator(TOOLBAR)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator(LAYER)).toHaveCount(0)
  })

  test('keys belong to the page while the focus sits in an input', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await startRecording(page, false)
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    // a page-owned input: the keys are the page's even with the layer open (the toolbar is hidden anyway)
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.setAttribute('data-testid', 'page-input')
      document.body.appendChild(input)
    })
    await page.locator('[data-testid="page-input"]').click()
    await page.keyboard.press('p')
    // the input holds the character; no tool switched (the stroke below is the pointer, nothing drawn)
    await page.mouse.move(200, 150)
    await page.mouse.down()
    await page.mouse.move(320, 150, { steps: 6 })
    await page.mouse.up()
    // nothing was drawn: the layer stayed in pointer mode
    expect(await pixelAt(page, CANVAS, 235, 150)).toEqual([0, 0, 0])
    const value = await page.locator('[data-testid="page-input"]').inputValue()
    expect(value).toBe('p')
    await page.keyboard.press('Escape')
  })
})
