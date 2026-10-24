import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getEntries, getScreenshotPageUrl, setSettings, triggerScreenshot } from './helpers'

/**
 * The step tool of the screenshot editor (screenshot.md §1.1): badges numbered 1, 2, 3… put down with clicks, dragged,
 * deleted and counted again from 1, every step undoable, each colour readable on a background of its own colour. Read
 * back from the pixels of the preview, the PNG, JPEG and WebP downloads, the clipboard, the beautified and watermarked
 * picture and the saved asset — and kept through a failed download and a failed save.
 */

test.describe.configure({ timeout: 60_000 })

const SESSION = '[data-ann-ui="screenshot-session"]'
const PREVIEW = '[data-ann-ui="screenshot-preview"]'
const TOOLBAR = '[data-ann-ui="screenshot-toolbar"]'
const CANVAS = `${PREVIEW} canvas`
const RING = '[data-ann-ui="screenshot-step-selection"]'
const DELETE = '[data-ann-ui="screenshot-step-delete"]'
const NEXT = '[data-ann-ui="screenshot-step-next"]'
const STEP_ROW = '[data-ann-ui="screenshot-steps"]'
const NOTICE = '.ann-shot-notice'

type Rgb = readonly [number, number, number]
type Point = [number, number]

/** The annotation colours of the toolbar, by their names, and the ink a badge of that colour has its rim and number in. */
const PALETTE: ReadonlyArray<{ name: string; fill: Rgb; ink: Rgb }> = [
  { name: '红', fill: [229, 72, 77], ink: [255, 255, 255] },
  { name: '黄', fill: [246, 196, 83], ink: [32, 37, 43] },
  { name: '青', fill: [20, 125, 114], ink: [255, 255, 255] },
  { name: '白', fill: [255, 255, 255], ink: [32, 37, 43] },
  { name: '黑', fill: [32, 37, 43], ink: [255, 255, 255] },
]
const RED = PALETTE[0]!
const TEAL = PALETTE[2]!
/** A badge is 28 CSS pixels across; the test browser captures one pixel per CSS pixel. */
const RADIUS = 14

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** What a badge left in the pixels around its centre. */
interface BadgeRead {
  /** the disc, sampled above, below and on the diagonals at 0.7 of the radius, where no digit reaches: the median */
  fill: number[]
  /** eight samples just inside the edge, where the rim is */
  rim: number[][]
  /** every pixel within 8 of the centre, row by row: the number and the disc around it */
  core: number[][]
  /** the picture's size */
  width: number
  height: number
}

/** Triggers a screenshot of the page that is open, drags a region — by default over the post — and confirms it. */
async function openEditor(page: Page, region?: { from: Point; to: Point }): Promise<void> {
  await triggerScreenshot(page)
  await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]'), 'the settings have arrived').toBeVisible()
  const post = (await page.getByTestId('screenshot-post').boundingBox())!
  const { from, to } = region ?? { from: [post.x + 10, post.y + 10] as Point, to: [post.x + 410, post.y + 170] as Point }
  await page.mouse.move(from[0], from[1])
  await page.mouse.down()
  await page.mouse.move(to[0], to[1], { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator(PREVIEW)).toBeVisible()
}

/** The preview canvas: its pixel size and where it is on screen. */
async function canvasInfo(page: Page): Promise<{ width: number; height: number; box: Box }> {
  return page.locator(CANVAS).evaluate(canvas => {
    const element = canvas as HTMLCanvasElement
    const rect = element.getBoundingClientRect()
    return { width: element.width, height: element.height, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
  })
}

/** A point of the screen over the preview, as a point of the capture — where a click there puts a badge. */
const toCanvas = (info: { width: number; height: number; box: Box }, point: Point): Point => [
  ((point[0] - info.box.x) * info.width) / info.box.width,
  ((point[1] - info.box.y) * info.height) / info.box.height,
]

/** Whole screen pixels inside the preview, `dx`, `dy` from its corner. */
const over =
  (info: { box: Box }) =>
  (dx: number, dy: number): Point => [Math.round(info.box.x + dx), Math.round(info.box.y + dy)]

const toolbarButton = (page: Page, name: string) => page.locator(TOOLBAR).getByRole('button', { name, exact: true })
const resetButton = (page: Page) => toolbarButton(page, '重置计数')

/** Reads the badges at points of the capture, from the preview, the clipboard or a file; `offset` is where the capture sits in it. */
async function readBadges(page: Page, source: 'canvas' | 'clipboard' | { dataUrl: string }, centres: Point[], offset: Point = [0, 0]): Promise<BadgeRead[]> {
  return page.evaluate(
    async ({ source, centres, offset, radius }) => {
      let image: CanvasImageSource
      let width: number
      let height: number
      if (source === 'canvas') {
        const canvas = document.querySelector('[data-ann-ui="screenshot-preview"] canvas') as HTMLCanvasElement
        ;[image, width, height] = [canvas, canvas.width, canvas.height]
      } else if (source === 'clipboard') {
        const [item] = await navigator.clipboard.read()
        const bitmap = await createImageBitmap(await item!.getType('image/png'))
        ;[image, width, height] = [bitmap, bitmap.width, bitmap.height]
      } else {
        const picture = new Image()
        picture.src = source.dataUrl
        await picture.decode()
        ;[image, width, height] = [picture, picture.naturalWidth, picture.naturalHeight]
      }
      const scratch = document.createElement('canvas')
      scratch.width = width
      scratch.height = height
      const ctx = scratch.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      const { data } = ctx.getImageData(0, 0, width, height)
      const pixel = (x: number, y: number): number[] => {
        const [px, py] = [Math.floor(x), Math.floor(y)]
        if (px < 0 || py < 0 || px >= width || py >= height) return [-1, -1, -1]
        const i = (py * width + px) * 4
        return [data[i]!, data[i + 1]!, data[i + 2]!]
      }
      const median = (samples: number[][]): number[] => [0, 1, 2].map(channel => samples.map(sample => sample[channel]!).sort((a, b) => a - b)[Math.floor(samples.length / 2)]!)
      const around = (cx: number, cy: number, distance: number, degrees: number[]) =>
        degrees.map(degree => pixel(cx + Math.cos((degree * Math.PI) / 180) * distance, cy + Math.sin((degree * Math.PI) / 180) * distance))
      return centres.map(([x, y]) => {
        const [cx, cy] = [x + offset[0], y + offset[1]]
        const core: number[][] = []
        for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) core.push(pixel(cx + dx, cy + dy))
        return {
          fill: median(around(cx, cy, radius * 0.7, [90, 270, 45, 135, 225, 315])),
          rim: around(cx, cy, radius - 1, [0, 45, 90, 135, 180, 225, 270, 315]),
          core,
          width,
          height,
        }
      })
    },
    { source, centres, offset, radius: RADIUS },
  )
}

const apart = (a: readonly number[], b: readonly number[]): number => Math.max(...[0, 1, 2].map(channel => Math.abs(a[channel]! - b[channel]!)))
const nearer = (sample: readonly number[], ink: Rgb, fill: Rgb): boolean => apart(sample, ink) < apart(sample, fill)
/** The number's shape: which pixels near the centre are ink rather than disc. */
const shapeOf = (read: BadgeRead, fill: Rgb, ink: Rgb): string => read.core.map(sample => (nearer(sample, ink, fill) ? '1' : '0')).join('')
const inkOf = (read: BadgeRead, fill: Rgb, ink: Rgb): number => read.core.filter(sample => nearer(sample, ink, fill)).length

/** A badge of `colour` is there: the disc is the colour, a number is written in the ink, and — losslessly — the rim is ink. */
function expectBadge(read: BadgeRead, colour: { fill: Rgb; ink: Rgb }, what: string, { tolerance = 12, rim = true } = {}): void {
  expect(apart(read.fill, colour.fill), `${what}: the disc is ${colour.fill.join(', ')}, not ${read.fill.join(', ')}`).toBeLessThanOrEqual(tolerance)
  expect(inkOf(read, colour.fill, colour.ink), `${what}: a number is written in the ink`).toBeGreaterThanOrEqual(12)
  if (rim) expect(read.rim.filter(sample => nearer(sample, colour.ink, colour.fill)).length, `${what}: the rim is in the ink`).toBeGreaterThanOrEqual(6)
}

function expectNoBadge(read: BadgeRead, colour: { fill: Rgb }, what: string): void {
  expect(apart(read.fill, colour.fill), `${what}: no badge is left there`).toBeGreaterThan(60)
}

/** Selects the badge at a point of the screen and reads its number off the × that deletes it. */
async function numberAt(page: Page, point: Point): Promise<number> {
  await page.mouse.click(point[0], point[1])
  const remove = page.locator(DELETE)
  await expect(remove, 'a click on a badge selects it').toBeVisible()
  return Number(/删除序号 (\d+)/.exec((await remove.getAttribute('aria-label')) ?? '')?.[1])
}

async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from[0], from[1])
  await page.mouse.down()
  await page.mouse.move(to[0], to[1], { steps: 8 })
  await page.mouse.up()
}

/**
 * Makes the service worker note what it is asked to download instead of writing a file (the data URL is the picture
 * the user would get), or — `fail` — refuse it the way the browser does. Returns what has been asked for so far.
 */
async function stubDownloads(context: BrowserContext, { fail = false } = {}): Promise<() => Promise<string[]>> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(fail => {
    const asked: string[] = []
    ;(globalThis as { annhubDownloads?: string[] }).annhubDownloads = asked
    chrome.downloads.download = ((options: chrome.downloads.DownloadOptions, callback?: (downloadId?: number) => void) => {
      if (fail) return callback?.(undefined)
      asked.push(options.url)
      callback?.(1)
    }) as typeof chrome.downloads.download
  }, fail)
  return () => sw.evaluate(() => (globalThis as { annhubDownloads?: string[] }).annhubDownloads ?? [])
}

/** The one screenshot asset in the library, as a data URL. */
async function savedAsset(context: BrowserContext): Promise<{ dataUrl: string }> {
  await expect.poll(async () => (await getEntries(context)).filter(entry => entry.type === 'screenshot').length).toBe(1)
  const entry = (await getEntries(context)).find(candidate => candidate.type === 'screenshot')!
  const sw = await ensureServiceWorker(context)
  const dataUrl = await sw.evaluate(
    assetId =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('annhub')
        open.onerror = () => reject(new Error('no database'))
        open.onsuccess = () => {
          const request = open.result.transaction('assets', 'readonly').objectStore('assets').get(assetId)
          request.onerror = () => reject(new Error('no asset'))
          request.onsuccess = () => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.readAsDataURL((request.result as { bytes: Blob }).bytes)
          }
        }
      }),
    entry.assetId!,
  )
  return { dataUrl }
}

test.describe('step badges (screenshot.md §1.1)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('three clicks put down 1, 2, 3; a drag moves one and keeps its number; Delete and the × take one off and the later ones move up; a reset starts again at 1; each step undoes; the download has them', async ({
    page,
    context,
  }) => {
    await page.goto(getScreenshotPageUrl())
    await openEditor(page)
    const info = await canvasInfo(page)
    const at = over(info)
    const [first, second, third, dropped, fourth] = [at(60, 40), at(150, 40), at(240, 40), at(150, 110), at(330, 110)]
    const read = async (points: Point[]) =>
      readBadges(
        page,
        'canvas',
        points.map(point => toCanvas(info, point)),
      )

    await toolbarButton(page, '序号').click()
    await expect(toolbarButton(page, '序号')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(NEXT)).toHaveText('下一个：1')
    await expect(resetButton(page), 'nothing to reset yet').toBeDisabled()

    // 1. one click, one badge, counting up; undo takes the last one back
    for (const point of [first, second, third]) await page.mouse.click(point[0], point[1])
    await expect(page.locator(NEXT)).toHaveText('下一个：4')
    await page.keyboard.press('Control+z')
    await expect(page.locator(NEXT)).toHaveText('下一个：3')
    expectNoBadge((await read([third]))[0]!, RED, 'undo takes the badge just put down')
    await page.mouse.click(third[0], third[1])
    await expect(page.locator(NEXT)).toHaveText('下一个：4')
    await expect(resetButton(page)).toBeEnabled()
    await expect(page.locator(RING), 'a badge just put down is not selected').toBeHidden()
    const placed = await read([first, second, third])
    placed.forEach((badge, index) => expectBadge(badge, RED, `badge ${index + 1}`))
    expect(new Set(placed.map(badge => shapeOf(badge, RED.fill, RED.ink))).size, 'three different numbers').toBe(3)
    expect(await numberAt(page, first)).toBe(1)
    expect(await numberAt(page, second)).toBe(2)
    expect(await numberAt(page, third)).toBe(3)

    // the ring marks the selected badge over the picture, and never on it
    const ring = await page.locator(RING).boundingBox()
    expect(Math.abs(ring!.x + ring!.width / 2 - third[0]), 'the ring is around the badge').toBeLessThanOrEqual(2)
    expect(Math.abs(ring!.y + ring!.height / 2 - third[1])).toBeLessThanOrEqual(2)
    expect(ring!.width).toBeGreaterThan(28)
    expect(ring!.width).toBeLessThan(40)
    const selectionBlue = await page.locator(CANVAS).evaluate(canvas => {
      const element = canvas as HTMLCanvasElement
      const { data } = element.getContext('2d')!.getImageData(0, 0, element.width, element.height)
      let count = 0
      for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i]! - 76) < 20 && Math.abs(data[i + 1]! - 145) < 20 && data[i + 2]! > 230) count++
      return count
    })
    expect(selectionBlue, 'the selection blue is not in the picture').toBe(0)

    // 2. a drag moves a badge and keeps its number; it is one step for undo
    await drag(page, second, dropped)
    expectBadge((await read([dropped]))[0]!, RED, 'dragged')
    expectNoBadge((await read([second]))[0]!, RED, 'where it was')
    await expect(page.locator(NEXT), 'a drag is not a new badge').toHaveText('下一个：4')
    expect(await numberAt(page, dropped)).toBe(2)
    await page.keyboard.press('Control+z')
    expectBadge((await read([second]))[0]!, RED, 'undo puts it back')
    expectNoBadge((await read([dropped]))[0]!, RED, 'and takes it from where it went')
    await drag(page, second, dropped)
    expectBadge((await read([dropped]))[0]!, RED, 'dragged again')

    // 3. Delete takes the selected badge off; the third moves up to 2; undo brings both back
    const thirdAsThree = shapeOf((await read([third]))[0]!, RED.fill, RED.ink)
    expect(await numberAt(page, dropped)).toBe(2)
    await page.keyboard.press('Delete')
    await expect(page.locator(RING), 'the ring goes with it').toBeHidden()
    expectNoBadge((await read([dropped]))[0]!, RED, 'deleted')
    await expect(page.locator(NEXT)).toHaveText('下一个：3')
    const thirdAsTwo = shapeOf((await read([third]))[0]!, RED.fill, RED.ink)
    expect(thirdAsTwo, 'the third badge shows another number').not.toBe(thirdAsThree)
    expect(await numberAt(page, third)).toBe(2)
    await toolbarButton(page, '撤销').click()
    expectBadge((await read([dropped]))[0]!, RED, 'undo brings the deleted badge back')
    expect(shapeOf((await read([third]))[0]!, RED.fill, RED.ink), 'and the third is 3 again').toBe(thirdAsThree)
    expect(await numberAt(page, third)).toBe(3)

    // …and so does the ×, after which the keyboard stays with the tool; Backspace deletes as Delete does
    expect(await numberAt(page, dropped)).toBe(2)
    await page.locator(DELETE).click()
    expectNoBadge((await read([dropped]))[0]!, RED, 'deleted with the ×')
    await expect(toolbarButton(page, '序号')).toBeFocused()
    expect(shapeOf((await read([third]))[0]!, RED.fill, RED.ink)).toBe(thirdAsTwo)
    await page.keyboard.press('Control+z')
    expect(await numberAt(page, dropped)).toBe(2)
    await page.keyboard.press('Backspace')
    expectNoBadge((await read([dropped]))[0]!, RED, 'deleted with Backspace')
    await expect(page.locator(NEXT)).toHaveText('下一个：3')

    // 4. a reset: the next badge is 1 again, the ones down keep their numbers; undo takes the reset back
    await resetButton(page).click()
    await expect(page.locator(NEXT)).toHaveText('下一个：1')
    await expect(resetButton(page), 'already at 1').toBeDisabled()
    await page.keyboard.press('Control+z')
    await expect(page.locator(NEXT), 'undo takes the reset back').toHaveText('下一个：3')
    await resetButton(page).click()
    await page.mouse.click(fourth[0], fourth[1])
    await expect(page.locator(NEXT)).toHaveText('下一个：2')
    expect(await numberAt(page, fourth)).toBe(1)
    expect(await numberAt(page, first)).toBe(1)
    expect(await numberAt(page, third)).toBe(2)

    // another tool lets the selection and the count row go
    await toolbarButton(page, '矩形').click()
    await expect(page.locator(RING)).toBeHidden()
    await expect(page.locator(STEP_ROW)).toHaveCount(0)

    // 5. the download is the picture with the badges in it
    const shown = await read([first, third, fourth, second, dropped])
    const asked = await stubDownloads(context)
    await toolbarButton(page, '下载').click()
    await expect(page.locator(NOTICE)).toContainText('已下载')
    const files = await asked()
    expect(files, 'one file').toHaveLength(1)
    expect(files[0]).toMatch(/^data:image\/png;base64,/)
    const downloaded = await readBadges(
      page,
      { dataUrl: files[0]! },
      [first, third, fourth, second, dropped].map(point => toCanvas(info, point)),
    )
    expect([downloaded[0]!.width, downloaded[0]!.height], 'the whole picture').toEqual([info.width, info.height])
    for (const [index, what] of ['1', '2', '1 of the second count'].entries()) {
      expectBadge(downloaded[index]!, RED, `downloaded ${what}`)
      expect(shapeOf(downloaded[index]!, RED.fill, RED.ink), `downloaded ${what}: the number shown`).toBe(shapeOf(shown[index]!, RED.fill, RED.ink))
    }
    expectNoBadge(downloaded[3]!, RED, 'downloaded, where the dragged badge was')
    expectNoBadge(downloaded[4]!, RED, 'downloaded, where the deleted badge was')
  })

  test('each colour reads on a background of its own colour: the disc in the colour, the rim and the number in the ink that stands out on it, 28 pixels across', async ({
    page,
  }) => {
    await page.goto(getScreenshotPageUrl())
    // five blocks, one in each annotation colour: each badge goes on the block of its own colour
    await page.evaluate(
      colours => {
        const strip = document.createElement('div')
        Object.assign(strip.style, { position: 'fixed', left: '40px', top: '300px', display: 'flex', zIndex: '1' })
        for (const [r, g, b] of colours) {
          const block = document.createElement('div')
          Object.assign(block.style, { width: '80px', height: '80px', background: `rgb(${r}, ${g}, ${b})` })
          strip.append(block)
        }
        document.body.append(strip)
      },
      PALETTE.map(colour => colour.fill),
    )
    await openEditor(page, { from: [40, 300], to: [440, 380] })
    const info = await canvasInfo(page)
    const centres = PALETTE.map((_, index): Point => [Math.round(info.box.x + (info.box.width * (index + 0.5)) / PALETTE.length), Math.round(info.box.y + info.box.height / 2)])

    await toolbarButton(page, '序号').click()
    for (const [index, colour] of PALETTE.entries()) {
      await toolbarButton(page, colour.name).click()
      await page.mouse.click(centres[index]![0], centres[index]![1])
    }
    const badges = await readBadges(
      page,
      'canvas',
      centres.map(point => toCanvas(info, point)),
    )
    // the disc is the background's colour here, so the rim in the ink is what sets each badge off
    for (const [index, colour] of PALETTE.entries()) expectBadge(badges[index]!, colour, colour.name)

    // 28 pixels across: on the white block the dark rim shows where the badge ends
    const span = await page.locator(CANVAS).evaluate(
      (canvas, [cx, cy]) => {
        const element = canvas as HTMLCanvasElement
        const row = element.getContext('2d')!.getImageData(0, Math.floor(cy), element.width, 1).data
        // the block is 80 pixels wide around the badge: within 20 of the centre, only the rim and the number are dark
        const dark = Array.from({ length: 41 }, (_, index) => Math.floor(cx) - 20 + index).filter(x => x >= 0 && x < element.width && row[x * 4]! < 128)
        return Math.max(...dark) - Math.min(...dark) + 1
      },
      toCanvas(info, centres[3]!),
    )
    expect(span, 'the white badge, rim to rim').toBeGreaterThanOrEqual(26)
    expect(span).toBeLessThanOrEqual(30)
  })

  test('put down against an edge, a badge stays whole inside the picture, and a drag stops at the edge', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await openEditor(page)
    const info = await canvasInfo(page)
    await toolbarButton(page, '序号').click()
    await page.mouse.click(Math.round(info.box.x + 2), Math.round(info.box.y + 2))
    // the badge stands a radius in from both edges it was put against
    expectBadge((await readBadges(page, 'canvas', [[RADIUS, RADIUS]]))[0]!, RED, 'in the corner')
    await drag(page, [Math.round(info.box.x + RADIUS), Math.round(info.box.y + RADIUS)], [Math.round(info.box.x + info.box.width + 40), Math.round(info.box.y + 60)])
    const [moved] = await readBadges(page, 'canvas', [[info.width - RADIUS, toCanvas(info, [0, Math.round(info.box.y + 60)])[1]]])
    expectBadge(moved!, RED, 'dragged past the right edge, it stops at it')
  })

  test('the clipboard and the JPEG download carry the badges in the beautified, watermarked picture; the saved entry has them without the frame', async ({ page, context }) => {
    await setSettings(context, { downloadFormat: 'jpeg', watermark: { enabled: true, text: '@annhub', position: 'bottom-right', size: 'medium', opacity: 1 } })
    await page.goto(getScreenshotPageUrl())
    await openEditor(page)
    const info = await canvasInfo(page)
    const at = over(info)
    const points = [at(60, 40), at(150, 40), at(240, 40)]
    const centres = points.map(point => toCanvas(info, point))
    const colours = [RED, RED, TEAL]
    await toolbarButton(page, '序号').click()
    await page.mouse.click(points[0]![0], points[0]![1])
    await page.mouse.click(points[1]![0], points[1]![1])
    await toolbarButton(page, '青').click()
    await page.mouse.click(points[2]![0], points[2]![1])

    // beautified: 64 pixels of padding around the capture, the watermark in the corner
    await toolbarButton(page, '美化').click()
    const panel = page.getByRole('group', { name: '美化', exact: true })
    await panel.getByRole('group', { name: '内边距', exact: true }).getByRole('button', { name: '大', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect.poll(async () => (await canvasInfo(page)).width, 'the frame is on').toBe(info.width + 128)
    const framed: Point = [64, 64]
    const preview = await readBadges(page, 'canvas', centres, framed)
    preview.forEach((badge, index) => expectBadge(badge, colours[index]!, `preview ${index + 1}`))

    await toolbarButton(page, '复制').click()
    await expect(page.locator(NOTICE)).toContainText('已复制')
    const copied = await readBadges(page, 'clipboard', centres, framed)
    expect([copied[0]!.width, copied[0]!.height], 'the clipboard has the beautified picture').toEqual([info.width + 128, info.height + 128])
    copied.forEach((badge, index) => {
      expectBadge(badge, colours[index]!, `copied ${index + 1}`)
      expect(shapeOf(badge, colours[index]!.fill, colours[index]!.ink), 'pixel for pixel the preview').toBe(shapeOf(preview[index]!, colours[index]!.fill, colours[index]!.ink))
    })

    const asked = await stubDownloads(context)
    await toolbarButton(page, '下载').click()
    await expect(page.locator(NOTICE)).toContainText('已下载')
    const [jpeg] = await asked()
    expect(jpeg).toMatch(/^data:image\/jpeg;base64,/)
    const downloaded = await readBadges(page, { dataUrl: jpeg! }, centres, framed)
    expect([downloaded[0]!.width, downloaded[0]!.height]).toEqual([info.width + 128, info.height + 128])
    downloaded.forEach((badge, index) => expectBadge(badge, colours[index]!, `JPEG ${index + 1}`, { tolerance: 30, rim: false }))

    await toolbarButton(page, '确认').click()
    await expect(page.locator(SESSION)).toHaveCount(0)
    const saved = await readBadges(page, { dataUrl: (await savedAsset(context)).dataUrl }, centres)
    expect([saved[0]!.width, saved[0]!.height], 'the library keeps the capture without the frame').toEqual([info.width, info.height])
    saved.forEach((badge, index) => expectBadge(badge, colours[index]!, `saved ${index + 1}`))
  })

  test('the WebP download carries the badges', async ({ page, context }) => {
    await setSettings(context, { downloadFormat: 'webp' })
    await page.goto(getScreenshotPageUrl())
    await openEditor(page)
    const info = await canvasInfo(page)
    const at = over(info)
    const points = [at(60, 40), at(150, 40)]
    await toolbarButton(page, '序号').click()
    for (const point of points) await page.mouse.click(point[0], point[1])
    const asked = await stubDownloads(context)
    await toolbarButton(page, '下载').click()
    await expect(page.locator(NOTICE)).toContainText('已下载')
    const [webp] = await asked()
    expect(webp).toMatch(/^data:image\/webp;base64,/)
    const downloaded = await readBadges(
      page,
      { dataUrl: webp! },
      points.map(point => toCanvas(info, point)),
    )
    downloaded.forEach((badge, index) => expectBadge(badge, RED, `WebP ${index + 1}`, { tolerance: 30, rim: false }))
  })

  test('a failed download and a failed save keep every badge and the count, and the retries carry them', async ({ page, context }) => {
    await page.goto(getScreenshotPageUrl())
    await openEditor(page)
    const info = await canvasInfo(page)
    const at = over(info)
    const points = [at(60, 40), at(150, 40), at(240, 40)]
    const centres = points.map(point => toCanvas(info, point))
    await toolbarButton(page, '序号').click()
    for (const point of points) await page.mouse.click(point[0], point[1])
    const before = await readBadges(page, 'canvas', centres)

    const kept = async (what: string) => {
      const now = await readBadges(page, 'canvas', centres)
      now.forEach((badge, index) => {
        expectBadge(badge, RED, `${what}: badge ${index + 1}`)
        expect(shapeOf(badge, RED.fill, RED.ink)).toBe(shapeOf(before[index]!, RED.fill, RED.ink))
      })
      await expect(page.locator(NEXT), `${what}: the count goes on`).toHaveText('下一个：4')
      await expect(toolbarButton(page, '撤销'), `${what}: and can be undone`).toBeEnabled()
    }

    await stubDownloads(context, { fail: true })
    await toolbarButton(page, '下载').click()
    await expect(page.locator(`${NOTICE}.ann-shot-error`)).toContainText('下载失败')
    await kept('after the failed download')
    const asked = await stubDownloads(context)
    await toolbarButton(page, '下载').click()
    await expect(page.locator(NOTICE)).toContainText('已下载')
    const [file] = await asked()
    ;(await readBadges(page, { dataUrl: file! }, centres)).forEach((badge, index) => expectBadge(badge, RED, `the retried download: badge ${index + 1}`))

    // the disk refuses the picture: the save fails, and nothing of the edit is lost
    const sw = await ensureServiceWorker(context)
    await sw.evaluate(() => {
      const put = IDBObjectStore.prototype.put
      ;(globalThis as { annhubRestorePut?: () => void }).annhubRestorePut = () => {
        IDBObjectStore.prototype.put = put
      }
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
        if (this.name === 'assets') throw new DOMException('The disk is full', 'QuotaExceededError')
        return put.apply(this, args)
      }
    })
    await toolbarButton(page, '确认').click()
    await expect(page.locator(`${NOTICE}.ann-shot-error`)).toBeVisible()
    await expect(page.locator(SESSION), 'the session stays open').toBeVisible()
    await kept('after the failed save')
    await sw.evaluate(() => (globalThis as { annhubRestorePut?: () => void }).annhubRestorePut?.())
    await toolbarButton(page, '确认').click()
    await expect(page.locator(SESSION)).toHaveCount(0)
    ;(await readBadges(page, { dataUrl: (await savedAsset(context)).dataUrl }, centres)).forEach((badge, index) =>
      expectBadge(badge, RED, `saved on the retry: badge ${index + 1}`),
    )
  })

  test('a selected badge is not a layer of its own: Esc cancels the screenshot as it always does', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await openEditor(page)
    const info = await canvasInfo(page)
    const point = over(info)(80, 50)
    await toolbarButton(page, '序号').click()
    await page.mouse.click(point[0], point[1])
    expect(await numberAt(page, point)).toBe(1)
    await page.keyboard.press('Escape')
    await expect(page.locator(SESSION)).toHaveCount(0)
  })
})
