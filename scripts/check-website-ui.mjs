import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { STORE_URL } from '../website/components/landing/links.ts'

/** Contrast of each element's text against what is really painted behind it; understands every CSS colour syntax. */
function contrastOf(locator) {
  return locator.evaluateAll(elements => {
    const { document, getComputedStyle } = globalThis
    const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
    const rgba = css => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3] / 255]
    }
    const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3]))
    const luminance = rgb => {
      const [r, g, b] = rgb.map(channel => {
        const unit = channel / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    return elements.map(element => {
      const layers = []
      for (let node = element; node; node = node.parentElement) {
        const layer = rgba(getComputedStyle(node).backgroundColor)
        if (layer[3] > 0) layers.push(layer)
        if (layer[3] === 1) break
      }
      let ground = [255, 255, 255]
      for (const layer of layers.reverse()) ground = over(layer, ground)
      const text = over(rgba(getComputedStyle(element).color), ground)
      const [a, b] = [luminance(text), luminance(ground)]
      return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100
    })
  })
}

// Run against a freshly built static preview. Geometry checks guard the interaction regressions from the design review.
const origin = process.env.WEBSITE_SMOKE_ORIGIN ?? 'http://localhost:3001'
const browser = await chromium.launch({ headless: true })
const errors = []
const downloads = []

try {
  const page = await browser.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('download', download => downloads.push(download.suggestedFilename()))
  for (const locale of ['zh-CN', 'en']) {
    for (const width of [390, 820, 1024, 1280, 1440, 1920]) {
      const height = width === 390 ? 844 : 900
      await page.setViewportSize({ width, height })
      await page.goto(`${origin}/${locale}`, { waitUntil: 'networkidle' })
      // A phone cannot install the extension: its bar keeps only the library entry; hero, closing and footer always link
      // to the store (docs/product/website.md §4). The wider bar must still fit its links side by side.
      const install = page.locator('header').getByRole('link', { name: locale === 'zh-CN' ? '添加到 Chrome' : 'Add to Chrome', exact: true })
      assert.equal(await install.isVisible(), width >= 640, `Header install entry at ${locale}/${width}`)
      assert.equal(await page.locator(`a[href="${STORE_URL}"]:visible`).count(), width >= 640 ? 4 : 3, `Install entries at ${locale}/${width}`)
      const bar = await page.locator('header > div').evaluate(element => {
        const outer = element.getBoundingClientRect()
        const boxes = [...element.children].map(child => child.getBoundingClientRect()).filter(box => box.width > 0)
        return { fits: boxes.every(box => box.left >= outer.left && box.right <= outer.right), apart: boxes.every((box, i) => i === 0 || boxes[i - 1].right <= box.left) }
      })
      assert.ok(bar.fits && bar.apart, `Header links overlap or overflow at ${locale}/${width}`)
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), `Horizontal scroll at ${locale}/${width}`)
      if (width >= 1024) {
        // the first picture: every window is drawn at its natural size (nothing shrinks its text), the selection with
        // its menu is whole, and the caption stays next to the board it describes
        const board = await page.evaluate(() => {
          const { document } = globalThis
          const scaleOf = el => el.getBoundingClientRect().width / el.offsetWidth
          const header = document.querySelector('header').getBoundingClientRect()
          const frame = document.querySelector('.hb').getBoundingClientRect()
          const menu = document.querySelector('.hb-a .ah-hm')?.getBoundingClientRect()
          const caption = document.querySelector('[data-hero-caption]')?.getBoundingClientRect()
          return {
            scales: [...document.querySelectorAll('.hb-w')].filter(w => w.getClientRects().length).map(w => Math.round(scaleOf(w) * 100) / 100),
            menu: menu && { left: Math.round(menu.left), right: Math.round(menu.right), below: Math.round(menu.top - header.bottom) },
            caption: caption && frame && { fromLeft: Math.round(caption.left - frame.left), fromBottom: Math.round(caption.top - frame.bottom) },
          }
        })
        assert.ok(
          board.scales.length > 0 && board.scales.every(scale => scale >= 0.99),
          `Hero windows are drawn smaller than natural size at ${locale}/${width}: ${JSON.stringify(board.scales)}`,
        )
        assert.ok(
          board.menu && board.menu.left >= 0 && board.menu.right <= width && board.menu.below >= 0,
          `The selection menu is not whole at ${locale}/${width}: ${JSON.stringify(board.menu)}`,
        )
        assert.ok(
          board.caption && board.caption.fromLeft >= -8 && Math.abs(board.caption.fromBottom) <= 40,
          `The hero caption is away from the board at ${locale}/${width}: ${JSON.stringify(board.caption)}`,
        )
      }
      // entry types are told apart by hue as well as icon and word (docs/product/visual.md §3)
      const hue = await page.evaluate(() => {
        const { document, getComputedStyle } = globalThis
        const read = selector => {
          const el = document.querySelector(selector)
          return el ? getComputedStyle(el).color : null
        }
        return { clip: read('.ah-tchip.ah-t-clip'), screenshot: read('.ah-tchip.ah-t-screenshot') }
      })
      assert.ok(hue.clip && hue.screenshot && hue.clip !== hue.screenshot, `Type chips share one colour at ${locale}/${width}: ${JSON.stringify(hue)}`)
      // the small grey text of the library windows (group titles, counts, highlight counts) is readable
      const low = (await contrastOf(page.locator('.ah-nav-label, .ah-nav-i .n, .ah-hlc'))).filter(ratio => ratio < 4.5)
      assert.deepEqual(low, [], `Small text under 4.5:1 at ${locale}/${width}`)
      // the colour bar of the highlight card lies wholly inside its card
      await page.locator('#ways').scrollIntoViewIfNeeded()
      const colourBar = await page.evaluate(() => {
        const { document } = globalThis
        const bar = document.querySelector('#ways .ah-hbar')
        const frame = bar?.closest('.overflow-hidden')
        if (!bar || !frame) return null
        const [b, f] = [bar.getBoundingClientRect(), frame.getBoundingClientRect()]
        return { left: Math.round(b.left - f.left), right: Math.round(f.right - b.right) }
      })
      assert.ok(colourBar && colourBar.left >= 0 && colourBar.right >= 0, `The highlight colour bar sticks out of its card at ${locale}/${width}: ${JSON.stringify(colourBar)}`)
      await page.evaluate(() => globalThis.scrollTo(0, 0))
      const cta = page.locator('header').getByRole('link', { name: locale === 'zh-CN' ? '体验资料库' : 'Try the library', exact: true })
      assert.ok(await cta.isVisible(), `No persistent library entry at ${locale}/${width}`)
      await cta.click()
      const firstTask = page.locator('[data-tour-pin="0"]')
      await firstTask.waitFor({ state: 'visible' })
      await page.waitForFunction(() => !globalThis.document.querySelector('[data-tour-pin="0"]')?.disabled)
      // the task row never needs a sideways scroll: a button hidden behind one is not found, a half-seen one looks cut off
      const row = await page.evaluate(() => {
        const { document } = globalThis
        const row = document.querySelector('[data-tour-pin="0"]')?.parentElement
        return row ? { scroll: row.scrollWidth, client: row.clientWidth } : null
      })
      assert.ok(row && row.scroll <= row.client + 1, `The task row scrolls sideways at ${locale}/${width}: ${JSON.stringify(row)}`)
      for (let task = 0; task < 5; task++) {
        await page.locator(`[data-tour-pin="${task}"]`).click()
        const stage = await page.locator('#library-demo-window').boundingBox()
        assert.ok(stage && stage.y >= 72 && stage.y + stage.height <= height + 1, `Task ${task} result is off screen at ${locale}/${width}: ${JSON.stringify(stage)}`)
        assert.equal(await page.locator('[data-tour-pin][aria-pressed="true"]').count(), 1)
      }
      assert.ok(await page.locator('#library-demo-window .ah-file-body').isVisible(), 'Export must show readable Markdown')
      assert.doesNotMatch(await page.locator('#library-demo-window').innerText(), /已写入下载目录|written to Downloads|export complete/i)
      assert.equal(downloads.length, 0, 'A preview must not start a download')

      for (let step = 0; step < 6; step++) {
        await page.locator('#story button[aria-controls]').nth(step).click()
        const panel = page.locator('#story [role="region"]:visible')
        assert.equal(await panel.count(), 1)
        if (width < 1280) {
          const text = panel.locator('.story-focus, .story-file').first()
          if (step !== 2) {
            assert.ok(await text.isVisible(), `Missing readable narrow scene ${step}`)
            assert.equal(await text.evaluate(el => globalThis.getComputedStyle(el).transform), 'none', 'Narrow reading scenes must not be scaled down')
          }
        }
      }
      await page.locator('#story button[aria-controls]').first().focus()
      await page.keyboard.press('ArrowRight')
      assert.equal(await page.locator('#story button[aria-controls]').nth(1).getAttribute('aria-pressed'), 'true')
      console.log(`Website tasks and workflow: ${locale} ${width}px OK`)
    }

    await page.locator('[data-tour-pin="0"]').click()
    const search = page.locator('#library input[type="search"]')
    await search.fill(locale === 'zh-CN' ? '幂等键' : 'idempotency')
    const hits = await page.locator('#library button.ah-erow').count()
    assert.ok(hits > 0 && hits < 9, 'Searching must narrow the sample entries')
    await search.fill('no-example-matches-this-query')
    assert.equal(await page.locator('#library button.ah-erow').count(), 0)
    assert.ok(await page.locator('#library [role="status"]').isVisible(), 'Empty search must explain the result')
    await search.fill('')
    await page.locator('#library button.ah-erow').first().click()
    await page
      .locator('#library .ah-drawer')
      .getByRole('button', { name: locale === 'zh-CN' ? '阅读' : 'Read', exact: true })
      .click()
    const marks = page.locator('#library .ah-md-rd [data-hid]')
    const initialMarks = await marks.count()
    await page
      .locator('#library .ah-md-rd p')
      .first()
      .evaluate(el => {
        const node = globalThis.document.createTreeWalker(el, globalThis.NodeFilter.SHOW_TEXT).nextNode()
        if (!node || node.textContent.length < 12) throw new Error('Expected a sample paragraph')
        const range = globalThis.document.createRange()
        range.setStart(node, 0)
        range.setEnd(node, 12)
        const selection = globalThis.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      })
    await page.keyboard.press('h')
    assert.ok((await marks.count()) > initialMarks, 'Keyboard highlighting must still work')

    await page.goto(`${origin}/${locale}`, { waitUntil: 'networkidle' })
    for (let n = 0; n < 16; n++) {
      await page.keyboard.press('Tab')
      assert.equal(
        await page.evaluate(() => !!globalThis.document.activeElement.closest('[inert], [aria-hidden="true"]')),
        false,
        'Decorative scenes must not capture keyboard focus',
      )
    }
  }
  assert.deepEqual(errors, [], 'Browser runtime errors')
  console.log('Website search, highlighting, export preview and focus checks passed.')
} finally {
  await browser.close()
}
