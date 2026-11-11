import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Page } from '@playwright/test'
import { test } from '../../../../e2e/fixtures'
import { clearLibrary, ensureServiceWorker, selectUntilMenu, sendMessage, triggerAnnotation, triggerScreenshot, updateEntry } from '../../../../e2e/helpers'
import { CLIPS, PROPERTY_NAMES, SCENE_TEXT, type StoreLocale } from './content'

/**
 * Chrome Web Store listing images from the real extension (permissions.md §6: taken from the real
 * extension, one set per listing language, English shots for the English listing). One test per
 * image, 1280x800 (the size the store asks for):
 *
 *   01-selection-menu     the clip menu on an article
 *   02-screenshot-editor  the in-place editor with the highlighter, step numbers and a text label
 *   03-page-annotation    the annotation layer on the live page, with its toolbar
 *   04-record-tab         a recording in progress: the page with ink and cursor highlight, the popup's recording state
 *   05-download           the library's selection bar and download dialog over the grid, clips and screenshots together
 *   extra-library.png     the library grid on its own — a spare
 *   extra-reading.png     the reading view with highlights — a spare: the store takes five images
 *
 * Tab capture cannot be driven by automation, so 04 lays the real popup (its recording state fed
 * through the same stub the popup E2E uses) over a real page that the real content script is
 * annotating while the recording lifecycle message is in effect. Everything else is one capture.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const locale: StoreLocale = process.env.STORE_LOCALE === 'zh' ? 'zh' : 'en'
const outDir = path.join(__dirname, locale)
fs.mkdirSync(outDir, { recursive: true })

const text = SCENE_TEXT[locale]
const ARTICLE = `http://127.0.0.1:8174/${text.articlePage}`
const VIEWPORT = { width: 1280, height: 800 }
const DAY = 86_400_000
const now = Date.now()

test.use({ uiLocale: locale === 'zh' ? 'zh-CN' : 'en-US' })

const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface Box {
  x: number
  y: number
  width: number
  height: number
}

// ── the library ─────────────────────────────────────────────────────────────────────────────

function highlightOf(content: string, quote: string, color: string, note?: string) {
  const start = content.indexOf(quote)
  if (start < 0) throw new Error(`quote not found: ${quote.slice(0, 40)}`)
  return { id: `hl_${Math.random().toString(36).slice(2, 10)}`, start, end: start + quote.length, quote, color, note, createdAt: now - 2 * DAY }
}

/** The property registry and the six clips, in the record shape the store persists. */
async function seedLibrary(context: BrowserContext, extensionId: string): Promise<void> {
  await clearLibrary(context)
  const names = PROPERTY_NAMES[locale]
  const sample = await context.newPage()
  await sample.setViewportSize(VIEWPORT)
  await sample.goto(`chrome-extension://${extensionId}/sample.html`)
  for (const def of [
    { name: names.project, type: 'text', builtin: false, presets: ['clip'] },
    { name: names.status, type: 'text', builtin: false, presets: [] },
  ]) {
    await sendMessage(sample, { type: 'UPSERT_PROPERTY', def })
  }
  await sample.close()

  const worker = await ensureServiceWorker(context)
  await worker.evaluate(
    payload => {
      const clips = payload as Array<Record<string, unknown>>
      return new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('annhub')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('entries', 'readwrite')
          for (const clip of clips) tx.objectStore('entries').put(clip)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => {
            db.close()
            reject(tx.error)
          }
        }
      })
    },
    CLIPS[locale].map(body => ({
      id: body.id,
      type: 'clip',
      content: body.content,
      context: body.context,
      note: body.note,
      highlights: body.highlights?.map(h => highlightOf(body.content, h.quote, h.color, h.note)),
      sourceUrl: body.url,
      sourceHost: body.host,
      properties: { title: body.title, tags: body.tags, ...body.properties },
      createdAt: now - body.ageDays * DAY,
      updatedAt: now - body.ageDays * DAY,
    })),
  )
}

// ── page helpers ────────────────────────────────────────────────────────────────────────────

/** The line boxes a phrase of the page takes, in viewport coordinates (whitespace in the phrase matches any run of it). */
async function rectsOfText(page: Page, selector: string, phrase: string): Promise<Box[]> {
  return page.evaluate(
    ({ selector, phrase }) => {
      const root = document.querySelector(selector)
      if (!root) throw new Error(`no element: ${selector}`)
      const pattern = new RegExp(
        phrase
          .split(/\s+/)
          .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('\\s+'),
      )
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const match = pattern.exec(node.textContent ?? '')
        if (!match) continue
        const range = document.createRange()
        range.setStart(node, match.index)
        range.setEnd(node, match.index + match[0].length)
        return [...range.getClientRects()].filter(rect => rect.width > 4).map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }))
      }
      throw new Error(`phrase not found in ${selector}: ${phrase}`)
    },
    { selector, phrase },
  )
}

async function dragFromTo(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(from[0], from[1])
  await page.mouse.down()
  await page.mouse.move(to[0], to[1], { steps: 14 })
  await page.mouse.up()
}

/** One highlighter stroke along each line a phrase takes; the stroke's round ends reach half a band past its points, so the points sit that far inside. */
async function highlightLines(page: Page, lines: Box[]): Promise<void> {
  const cap = 9
  for (const line of lines) {
    const y = line.y + line.height / 2
    await dragFromTo(page, [line.x + cap, y], [line.x + line.width - cap, y])
  }
}

/** The chart's SVG, so a point of its drawing (640x300 user units, one per pixel) is a point of the page. */
async function chartPoint(page: Page, x: number, y: number): Promise<[number, number]> {
  const box = (await page.locator('[data-testid="chart-figure"] svg').boundingBox())!
  return [box.x + x, box.y + y]
}

/** Drags a region over an element through the real screenshot session and saves it. */
async function saveRegion(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await triggerScreenshot(page)
  await page.mouse.move(from[0], from[1])
  await page.mouse.down()
  await page.mouse.move(to[0], to[1], { steps: 8 })
  await page.mouse.up()
  await page.locator('[data-ann-ui="shot-confirm-bar"]').waitFor({ state: 'visible' })
  await page.keyboard.press('Enter')
  await page.locator('[data-ann-ui="screenshot-preview"]').waitFor({ state: 'visible' })
  await page.locator('[data-ann-ui="screenshot-save"]').click()
  await page.locator('[data-ann-ui="screenshot-session"]').waitFor({ state: 'detached' })
}

// ── scenes ──────────────────────────────────────────────────────────────────────────────────

// The first shot leads with the block capsule: since 2.2.0 it is four icon-only buttons (clip,
// screenshot, download, more) — the page-level UI the release added. The selection menu (icon +
// short text, unchanged by 2.2.0) stays as a spare.
test('01 block capsule', async ({ page }) => {
  await page.setViewportSize(VIEWPORT)
  await page.goto(ARTICLE)
  await page.mouse.move(5, 5)
  await settle(200)
  await page.locator('figure').first().hover()
  const capsule = page.locator('[data-ann-ui="block-capsule"]')
  await capsule.waitFor({ state: 'visible' })
  // rest on the download button so the capsule shows the affordance's hover state
  await capsule.locator('button').nth(2).hover()
  await settle(400)
  await page.screenshot({ path: path.join(outDir, '01-block-capsule.png') })
})

test('extra selection menu', async ({ page }) => {
  await page.setViewportSize(VIEWPORT)
  await page.goto(ARTICLE)
  const menu = await selectUntilMenu(page, '#lead')
  await menu.locator('.ann-menu-action').first().hover()
  await settle(700)
  await page.screenshot({ path: path.join(outDir, 'extra-selection-menu.png') })
})

test('02 screenshot editor', async ({ page }) => {
  await page.setViewportSize(VIEWPORT)
  await page.goto(ARTICLE)
  await page.evaluate(() => window.scrollTo(0, 300))
  await settle(300)

  const measure = await rectsOfText(page, '#measure', text.measurePhrase)
  const heading = (await page.locator('h2').first().boundingBox())!
  const caption = (await page.locator('figcaption').boundingBox())!
  const peak = await chartPoint(page, 190, 44)
  const plateau = await chartPoint(page, 250, 126)
  const crossing = await chartPoint(page, 372, 154)
  const label = await chartPoint(page, 92, 52)

  await triggerScreenshot(page)
  await page.mouse.move(heading.x - 14, heading.y - 14)
  await page.mouse.down()
  await page.mouse.move(caption.x + caption.width + 14, caption.y + caption.height + 14, { steps: 8 })
  await page.mouse.up()
  await page.locator('[data-ann-ui="shot-confirm-bar"]').waitFor({ state: 'visible' })
  await page.keyboard.press('Enter')
  await page.locator('[data-ann-ui="screenshot-preview"]').waitFor({ state: 'visible' })
  await settle(400)

  const toolbar = page.locator('[data-ann-ui="screenshot-toolbar"]')
  const button = (name: string) => toolbar.getByRole('button', { name, exact: true })

  // the highlighter lays a translucent band over the sentence, one stroke a line
  await button(text.names.highlighter).click()
  await button(text.names.yellow).click()
  await highlightLines(page, measure)

  // numbered steps along the chart, then a label in red
  await button(text.names.red).click()
  await button(text.names.stepTool).click()
  for (const point of [peak, plateau, crossing]) await page.mouse.click(point[0], point[1])
  await button(text.names.textTool).click()
  await page.mouse.click(label[0], label[1])
  await page.locator('[data-ann-ui="screenshot-text-input"]').fill(text.peakLabel)
  await page.locator('[data-ann-ui="screenshot-text-input"]').press('Enter')
  await button(text.names.stepTool).click()
  await page.mouse.move(heading.x + heading.width + 200, heading.y + 400)
  await settle(500)
  await page.screenshot({ path: path.join(outDir, '02-screenshot-editor.png') })
})

test('03 page annotation', async ({ page }) => {
  await page.setViewportSize(VIEWPORT)
  await page.goto(ARTICLE)
  const lead = await rectsOfText(page, '#lead', text.leadPhrase)
  const peak = await chartPoint(page, 190, 44)
  const labelAt = await chartPoint(page, 330, 40)

  await triggerAnnotation(page)
  await page.locator('[data-ann-ui="annotation-layer"]').waitFor()
  const tool = (name: string) => page.locator(`[data-ann-ui="annotation-toolbar"] [data-ann-ui="annotation-tool-${name}"]`)

  await tool('highlighter').click()
  await page.locator('[data-ann-ui="annotation-color-yellow"]').click()
  await highlightLines(page, lead)

  await page.locator('[data-ann-ui="annotation-color-red"]').click()
  await tool('text').click()
  await page.mouse.click(labelAt[0], labelAt[1])
  await page.keyboard.type(text.stormLabel)
  await page.keyboard.press('Enter')

  await tool('arrow').click()
  await dragFromTo(page, [labelAt[0] - 8, labelAt[1] + 14], [peak[0] + 16, peak[1] + 2])
  await page.mouse.move(peak[0] + 380, peak[1] + 140)
  await settle(500)
  await page.screenshot({ path: path.join(outDir, '03-page-annotation.png') })
})

/** Makes the popup believe the active tab is an http page and the worker answers with this recording state. */
async function popupIn(page: Page, extensionId: string, recording: Record<string, unknown>): Promise<Page> {
  const popup = await page.context().newPage()
  await popup.setViewportSize({ width: 520, height: 600 })
  await popup.addInitScript(
    ({ recording }) => {
      const query = chrome.tabs.query.bind(chrome.tabs)
      chrome.tabs.query = ((info: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
        if (!info?.active) return query(info, callback as never)
        const tabs = [{ id: 4242, url: 'https://engineering.example.com/posts/retries', title: 'Retries' } as chrome.tabs.Tab]
        if (callback) return void callback(tabs)
        return Promise.resolve(tabs)
      }) as typeof chrome.tabs.query
      const send = chrome.runtime.sendMessage.bind(chrome.runtime)
      chrome.runtime.sendMessage = ((...rest: unknown[]) => {
        const type = (rest[0] as { type?: string } | undefined)?.type
        if (type === 'GET_RECORDING_STATE') return Promise.resolve({ success: true, data: recording })
        return (send as (...args: unknown[]) => unknown)(...rest)
      }) as typeof chrome.runtime.sendMessage
    },
    { recording },
  )
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.locator('.popup-shell').waitFor()
  return popup
}

/** What the worker broadcasts to the page when a recording starts: the cursor highlight is on, in teal. */
async function broadcastRecording(page: Page): Promise<void> {
  const worker = await ensureServiceWorker(page.context())
  const url = page.url()
  await worker.evaluate(
    async payload => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === payload.url)
      await chrome.tabs.sendMessage(tab!.id!, payload.message, { frameId: 0 })
    },
    { url, message: { type: 'RECORDING_LIFECYCLE', active: true, cursorHighlight: { enabled: true, shape: 'ring', color: '#147d72' } } },
  )
}

test('04 record tab', async ({ context, page, extensionId }) => {
  await seedLibrary(context, extensionId) // the popup lists the latest entries under the recording block
  await page.setViewportSize(VIEWPORT)
  await page.goto(`${ARTICLE}#left`)
  const lead = await rectsOfText(page, '#lead', text.leadPhrase)
  const around: [[number, number], [number, number]] = [await chartPoint(page, 156, 30), await chartPoint(page, 232, 74)]
  const rest = await chartPoint(page, 232, 52)

  await broadcastRecording(page)
  await triggerAnnotation(page)
  await page.locator('[data-ann-ui="annotation-layer"]').waitFor()
  // the toolbar would be filmed, so the layer has none while recording: the tools run on single keys
  await page.keyboard.press('2')
  await page.keyboard.press('h')
  await highlightLines(page, lead)
  await page.keyboard.press('1')
  await page.keyboard.press('o')
  await dragFromTo(page, around[0], around[1])
  await page.mouse.move(rest[0], rest[1]) // the cursor highlight rests on the circle's edge
  await settle(500)
  const pageShot = await page.screenshot()

  const popup = await popupIn(page, extensionId, {
    status: 'recording',
    withMic: true,
    tabId: 4242,
    tabTitle: text.recordedTab,
    startedAt: Date.now() - 161_000,
  })
  await settle(500)
  const popupShot = await popup.locator('.popup-shell').screenshot()
  await popup.close()

  const compose = await context.newPage()
  await compose.setViewportSize(VIEWPORT)
  await compose.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;position:relative;overflow:hidden;background:#fff">
<img alt="" src="data:image/png;base64,${pageShot.toString('base64')}" style="position:absolute;left:0;top:0;width:1280px;height:800px" />
<img alt="" src="data:image/png;base64,${popupShot.toString('base64')}" style="position:absolute;right:14px;top:14px;border-radius:12px;box-shadow:0 0 0 1px rgba(15,23,42,.12),0 18px 44px rgba(15,23,42,.30)" />
</body></html>`)
  await compose
    .locator('img')
    .last()
    .evaluate(img => (img instanceof HTMLImageElement ? img.decode() : undefined))
  await compose.screenshot({ path: path.join(outDir, '04-record-tab.png') })
})

test('05 download and the library', async ({ context, page, extensionId }) => {
  test.setTimeout(180_000)
  await seedLibrary(context, extensionId)

  // two real screenshots through the real flow, so pixels and asset records are what a user gets
  await page.setViewportSize(VIEWPORT)
  await page.goto(ARTICLE)
  {
    const figure = (await page.getByTestId('chart-figure').boundingBox())!
    await saveRegion(page, [figure.x + 6, figure.y + 6], [figure.x + figure.width - 6, figure.y + figure.height - 6])
  }
  await page.goto(ARTICLE)
  await page.evaluate(() => {
    const headings = document.querySelectorAll('h2')
    window.scrollTo(0, headings[1]!.getBoundingClientRect().top + window.scrollY - 60)
  })
  await settle(300)
  {
    const heading = (await page.locator('h2').nth(1).boundingBox())!
    const explanation = (await page.locator('pre + p').boundingBox())!
    await saveRegion(page, [heading.x - 10, heading.y - 10], [explanation.x + explanation.width + 10, explanation.y + explanation.height + 10])
  }

  // the capture ran on a local address; the library shows the article's own site, like a page the user really clipped
  {
    const worker = await ensureServiceWorker(context)
    const titles = text.shotTitles
    const shots = await worker.evaluate(
      () =>
        new Promise<Array<{ id: string; createdAt: number }>>(resolve => {
          const open = indexedDB.open('annhub')
          open.onsuccess = () => {
            const get = open.result.transaction('entries', 'readonly').objectStore('entries').getAll()
            get.onsuccess = () => {
              open.result.close()
              resolve((get.result as Array<{ id: string; type: string; createdAt: number }>).filter(entry => entry.type === 'screenshot'))
            }
          }
        }),
    )
    if (shots.length !== 2) throw new Error(`expected 2 screenshot entries, got ${shots.length}`)
    shots.sort((a, b) => a.createdAt - b.createdAt)
    for (const [index, shot] of shots.entries()) await updateEntry(context, extensionId, shot.id, { properties: { set: { title: titles[index] } } })
    await worker.evaluate(
      ids =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('annhub')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const db = open.result
            const store = db.transaction('entries', 'readwrite')
            const entries = store.objectStore('entries')
            for (const id of ids) {
              const get = entries.get(id)
              get.onsuccess = () => {
                const entry = get.result as Record<string, unknown>
                entries.put({ ...entry, sourceHost: 'engineering.example.com', sourceUrl: 'https://engineering.example.com/posts/why-retries-need-jitter' })
              }
            }
            store.oncomplete = () => {
              db.close()
              resolve()
            }
            store.onerror = () => reject(store.error)
          }
        }),
      shots.map(shot => shot.id),
    )
  }

  const library = await context.newPage()
  library.on('console', message => {
    if (message.type() === 'error') console.log('[library]', message.text())
  })
  await library.setViewportSize(VIEWPORT)
  await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
  await library.locator('.entry-card').nth(7).waitFor({ state: 'visible' })
  await settle(900)
  await library.screenshot({ path: path.join(outDir, 'extra-library.png') })

  // the batch download (download.md §3.2–3.3): the selection bar takes the filter bar's place and
  // the dialog shows what the batch will write; the first four cards are the two screenshots and
  // the two most recent clips
  await library.getByTestId('enter-select').click()
  await library.getByTestId('selection-bar').waitFor({ state: 'visible' })
  for (let index = 0; index < 4; index++) await library.locator('.entry-card').nth(index).click()
  await library
    .getByTestId('selection-bar')
    .filter({ hasText: locale === 'zh' ? '已选 4 条' : '4 selected' })
    .waitFor({ state: 'visible' })
  await library.getByTestId('download-selected').click()
  const dialog = library.getByTestId('download-dialog')
  await dialog.waitFor({ state: 'visible' })
  // the estimate arrives from the worker; the dialog shows "loading" until it does
  await dialog
    .getByTestId('download-summary')
    .filter({ hasText: locale === 'zh' ? '条' : 'entries' })
    .waitFor({ state: 'visible' })
  await settle(400)
  await library.screenshot({ path: path.join(outDir, '05-download.png') })
  await library.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })

  // the reading view: highlights with notes, the side rail (the marquee tile's second card)
  await library.goto(`chrome-extension://${extensionId}/library.html#/read/ent_backpressure`)
  await library.getByTestId('reading-view').waitFor({ state: 'visible' })
  await library.locator('.md-hl').nth(2).waitFor({ state: 'visible' })
  await settle(500)
  await library.screenshot({ path: path.join(outDir, 'extra-reading.png') })
  await library.close()
})

// A spare: the block capsule that appears when the pointer rests on a block. Since 2.2.0 it is four
// icon-only buttons (clip, screenshot, download, more) — the page-level UI change the listing's
// screenshot 01 (the selection menu) cannot show.
test('extra block capsule', async ({ page }) => {
  await page.setViewportSize(VIEWPORT)
  await page.goto(ARTICLE)
  await page.mouse.move(0, 0)
  await settle(200)
  const box = (await page.locator('#measure').boundingBox())!
  await page.mouse.move(box.x + 80, box.y + 20, { steps: 4 })
  await settle(1200)
  const capsule = page.locator('[data-ann-ui="block-capsule"]')
  console.log('capsule count:', await capsule.count())
  await page.screenshot({ path: path.join(outDir, 'extra-block-capsule.png') })
})

// Promo tiles (440x280, 1400x560): one set per item, English; promo.html composes them from the
// English images taken above. JPEG so there is no alpha channel (the store rejects 32-bit PNG here).
test('promo tiles', async ({ page }) => {
  test.setTimeout(60_000)
  if (locale !== 'en') test.skip(true, 'promo tiles are one set; taken with the English run')

  await page.setViewportSize({ width: 460, height: 320 })
  await page.goto('http://127.0.0.1:8174/promo.html')
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())))
  await page.locator('#small').screenshot({ path: path.join(__dirname, 'promo-small-440x280.jpg'), type: 'jpeg', quality: 92 })
  await page.setViewportSize({ width: 1420, height: 600 })
  await page.locator('#marquee').screenshot({ path: path.join(__dirname, 'promo-marquee-1400x560.jpg'), type: 'jpeg', quality: 92 })
})
