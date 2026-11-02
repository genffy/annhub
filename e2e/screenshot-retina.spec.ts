/**
 * A capture at twice the window's size — the Retina case (screenshot.md §1.1, §4.4): the capture
 * keeps its pixels, the preview stays its drawn size on screen, beautify pads in CSS pixels, and a
 * stroke lands where the pointer drew it, in the picture's pixels. Moved verbatim from
 * screenshot-beautify.spec.ts with its capture stub.
 */
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getScreenshotPageUrl, triggerScreenshot } from './helpers'
import { analyze, boxOf, canvasInfo, openPanel, PREVIEW, savedAsset, SESSION, toolbarButton } from './screenshot-editor-helpers'

test.describe.configure({ timeout: 60_000 })

async function captureAtTwiceTheSize(page: Page, context: BrowserContext): Promise<{ width: number; height: number }> {
  const [innerWidth, innerHeight] = await page.evaluate(() => [window.innerWidth, window.innerHeight])
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(
    async ({ width, height }) => {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')!
      const image = ctx.createImageData(width, height)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const at = (y * width + x) * 4
          image.data[at] = Math.round((x * 255) / (width - 1))
          image.data[at + 1] = Math.round((y * 255) / (height - 1))
          image.data[at + 2] = 128
          image.data[at + 3] = 255
        }
      }
      ctx.putImageData(image, 0, 0)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(blob)
      })
      chrome.tabs.captureVisibleTab = ((_windowId: number, _options: unknown, callback: (url: string) => void) => callback(dataUrl)) as typeof chrome.tabs.captureVisibleTab
    },
    { width: innerWidth * 2, height: innerHeight * 2 },
  )
  return { width: innerWidth, height: innerHeight }
}

test.describe('a capture at twice the window’s size, as a Retina screen takes it (screenshot.md §1.1, §4.4)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('the capture keeps its pixels, the preview its size on screen, the padding its size in CSS pixels, and a stroke lands where the pointer drew it', async ({
    page,
    context,
  }) => {
    await page.goto(getScreenshotPageUrl())
    const view = await captureAtTwiceTheSize(page, context)
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]'), 'the settings have arrived').toBeVisible()
    const post = (await page.getByTestId('screenshot-post').boundingBox())!
    await page.mouse.move(post.x + 10, post.y + 10)
    await page.mouse.down()
    await page.mouse.move(post.x + 410, post.y + 170, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await expect(page.locator(PREVIEW)).toBeVisible()

    // two pixels of picture for each one of the selection, and the selection is as big on screen as it was drawn
    const plain = await canvasInfo(page)
    const selection = await boxOf(page, PREVIEW)
    expect(plain.width / selection.width, 'two pixels across for each on screen').toBeCloseTo(2, 1)
    expect(plain.height / selection.height, 'and down').toBeCloseTo(2, 1)
    expect(selection.width, 'the selection is 400 CSS pixels wide').toBeGreaterThan(300)
    // and it is the part of the window that was selected: the crop's corner is the capture's pixel under the selection's corner
    const [corner] = (await analyze(page, { source: 'canvas', points: [[2, 2]] })).at as [number[]]
    expect(Math.abs(corner![0]! - ((selection.x + 1) * 2 * 255) / (view.width * 2 - 1))).toBeLessThanOrEqual(6)
    expect(Math.abs(corner![1]! - ((selection.y + 1) * 2 * 255) / (view.height * 2 - 1))).toBeLessThanOrEqual(6)

    // beautify pads in CSS pixels: 64 of them are 128 pixels of picture and 64 on screen, on every side
    const { panel, choice } = await openPanel(page)
    await choice('背景', '米色').click()
    await choice('内边距', '大').click()
    await panel.getByRole('switch', { name: '阴影', exact: true }).click() // so the capture is the only thing unlike the background
    await page.keyboard.press('Escape') // the panel is out of the way of the drag
    const grown = await canvasInfo(page)
    expect([grown.width, grown.height], '128 pixels of padding on every side').toEqual([plain.width + 256, plain.height + 256])
    const framedBox = await boxOf(page, PREVIEW)
    expect(framedBox.width - selection.width, '64 CSS pixels on every side, on screen').toBeCloseTo(128, 0)
    expect(framedBox.height - selection.height).toBeCloseTo(128, 0)
    const framed = await analyze(page, { source: 'canvas', background: [246, 241, 231] })
    expect(framed.differs, 'the capture, whole, 128 pixels in from every edge').toEqual({ x: 128, y: 128, width: plain.width, height: plain.height })

    // a stroke lands where the pointer drew it, in the picture's pixels
    const from: [number, number] = [grown.box.x + grown.box.width * 0.3, grown.box.y + grown.box.height * 0.4]
    const to: [number, number] = [grown.box.x + grown.box.width * 0.6, grown.box.y + grown.box.height * 0.7]
    await toolbarButton(page, '矩形').click()
    await page.mouse.move(from[0], from[1])
    await page.mouse.down()
    await page.mouse.move(to[0], to[1], { steps: 6 })
    await page.mouse.up()
    const inPicture = (point: [number, number]): [number, number] => [
      ((point[0] - grown.box.x) * grown.width) / grown.box.width,
      ((point[1] - grown.box.y) * grown.height) / grown.box.height,
    ]
    const [start, end] = [inPicture(from), inPicture(to)]
    const shown = await analyze(page, { source: 'canvas' })
    expect(shown.red, 'a stroke on the framed picture').not.toBeNull()
    for (const [actual, expected, what] of [
      [shown.red!.x, start[0], 'left'],
      [shown.red!.y, start[1], 'top'],
      [shown.red!.x + shown.red!.width, end[0], 'right'],
      [shown.red!.y + shown.red!.height, end[1], 'bottom'],
    ] as const) {
      expect(Math.abs(actual - expected), `the stroke's ${what} edge is where the pointer was (${actual} against ${expected})`).toBeLessThanOrEqual(10)
    }

    // saved: the capture at its full pixels, without the padding, the stroke where it was over the content
    await toolbarButton(page, '确认').click()
    await expect(page.locator(SESSION)).toHaveCount(0)
    const saved = await analyze(page, { source: { dataUrl: (await savedAsset(context)).dataUrl } })
    expect([saved.width, saved.height]).toEqual([plain.width, plain.height])
    expect(Math.abs(saved.red!.x - (start[0] - 128)), 'the saved stroke starts where the framed one did, less the padding').toBeLessThanOrEqual(10)
    expect(Math.abs(saved.red!.y - (start[1] - 128))).toBeLessThanOrEqual(10)
  })
})

