import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getEntries, getScreenshotPageUrl, setSettings, triggerScreenshot } from './helpers'

/**
 * The highlighter, the line and the line widths of the screenshot editor (screenshot.md §1.1), drawn on a white sheet
 * laid over the fixture page, with black bars standing in for lines of text. Read back from the pixels of the preview,
 * the PNG, JPEG and WebP downloads, the clipboard, the beautified and watermarked picture and the saved asset: the
 * highlighter lays 40% of its colour over the text, which keeps 60% of its contrast; a line goes where it was drawn,
 * level, upright or diagonal with Shift held; each width measures what it should, at 1x and at 2x. Kept through a
 * failed download and a failed save.
 */

test.describe.configure({ timeout: 60_000 })

const SESSION = '[data-ann-ui="screenshot-session"]'
const PREVIEW = '[data-ann-ui="screenshot-preview"]'
const TOOLBAR = '[data-ann-ui="screenshot-toolbar"]'
const CANVAS = `${PREVIEW} canvas`
const WIDTHS = '[data-ann-ui="screenshot-line-widths"]'
const NOTICE = '.ann-shot-notice'

type Rgb = readonly [number, number, number]
type Point = [number, number]
type Source = 'canvas' | 'clipboard' | { dataUrl: string }

/** The annotation colours of the toolbar, by their names. */
const PALETTE: ReadonlyArray<{ name: string; rgb: Rgb }> = [
  { name: '红', rgb: [229, 72, 77] },
  { name: '黄', rgb: [246, 196, 83] },
  { name: '青', rgb: [20, 125, 114] },
  { name: '白', rgb: [255, 255, 255] },
  { name: '黑', rgb: [32, 37, 43] },
]
const RED = PALETTE[0]!
const TEAL = PALETTE[2]!
const WHITE: Rgb = [255, 255, 255]
/** the "text": the bars are pure black */
const INK: Rgb = [0, 0, 0]
/** How much of its colour the highlighter lays over the picture. */
const ALPHA = 0.4

/** Where the sheet lies in the window, in CSS pixels; the screenshot takes exactly the sheet. */
const SHEET = { x: 40, y: 280, width: 400 }
/** Each row of text is 40 pixels tall, with a black bar 10 pixels tall across its left half. */
const ROW = 40
const BAR = { left: 0, right: 200, top: 15, bottom: 25 }
/** The middle of a row's bar, where a stroke over that line of text goes. */
const lineOf = (row: number): number => row * ROW + (BAR.top + BAR.bottom) / 2

interface Info {
  width: number
  height: number
  box: { x: number; y: number; width: number; height: number }
}

/** Lays the sheet over the fixture page: `rows` rows of text from the top, white below them down to `height`. */
async function laySheet(page: Page, { rows = 0, height }: { rows?: number; height: number }): Promise<void> {
  await page.evaluate(
    ({ sheet, rows, height, row, bar }) => {
      const element = document.createElement('div')
      Object.assign(element.style, {
        position: 'fixed',
        left: `${sheet.x}px`,
        top: `${sheet.y}px`,
        width: `${sheet.width}px`,
        height: `${height}px`,
        background: '#ffffff',
        zIndex: '1',
      })
      for (let index = 0; index < rows; index++) {
        const text = document.createElement('div')
        Object.assign(text.style, {
          position: 'absolute',
          left: `${bar.left}px`,
          top: `${index * row + bar.top}px`,
          width: `${bar.right - bar.left}px`,
          height: `${bar.bottom - bar.top}px`,
          background: '#000000',
        })
        element.append(text)
      }
      document.body.append(element)
    },
    { sheet: SHEET, rows, height, row: ROW, bar: BAR },
  )
}

/** Takes a screenshot of exactly the sheet and opens the editor on it. A point of the capture is then a point of the sheet, times `scale`. */
async function openOnSheet(page: Page, height: number, scale = 1): Promise<Info> {
  await triggerScreenshot(page)
  await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]'), 'the settings have arrived').toBeVisible()
  await page.mouse.move(SHEET.x, SHEET.y)
  await page.mouse.down()
  await page.mouse.move(SHEET.x + SHEET.width, SHEET.y + height, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator(PREVIEW)).toBeVisible()
  const info = await page.locator(CANVAS).evaluate(canvas => {
    const element = canvas as HTMLCanvasElement
    const rect = element.getBoundingClientRect()
    return { width: element.width, height: element.height, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
  })
  expect([info.width, info.height], 'the capture is the sheet').toEqual([SHEET.width * scale, height * scale])
  return info
}

/** The point of the screen over the preview that shows a point of the capture: where to press to draw there. */
const toScreen = (info: Info, [x, y]: Point): Point => [info.box.x + (x * info.box.width) / info.width, info.box.y + (y * info.box.height) / info.height]

/** One stroke through points of the capture: pressed at the first, let go at the last. */
async function stroke(page: Page, info: Info, points: Point[], { shift = false } = {}): Promise<void> {
  const [first, ...rest] = points.map(point => toScreen(info, point))
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(first![0], first![1])
  await page.mouse.down()
  for (const point of rest) await page.mouse.move(point[0], point[1], { steps: 8 })
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}

const toolbarButton = (page: Page, name: string) => page.locator(TOOLBAR).getByRole('button', { name, exact: true })

/** The colour at each point of the capture, read from the preview, the clipboard or a file; `offset` is where the capture sits in it. */
async function colours(page: Page, source: Source, points: Point[], offset: Point = [0, 0]): Promise<{ at: number[][]; width: number; height: number }> {
  return page.evaluate(
    async ({ source, points, offset }) => {
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
      const at = points.map(([x, y]) => {
        const [px, py] = [Math.floor(x + offset[0]), Math.floor(y + offset[1])]
        if (px < 0 || py < 0 || px >= width || py >= height) return [-1, -1, -1]
        const i = (py * width + px) * 4
        return [data[i]!, data[i + 1]!, data[i + 2]!]
      })
      return { at, width, height }
    },
    { source, points, offset },
  )
}

const apart = (a: readonly number[], b: readonly number[]): number => Math.max(...[0, 1, 2].map(channel => Math.abs(a[channel]! - b[channel]!)))
/** What `under` becomes with the highlighter's colour laid over it, `times` times. */
function over(under: readonly number[], colour: Rgb, times = 1): number[] {
  let result = [...under]
  for (let time = 0; time < times; time++) result = result.map((value, channel) => value * (1 - ALPHA) + colour[channel]! * ALPHA)
  return result
}
/** The pixels around a point, three by three: a line drawn through the point covers the middle of them. */
const around = ([x, y]: Point): Point[] => [-1, 0, 1].flatMap(dy => [-1, 0, 1].map((dx): Point => [x + dx, y + dy]))
/** How near the nearest of each nine pixels comes to a colour. */
const nearest = (samples: number[][], colour: Rgb): number[] =>
  Array.from({ length: samples.length / 9 }, (_, index) => Math.min(...samples.slice(index * 9, index * 9 + 9).map(sample => apart(sample, colour))))

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

/**
 * Makes the service worker hand the session a white picture twice the window's size in place of the browser's capture
 * — a Retina display. The test browser's own capture is one pixel per CSS pixel whatever the emulated pixel ratio.
 */
async function captureWhiteAtTwiceTheSize(page: Page, context: BrowserContext): Promise<void> {
  const [innerWidth, innerHeight] = await page.evaluate(() => [window.innerWidth, window.innerHeight])
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(
    async ({ width, height }) => {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
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
}

/** One upright stroke for each tool and width, in black on the white sheet: where it is, in CSS pixels of the sheet, and how wide it should be. */
const COLUMNS = [
  { tool: '画笔', width: '细', x: 20, px: 2 },
  { tool: '画笔', width: '中', x: 40, px: 3 },
  { tool: '画笔', width: '粗', x: 60, px: 6 },
  { tool: '直线', width: '细', x: 90, px: 2 },
  { tool: '直线', width: '中', x: 110, px: 3 },
  { tool: '直线', width: '粗', x: 130, px: 6 },
  { tool: '荧光笔', width: '细', x: 180, px: 12 },
  { tool: '荧光笔', width: '中', x: 230, px: 20 },
  { tool: '荧光笔', width: '粗', x: 300, px: 32 },
] as const

/**
 * Draws the columns from 20 to 140 down the sheet, then measures each across, at 80: the sum of how much of the stroke
 * each pixel shows is how wide it is, the edges' antialiasing included. A highlighter pixel shows all of its stroke
 * when it is 40% black.
 */
async function drawAndMeasureColumns(page: Page, info: Info, scale: number): Promise<number[]> {
  const widthButton = (name: string) => page.locator(WIDTHS).getByRole('button', { name, exact: true })
  await toolbarButton(page, '黑').click()
  let current = ''
  for (const column of COLUMNS) {
    // a press on the tool that is on turns it off
    if (column.tool !== current) await toolbarButton(page, column.tool).click()
    current = column.tool
    await widthButton(column.width).click()
    await stroke(page, info, [
      [column.x * scale, 20 * scale],
      [column.x * scale, 140 * scale],
    ])
  }
  return Promise.all(
    COLUMNS.map(async column => {
      const reach = Math.ceil((column.px / 2 + 4) * scale)
      const xs = Array.from({ length: reach * 2 + 1 }, (_, index) => column.x * scale - reach + index)
      const { at } = await colours(
        page,
        'canvas',
        xs.map((x): Point => [x, 80 * scale]),
      )
      const full = column.tool === '荧光笔' ? over(WHITE, [32, 37, 43])[0]! : 32
      return at.reduce((sum, [red]) => sum + Math.max(0, Math.min(1, (255 - red!) / (255 - full))), 0)
    }),
  )
}

test.describe('the highlighter, the line and the line widths (screenshot.md §1.1)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('the highlighter lays 40% of each colour over the text, which keeps 60% of its contrast; a stroke run back over itself is no deeper, a second stroke is; undo takes a stroke back; the download has them', async ({
    page,
    context,
  }) => {
    await page.goto(getScreenshotPageUrl())
    await laySheet(page, { rows: PALETTE.length, height: PALETTE.length * ROW })
    const info = await openOnSheet(page, PALETTE.length * ROW)

    await toolbarButton(page, '荧光笔').click()
    await expect(toolbarButton(page, '荧光笔')).toHaveAttribute('aria-pressed', 'true')
    for (const [row, colour] of PALETTE.entries()) {
      await toolbarButton(page, colour.name).click()
      // the yellow stroke goes across the line and back over the end of it, all in one
      const across: Point[] = [
        [20, lineOf(row)],
        [380, lineOf(row)],
      ]
      await stroke(page, info, row === 1 ? [...across, [260, lineOf(row)]] : across)
    }

    // in each row: the paper and the text under the stroke, and the paper beside it
    const points = PALETTE.flatMap((_, row): Point[] => [
      [300, lineOf(row)],
      [100, lineOf(row)],
      [300, row * ROW + 3],
    ])
    const expectHighlighted = (samples: number[][], what: string, tolerance = 4) => {
      for (const [row, colour] of PALETTE.entries()) {
        const [paper, text, beside] = samples.slice(row * 3, row * 3 + 3) as [number[], number[], number[]]
        expect(
          apart(paper, over(WHITE, colour.rgb)),
          `${what} ${colour.name}: the paper under the stroke is ${over(WHITE, colour.rgb).map(Math.round).join(', ')}, not ${paper.join(', ')}`,
        ).toBeLessThanOrEqual(tolerance)
        expect(apart(text, over(INK, colour.rgb)), `${what} ${colour.name}: the text under it takes the colour as much, not ${text.join(', ')}`).toBeLessThanOrEqual(tolerance)
        // 60% of the 255 between white paper and black text
        expect(Math.min(...[0, 1, 2].map(channel => paper[channel]! - text[channel]!)), `${what} ${colour.name}: the text keeps 60% of its contrast`).toBeGreaterThanOrEqual(
          153 - tolerance,
        )
        expect(apart(beside, WHITE), `${what} ${colour.name}: beside the stroke the paper is white`).toBeLessThanOrEqual(tolerance)
      }
    }
    const shown = (await colours(page, 'canvas', points)).at
    expectHighlighted(shown, 'preview')
    // the yellow stroke's way back is in the same stroke: the paper it went over twice is as deep as the paper it went over once
    const [twice, once] = (
      await colours(page, 'canvas', [
        [300, lineOf(1)],
        [230, lineOf(1)],
      ])
    ).at
    expect(apart(twice!, once!), 'run back over itself, a stroke is no deeper').toBeLessThanOrEqual(2)

    // a second stroke across the red one lays the colour again where they cross
    await toolbarButton(page, '红').click()
    await stroke(page, info, [
      [340, 4],
      [340, 36],
    ])
    const crossing: Point[] = [
      [340, lineOf(0)],
      [340, 6],
    ]
    const [both, second] = (await colours(page, 'canvas', crossing)).at
    expect(apart(both!, over(WHITE, RED.rgb, 2)), `two strokes lay the colour twice: ${both!.join(', ')}`).toBeLessThanOrEqual(5)
    expect(apart(second!, over(WHITE, RED.rgb)), 'and once where only the second one is').toBeLessThanOrEqual(4)
    await expect(toolbarButton(page, '撤销')).toBeEnabled()
    await page.keyboard.press('Control+z')
    const [first, gone] = (await colours(page, 'canvas', crossing)).at
    expect(apart(first!, over(WHITE, RED.rgb)), 'undo takes the second stroke back').toBeLessThanOrEqual(4)
    expect(apart(gone!, WHITE), 'all of it').toBeLessThanOrEqual(2)

    // the download is the picture with the strokes in it
    const asked = await stubDownloads(context)
    await toolbarButton(page, '下载').click()
    await expect(page.locator(NOTICE)).toContainText('已下载')
    const files = await asked()
    expect(files, 'one file').toHaveLength(1)
    expect(files[0]).toMatch(/^data:image\/png;base64,/)
    const downloaded = await colours(page, { dataUrl: files[0]! }, points)
    expect([downloaded.width, downloaded.height], 'the whole picture').toEqual([info.width, info.height])
    expectHighlighted(downloaded.at, 'downloaded')
  })

  test('a line goes straight from where it is pressed to where it is let go; with Shift held it lies level, upright or on a 45° diagonal; a click draws none; each line undoes', async ({
    page,
  }) => {
    await page.goto(getScreenshotPageUrl())
    await laySheet(page, { height: 240 })
    const info = await openOnSheet(page, 240)
    await toolbarButton(page, '直线').click()
    await expect(toolbarButton(page, '直线')).toHaveAttribute('aria-pressed', 'true')

    await stroke(page, info, [
      [20, 20],
      [220, 80],
    ])
    // with Shift held: nearly level, nearly upright, nearly diagonal
    await stroke(
      page,
      info,
      [
        [20, 140],
        [220, 160],
      ],
      { shift: true },
    )
    await stroke(
      page,
      info,
      [
        [360, 20],
        [372, 200],
      ],
      { shift: true },
    )
    await stroke(
      page,
      info,
      [
        [240, 100],
        [340, 180],
      ],
      { shift: true },
    )
    // a click is not a line
    await page.mouse.click(...toScreen(info, [100, 220]))

    const on = async (points: Point[]) => Math.max(...nearest((await colours(page, 'canvas', points.flatMap(around))).at, RED.rgb))
    const blank = async (points: Point[]) => Math.max(...(await colours(page, 'canvas', points)).at.map(sample => apart(sample, WHITE)))
    // free: through the points from the press to the pointer, and not 10 pixels beside them
    expect(
      await on([
        [70, 35],
        [120, 50],
        [170, 65],
        [220, 80],
      ]),
      'the free line',
    ).toBeLessThanOrEqual(12)
    expect(await blank([[120, 60]]), 'beside it, the paper').toBeLessThanOrEqual(2)
    // level: along y = 140, as far across as the pointer went, and not down to it
    expect(
      await on([
        [120, 140],
        [215, 140],
      ]),
      'the level line',
    ).toBeLessThanOrEqual(12)
    expect(
      await blank([
        [120, 150],
        [220, 160],
      ]),
      'not to the pointer',
    ).toBeLessThanOrEqual(2)
    // upright: down x = 360, and not across to the pointer
    expect(
      await on([
        [360, 110],
        [360, 195],
      ]),
      'the upright line',
    ).toBeLessThanOrEqual(12)
    expect(
      await blank([
        [366, 110],
        [372, 200],
      ]),
      'not to the pointer',
    ).toBeLessThanOrEqual(2)
    // diagonal: from (240, 100) at 45° to where the pointer is along it, 90 across and 90 down
    expect(
      await on([
        [285, 145],
        [325, 185],
      ]),
      'the diagonal',
    ).toBeLessThanOrEqual(12)
    expect(
      await blank([
        [290, 140],
        [340, 180],
      ]),
      'not to the pointer',
    ).toBeLessThanOrEqual(2)
    expect(await blank([[100, 220]]), 'the click left nothing').toBeLessThanOrEqual(2)

    // each line is one step back
    await page.keyboard.press('Control+z')
    expect(
      await blank([
        [285, 145],
        [325, 185],
      ]),
      'undo takes the diagonal',
    ).toBeLessThanOrEqual(2)
    expect(await on([[360, 110]]), 'and only the diagonal').toBeLessThanOrEqual(12)
    await page.keyboard.press('Control+z')
    expect(
      await blank([
        [360, 110],
        [360, 195],
      ]),
      'the next undo takes the upright one',
    ).toBeLessThanOrEqual(2)
  })

  test('the pen, the line and the highlighter have a width row, medium first and kept from one to the next, the shapes none; choosing a width is not an edit; the widths measure 2, 3, 6 and 12, 20, 32 pixels', async ({
    page,
  }) => {
    await page.goto(getScreenshotPageUrl())
    await laySheet(page, { height: 160 })
    const info = await openOnSheet(page, 160)
    const row = page.locator(WIDTHS)
    const widthButton = (name: string) => row.getByRole('button', { name, exact: true })

    await expect(row, 'no tool, no widths').toHaveCount(0)
    for (const tool of ['矩形', '椭圆', '箭头', '马赛克', '文字', '序号']) {
      await toolbarButton(page, tool).click()
      await expect(row, `${tool} has no width`).toHaveCount(0)
    }
    await toolbarButton(page, '荧光笔').click()
    // one group named for what it chooses, its buttons named and pressed
    await expect(page.getByRole('group', { name: '线宽', exact: true })).toBeVisible()
    await expect(widthButton('中'), 'medium first').toHaveAttribute('aria-pressed', 'true')
    for (const name of ['细', '粗']) await expect(widthButton(name)).toHaveAttribute('aria-pressed', 'false')

    // the keyboard reaches the widths: on from the toolbar's last button
    await toolbarButton(page, '确认').focus()
    await page.keyboard.press('Tab')
    await expect(widthButton('细')).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(widthButton('粗')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(widthButton('粗')).toHaveAttribute('aria-pressed', 'true')
    await expect(widthButton('中')).toHaveAttribute('aria-pressed', 'false')
    for (const tool of ['画笔', '直线']) {
      await toolbarButton(page, tool).click()
      await expect(widthButton('粗'), `${tool} draws at the width chosen`).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(toolbarButton(page, '撤销'), 'choosing a width is not an edit').toBeDisabled()

    const widths = await drawAndMeasureColumns(page, info, 1)
    for (const [index, column] of COLUMNS.entries()) expect(widths[index]!, `${column.tool} ${column.width}: ${column.px} pixels`).toBeCloseTo(column.px, 0)
  })

  test('at 2x every width is twice as many pixels of the picture', async ({ page, context }) => {
    await page.goto(getScreenshotPageUrl())
    await laySheet(page, { height: 160 })
    await captureWhiteAtTwiceTheSize(page, context)
    const info = await openOnSheet(page, 160, 2)
    const widths = await drawAndMeasureColumns(page, info, 2)
    for (const [index, column] of COLUMNS.entries()) expect(widths[index]!, `${column.tool} ${column.width}: ${column.px * 2} pixels`).toBeCloseTo(column.px * 2, 0)
  })

  /** A red highlighter stroke over the first line of text and a teal line under the text, drawn on a fresh editor. */
  async function highlightAndUnderline(page: Page, info: Info): Promise<void> {
    await toolbarButton(page, '荧光笔').click()
    await stroke(page, info, [
      [20, lineOf(0)],
      [380, lineOf(0)],
    ])
    await toolbarButton(page, '直线').click()
    await toolbarButton(page, '青').click()
    await stroke(page, info, [
      [40, 120],
      [360, 120],
    ])
  }
  /** The highlighted paper and text, a point on the line and one beside it. */
  const MARKS: Point[] = [
    [300, lineOf(0)],
    [100, lineOf(0)],
    [200, 120],
    [200, 132],
  ]
  function expectMarks(samples: number[][], what: string, tolerance = 4): void {
    const [paper, text, line, beside] = samples as [number[], number[], number[], number[]]
    expect(apart(paper, over(WHITE, RED.rgb)), `${what}: the highlighted paper, not ${paper.join(', ')}`).toBeLessThanOrEqual(tolerance)
    expect(apart(text, over(INK, RED.rgb)), `${what}: the highlighted text, not ${text.join(', ')}`).toBeLessThanOrEqual(tolerance)
    expect(apart(line, TEAL.rgb), `${what}: the line, not ${line.join(', ')}`).toBeLessThanOrEqual(tolerance)
    expect(apart(beside, WHITE), `${what}: beside the line, not ${beside.join(', ')}`).toBeLessThanOrEqual(tolerance)
  }

  test('the clipboard and the JPEG download carry the highlighter and the line in the beautified, watermarked picture; the saved entry has them without the frame', async ({
    page,
    context,
  }) => {
    await setSettings(context, { downloadFormat: 'jpeg', watermark: { enabled: true, text: '@annhub', position: 'bottom-right', size: 'medium', opacity: 1 } })
    await page.goto(getScreenshotPageUrl())
    await laySheet(page, { rows: 2, height: 160 })
    const info = await openOnSheet(page, 160)
    await highlightAndUnderline(page, info)

    // beautified: 64 pixels of padding around the capture, the watermark in the corner
    await toolbarButton(page, '美化').click()
    const panel = page.getByRole('group', { name: '美化', exact: true })
    await panel.getByRole('group', { name: '内边距', exact: true }).getByRole('button', { name: '大', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect.poll(async () => (await colours(page, 'canvas', [])).width, 'the frame is on').toBe(info.width + 128)
    const framed: Point = [64, 64]
    expectMarks((await colours(page, 'canvas', MARKS, framed)).at, 'preview')

    await toolbarButton(page, '复制').click()
    await expect(page.locator(NOTICE)).toContainText('已复制')
    const copied = await colours(page, 'clipboard', MARKS, framed)
    expect([copied.width, copied.height], 'the clipboard has the beautified picture').toEqual([info.width + 128, info.height + 128])
    expectMarks(copied.at, 'copied')

    const asked = await stubDownloads(context)
    await toolbarButton(page, '下载').click()
    await expect(page.locator(NOTICE)).toContainText('已下载')
    const [jpeg] = await asked()
    expect(jpeg).toMatch(/^data:image\/jpeg;base64,/)
    const downloaded = await colours(page, { dataUrl: jpeg! }, MARKS, framed)
    expect([downloaded.width, downloaded.height]).toEqual([info.width + 128, info.height + 128])
    expectMarks(downloaded.at, 'JPEG', 24)

    await toolbarButton(page, '确认').click()
    await expect(page.locator(SESSION)).toHaveCount(0)
    const saved = await colours(page, await savedAsset(context), MARKS)
    expect([saved.width, saved.height], 'the library keeps the capture without the frame').toEqual([info.width, info.height])
    expectMarks(saved.at, 'saved')
  })

  test('the WebP download carries the highlighter and the line', async ({ page, context }) => {
    await setSettings(context, { downloadFormat: 'webp' })
    await page.goto(getScreenshotPageUrl())
    await laySheet(page, { rows: 2, height: 160 })
    const info = await openOnSheet(page, 160)
    await highlightAndUnderline(page, info)
    const asked = await stubDownloads(context)
    await toolbarButton(page, '下载').click()
    await expect(page.locator(NOTICE)).toContainText('已下载')
    const [webp] = await asked()
    expect(webp).toMatch(/^data:image\/webp;base64,/)
    expectMarks((await colours(page, { dataUrl: webp! }, MARKS)).at, 'WebP', 24)
  })

  test('a failed download and a failed save keep the strokes and their undo, and the retries carry them', async ({ page, context }) => {
    await page.goto(getScreenshotPageUrl())
    await laySheet(page, { rows: 2, height: 160 })
    const info = await openOnSheet(page, 160)
    await highlightAndUnderline(page, info)
    const kept = async (what: string) => {
      expectMarks((await colours(page, 'canvas', MARKS)).at, what)
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
    expectMarks((await colours(page, { dataUrl: file! }, MARKS)).at, 'the retried download')

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
    expectMarks((await colours(page, await savedAsset(context), MARKS)).at, 'saved on the retry')
  })
})
