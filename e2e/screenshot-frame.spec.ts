import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getAssetMetadata, getEntries, stopServiceWorker, triggerScreenshot } from './helpers'

/**
 * Precise selection and repeatable frames (screenshot.md §1.2, §1.4, §6;
 * US-CAP-10, US-CAP-16). The pricing fixture has a billing toggle whose
 * three states change only the price text — the frame must stay identical.
 */

const PAGE_URL = 'http://localhost:8173/pricing.html'
/** A timeline that keeps a few cells in the DOM and recycles them as the page scrolls, like a social feed's. */
const FEED_URL = 'http://localhost:8173/virtualfeed.html'

async function open(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(PAGE_URL)
  await page.waitForLoadState('networkidle')
}

function scrollY(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.scrollY)
}

/**
 * The session is open and past the moment it looks for a remembered frame (that answer comes a round trip after the
 * settings): either the picking chips or a pending frame is on the screen, and then the page has had time to move if
 * anything was going to move it.
 */
async function sessionSettled(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-ann-ui="screenshot-ratio-bar"], [data-ann-ui="shot-confirm-bar"]').first().waitFor()
  await page.waitForTimeout(700)
}

/** Hovers the plans, presses ↑ until the container is the target, picks the margin, clicks. */
async function capturePlansWithMargin(page: import('@playwright/test').Page, margin: number): Promise<void> {
  await triggerScreenshot(page)
  // the frame the last shot left is offered, pending, and owns the screen; the target here is chosen afresh, so it is
  // let go with a click outside it
  await page.locator('[data-ann-ui="screenshot-ratio-bar"], [data-ann-ui="shot-confirm-bar"]').first().waitFor()
  if (await page.locator('[data-ann-ui="shot-confirm-bar"]').count()) await page.mouse.click(4, 4)
  const plans = page.getByTestId('plans')
  const box = (await plans.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 30)
  await page.waitForTimeout(200)
  // ↑ climbs from the hovered heading through its card to the container
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(150)
  await page.locator(`[data-ann-ui="shot-margin-${margin}"]`).click()
  await page.waitForTimeout(120)
  await page.mouse.click(box.x + box.width / 2, box.y + 30)
  await page.locator('[data-ann-ui="screenshot-save"]').click()
  await page.locator('[data-ann-ui="screenshot-session"]').waitFor({ state: 'detached', timeout: 15_000 })
}

/** Pixel dimensions of every saved screenshot asset, oldest first. */
async function savedShotDims(context: import('@playwright/test').BrowserContext): Promise<Array<{ id: string; width: number; height: number }>> {
  const entries = await getEntries(context)
  const ids = entries
    .filter(entry => entry.type === 'screenshot')
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(entry => entry.assetId!)
  return assetDims(context, ids)
}

async function assetDims(context: import('@playwright/test').BrowserContext, ids: string[]): Promise<Array<{ id: string; width: number; height: number }>> {
  const assets = await getAssetMetadata(context)
  const byId = new Map(assets.map(asset => [asset.id, asset] as const))
  return ids.map(id => ({ id, width: byId.get(id)?.width ?? 0, height: byId.get(id)?.height ?? 0 }))
}

/** Compares the outer margin ring of two saved assets, pixel by pixel. */
async function ringsEqual(page: import('@playwright/test').Page, ids: string[], ringCss: number): Promise<boolean> {
  const dataUrls = await Promise.all(
    ids.map(async id => {
      const sw = await ensureServiceWorker(page.context())
      return sw.evaluate(async assetId => {
        const open = (await indexedDB.open('annhub')) as IDBOpenDBRequest
        return await new Promise<string>(resolve => {
          open.onsuccess = () => {
            const db = open.result
            if (!db.objectStoreNames.contains('assets')) {
              resolve('')
              return
            }
            const request = db.transaction('assets', 'readonly').objectStore('assets').get(assetId)
            request.onsuccess = async () => {
              const blob = (request.result as { bytes: Blob }).bytes
              const dataUrl = await new Promise<string>(resolve2 => {
                const reader = new FileReader()
                reader.onload = () => resolve2(String(reader.result))
                reader.readAsDataURL(blob)
              })
              resolve(dataUrl)
            }
          }
        })
      }, id)
    }),
  )
  return page.evaluate(
    async ([urls, ring]) => {
      const load = (url: string) =>
        new Promise<ImageBitmap>(resolve => {
          const img = new Image()
          img.onload = () => resolve(createImageBitmap(img))
          img.src = url
        })
      const bitmaps = await Promise.all(urls.map(load))
      const [first, ...rest] = bitmaps
      if (!first) return false
      const sample = (bitmap: ImageBitmap): Uint8ClampedArray => {
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(bitmap, 0, 0)
        const { width, height } = bitmap
        const ringWidth = Math.round(ring * (width / window.innerWidth))
        // the outer ring: rows and columns within ringWidth of each edge
        const points: Array<[number, number]> = []
        for (let x = 0; x < width; x++) {
          for (const y of [0, Math.floor(ringWidth / 2), ringWidth - 1, height - ringWidth, height - Math.floor(ringWidth / 2), height - 1]) points.push([x, y])
        }
        for (let y = 0; y < height; y++) {
          for (const x of [0, Math.floor(ringWidth / 2), ringWidth - 1, width - ringWidth, width - Math.floor(ringWidth / 2), width - 1]) points.push([x, y])
        }
        const data = ctx.getImageData(0, 0, width, height).data
        const out = new Uint8ClampedArray(points.length * 4)
        points.forEach(([x, y], i) => {
          const at = (y * width + x) * 4
          out[i * 4] = data[at]!
          out[i * 4 + 1] = data[at + 1]!
          out[i * 4 + 2] = data[at + 2]!
          out[i * 4 + 3] = data[at + 3]!
        })
        return out
      }
      const reference = sample(first)
      return rest.every(bitmap => {
        const other = sample(bitmap)
        if (other.length !== reference.length) return false
        for (let i = 0; i < reference.length; i++) if (Math.abs(other[i]! - reference[i]!) > 6) return false
        return true
      })
    },
    [dataUrls, ringCss] as [string[], number],
  )
}

test.describe('repeatable frames (screenshot.md §1.4)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('element + 24px margin yields identical sizes and an identical margin ring across three states', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page)
    for (const period of ['monthly', 'quarterly', 'yearly']) {
      await page.locator(`.toggle button[data-period="${period}"]`).click()
      await capturePlansWithMargin(page, 24)
    }
    const dims = await savedShotDims(page.context())
    expect(dims).toHaveLength(3)
    for (const dim of dims) expect(dim.width).toBe(dims[0]!.width)
    for (const dim of dims) expect(dim.height).toBe(dims[0]!.height)
    expect(dims[0]!.width).toBeGreaterThan(400)
    // the ring around the plans shows the page, not the changing prices
    expect(
      await ringsEqual(
        page,
        dims.map(dim => dim.id),
        24,
      ),
    ).toBe(true)
  })

  test('after a small scroll the last frame follows its element, and the page stays where the user left it', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page)
    await capturePlansWithMargin(page, 24)
    const first = (await savedShotDims(page.context()))[0]!

    // the plans move up the window and are still wholly in it: the frame goes with them, the page is not scrolled for it
    await page.evaluate(() => window.scrollTo(0, 40))
    expect(await scrollY(page)).toBe(40)
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="shot-frame-label"]')).toContainText('上次取景框')
    expect(await scrollY(page)).toBe(40)
    await page.keyboard.press('Enter')
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await page.locator('[data-ann-ui="screenshot-session"]').waitFor({ state: 'detached', timeout: 15_000 })

    const dims = await savedShotDims(page.context())
    expect(dims).toHaveLength(2)
    expect(dims[1]!.width).toBe(first.width)
    expect(dims[1]!.height).toBe(first.height)
    expect(
      await ringsEqual(
        page,
        dims.map(dim => dim.id),
        24,
      ),
    ).toBe(true)
  })

  test('a last frame that is out of sight is not chased: the page stays, and the memory waits for the plans to be back', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page)
    await capturePlansWithMargin(page, 24)

    await page.evaluate(() => window.scrollTo(0, 700))
    const away = await scrollY(page)
    expect(away, 'the plans are above the window now').toBeGreaterThan(300)
    await triggerScreenshot(page)
    await sessionSettled(page)
    expect(await scrollY(page), 'opening the session does not scroll the page').toBe(away)
    await expect(page.locator('[data-ann-ui="shot-frame-label"]')).toHaveCount(0)
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toHaveCount(0)

    // the memory is still there: with the plans in the window again the frame is offered
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="shot-frame-label"]')).toContainText('上次取景框')
  })

  // X: the first post is remembered, the user reads on, and the shortcut then threw the page back to the top and
  // framed the post that sits there — wherever the user had scrolled to
  test('on a timeline whose cells are recycled, the shortcut never takes the user back to the post it remembers', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto(FEED_URL)
    await page.waitForLoadState('networkidle')
    await triggerScreenshot(page)
    const post = (await page.locator('article[data-post="1"]').boundingBox())!
    // the post's own padding: the hovered element is the post itself
    await page.mouse.move(post.x + 6, post.y + 6)
    await page.waitForTimeout(200)
    await page.mouse.click(post.x + 6, post.y + 6)
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await page.locator('[data-ann-ui="screenshot-session"]').waitFor({ state: 'detached', timeout: 15_000 })

    for (const depth of [6000, 2500]) {
      await page.evaluate(top => window.scrollTo(0, top), depth)
      await expect.poll(() => page.locator('[data-testid="timeline"] > .cell').first().getAttribute('style')).not.toContain('top: 0px')
      expect(await scrollY(page)).toBe(depth)
      await triggerScreenshot(page)
      await sessionSettled(page)
      expect(await scrollY(page), `with the page at ${depth}`).toBe(depth)
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    }
  })

  test("a frame offered from memory and confirmed as it came is still the element's: it follows the element when the layout moves", async ({ page }) => {
    test.setTimeout(180_000)
    await open(page)
    await capturePlansWithMargin(page, 24)

    // offered, confirmed untouched, saved: the memory must keep the element, not turn it into a place on the page
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="shot-frame-label"]')).toContainText('上次取景框')
    await page.keyboard.press('Enter')
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await page.locator('[data-ann-ui="screenshot-session"]').waitFor({ state: 'detached', timeout: 15_000 })

    // the content moves down: the plans are somewhere else on the page now (padding, so no sibling index shifts)
    await page.evaluate(() => {
      document.body.style.paddingTop = '120px'
    })
    await triggerScreenshot(page)
    const label = page.locator('[data-ann-ui="shot-frame-label"]')
    await expect(label).toContainText('上次取景框')
    await expect(label).not.toContainText('没找到')
    const plans = (await page.getByTestId('plans').boundingBox())!
    const frame = (await page.locator('.ann-shot-rect').boundingBox())!
    expect(frame.y, 'the frame went with the plans').toBeCloseTo(plans.y - 24, 0)
    expect(frame.x).toBeCloseTo(plans.x - 24, 0)
    expect(frame.width).toBeCloseTo(plans.width + 48, 0)
    expect(frame.height).toBeCloseTo(plans.height + 48, 0)
  })

  test('a missing anchor falls back to the recorded position with a notice', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page)
    await capturePlansWithMargin(page, 24)
    const first = (await savedShotDims(page.context()))[0]!

    await page.getByTestId('remove-anchor').click()
    // the click scrolled the page to its foot; the recorded place is in the window again once the user is back
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="shot-frame-label"]')).toContainText('没找到上次的元素')
    await page.keyboard.press('Enter')
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await page.locator('[data-ann-ui="screenshot-session"]').waitFor({ state: 'detached', timeout: 15_000 })

    const dims = await savedShotDims(page.context())
    expect(dims).toHaveLength(2)
    expect(dims[1]!.width).toBe(first.width)
    expect(dims[1]!.height).toBe(first.height)
  })
})

test.describe('the last frame is kept for this tab and this page only (screenshot.md §1.4)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  /** Drags a box and saves it: the frame this tab now remembers. */
  async function saveDraggedFrame(page: import('@playwright/test').Page): Promise<void> {
    await triggerScreenshot(page)
    await page.mouse.move(60, 80)
    await page.mouse.down()
    await page.mouse.move(420, 260, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await page.locator('[data-ann-ui="screenshot-session"]').waitFor({ state: 'detached', timeout: 15_000 })
  }

  /** Whether a new session opens on the remembered frame; the session is cancelled again either way. */
  async function offersLastFrame(page: import('@playwright/test').Page): Promise<boolean> {
    // back at the top, where these tests drew the frame: a fragment link scrolls the page, and a frame is offered
    // only where it is in the window
    await page.evaluate(() => window.scrollTo(0, 0))
    await triggerScreenshot(page)
    await page.locator('[data-ann-ui="screenshot-session"]').waitFor()
    const offered = await page
      .locator('[data-ann-ui="shot-frame-label"]')
      .waitFor({ timeout: 2000 })
      .then(
        () => true,
        () => false,
      )
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    return offered
  }

  /** The tabs the worker keeps a frame for. */
  async function keptFrames(context: import('@playwright/test').BrowserContext): Promise<string[]> {
    const sw = await ensureServiceWorker(context)
    return sw.evaluate(async () => Object.keys(await chrome.storage.session.get(null)).filter(key => key.startsWith('annhub.frame:')))
  }

  test('a reload, another query or another fragment keep it; another tab on the same page does not have it', async ({ page, context }) => {
    await open(page)
    await saveDraggedFrame(page)
    await expect.poll(() => keptFrames(context)).toHaveLength(1)
    await page.reload()
    expect(await offersLastFrame(page), 'after a reload').toBe(true)
    await page.goto(`${PAGE_URL}?period=yearly#plans`)
    expect(await offersLastFrame(page), 'with another query and fragment').toBe(true)

    const other = await context.newPage()
    await open(other)
    expect(await offersLastFrame(other), 'in another tab').toBe(false)
    expect(await keptFrames(context)).toHaveLength(1)
    await other.close()
  })

  test('moving to another page forgets it, even when the worker was asleep', async ({ page, context }) => {
    await open(page)
    await saveDraggedFrame(page)
    await expect.poll(() => keptFrames(context)).toHaveLength(1)
    // the tab event has to wake the worker: its listener is there only because a tab has a frame
    await stopServiceWorker(context, page)
    await page.goto('http://localhost:8173/capture.html')
    await expect.poll(() => keptFrames(context)).toHaveLength(0)
    await open(page)
    expect(await offersLastFrame(page), 'back on the page').toBe(false)
  })

  test('a page that changes its path in place has moved to another page', async ({ page, context }) => {
    await open(page)
    await saveDraggedFrame(page)
    await expect.poll(() => keptFrames(context)).toHaveLength(1)
    await page.evaluate(() => history.pushState(null, '', '/pricing-yearly.html'))
    await expect.poll(() => keptFrames(context)).toHaveLength(0)
    await page.evaluate(() => history.pushState(null, '', '/pricing.html'))
    expect(await offersLastFrame(page), 'back on the first path').toBe(false)
  })

  test('closing the tab forgets it', async ({ context }) => {
    const tab = await context.newPage()
    await open(tab)
    await saveDraggedFrame(tab)
    await expect.poll(() => keptFrames(context)).toHaveLength(1)
    await tab.close()
    await expect.poll(() => keptFrames(context)).toHaveLength(0)
  })

  test('a frame drawn over the last one does not carry its label along', async ({ page }) => {
    await open(page)
    await saveDraggedFrame(page)
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="shot-frame-label"]')).toContainText('上次取景框')

    // a drag elsewhere replaces it: the new frame is a new frame, not "the last one"
    await page.mouse.move(700, 300)
    await page.mouse.down()
    await page.mouse.move(980, 480, { steps: 4 })
    await page.mouse.up()
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await expect(page.locator('[data-ann-ui="shot-frame-label"]')).toHaveCount(0)
  })

  // the area also holds the captures sender.ts lets a content script undo and edit: it must stay closed to them
  test("neither the page's scripts nor the extension's content scripts can read it", async ({ page, context }) => {
    await open(page)
    await saveDraggedFrame(page)
    await expect.poll(() => keptFrames(context)).toHaveLength(1)
    expect(await page.evaluate(() => [...Object.keys(sessionStorage), ...Object.keys(localStorage)].filter(key => key.startsWith('annhub')))).toEqual([])

    const cdp = await context.newCDPSession(page)
    const worlds: Array<{ id: number; origin: string; auxData?: { type?: string } }> = []
    cdp.on('Runtime.executionContextCreated', event => worlds.push(event.context))
    await cdp.send('Runtime.enable')
    await expect.poll(() => worlds.some(world => world.auxData?.type === 'isolated' && world.origin.startsWith('chrome-extension://'))).toBe(true)
    const contentScripts = worlds.find(world => world.auxData?.type === 'isolated' && world.origin.startsWith('chrome-extension://'))!
    const { result } = await cdp.send('Runtime.evaluate', {
      contextId: contentScripts.id,
      expression: "chrome.storage.session.get(null).then(items => 'read ' + Object.keys(items).join(', '), error => 'refused: ' + error.message)",
      awaitPromise: true,
      returnByValue: true,
    })
    expect(result.value).toMatch(/^refused/)
    await cdp.detach()
  })
})

test.describe('precise selection (screenshot.md §1.2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('a released drag waits for confirmation; arrows nudge; Enter captures, Esc cancels', async ({ page }) => {
    await open(page)
    await triggerScreenshot(page)
    await page.mouse.move(60, 80)
    await page.mouse.down()
    await page.mouse.move(420, 260, { steps: 4 })
    await page.mouse.up()

    const bar = page.locator('[data-ann-ui="shot-confirm-bar"]')
    await expect(bar).toBeVisible()
    await expect(page.locator('[data-ann-ui="shot-handle-se"]')).toBeVisible()
    expect((await getEntries(page.context())).filter(entry => entry.type === 'screenshot')).toHaveLength(0)

    const rect = page.locator('.ann-shot-rect')
    const before = await rect.boundingBox()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    const after = await rect.boundingBox()
    expect(after!.x).toBe(before!.x + 1)
    expect(after!.y).toBe(before!.y + 10)

    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect.poll(async () => (await getEntries(page.context())).filter(entry => entry.type === 'screenshot')).toHaveLength(1)

    // Esc at the confirmation stage cancels the session outright
    await triggerScreenshot(page)
    await page.mouse.move(60, 80)
    await page.mouse.down()
    await page.mouse.move(420, 260, { steps: 3 })
    await page.mouse.up()
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
  })

  test('dragging snaps to element edges and Shift holds the ratio', async ({ page }) => {
    await open(page)
    await triggerScreenshot(page)
    const plans = (await page.getByTestId('plans').boundingBox())!

    // drag from inside the plans toward its left edge: the moving point snaps onto it
    await page.mouse.move(plans.x + 120, plans.y + 120)
    await page.mouse.down()
    await page.mouse.move(plans.x + 3, plans.y + 260, { steps: 5 })
    await page.mouse.move(plans.x + 1, plans.y + 300, { steps: 2 })
    const rect = await page.locator('.ann-shot-rect').boundingBox()
    expect(Math.abs(rect!.x - plans.x)).toBeLessThanOrEqual(2)

    // hold Shift: the ratio freezes even as the pointer wanders
    await page.keyboard.down('Shift')
    const locked = await page.locator('.ann-shot-rect').boundingBox()
    const ratio = locked!.width / locked!.height
    await page.mouse.move(plans.x + 500, plans.y + 40, { steps: 4 })
    const shifted = await page.locator('.ann-shot-rect').boundingBox()
    expect(Math.abs(shifted!.width / shifted!.height - ratio)).toBeLessThan(0.05)
    await page.keyboard.up('Shift')
    await page.mouse.up()
  })

  test('↑ skips same-box wrappers to the plans container; the margin bar appears on hover', async ({ page }) => {
    await open(page)
    await triggerScreenshot(page)
    const plans = (await page.getByTestId('plans').boundingBox())!
    await page.mouse.move(plans.x + plans.width / 2, plans.y + 30)
    await page.waitForTimeout(250)
    await expect(page.locator('[data-ann-ui="shot-margin-bar"]')).toBeVisible()

    const hovered = await page.locator('[data-ann-ui="shot-hover-outline"]').boundingBox()
    expect(hovered!.height).toBeLessThan(plans.height) // a card, not the container
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(200)
    const climbed = await page.locator('[data-ann-ui="shot-hover-outline"]').boundingBox()
    expect(Math.abs(climbed!.x - plans.x)).toBeLessThanOrEqual(4)
    expect(Math.abs(climbed!.width - plans.width)).toBeLessThanOrEqual(4)
  })

  test('a pending frame owns the screen: no picker beside it, its own hint, and a click outside starts over (screenshot.md §1.2)', async ({ page }) => {
    await open(page)
    await triggerScreenshot(page)
    const plans = (await page.getByTestId('plans').boundingBox())!
    const hint = page.locator('.ann-shot-hint')
    await expect(hint).toContainText('单击选择元素')

    // drag a frame over the left part of the plans row
    await page.mouse.move(plans.x + 20, plans.y + 20)
    await page.mouse.down()
    await page.mouse.move(plans.x + plans.width * 0.45, plans.y + plans.height - 20, { steps: 4 })
    await page.mouse.up()
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()

    // what the screen says is about the frame: how to settle it, not how to pick; the chips of a drag that is over are gone
    await expect(hint).toContainText('点选区外重选')
    await expect(hint).not.toContainText('单击选择元素')
    await expect(hint).toContainText('匿名')
    await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]')).toHaveCount(0)
    // and the hint is not dimmed by the frame's shade: it is above the frame
    const stacking = await page.evaluate(() => {
      const layer = (selector: string): number => Number(getComputedStyle(document.querySelector(selector)!).zIndex) || 0
      return { hint: layer('.ann-shot-hint'), frame: layer('.ann-shot-rect') }
    })
    expect(stacking.hint).toBeGreaterThan(stacking.frame)

    // the pointer resting anywhere — inside the frame, on a card outside it — brings up no picker, however long it stays
    for (const along of [0.25, 0.8]) {
      await page.mouse.move(plans.x + plans.width * along, plans.y + 60)
      await page.waitForTimeout(450)
      await expect(page.locator('[data-ann-ui="shot-hover-outline"]')).toHaveCount(0)
      await expect(page.locator('[data-ann-ui="shot-margin-bar"]')).toHaveCount(0)
    }

    // a click outside the frame starts over: picking again, with nothing captured behind the user's back
    await page.mouse.click(plans.x + plans.width * 0.8, plans.y + 60)
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toHaveCount(0)
    await expect(page.locator('.ann-shot-rect')).toHaveCount(0)
    await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]')).toBeVisible()
    await expect(hint).toContainText('单击选择元素')
    await expect(page.locator('[data-ann-ui="shot-hover-outline"]'), 'the picker is back: the pointer rests on a card').toBeVisible()
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toHaveCount(0)
    expect((await getEntries(page.context())).filter(entry => entry.type === 'screenshot')).toHaveLength(0)

    // picking again works as it always did: a click takes the element under the pointer
    await page.mouse.click(plans.x + plans.width * 0.8, plans.y + 60)
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-ann-ui="shot-hover-outline"]')).toHaveCount(0)
    await expect(page.locator('[data-ann-ui="shot-margin-bar"]')).toHaveCount(0)
  })
})
