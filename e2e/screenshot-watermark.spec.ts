import type { BrowserContext, Page } from '@playwright/test'
import { crc32, deflateSync } from 'zlib'
import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getEntries, getScreenshotPageUrl, getSettings, sendMessage, setSettings, triggerScreenshot } from './helpers'

/**
 * The brand watermark's picture (screenshot.md §4.3, §5), read back from the pixels of the preview, the clipboard, the
 * download and the saved asset: that a stored PNG is drawn with the text — the picture first, a margin in from its corner,
 * at the size and opacity of the settings — that `W` takes both off and puts both back, that the library entry never has
 * either, and that a picture the browser cannot read leaves the text exactly where it would have been.
 */

test.describe.configure({ timeout: 90_000 })

const SESSION = '[data-ann-ui="screenshot-session"]'
const PREVIEW = '[data-ann-ui="screenshot-preview"]'
const TOOLBAR = '[data-ann-ui="screenshot-toolbar"]'
const CANVAS = `${PREVIEW} canvas`
const HINT = `${SESSION} .ann-shot-hint`

type Rgb = [number, number, number]
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

/** The picture is two flat halves, green then magenta, so which way up and round it was drawn can be read from it. */
const GREEN: Rgb = [0, 170, 60]
const MAGENTA: Rgb = [210, 30, 170]

/** How far a watermark stands in from the edges of a picture this size: 2% of the shorter side, at least 12. */
const MARGIN = 12

// ── the stored picture ───────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const check = Buffer.alloc(4)
  check.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, check])
}

/** An opaque PNG as the data URL the settings keep it in; `colourAt` says what colour each column is. */
function pngDataUrl(width: number, height: number, colourAt: (x: number) => Rgb): string {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // red, green, blue and alpha
  const stride = 1 + width * 4
  const rows = Buffer.alloc(stride * height) // every row begins with filter 0: none
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rows.set([...colourAt(x), 255], y * stride + 1 + x * 4)
  }
  const png = Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${png.toString('base64')}`
}

/** Twice as wide as tall, and bigger than any size the watermark draws it at. */
const PICTURE = pngDataUrl(128, 64, x => (x < 64 ? GREEN : MAGENTA))

/** The PNG signature and then nothing a decoder can use: it passes the settings' check (screenshot.md §4.3) and fails to decode. */
const UNREADABLE = `data:image/png;base64,${Buffer.concat([PNG_SIGNATURE, Buffer.alloc(64, 0x41)]).toString('base64')}`

interface WatermarkSeed {
  enabled?: boolean
  text?: string
  /** `null` stores no picture at all */
  image?: string | null
  position?: Corner
  size?: 'small' | 'medium' | 'large'
  opacity?: number
}

function watermarkSettings(seed: WatermarkSeed = {}) {
  const { enabled = true, text = '@annhub', image = PICTURE, position = 'bottom-right', size = 'medium', opacity = 1 } = seed
  return { enabled, text, ...(image === null ? {} : { image }), position, size, opacity }
}

const darkSlate = { enabled: true, background: 'grad-slate', padding: 'large', radius: 12, shadow: false }
const whiteFrame = { ...darkSlate, background: 'solid-white' }

// ── reading pixels ───────────────────────────────────────────────────────

interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface Reading {
  width: number
  height: number
  /** pixels with no alpha at all */
  transparent: number
  /** where the picture's two halves are: the pixels with colour in them, told apart by hue */
  green: Box | null
  magenta: Box | null
  /** the grey pixels unlike the backdrop — the text — and how far the most different one is (in luminance) */
  ink: { box: Box | null; count: number; lighter: number; darker: number; strongest: number }
  /** a hash of every pixel of the window: two readings of one picture agree on it */
  checksum: number
  /** the pixel (r, g, b, a) at each requested point */
  at: number[][]
}

interface ReadOptions {
  /** the preview canvas, the image on the clipboard, or a data URL */
  source: 'canvas' | 'clipboard' | { dataUrl: string }
  /** the only pixels that count (default: all of them) */
  within?: Box
  /** the colour behind the watermark, to tell ink from backdrop (default: white) */
  backdrop?: Rgb
  points?: Array<[number, number]>
}

/** Reads the pixels of an image inside the page, where a canvas lives. */
async function read(page: Page, options: ReadOptions): Promise<Reading> {
  return page.evaluate(async ({ source, within, backdrop = [255, 255, 255], points = [] }) => {
    let image: HTMLCanvasElement | ImageBitmap | HTMLImageElement
    if (source === 'canvas') {
      image = document.querySelector('[data-ann-ui="screenshot-preview"] canvas') as HTMLCanvasElement
    } else if (source === 'clipboard') {
      const [item] = await navigator.clipboard.read()
      image = await createImageBitmap(await item!.getType('image/png'))
    } else {
      image = new Image()
      image.src = source.dataUrl
      await image.decode()
    }
    const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width
    const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height
    const scratch = document.createElement('canvas')
    scratch.width = width
    scratch.height = height
    const ctx = scratch.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, width, height)

    type Extent = { x0: number; y0: number; x1: number; y1: number }
    const grow = (extent: Extent | null, x: number, y: number): Extent =>
      extent ? { x0: Math.min(extent.x0, x), y0: Math.min(extent.y0, y), x1: Math.max(extent.x1, x), y1: Math.max(extent.y1, y) } : { x0: x, y0: y, x1: x, y1: y }
    const toBox = (extent: Extent | null) => (extent ? { x: extent.x0, y: extent.y0, width: extent.x1 - extent.x0 + 1, height: extent.y1 - extent.y0 + 1 } : null)
    const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b
    const ground = luminance(backdrop[0], backdrop[1], backdrop[2])
    const area = within ?? { x: 0, y: 0, width, height }

    let transparent = 0
    let green: Extent | null = null
    let magenta: Extent | null = null
    let ink: Extent | null = null
    let [inkCount, lighter, darker, strongest] = [0, 0, 0, 0]
    let hash = 0x811c9dc5
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
        const inside = x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height
        if (inside) for (let k = 0; k < 4; k++) hash = Math.imul(hash ^ data[i + k]!, 0x01000193)
        if (a === 0) {
          transparent++
          continue
        }
        if (!inside) continue
        if (Math.max(r, g, b) - Math.min(r, g, b) >= 12) {
          // colour: the picture, whatever the opacity has done to it
          if (g > r + 12 && g > b + 12) green = grow(green, x, y)
          else if (g < r - 12 && g < b - 12) magenta = grow(magenta, x, y)
        } else {
          const difference = luminance(r, g, b) - ground
          if (Math.abs(difference) > 24) {
            ink = grow(ink, x, y)
            inkCount++
            if (difference > 0) lighter++
            else darker++
            strongest = Math.max(strongest, Math.abs(difference))
          }
        }
      }
    }
    const at = points.map(([x, y]) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return [0, 0, 0, 0]
      const i = (y * width + x) * 4
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
    })
    return {
      width,
      height,
      transparent,
      green: toBox(green),
      magenta: toBox(magenta),
      ink: { box: toBox(ink), count: inkCount, lighter, darker, strongest },
      checksum: hash >>> 0,
      at,
    }
  }, options)
}

const right = (box: Box): number => box.x + box.width
const bottom = (box: Box): number => box.y + box.height

/** Where the picture was drawn: both its halves together. */
function pictureOf(reading: Reading): Box {
  const [a, b] = [reading.green!, reading.magenta!]
  const [x, y] = [Math.min(a.x, b.x), Math.min(a.y, b.y)]
  return { x, y, width: Math.max(right(a), right(b)) - x, height: Math.max(bottom(a), bottom(b)) - y }
}

const near = (actual: number[], expected: readonly number[], tolerance: number): boolean => expected.every((value, index) => Math.abs((actual[index] ?? -999) - value) <= tolerance)

const noWatermark = (reading: Reading): Array<Box | null> => [reading.green, reading.magenta, reading.ink.box]

/**
 * The part of a picture a watermark in `corner` can be in: roomy enough that none of it is cut off, and narrow enough to stay
 * clear of the fixture page's own post, whose text would be read as ink.
 */
function cornerOf(size: { width: number; height: number }, corner: Corner, depth = 90, width = 210): Box {
  return { x: corner.endsWith('right') ? size.width - width : 0, y: corner.startsWith('top') ? 0 : size.height - depth, width, height: depth }
}

/** The preview canvas's size in its own pixels. */
const canvasSize = (page: Page): Promise<{ width: number; height: number }> =>
  page.locator(CANVAS).evaluate(canvas => ({ width: (canvas as HTMLCanvasElement).width, height: (canvas as HTMLCanvasElement).height }))

/** Waits for the picture to show on the preview, then reads it: it is decoded while the region is dragged, so it is normally there at once. */
async function shownPicture(page: Page, within: Box, backdrop?: Rgb): Promise<Reading> {
  let reading!: Reading
  await expect
    .poll(
      async () => {
        reading = await read(page, { source: 'canvas', within, backdrop })
        return reading.green !== null && reading.magenta !== null
      },
      { message: 'the picture is drawn on the preview' },
    )
    .toBe(true)
  return reading
}

// ── driving the editor ───────────────────────────────────────────────────

/** A region dragged over most of the window — its corners are blank page — and confirmed into the editor. */
async function openEditor(page: Page): Promise<void> {
  const view = page.viewportSize()!
  await page.goto(getScreenshotPageUrl())
  await triggerScreenshot(page)
  await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]'), 'the settings have arrived').toBeVisible()
  await page.mouse.move(60, 40)
  await page.mouse.down()
  await page.mouse.move(view.width - 60, view.height - 140, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator(PREVIEW)).toBeVisible()
}

const toolbarButton = (page: Page, name: string) => page.locator(TOOLBAR).getByRole('button', { name, exact: true })

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
 * Makes the service worker note what it is asked to download instead of writing a file: the data URL it is handed is the
 * picture the user would get. Returns what has been asked for so far.
 */
async function recordDownloads(context: BrowserContext): Promise<() => Promise<string[]>> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(() => {
    const asked: string[] = []
    ;(globalThis as { annhubDownloads?: string[] }).annhubDownloads = asked
    chrome.downloads.download = ((options: chrome.downloads.DownloadOptions, callback?: (downloadId: number) => void) => {
      asked.push(options.url)
      callback?.(1)
    }) as typeof chrome.downloads.download
  })
  return () => sw.evaluate(() => (globalThis as { annhubDownloads?: string[] }).annhubDownloads ?? [])
}

test.describe('the watermark picture (screenshot.md §4.3, §5)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('the picture is drawn in its corner ahead of the text, and the clipboard and the download carry the very pixels of the preview', async ({ page, context }) => {
    await setSettings(context, { watermark: watermarkSettings() })
    await openEditor(page)
    const size = await canvasSize(page)
    const corner = cornerOf(size, 'bottom-right')
    const shown = await shownPicture(page, corner)
    const picture = pictureOf(shown)
    const text = shown.ink.box

    // the PNG as it was stored: green half on the left, magenta on the right, twice as wide as tall
    expect(right(shown.green!), 'the green half is the left one').toBeLessThanOrEqual(shown.magenta!.x + 2)
    expect(Math.abs(shown.green!.width - shown.magenta!.width), 'both halves are as wide as each other').toBeLessThanOrEqual(6)
    expect(Math.abs(picture.width / picture.height - 2), 'in the proportions of the PNG').toBeLessThanOrEqual(0.2)

    // the picture first, the text just after it, centred on it; the strip a margin in from the corner
    expect(text, 'the text is written too').not.toBeNull()
    expect(right(picture), 'the picture comes first').toBeLessThanOrEqual(text!.x)
    expect(text!.x - right(picture), 'and the text close after it').toBeGreaterThanOrEqual(4)
    expect(text!.x - right(picture)).toBeLessThanOrEqual(30)
    expect(Math.abs(picture.y + picture.height / 2 - (text!.y + text!.height / 2)), 'centred on the picture').toBeLessThanOrEqual(6)
    expect(Math.abs(size.width - MARGIN - right(text!)), 'the text ends a margin in from the right edge').toBeLessThanOrEqual(4)
    expect(Math.abs(size.height - MARGIN - bottom(picture)), 'the picture stands a margin above the bottom edge').toBeLessThanOrEqual(3)

    await toolbarButton(page, '复制').click()
    await expect(page.locator('.ann-shot-notice')).toContainText('已复制')
    const copied = await read(page, { source: 'clipboard', within: corner })
    expect([copied.width, copied.height], 'the clipboard has the whole picture').toEqual([size.width, size.height])
    expect(copied.checksum, 'and its corner is the preview’s corner, pixel for pixel').toBe(shown.checksum)
    expect(pictureOf(copied)).toEqual(picture)

    const asked = await recordDownloads(context)
    await toolbarButton(page, '下载').click()
    await expect(page.locator('.ann-shot-notice')).toContainText('已下载')
    const files = await asked()
    expect(files, 'one file was asked for').toHaveLength(1)
    expect(files[0]).toMatch(/^data:image\/png;base64,/)
    const downloaded = await read(page, { source: { dataUrl: files[0]! }, within: corner })
    expect([downloaded.width, downloaded.height], 'the download is the whole picture').toEqual([size.width, size.height])
    expect(downloaded.checksum, 'with the same corner').toBe(shown.checksum)
  })

  test('the library keeps the capture itself — neither the picture nor the text is in the saved asset', async ({ page, context }) => {
    await setSettings(context, { watermark: watermarkSettings() })
    await openEditor(page)
    const size = await canvasSize(page)
    const corner = cornerOf(size, 'bottom-right')
    await shownPicture(page, corner) // the preview has it…

    await toolbarButton(page, '确认').click()
    await expect(page.locator(SESSION)).toHaveCount(0)
    const saved = await read(page, { source: { dataUrl: (await savedAsset(context)).dataUrl }, within: corner })
    expect([saved.width, saved.height], 'the capture, with nothing around it').toEqual([size.width, size.height])
    expect(noWatermark(saved), '…and the library has neither').toEqual([null, null, null])
    expect(saved.transparent).toBe(0)
  })

  test('in each of the four corners the strip hugs the corner and the picture comes first, on whichever side the text is', async ({ page, context }) => {
    for (const position of CORNERS) {
      await setSettings(context, { watermark: watermarkSettings({ position }) })
      await openEditor(page)
      const size = await canvasSize(page)
      const shown = await shownPicture(page, cornerOf(size, position))
      const picture = pictureOf(shown)
      const text = shown.ink.box
      expect(text, `${position}: the text is written`).not.toBeNull()
      expect(right(picture), `${position}: the picture comes first`).toBeLessThanOrEqual(text!.x)
      if (position.endsWith('left')) expect(Math.abs(picture.x - MARGIN), `${position}: the picture a margin in from the left edge`).toBeLessThanOrEqual(3)
      else expect(Math.abs(size.width - MARGIN - right(text!)), `${position}: the text a margin in from the right edge`).toBeLessThanOrEqual(4)
      if (position.startsWith('top')) expect(Math.abs(picture.y - MARGIN), `${position}: the picture a margin below the top edge`).toBeLessThanOrEqual(3)
      else expect(Math.abs(size.height - MARGIN - bottom(picture)), `${position}: the picture a margin above the bottom edge`).toBeLessThanOrEqual(3)
    }
  })

  test('the three sizes scale the picture, and a picture without any text is drawn all the same', async ({ page, context }) => {
    const heights: number[] = []
    for (const size of ['small', 'medium', 'large'] as const) {
      await setSettings(context, { watermark: watermarkSettings({ text: '', size }) })
      await openEditor(page)
      const canvas = await canvasSize(page)
      const shown = await shownPicture(page, cornerOf(canvas, 'bottom-right'))
      const picture = pictureOf(shown)
      expect(shown.ink.box, `${size}: no text, so no ink`).toBeNull()
      expect(Math.abs(canvas.width - MARGIN - right(picture)), `${size}: a margin in from the right edge`).toBeLessThanOrEqual(3)
      expect(Math.abs(canvas.height - MARGIN - bottom(picture)), `${size}: and from the bottom edge`).toBeLessThanOrEqual(3)
      expect(Math.abs(picture.width / picture.height - 2), `${size}: still the shape of the PNG`).toBeLessThanOrEqual(0.25)
      heights.push(picture.height)
    }
    const [small, medium, large] = heights as [number, number, number]
    expect(medium, 'medium is bigger than small').toBeGreaterThanOrEqual(small * 1.2)
    expect(large, 'and large than medium').toBeGreaterThanOrEqual(medium * 1.2)
  })

  test('the opacity of the settings fades the picture and the text alike', async ({ page, context }) => {
    for (const opacity of [0.2, 0.5, 1]) {
      await setSettings(context, { watermark: watermarkSettings({ opacity }) })
      await openEditor(page)
      const size = await canvasSize(page)
      const corner = cornerOf(size, 'bottom-right')
      const shown = await shownPicture(page, corner)
      const picture = pictureOf(shown)

      // the middle of each half, which no edge touches, is the colour laid over the white page at that opacity
      const middle = Math.round(picture.y + picture.height / 2)
      const { at } = await read(page, {
        source: 'canvas',
        within: corner,
        points: [
          [Math.round(shown.green!.x + shown.green!.width / 2), middle],
          [Math.round(shown.magenta!.x + shown.magenta!.width / 2), middle],
        ],
      })
      const onWhite = (colour: Rgb) => colour.map(channel => 255 * (1 - opacity) + channel * opacity)
      expect(near(at[0]!, onWhite(GREEN), 5), `${opacity}: the green half is ${onWhite(GREEN)}, got ${at[0]}`).toBe(true)
      expect(near(at[1]!, onWhite(MAGENTA), 5), `${opacity}: the magenta half is ${onWhite(MAGENTA)}, got ${at[1]}`).toBe(true)

      // the ink is 219 levels of luminance away from white at full opacity; at this opacity it is that much less
      expect(shown.ink.strongest, `${opacity}: the text is faded to match`).toBeGreaterThanOrEqual(219 * opacity * 0.8)
      expect(shown.ink.strongest).toBeLessThanOrEqual(219 * opacity * 1.02 + 2)
    }
  })

  test('W takes the picture and the text off this screenshot together and puts them back; the setting stays on', async ({ page, context }) => {
    await setSettings(context, { watermark: watermarkSettings() })
    await openEditor(page)
    const size = await canvasSize(page)
    const corner = cornerOf(size, 'bottom-right')
    const shown = await shownPicture(page, corner)
    await expect(page.locator(HINT), 'the hint says the watermark is on').toContainText('水印：开')

    await page.keyboard.press('w')
    await expect
      .poll(async () => noWatermark(await read(page, { source: 'canvas', within: corner })), { message: 'W: nothing of the watermark is left on the preview' })
      .toEqual([null, null, null])
    await expect(page.locator(HINT), 'and the hint says so').toContainText('水印：关')

    await toolbarButton(page, '复制').click()
    await expect(page.locator('.ann-shot-notice')).toContainText('已复制')
    expect(noWatermark(await read(page, { source: 'clipboard', within: corner })), 'what is copied with W off has none of it').toEqual([null, null, null])

    await page.keyboard.press('W')
    await expect
      .poll(async () => (await read(page, { source: 'canvas', within: corner })).checksum, { message: 'W again: the same watermark, back where it was' })
      .toBe(shown.checksum)
    await expect(page.locator(HINT)).toContainText('水印：开')
    expect(await getSettings(context), 'W is for this screenshot only: the setting is untouched').toMatchObject({ watermark: { enabled: true, text: '@annhub' } })
  })

  test('text alone is drawn without any picture, and a stored picture is not drawn while the watermark is off', async ({ page, context }) => {
    await setSettings(context, { watermark: watermarkSettings({ image: null }) })
    await openEditor(page)
    let size = await canvasSize(page)
    await expect.poll(async () => (await read(page, { source: 'canvas', within: cornerOf(size, 'bottom-right') })).ink.box !== null, { message: 'the text is written' }).toBe(true)
    const textOnly = await read(page, { source: 'canvas', within: cornerOf(size, 'bottom-right') })
    expect([textOnly.green, textOnly.magenta], 'no picture was stored, so none is drawn').toEqual([null, null])
    expect(Math.abs(size.width - MARGIN - right(textOnly.ink.box!)), 'the text hangs on the corner as it always did').toBeLessThanOrEqual(4)

    // the picture and the text are stored, but the single switch is off
    await setSettings(context, { watermark: watermarkSettings({ enabled: false }) })
    await openEditor(page)
    size = await canvasSize(page)
    const corner = cornerOf(size, 'bottom-right')
    expect(noWatermark(await read(page, { source: 'canvas', within: corner })), 'switched off: nothing is drawn').toEqual([null, null, null])
    await expect(page.locator(HINT), 'and W is not offered').not.toContainText('水印')
    await page.keyboard.press('w')
    await page.keyboard.press('w')
    expect(noWatermark(await read(page, { source: 'canvas', within: corner })), 'W does not switch it on').toEqual([null, null, null])
  })

  test('a picture the browser cannot read is skipped, and the text is written exactly as if no picture had been stored', async ({ page, context, extensionId }) => {
    await setSettings(context, { watermark: watermarkSettings({ image: UNREADABLE }) })

    // it passes the settings, so it is the decoder that skips it
    const extensionPage = await context.newPage()
    await extensionPage.goto(`chrome-extension://${extensionId}/sample.html`)
    const stored = await sendMessage<{ watermark: { image?: string } }>(extensionPage, { type: 'GET_SETTINGS' })
    await extensionPage.close()
    expect(stored.watermark.image, 'the session is handed the unreadable picture').toBe(UNREADABLE)

    await openEditor(page)
    const size = await canvasSize(page)
    const corner = cornerOf(size, 'bottom-right')
    const broken = await read(page, { source: 'canvas', within: corner })
    expect([broken.green, broken.magenta], 'no picture').toEqual([null, null])
    expect(broken.ink.box, 'the text is written').not.toBeNull()

    await setSettings(context, { watermark: watermarkSettings({ image: null }) })
    await openEditor(page)
    const textOnly = await read(page, { source: 'canvas', within: corner })
    expect(broken.checksum, 'in the very place it takes without a picture').toBe(textOnly.checksum)
  })

  test('on a dark beautify background the text is light and the picture keeps its colours; on a light one the text is dark', async ({ page, context }) => {
    await setSettings(context, { watermark: watermarkSettings(), beautify: darkSlate })
    await openEditor(page)
    let size = await canvasSize(page)
    // the padding band only (64 px deep): the capture itself is light and would read as ink
    let corner = cornerOf(size, 'bottom-right', 60, 300)
    const dark = await shownPicture(page, corner, [24, 25, 29])
    const picture = pictureOf(dark)
    const middle = Math.round(picture.y + picture.height / 2)
    const { at } = await read(page, {
      source: 'canvas',
      within: corner,
      points: [
        [Math.round(dark.green!.x + dark.green!.width / 2), middle],
        [Math.round(dark.magenta!.x + dark.magenta!.width / 2), middle],
      ],
    })
    expect(near(at[0]!, GREEN, 3) && near(at[1]!, MAGENTA, 3), `the picture is not recoloured for the dark ground (${at[0]}, ${at[1]})`).toBe(true)
    expect(dark.ink.lighter, 'light ink on the dark ground').toBeGreaterThan(15)
    expect(dark.ink.darker, 'and no dark ink').toBe(0)
    expect(bottom(picture), 'in the padding, a margin above the edge').toBeLessThanOrEqual(size.height - MARGIN + 1)

    await setSettings(context, { watermark: watermarkSettings(), beautify: whiteFrame })
    await openEditor(page)
    size = await canvasSize(page)
    corner = cornerOf(size, 'bottom-right', 60, 300)
    const light = await shownPicture(page, corner)
    expect(light.ink.darker, 'dark ink on the white ground').toBeGreaterThan(15)
    expect(light.ink.lighter, 'and no light ink').toBe(0)
  })
})
