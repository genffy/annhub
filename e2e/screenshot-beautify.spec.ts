import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getEntries, getScreenshotPageUrl, setSettings, triggerScreenshot } from './helpers'

/**
 * The screenshot editor's beautify panel and the picture it makes (screenshot.md §4.4): where the panel sits, what its
 * controls are called, and — read back from the pixels of the preview, the clipboard and the saved asset — that the
 * backgrounds, padding, corners, shadow and output ratio are what the panel says, that the content stays whole and
 * centred, and that annotating works with and without the beautified frame around it.
 */

test.describe.configure({ timeout: 60_000 })

const SESSION = '[data-ann-ui="screenshot-session"]'
const PREVIEW = '[data-ann-ui="screenshot-preview"]'
const TOOLBAR = '[data-ann-ui="screenshot-toolbar"]'
const CANVAS = `${PREVIEW} canvas`
const SIZE_LABEL = `${PREVIEW} .ann-shot-size`

/** The red the annotation tools start with (toolbar.tsx) and a stroke of it. */
const ANNOTATION_RED = '#e5484d'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface Analysis {
  width: number
  height: number
  /** pixels with no alpha at all */
  transparent: number
  /** bounding box of the annotation-red pixels */
  red: Box | null
  /** bounding box of the pixels unlike `background` */
  differs: Box | null
  /** the pixel (r, g, b, a) at each requested point */
  at: number[][]
  /** pixels clearly lighter / darker than mid-grey inside `ink` */
  ink: { light: number; dark: number }
}

interface AnalyzeOptions {
  /** the preview canvas, the image on the clipboard, or a data URL */
  source: 'canvas' | 'clipboard' | { dataUrl: string }
  points?: Array<[number, number]>
  background?: [number, number, number]
  ink?: Box
}

/** Reads the pixels of an image inside the page, where a canvas lives. */
async function analyze(page: Page, options: AnalyzeOptions): Promise<Analysis> {
  return page.evaluate(async ({ source, points = [], background, ink }) => {
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

    const grow = (box: { x0: number; y0: number; x1: number; y1: number } | null, x: number, y: number) =>
      box ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) } : { x0: x, y0: y, x1: x, y1: y }
    const toBox = (box: { x0: number; y0: number; x1: number; y1: number } | null) =>
      box ? { x: box.x0, y: box.y0, width: box.x1 - box.x0 + 1, height: box.y1 - box.y0 + 1 } : null
    let transparent = 0
    let red: { x0: number; y0: number; x1: number; y1: number } | null = null
    let differs: { x0: number; y0: number; x1: number; y1: number } | null = null
    let light = 0
    let dark = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
        if (a === 0) {
          transparent++
          continue
        }
        if (r > 150 && r - g > 70 && r - b > 70) red = grow(red, x, y)
        if (background && (Math.abs(r - background[0]) > 6 || Math.abs(g - background[1]) > 6 || Math.abs(b - background[2]) > 6)) differs = grow(differs, x, y)
        if (ink && x >= ink.x && x < ink.x + ink.width && y >= ink.y && y < ink.y + ink.height) {
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
          if (luminance > 170) light++
          else if (luminance < 90) dark++
        }
      }
    }
    const at = points.map(([x, y]) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return [0, 0, 0, 0]
      const i = (y * width + x) * 4
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
    })
    return { width, height, transparent, red: toBox(red), differs: toBox(differs), at, ink: { light, dark } }
  }, options)
}

/** The preview canvas: its pixel size and where it is on screen. */
async function canvasInfo(page: Page): Promise<{ width: number; height: number; box: Box }> {
  return page.locator(CANVAS).evaluate(canvas => {
    const element = canvas as HTMLCanvasElement
    const rect = element.getBoundingClientRect()
    return { width: element.width, height: element.height, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
  })
}

const boxOf = (page: Page, selector: string): Promise<Box> =>
  page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })

const touches = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/**
 * A region dragged over the post of the fixture page — or, given `drag`, between two points of the window — and
 * confirmed into the editor.
 */
async function openEditor(page: Page, drag?: { from: [number, number]; to: [number, number] }): Promise<void> {
  await page.goto(getScreenshotPageUrl())
  await triggerScreenshot(page)
  await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]'), 'the settings have arrived').toBeVisible()
  const box = (await page.getByTestId('screenshot-post').boundingBox())!
  const [from, to] = drag
    ? [drag.from, drag.to]
    : [
        [box.x + 10, box.y + 10],
        [box.x + 410, box.y + 170],
      ]
  await page.mouse.move(from[0]!, from[1]!)
  await page.mouse.down()
  await page.mouse.move(to[0]!, to[1]!, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator(PREVIEW)).toBeVisible()
}

const toolbarButton = (page: Page, name: string) => page.locator(TOOLBAR).getByRole('button', { name, exact: true })
const beautifyButton = (page: Page) => toolbarButton(page, '美化')
const panelOf = (page: Page) => page.getByRole('group', { name: '美化', exact: true })

async function openPanel(page: Page) {
  await beautifyButton(page).click()
  const panel = panelOf(page)
  await expect(panel).toBeVisible()
  return {
    panel,
    group: (name: string) => panel.getByRole('group', { name, exact: true }),
    choice: (group: string, name: string) => panel.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true }),
  }
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

/** Every colour pair is (first stop, last stop) of the background in output.ts, as r, g, b. */
const BACKGROUNDS = [
  { name: '纯白', from: [255, 255, 255], to: [255, 255, 255] },
  { name: '米色', from: [246, 241, 231], to: [246, 241, 231] },
  { name: '紫色渐变', from: [239, 233, 250], to: [215, 201, 245] },
  { name: '蓝色渐变', from: [227, 237, 250], to: [198, 217, 242] },
  { name: '绿色渐变', from: [230, 243, 234], to: [200, 227, 208] },
  { name: '暖橙渐变', from: [253, 238, 226], to: [249, 214, 195] },
  { name: '深灰渐变', from: [42, 45, 53], to: [23, 24, 28] },
] as const

const near = (actual: number[], expected: readonly number[], tolerance = 4): boolean => expected.every((value, index) => Math.abs((actual[index] ?? -999) - value) <= tolerance)

test.describe('the beautify panel (screenshot.md §4.4)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('the toolbar button opens a panel that sits clear of the picture and the toolbar; Esc closes the panel before the session', async ({ page }) => {
    await openEditor(page)

    // the button is a button of the toolbar like the others — not lifted out of the row by the panel's styles
    const row = await page.locator(`${TOOLBAR} button`).evaluateAll(buttons =>
      buttons.map(button => {
        const rect = button.getBoundingClientRect()
        return {
          label: button.getAttribute('aria-label'),
          position: getComputedStyle(button).position,
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      }),
    )
    expect(
      row.filter(item => item.position === 'absolute').map(item => item.label),
      'toolbar buttons taken out of the row',
    ).toEqual([])
    const tools = row.filter(item => item.width === 34)
    expect(tools.length, 'the 34px buttons').toBeGreaterThanOrEqual(10)
    expect(Math.max(...tools.map(item => item.top)) - Math.min(...tools.map(item => item.top)), 'the 34px buttons share one row').toBeLessThanOrEqual(1)

    await expect(beautifyButton(page)).toHaveAttribute('aria-expanded', 'false')
    const { panel } = await openPanel(page)
    await expect(beautifyButton(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(panel.getByRole('switch', { name: '启用美化' }), 'the keyboard goes into the panel').toBeFocused()

    const view = page.viewportSize()!
    const [placed, toolbar, preview] = await Promise.all([boxOf(page, '[data-ann-ui="screenshot-beautify-panel"]'), boxOf(page, TOOLBAR), boxOf(page, PREVIEW)])
    expect(placed.width, 'the design draws it 262px wide').toBeGreaterThanOrEqual(250)
    expect(placed.x, 'inside the window, left').toBeGreaterThanOrEqual(0)
    expect(placed.y, 'inside the window, top').toBeGreaterThanOrEqual(0)
    expect(placed.x + placed.width, 'inside the window, right').toBeLessThanOrEqual(view.width)
    expect(placed.y + placed.height, 'inside the window, bottom').toBeLessThanOrEqual(view.height)
    expect(touches(placed, toolbar), 'the panel covers the toolbar').toBe(false)
    expect(touches(placed, preview), 'the panel covers the picture').toBe(false)

    await page.keyboard.press('Escape')
    await expect(panelOf(page), 'Esc closes the panel…').toHaveCount(0)
    await expect(page.locator(SESSION), '…and leaves the session, with everything in it, alone').toBeVisible()
    await expect(beautifyButton(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(beautifyButton(page), 'the keyboard goes back to the button').toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator(SESSION), 'a second Esc cancels the screenshot').toHaveCount(0)
  })

  test('every control has one name: eight named backgrounds, small/medium/large, three radii, one shadow switch, the ratios of the settings', async ({ page, context }) => {
    await setSettings(context, { ratioPresets: ['9:16', '4:3'] })
    await openEditor(page)
    const { panel, group, choice } = await openPanel(page)

    await expect(panel.getByRole('switch', { name: '启用美化' }), 'off, as the settings default').not.toBeChecked()
    await expect(panel.getByRole('button', { name: '复原', exact: true })).toBeVisible()

    // the shadow switch is the only control called 阴影, and the enable switch is not mislabelled as it
    await expect(panel.getByRole('switch', { name: '阴影', exact: true })).toHaveCount(1)
    await expect(panel.getByRole('switch', { name: '阴影', exact: true })).toBeChecked()
    await expect(panel.getByText('阴影', { exact: true })).toHaveCount(1)
    await expect(panel.getByRole('switch')).toHaveCount(2)
    await expect(panel.locator('select, input[type="checkbox"]'), 'no browser selects or checkboxes').toHaveCount(0)

    const names = (name: string) =>
      group(name)
        .getByRole('button')
        .evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? button.textContent))
    expect(await names('背景'), 'backgrounds by name, not A/B/1–5').toEqual(['无（透明）', '纯白', '米色', '紫色渐变', '蓝色渐变', '绿色渐变', '暖橙渐变', '深灰渐变'])
    expect(await names('内边距')).toEqual(['小', '中', '大'])
    expect(await names('圆角')).toEqual(['0', '12', '24'])
    expect(await names('输出画布比例'), 'free, then the ratios the settings turned on, in their order').toEqual(['自由', '9:16', '4:3'])

    await expect(choice('背景', '纯白')).toHaveAttribute('aria-pressed', 'true')
    await expect(choice('内边距', '中')).toHaveAttribute('aria-pressed', 'true')
    await expect(choice('圆角', '12')).toHaveAttribute('aria-pressed', 'true')
    await expect(choice('输出画布比例', '自由')).toHaveAttribute('aria-pressed', 'true')
    await expect(group('背景').getByRole('button', { pressed: true })).toHaveCount(1)

    // the swatches show what they will paint
    const swatches = await group('背景')
      .getByRole('button')
      .evaluateAll(buttons =>
        buttons.map(button => ({
          name: button.getAttribute('aria-label'),
          width: button.getBoundingClientRect().width,
          look: getComputedStyle(button).backgroundImage + getComputedStyle(button).backgroundColor,
        })),
      )
    expect(new Set(swatches.map(swatch => swatch.look)).size, 'eight different looks').toBe(8)
    expect(Math.min(...swatches.map(swatch => swatch.width)), 'big enough to aim at').toBeGreaterThanOrEqual(20)
    const blue = swatches.find(swatch => swatch.name === '蓝色渐变')!
    expect(blue.look).toContain('linear-gradient')
    expect(blue.look, 'the swatch is the colour the canvas paints').toContain('rgb(227, 237, 250)')
  })

  test('changing anything turns beautify on and the picture grows; the switch turns it off; 复原 returns to the settings and keeps the panel open', async ({ page }) => {
    await openEditor(page)
    const plain = await canvasInfo(page)
    const { panel, group, choice } = await openPanel(page)
    const enabled = panel.getByRole('switch', { name: '启用美化' })

    await choice('内边距', '大').click()
    await expect(enabled, 'a change turns it on, so it can be seen').toBeChecked()
    await expect.poll(async () => (await canvasInfo(page)).width, 'padding 64 on each side').toBe(plain.width + 128)
    expect((await canvasInfo(page)).height).toBe(plain.height + 128)

    await enabled.click()
    await expect(enabled).not.toBeChecked()
    await expect.poll(async () => (await canvasInfo(page)).width, 'off: the picture is the content again').toBe(plain.width)

    await choice('背景', '深灰渐变').click()
    await choice('圆角', '24').click()
    await choice('输出画布比例', '16:9').click()
    await panel.getByRole('switch', { name: '阴影', exact: true }).click()
    await expect(enabled).toBeChecked()
    expect((await canvasInfo(page)).width).toBeGreaterThan(plain.width)

    await panel.getByRole('button', { name: '复原', exact: true }).click()
    await expect(panelOf(page), 'reset keeps the panel where it is').toBeVisible()
    await expect(enabled, 'the settings say off').not.toBeChecked()
    await expect(choice('背景', '纯白')).toHaveAttribute('aria-pressed', 'true')
    await expect(choice('内边距', '中')).toHaveAttribute('aria-pressed', 'true')
    await expect(choice('圆角', '12')).toHaveAttribute('aria-pressed', 'true')
    await expect(choice('输出画布比例', '自由')).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.getByRole('switch', { name: '阴影', exact: true })).toBeChecked()
    expect((await canvasInfo(page)).width).toBe(plain.width)
    await expect(group('背景').getByRole('button', { pressed: true })).toHaveCount(1)
  })

  test('every background is painted as itself: corner to corner, and none leaves the canvas transparent', async ({ page }) => {
    await openEditor(page)
    const { choice } = await openPanel(page)

    for (const background of BACKGROUNDS) {
      await choice('背景', background.name).click()
      const { width, height } = await canvasInfo(page)
      const analysis = await analyze(page, {
        source: 'canvas',
        points: [
          [0, 0],
          [width - 1, height - 1],
          [width - 1, 0],
        ],
      })
      const [topLeft, bottomRight, topRight] = analysis.at as [number[], number[], number[]]
      expect(near(topLeft, background.from) && topLeft[3] === 255, `${background.name}: first colour at the top-left corner, got ${topLeft}`).toBe(true)
      expect(near(bottomRight, background.to) && bottomRight[3] === 255, `${background.name}: last colour at the bottom-right corner, got ${bottomRight}`).toBe(true)
      if (background.from.join() !== background.to.join()) {
        expect(near(topRight, background.from, 2) || near(topRight, background.to, 2), `${background.name}: a gradient, not one flat colour (top-right is ${topRight})`).toBe(false)
      }
    }

    await choice('背景', '无（透明）').click()
    const { width, height } = await canvasInfo(page)
    const analysis = await analyze(page, {
      source: 'canvas',
      points: [
        [0, 0],
        [width - 1, height - 1],
      ],
    })
    expect(
      analysis.at.map(pixel => pixel[3]),
      'nothing is painted behind the content',
    ).toEqual([0, 0])
  })

  test('padding, corners, shadow and ratio: the content stays whole and centred, the corners round, the shadow falls under it', async ({ page }) => {
    await openEditor(page)
    const plain = await analyze(page, { source: 'canvas' })
    const { panel, choice } = await openPanel(page)
    const shadow = panel.getByRole('switch', { name: '阴影', exact: true })
    const IVORY: [number, number, number] = [246, 241, 231]

    await choice('背景', '米色').click()
    await choice('内边距', '大').click()
    await choice('圆角', '0').click()
    await shadow.click() // off

    // free: content plus padding on every side, the content a crisp rectangle in the middle of the background
    const free = await canvasInfo(page)
    expect([free.width, free.height]).toEqual([plain.width + 128, plain.height + 128])
    const bare = await analyze(page, { source: 'canvas', background: IVORY })
    expect(bare.differs, 'the content, whole, 64px from every edge').toEqual({ x: 64, y: 64, width: plain.width, height: plain.height })
    expect(bare.transparent).toBe(0)

    // corners: rounded off the content's four corners with 24, square with 0
    const corner = (analysis: Analysis) => analysis.at as number[][]
    const probes: Array<[number, number]> = [
      [65, 65],
      [64 + plain.width - 2, 65],
      [65, 64 + plain.height - 2],
      [64 + plain.width - 2, 64 + plain.height - 2],
    ]
    const square = await analyze(page, { source: 'canvas', points: probes })
    for (const pixel of corner(square)) expect(near(pixel, IVORY, 4), `radius 0 keeps the content's corner pixel ${pixel}`).toBe(false)
    await choice('圆角', '24').click()
    const rounded = await analyze(page, { source: 'canvas', points: probes })
    for (const pixel of corner(rounded)) expect(near(pixel, IVORY, 4), `radius 24 shows the background in the content's corner (${pixel})`).toBe(true)

    // shadow: under the bottom edge it darkens the background; with it off the same place is bare background
    await choice('圆角', '12').click()
    const below: Array<[number, number]> = [[64 + Math.round(plain.width / 2), 64 + plain.height + 6]]
    const [without] = (await analyze(page, { source: 'canvas', points: below })).at as [number[]]
    expect(near(without!, IVORY, 2), 'no shadow: bare background').toBe(true)
    await shadow.click()
    await expect(shadow).toBeChecked()
    const [withShadow] = (await analyze(page, { source: 'canvas', points: below })).at as [number[]]
    expect(withShadow![0]! + withShadow![1]! + withShadow![2]!, 'the shadow darkens what is under the content’s bottom edge').toBeLessThan(
      without![0]! + without![1]! + without![2]! - 30,
    )
    expect(withShadow![3], 'and the picture stays opaque').toBe(255)
    // a shadow does not paint over the content: its middle is what it was
    const centre: Array<[number, number]> = [[64 + Math.round(plain.width / 2), 64 + Math.round(plain.height / 2)]]
    const [withShadowCentre] = (await analyze(page, { source: 'canvas', points: centre })).at as [number[]]
    await shadow.click()
    const [withoutShadowCentre] = (await analyze(page, { source: 'canvas', points: centre })).at as [number[]]
    expect(withShadowCentre).toEqual(withoutShadowCentre)
    await shadow.click()

    // ratio: the canvas takes the shape, the content stays whole and in the middle
    for (const [label, ratio] of [
      ['16:9', 16 / 9],
      ['4:5', 4 / 5],
      ['1:1', 1],
    ] as const) {
      await choice('输出画布比例', label).click()
      const info = await canvasInfo(page)
      expect(info.width / info.height, `ratio ${label}`).toBeCloseTo(ratio, 1)
      expect(info.width, 'never smaller than content plus padding').toBeGreaterThanOrEqual(plain.width + 128)
      expect(info.height).toBeGreaterThanOrEqual(plain.height + 128)
      await choice('圆角', '0').click()
      await shadow.click() // off, so the content is the only thing unlike the background
      const placed = await analyze(page, { source: 'canvas', background: IVORY })
      expect(placed.differs?.width, `${label}: the content is not cropped`).toBe(plain.width)
      expect(placed.differs?.height, `${label}: nor squeezed`).toBe(plain.height)
      expect(Math.abs(placed.differs!.x + placed.differs!.width / 2 - info.width / 2), `${label}: centred across`).toBeLessThanOrEqual(1)
      expect(Math.abs(placed.differs!.y + placed.differs!.height / 2 - info.height / 2), `${label}: centred down`).toBeLessThanOrEqual(1)
      await choice('圆角', '12').click()
      await shadow.click()
    }
    await choice('输出画布比例', '自由').click()
    expect((await canvasInfo(page)).width, 'free again').toBe(plain.width + 128)
  })

  test('the preview follows the picture: it grows around the selection, the toolbar moves with it, a picture too big for the window shrinks while copy keeps every pixel', async ({
    page,
    context,
  }) => {
    await setSettings(context, { ratioPresets: ['1:1', '9:16'] })
    await openEditor(page)
    const selection = await boxOf(page, PREVIEW)
    const plain = await canvasInfo(page)
    const { choice } = await openPanel(page)
    const view = page.viewportSize()!

    await choice('内边距', '大').click()
    const grown = await boxOf(page, PREVIEW)
    expect(grown.width, 'the frame is bigger than the selection').toBeGreaterThan(selection.width + 100)
    expect(Math.abs(grown.x + grown.width / 2 - (selection.x + selection.width / 2)), 'centred on it, across').toBeLessThanOrEqual(1)
    expect(grown.y, 'and around it, down').toBeLessThanOrEqual(selection.y)
    expect(grown.y + grown.height).toBeGreaterThanOrEqual(selection.y + selection.height)
    for (const label of ['自由', '1:1']) {
      await choice('输出画布比例', label).click()
      const [preview, toolbar] = await Promise.all([boxOf(page, PREVIEW), boxOf(page, TOOLBAR)])
      expect(touches(preview, toolbar), `${label}: the toolbar sits on the picture`).toBe(false)
      expect(toolbar.y + toolbar.height, `${label}: the toolbar stays in the window`).toBeLessThanOrEqual(view.height)
      expect(toolbar.y, `${label}: and so does the top`).toBeGreaterThanOrEqual(0)
    }

    // 9:16 is taller than the window: the preview is the picture scaled down to fit…
    await choice('输出画布比例', '9:16').click()
    const tall = await canvasInfo(page)
    expect(tall.height, 'the picture itself is taller than the window').toBeGreaterThan(view.height)
    const shrunk = await boxOf(page, PREVIEW)
    expect(shrunk.y).toBeGreaterThanOrEqual(0)
    expect(shrunk.y + shrunk.height, 'inside the window').toBeLessThanOrEqual(view.height)
    expect(shrunk.width / shrunk.height, 'in the same shape').toBeCloseTo(9 / 16, 1)
    expect(touches(shrunk, await boxOf(page, TOOLBAR)), 'with the toolbar clear of it').toBe(false)
    // …while copy has every pixel
    await toolbarButton(page, '复制').click()
    await expect(page.locator('.ann-shot-notice')).toContainText('已复制')
    const copied = await analyze(page, { source: 'clipboard' })
    expect([copied.width, copied.height], 'the clipboard has the full picture').toEqual([tall.width, tall.height])
    expect(plain.width, 'sanity: the content itself is small').toBeLessThan(tall.width)
  })

  test('copy and save: the clipboard has the beautified picture with its watermark, the library keeps the plain capture', async ({ page, context }) => {
    await setSettings(context, { watermark: { enabled: true, text: '@annhub', position: 'bottom-right', size: 'large', opacity: 1 } })
    await openEditor(page)
    const plain = await canvasInfo(page)
    const { choice } = await openPanel(page)
    await choice('背景', '蓝色渐变').click()
    await choice('内边距', '中').click()

    const shown = await canvasInfo(page)
    expect([shown.width, shown.height]).toEqual([plain.width + 80, plain.height + 80])
    await toolbarButton(page, '复制').click()
    await expect(page.locator('.ann-shot-notice')).toContainText('已复制')
    const probes: Array<[number, number]> = [
      [0, 0],
      [shown.width - 1, shown.height - 1],
    ]
    const copied = await analyze(page, { source: 'clipboard', points: probes })
    const preview = await analyze(page, { source: 'canvas', points: probes })
    expect([copied.width, copied.height], 'what is copied is what is shown').toEqual([shown.width, shown.height])
    expect(copied.at).toEqual(preview.at)
    expect(near(copied.at[0]!, [227, 237, 250]), 'with the background').toBe(true)

    // the watermark's dark ink on a light background lands in the corner
    const corner: Box = { x: shown.width - 130, y: shown.height - 40, width: 126, height: 36 }
    expect((await analyze(page, { source: 'clipboard', ink: corner })).ink.dark, 'the watermark is written…').toBeGreaterThan(15)

    await toolbarButton(page, '确认').click()
    await expect(page.locator(SESSION)).toHaveCount(0)
    const saved = await analyze(page, { source: { dataUrl: (await savedAsset(context)).dataUrl }, points: [[0, 0]] })
    expect([saved.width, saved.height], 'the library keeps the capture itself: no padding').toEqual([plain.width, plain.height])
    expect(saved.transparent).toBe(0)
    expect(near(saved.at[0]!, [255, 255, 255]), `and its corner is the page, not the background (${saved.at[0]})`).toBe(true)
  })

  test('on a dark background the watermark is written in light ink', async ({ page, context }) => {
    await setSettings(context, { watermark: { enabled: true, text: '@annhub', position: 'bottom-right', size: 'large', opacity: 1 } })
    await openEditor(page)
    const { choice } = await openPanel(page)
    await choice('背景', '深灰渐变').click()
    await choice('内边距', '大').click()
    const { width, height } = await canvasInfo(page)
    const corner: Box = { x: width - 130, y: height - 40, width: 126, height: 36 }
    const dark = await analyze(page, { source: 'canvas', ink: corner })
    expect(dark.ink.light, 'light ink on the dark corner').toBeGreaterThan(15)
    await choice('背景', '纯白').click()
    const light = await analyze(page, { source: 'canvas', ink: corner })
    expect(light.ink.dark, 'dark ink on the white corner').toBeGreaterThan(15)
  })
})

test.describe('annotating the capture (screenshot.md §3, §4.4)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  /** Drags a rectangle with the rectangle tool from one preview position to another. */
  async function drawRectangle(page: Page, from: [number, number], to: [number, number]): Promise<void> {
    await toolbarButton(page, '矩形').click()
    await page.mouse.move(from[0], from[1])
    await page.mouse.down()
    await page.mouse.move(to[0], to[1], { steps: 6 })
    await page.mouse.up()
  }

  /** Where a point of the screen falls on the preview canvas, in the canvas's own pixels. */
  const toCanvas = (info: { width: number; height: number; box: Box }, point: [number, number]): [number, number] => [
    ((point[0] - info.box.x) * info.width) / info.box.width,
    ((point[1] - info.box.y) * info.height) / info.box.height,
  ]

  test('a rectangle drawn on the plain preview shows, keeps the capture under it, and is what gets saved', async ({ page, context }) => {
    await openEditor(page)
    const info = await canvasInfo(page)
    const from: [number, number] = [info.box.x + 60, info.box.y + 40]
    const to: [number, number] = [info.box.x + 220, info.box.y + 110]
    await drawRectangle(page, from, to)

    const [start, end] = [toCanvas(info, from), toCanvas(info, to)]
    const shown = await analyze(page, { source: 'canvas' })
    expect(shown.transparent, 'the capture is still on the canvas after drawing').toBe(0)
    expect(shown.red, `a stroke in ${ANNOTATION_RED}`).not.toBeNull()
    expect(shown.red!.x).toBeCloseTo(start[0] - 1.5, -1)
    expect(shown.red!.y).toBeCloseTo(start[1] - 1.5, -1)
    expect(shown.red!.x + shown.red!.width).toBeCloseTo(end[0] + 1.5, -1)
    expect(shown.red!.y + shown.red!.height).toBeCloseTo(end[1] + 1.5, -1)

    await toolbarButton(page, '确认').click()
    await expect(page.locator(SESSION)).toHaveCount(0)
    const saved = await analyze(page, { source: { dataUrl: (await savedAsset(context)).dataUrl } })
    expect(saved.transparent, 'the saved picture is the capture, not a blank').toBe(0)
    expect(saved.red, 'with the annotation in it').not.toBeNull()
    expect(saved.red!.x).toBeCloseTo(start[0] - 1.5, -1)
    expect(saved.red!.y).toBeCloseTo(start[1] - 1.5, -1)
  })

  test('undo takes the last annotation off, and the text tool writes where it is clicked — neither blanks the capture', async ({ page }) => {
    await openEditor(page)
    const info = await canvasInfo(page)
    await drawRectangle(page, [info.box.x + 60, info.box.y + 40], [info.box.x + 220, info.box.y + 110])
    expect((await analyze(page, { source: 'canvas' })).red, 'the rectangle is there').not.toBeNull()

    await toolbarButton(page, '撤销').click()
    const undone = await analyze(page, { source: 'canvas' })
    expect(undone.red, 'undo takes it off').toBeNull()
    expect(undone.transparent, 'and the capture is whole').toBe(0)
    await expect(toolbarButton(page, '撤销'), 'nothing left to undo').toBeDisabled()

    await toolbarButton(page, '文字').click()
    const click: [number, number] = [info.box.x + 80, info.box.y + 50]
    await page.mouse.click(click[0], click[1])
    const input = page.locator('[data-ann-ui="screenshot-text-input"]')
    await expect(input).toBeVisible()
    await input.fill('Retries')
    await input.press('Enter')
    await expect(input).toHaveCount(0)
    const written = await analyze(page, { source: 'canvas' })
    expect(written.transparent).toBe(0)
    expect(written.red, 'the text is drawn in the annotation colour').not.toBeNull()
    expect(Math.abs(written.red!.x - (click[0] - info.box.x)), 'starting where it was clicked').toBeLessThanOrEqual(8)
    expect(written.red!.y, 'and below the click, the way a line of text sits on its baseline').toBeGreaterThanOrEqual(click[1] - info.box.y)
    expect(written.red!.width, 'seven letters wide').toBeGreaterThan(40)
  })

  test('every way of closing the text box keeps what was typed — Esc included — and an empty box leaves nothing; only the next Esc cancels the screenshot', async ({ page }) => {
    await openEditor(page)
    const info = await canvasInfo(page)
    const input = page.locator('[data-ann-ui="screenshot-text-input"]')
    await toolbarButton(page, '文字').click()

    // an empty box closed with Esc: no annotation, and the session stays
    await page.mouse.click(info.box.x + 40, info.box.y + 40)
    await expect(input).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(page.locator(SESSION), 'the first Esc only closes the box').toBeVisible()
    await expect(toolbarButton(page, '撤销'), 'nothing was added').toBeDisabled()

    // Esc with text in the box: the box closes, the text stays
    await page.mouse.click(info.box.x + 80, info.box.y + 50)
    await input.fill('Kept on Esc')
    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(page.locator(SESSION)).toBeVisible()
    expect((await analyze(page, { source: 'canvas' })).red, 'the text is on the picture').not.toBeNull()
    await expect(toolbarButton(page, '撤销'), 'as one annotation').toBeEnabled()
    await toolbarButton(page, '撤销').click()
    expect((await analyze(page, { source: 'canvas' })).red, 'which undo takes off').toBeNull()

    // clicking elsewhere on the picture closes the box too, and opens the next one where the click was
    await page.mouse.click(info.box.x + 80, info.box.y + 50)
    await input.fill('Kept on click')
    await page.mouse.click(info.box.x + 80, info.box.y + 120)
    await expect(input, 'the new box is the only one').toHaveCount(1)
    expect((await analyze(page, { source: 'canvas' })).red, 'and the first text is on the picture').not.toBeNull()
    await page.keyboard.press('Escape')
    await expect(page.locator(SESSION)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator(SESSION), 'the next Esc cancels the screenshot').toHaveCount(0)
  })

  test('a region against the top of the window keeps its size label in view and out from under the toolbar, and so does the picture beautify grows from it', async ({ page }) => {
    const view = page.viewportSize()!
    await openEditor(page, { from: [300, 6], to: [700, 130] })
    const inView = (box: Box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height
    const check = async (step: string) => {
      const [preview, toolbar, label] = await Promise.all([boxOf(page, PREVIEW), boxOf(page, TOOLBAR), boxOf(page, SIZE_LABEL)])
      expect(inView(label), `${step}: the size label is in the window (${JSON.stringify(label)})`).toBe(true)
      expect(touches(label, toolbar), `${step}: and the toolbar does not cover it`).toBe(false)
      expect(touches(preview, toolbar), `${step}: the toolbar is off the picture`).toBe(false)
    }
    await check('the plain selection')
    await expect(page.locator(SIZE_LABEL)).toHaveText(/^\d+ x \d+$/)

    const { choice } = await openPanel(page)
    await choice('内边距', '大').click()
    await check('grown by the padding')
    await choice('输出画布比例', '16:9').click()
    await check('at 16:9')
  })

  test('a region against the window’s edge keeps the toolbar and the panel in the window and off the picture', async ({ page }) => {
    const view = page.viewportSize()!
    await openEditor(page, { from: [view.width - 330, view.height - 170], to: [view.width - 24, view.height - 24] })
    const rectOf = (selector: string) => boxOf(page, selector)
    const inside = (box: Box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height

    let [preview, toolbar] = await Promise.all([rectOf(PREVIEW), rectOf(TOOLBAR)])
    let label = await rectOf(SIZE_LABEL)
    expect(inside(toolbar), `the toolbar fits the window (${JSON.stringify(toolbar)})`).toBe(true)
    expect(touches(preview, toolbar), 'and is off the picture').toBe(false)
    expect(inside(label), 'the size label is in the window').toBe(true)
    expect(touches(label, toolbar), 'and not under the toolbar').toBe(false)

    const { choice } = await openPanel(page)
    await choice('内边距', '大').click()
    await choice('输出画布比例', '1:1').click()
    for (const step of ['grown', 'square']) {
      const panel = await rectOf('[data-ann-ui="screenshot-beautify-panel"]')
      ;[preview, toolbar] = await Promise.all([rectOf(PREVIEW), rectOf(TOOLBAR)])
      label = await rectOf(SIZE_LABEL)
      expect(inside(label), `${step}: the size label is in the window`).toBe(true)
      expect(touches(label, toolbar), `${step}: and not under the toolbar`).toBe(false)
      expect(inside(preview), `${step}: the picture fits the window`).toBe(true)
      expect(inside(toolbar), `${step}: so does the toolbar`).toBe(true)
      expect(inside(panel), `${step}: and the panel`).toBe(true)
      expect(touches(panel, toolbar), `${step}: the panel is off the toolbar`).toBe(false)
      expect(touches(panel, preview), `${step}: and off the picture`).toBe(false)
      expect(touches(preview, toolbar), `${step}: the toolbar is off the picture`).toBe(false)
      await choice('输出画布比例', '自由').click()
    }
  })

  test('with the beautified frame around it a rectangle lands where the pointer drew it, on the capture and not on the padding', async ({ page, context }) => {
    await openEditor(page)
    const plain = await canvasInfo(page)
    const { choice } = await openPanel(page)
    await choice('背景', '米色').click()
    await choice('内边距', '大').click()
    await page.keyboard.press('Escape') // the panel is out of the way of the drag

    const info = await canvasInfo(page)
    expect([info.width, info.height]).toEqual([plain.width + 128, plain.height + 128])
    const from: [number, number] = [info.box.x + info.box.width * 0.3, info.box.y + info.box.height * 0.4]
    const to: [number, number] = [info.box.x + info.box.width * 0.6, info.box.y + info.box.height * 0.7]
    await drawRectangle(page, from, to)

    const [start, end] = [toCanvas(info, from), toCanvas(info, to)]
    const shown = await analyze(page, { source: 'canvas' })
    expect(shown.red, 'a stroke on the framed picture').not.toBeNull()
    expect(shown.red!.x).toBeCloseTo(start[0] - 1.5, -1)
    expect(shown.red!.y).toBeCloseTo(start[1] - 1.5, -1)
    expect(shown.red!.x + shown.red!.width).toBeCloseTo(end[0] + 1.5, -1)
    expect(shown.red!.y + shown.red!.height).toBeCloseTo(end[1] + 1.5, -1)

    // saved: the capture alone, the stroke where it was over the content (the padding is not part of it)
    await toolbarButton(page, '确认').click()
    await expect(page.locator(SESSION)).toHaveCount(0)
    const saved = await analyze(page, { source: { dataUrl: (await savedAsset(context)).dataUrl } })
    expect([saved.width, saved.height]).toEqual([plain.width, plain.height])
    expect(saved.red, 'the annotation is in the saved capture').not.toBeNull()
    expect(saved.red!.x).toBeCloseTo(start[0] - 64 - 1.5, -1)
    expect(saved.red!.y).toBeCloseTo(start[1] - 64 - 1.5, -1)
  })
})

/**
 * Makes the browser hand the extension a capture of the visible tab at twice the window's size, the way a Retina screen
 * does: red grows left to right and green top to bottom, so a pixel of any crop says where in the window it came from.
 * (The test browser's own capture is always at one pixel per CSS pixel; the session takes its scale from the image.)
 */
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
