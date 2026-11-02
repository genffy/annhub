/**
 * Shared pixel-reading and editor-driving helpers for the screenshot editor specs: the session's
 * selectors, a page-side pixel analyzer for the preview, the clipboard and saved assets, and the
 * ways to open the editor and its beautify panel. Moved verbatim from screenshot-beautify.spec.ts
 * when the retina capture tests moved to their own file.
 */
import type { BrowserContext, Page } from '@playwright/test'
import { expect } from './fixtures'
import { ensureServiceWorker, getEntries, getScreenshotPageUrl, triggerScreenshot } from './helpers'

export const SESSION = '[data-ann-ui="screenshot-session"]'
export const PREVIEW = '[data-ann-ui="screenshot-preview"]'
export const TOOLBAR = '[data-ann-ui="screenshot-toolbar"]'
export const CANVAS = `${PREVIEW} canvas`
export const SIZE_LABEL = `${PREVIEW} .ann-shot-size`

/** The red the annotation tools start with (toolbar.tsx) and a stroke of it. */
export const ANNOTATION_RED = '#e5484d'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Analysis {
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

export interface AnalyzeOptions {
  /** the preview canvas, the image on the clipboard, or a data URL */
  source: 'canvas' | 'clipboard' | { dataUrl: string }
  points?: Array<[number, number]>
  background?: [number, number, number]
  ink?: Box
}

/** Reads the pixels of an image inside the page, where a canvas lives. */
export async function analyze(page: Page, options: AnalyzeOptions): Promise<Analysis> {
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
export async function canvasInfo(page: Page): Promise<{ width: number; height: number; box: Box }> {
  return page.locator(CANVAS).evaluate(canvas => {
    const element = canvas as HTMLCanvasElement
    const rect = element.getBoundingClientRect()
    return { width: element.width, height: element.height, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
  })
}

export const boxOf = (page: Page, selector: string): Promise<Box> =>
  page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })

export const touches = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/**
 * A region dragged over the post of the fixture page — or, given `drag`, between two points of the window — and
 * confirmed into the editor.
 */
export async function openEditor(page: Page, drag?: { from: [number, number]; to: [number, number] }): Promise<void> {
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

export const toolbarButton = (page: Page, name: string) => page.locator(TOOLBAR).getByRole('button', { name, exact: true })
export const beautifyButton = (page: Page) => toolbarButton(page, '美化')
export const panelOf = (page: Page) => page.getByRole('group', { name: '美化', exact: true })

export async function openPanel(page: Page) {
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
export async function savedAsset(context: BrowserContext): Promise<{ dataUrl: string }> {
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
