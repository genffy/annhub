import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { getScreenshotPageUrl, triggerAnnotation } from './helpers'

/**
 * Page annotation and tab recording do not touch each other (annotate.md §3): the annotation layer is the same
 * layer with or without a recording — its toolbar, its tools, its keys, its ink — and the recording adds only the
 * cursor highlight and the ripple, which ride the pointer, never block a click and end with the recording. The
 * lifecycle message arrives exactly as the worker broadcasts it — the same road, so the test exercises the real listener.
 */

test.describe.configure({ timeout: 60_000 })

const LAYER = '[data-ann-ui="annotation-layer"]'
const TOOLBAR = '[data-ann-ui="annotation-toolbar"]'
const CANVAS = '[data-ann-ui="annotation-canvas"]'
const HIGHLIGHT = '[data-ann-ui="cursor-highlight"]'
const HIGHLIGHT_SHAPE = '[data-ann-ui="cursor-highlight-shape"]'

/** Yellow-dominant over the white page, antialiased edges included; the ink yellow is rgb(246, 196, 83). */
type Rgb = readonly [number, number, number]

const isYellow = (rgb: Rgb): boolean => rgb[0] >= 200 && rgb[1] >= 150 && rgb[2] <= 140 && rgb[0] - rgb[2] >= 60

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

/** The worker's own broadcast: no frameId, so every frame of the tab hears it (annotate.md §3.3). */
async function broadcastLifecycle(page: Page, active: boolean): Promise<void> {
  const worker = await (await import('./helpers')).ensureServiceWorker(page.context())
  const url = page.url()
  await worker.evaluate(
    async payload => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === payload.url)
      await chrome.tabs.sendMessage(tab!.id!, payload.message)
    },
    {
      url,
      message: active
        ? { type: 'RECORDING_LIFECYCLE', active: true, cursorHighlight: { enabled: true, shape: 'ring', color: '#e5484d' } }
        : { type: 'RECORDING_LIFECYCLE', active: false },
    },
  )
}

test.describe('recording-time annotation and cursor highlight (annotate.md §3)', () => {
  /** A drag with the real pointer: the stroke lands on the layer's canvas when a drawing tool is picked. */
  async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
    await page.mouse.move(from[0], from[1])
    await page.mouse.down()
    await page.mouse.move(to[0], to[1], { steps: 8 })
    await page.mouse.up()
  }

  const toolButton = (page: Page, tool: string) => page.locator(`${TOOLBAR} [data-ann-ui="annotation-tool-${tool}"]`)

  test('a layer opened while recording is the layer as always: its toolbar is there, it starts on the pointer, the toolbar picks the tools', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await startRecording(page)
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await expect(page.locator(TOOLBAR), 'the toolbar is on the page, so it is in the picture like the rest of the page').toBeVisible()
    await expect(toolButton(page, 'pointer')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(LAYER)).not.toHaveClass(/ann-annot-drawing/)

    // the pointer tool leaves the page to itself: a drag draws nothing
    await drag(page, [200, 150], [320, 150])
    expect(await pixelAt(page, CANVAS, 235, 150)).toEqual([0, 0, 0])

    // pen from the toolbar: red
    await toolButton(page, 'pen').click()
    await drag(page, [200, 150], [320, 150])
    const red = await pixelAt(page, CANVAS, 235, 150)
    expect(red[0]).toBeGreaterThan(180)
    expect(red[0] - red[1]).toBeGreaterThan(60)

    // a colour from the toolbar: yellow
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-color-yellow"]`).click()
    await drag(page, [200, 220], [320, 220])
    expect(isYellow(await pixelAt(page, CANVAS, 235, 220))).toBe(true)

    // undo and exit from the toolbar
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-undo"]`).click()
    expect(await pixelAt(page, CANVAS, 235, 220)).toEqual([0, 0, 0])
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-exit"]`).click()
    await expect(page.locator(LAYER)).toHaveCount(0)
  })

  test('a layer that is already open when the recording starts is left as it was, and so is it when the recording stops', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await toolButton(page, 'pen').click()
    await drag(page, [200, 150], [320, 150])
    const red = async (y: number): Promise<boolean> => {
      const rgb = await pixelAt(page, CANVAS, 235, y)
      return rgb[0] > 180 && rgb[0] - rgb[1] > 60
    }
    expect(await red(150)).toBe(true)

    await startRecording(page)
    // nothing about the layer moved: the toolbar, the tool the user picked, the ink drawn so far
    await expect(page.locator(TOOLBAR)).toBeVisible()
    await expect(toolButton(page, 'pen')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(LAYER)).toHaveClass(/ann-annot-drawing/)
    expect(await red(150)).toBe(true)
    // the pen still draws, with the cursor highlight riding the pointer over the layer
    await drag(page, [200, 220], [320, 220])
    expect(await red(220)).toBe(true)
    await expect(page.locator(HIGHLIGHT_SHAPE)).toBeVisible()

    await stopRecording(page)
    await expect(page.locator(HIGHLIGHT)).toHaveCount(0)
    await expect(page.locator(TOOLBAR)).toBeVisible()
    await expect(toolButton(page, 'pen')).toHaveAttribute('aria-pressed', 'true')
    expect(await red(150)).toBe(true)
    expect(await red(220)).toBe(true)
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-exit"]`).click()
    await expect(page.locator(LAYER)).toHaveCount(0)
  })

  // A site binds single keys of its own (X: L likes, R replies, T reposts, N posts); the recording must not take them
  // for the annotation layer, which has no keys of that kind — the page hears every one and nothing in the layer changes.
  test('the page keeps its own single keys while a recording runs with the layer open', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await startRecording(page)
    await triggerAnnotation(page)
    await page.locator(LAYER).waitFor()
    await toolButton(page, 'pen').click()
    await page.evaluate(() => {
      const seen: Array<{ key: string; prevented: boolean }> = []
      ;(window as unknown as { __keys: typeof seen }).__keys = seen
      window.addEventListener('keydown', event => seen.push({ key: event.key, prevented: event.defaultPrevented }))
    })
    const keys = ['l', 'p', 'h', 'a', 'r', 'o', 't', 'n', 'v', '1', '2', 'z', 'e']
    for (const key of keys) await page.keyboard.press(key)
    const seen = await page.evaluate(() => (window as unknown as { __keys: Array<{ key: string; prevented: boolean }> }).__keys)
    expect(
      seen.map(entry => entry.key),
      'the page heard every key',
    ).toEqual(keys)
    expect(
      seen.filter(entry => entry.prevented),
      'and none was taken from it',
    ).toEqual([])
    // the layer took none of them for itself either: the pen is still the tool and the layer is still open
    await expect(toolButton(page, 'pen')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(LAYER)).toHaveCount(1)
    await page.locator(`${TOOLBAR} [data-ann-ui="annotation-exit"]`).click()
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
  })

  test('a same-origin subframe follows the stop of the recording like the top frame (annotate.md §3.3, RV-CAP-19)', async ({ page }) => {
    await page.goto('http://localhost:8173/iframe-host.html')
    const frame = page.frameLocator('iframe[name="same"]')
    await broadcastLifecycle(page, true)
    await frame.locator('#frame-text').hover()
    await expect(frame.locator(HIGHLIGHT_SHAPE), 'the subframe shows the highlight while the recording runs').toBeVisible()
    await broadcastLifecycle(page, false)
    await expect(frame.locator(HIGHLIGHT), 'the stop reaches the subframe: the highlight goes away there too').toHaveCount(0)
  })

  test('one ring at a time: the top ring hides while the pointer is inside a same-origin subframe (annotate.md §3.2)', async ({ page }) => {
    await page.goto('http://localhost:8173/iframe-host.html')
    await broadcastLifecycle(page, true)
    const shape = '[data-ann-ui="cursor-highlight-shape"]'
    const visible = async (): Promise<{ top: number; child: number; total: number }> => {
      const top = await page.evaluate(sel => {
        const el = document.querySelector<HTMLElement>(sel)
        return el && el.style.display === 'block' ? 1 : 0
      }, shape)
      const child = await page
        .frameLocator('iframe[name="same"]')
        .locator('html')
        .evaluate((_html, sel) => {
          const el = document.querySelector<HTMLElement>(sel)
          return el && el.style.display === 'block' ? 1 : 0
        }, shape)
      return { top, child, total: top + child }
    }

    // outside the iframe: the top frame's ring follows the pointer
    await page.mouse.move(420, 300)
    await page.waitForTimeout(120)
    expect(await visible(), "outside: one ring, the top frame's").toMatchObject({ total: 1, top: 1 })

    // inside: the subframe's ring takes over and the top ring is gone — one ring on screen
    const box = (await page.locator('iframe[name="same"]').boundingBox())!
    await page.mouse.move(box.x + 6, box.y + 40, { steps: 6 })
    await page.mouse.move(box.x + 250, box.y + 90, { steps: 12 })
    await page.waitForTimeout(120)
    expect(await visible(), "inside: one ring, the subframe's").toMatchObject({ total: 1, child: 1 })

    // back out: the top frame's ring returns
    await page.mouse.move(box.x - 30, box.y + 40, { steps: 6 })
    await page.mouse.move(420, 320, { steps: 4 })
    await page.waitForTimeout(120)
    expect(await visible(), "back out: one ring, the top frame's again").toMatchObject({ total: 1, top: 1 })
  })
})
