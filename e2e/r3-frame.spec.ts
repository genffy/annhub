import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getAssetMetadata, getEntries, triggerScreenshot } from './helpers'

/**
 * R3: precise selection and repeatable frames (screenshot.md §1.2, §1.4;
 * roadmap R3 acceptance). The pricing fixture has a billing toggle whose
 * three states change only the price text — the frame must stay identical.
 */

const PAGE_URL = 'http://localhost:8173/pricing.html'

async function open(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(PAGE_URL)
  await page.waitForLoadState('networkidle')
}

/** Hovers the plans, presses ↑ until the container is the target, picks the margin, clicks. */
async function capturePlansWithMargin(page: import('@playwright/test').Page, margin: number): Promise<void> {
  await triggerScreenshot(page)
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

  test('after scrolling, reusing the last frame captures the same content', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page)
    await capturePlansWithMargin(page, 24)
    const first = (await savedShotDims(page.context()))[0]!

    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(300)
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="shot-frame-label"]')).toContainText('上次取景框')
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

  test('a missing anchor falls back to the recorded position with a notice', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page)
    await capturePlansWithMargin(page, 24)
    const first = (await savedShotDims(page.context()))[0]!

    await page.getByTestId('remove-anchor').click()
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
})
