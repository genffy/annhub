import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { STORE_URL } from '../website/components/landing/links.ts'

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
      const cta = page.locator('header').getByRole('link', { name: locale === 'zh-CN' ? '体验资料库' : 'Try the library', exact: true })
      assert.ok(await cta.isVisible(), `No persistent library entry at ${locale}/${width}`)
      await cta.click()
      const firstTask = page.locator('[data-tour-pin="0"]')
      await firstTask.waitFor({ state: 'visible' })
      await page.waitForFunction(() => !globalThis.document.querySelector('[data-tour-pin="0"]')?.disabled)
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
