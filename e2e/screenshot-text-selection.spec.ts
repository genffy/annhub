import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getScreenshotPageUrl, setSettings } from './helpers'
import { analyze, CANVAS, openPanel, savedAsset, SESSION, toolbarButton } from './screenshot-editor-helpers'

for (const scale of [1, 2]) {
  for (const dark of [false, true]) {
    test(`text selection keeps every edge pixel with rounded corners (${scale}x, ${dark ? 'dark' : 'light'})`, async ({ page, context }, testInfo) => {
      test.slow()
      await clearLibrary(context)
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await setSettings(context, { beautify: { enabled: false, background: 'none', padding: 'small', radius: 12, shadow: false }, watermark: { enabled: false } })
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: scale, mobile: false })
      await page.goto(getScreenshotPageUrl())
      await page.evaluate(dark => {
        document.body.style.background = dark ? '#18202b' : '#ffffff'
        document.querySelector('article')?.remove()
        document.body.insertAdjacentHTML(
          'afterbegin',
          '<p id="selected-text" style="font:24px/1.45 Arial;width:440px;margin:80px 0">首行文字紧贴选区边缘，圆角不能裁掉任何笔画。Selected text keeps all of its original pixels. 末行文字和标点也需要完整保留。</p>',
        )
        document.body.style.color = dark ? '#f0f3f8' : '#18202b'
      }, dark)
      await page.locator('#selected-text').click({ clickCount: 3, position: { x: 15, y: 10 } })
      await page.locator('[data-ann-ui="selection-menu"]').getByRole('menuitem', { name: '截图', exact: true }).click()
      await page.keyboard.press('Enter')
      await expect(page.locator(CANVAS)).toBeVisible()
      const plain = await page.locator(CANVAS).evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())
      const { choice, panel } = await openPanel(page)
      const compare = () =>
        page.evaluate(async source => {
          const image = new Image()
          image.src = source
          await image.decode()
          const canvas = document.querySelector('[data-ann-ui="screenshot-preview"] canvas') as HTMLCanvasElement
          const x = (canvas.width - image.naturalWidth) / 2
          const y = (canvas.height - image.naturalHeight) / 2
          const scratch = document.createElement('canvas')
          scratch.width = image.naturalWidth
          scratch.height = image.naturalHeight
          const ctx = scratch.getContext('2d')!
          ctx.drawImage(image, 0, 0)
          const expected = ctx.getImageData(0, 0, scratch.width, scratch.height).data
          const actual = canvas.getContext('2d')!.getImageData(x, y, scratch.width, scratch.height).data
          let changed = 0
          for (let i = 0; i < expected.length; i++) if (expected[i] !== actual[i]) changed++
          return { changed, x, y, width: canvas.width, height: canvas.height }
        }, plain)
      for (const radius of [12, 24, 0]) {
        await choice('圆角', String(radius)).click()
        expect((await compare()).changed, `radius ${radius} preserves the whole selected image`).toBe(0)
      }
      await choice('圆角', '24').click()
      const shown = await compare()
      const bg = dark ? [24, 32, 43, 255] : [255, 255, 255, 255]
      expect((await analyze(page, { source: 'canvas', points: [[shown.x - scale * 2, shown.y + scale * 2]] })).at[0]).toEqual(bg)
      await page.keyboard.press('Escape')
      const dataUrl = await page.locator(CANVAS).evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())
      await testInfo.attach('rounded-text.png', { body: Buffer.from(dataUrl.split(',')[1]!, 'base64'), contentType: 'image/png' })
      await toolbarButton(page, '复制').click()
      await expect(page.locator('[data-ann-ui="screenshot-bubble"]')).toContainText('已复制')
      const copied = await page.evaluate(async () => {
        const item = (await navigator.clipboard.read())[0]!
        const blob = await item.getType('image/png')
        const image = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        canvas.getContext('2d')!.drawImage(image, 0, 0)
        image.close()
        return canvas.toDataURL()
      })
      expect(copied).toBe(dataUrl)
      const sw = await ensureServiceWorker(context)
      await sw.evaluate(() => {
        chrome.downloads.download = ((options: chrome.downloads.DownloadOptions, callback?: (id: number) => void) => {
          Object.assign(globalThis, { textSelectionDownload: options.url })
          callback?.(123)
        }) as typeof chrome.downloads.download
      })
      await toolbarButton(page, '下载').click()
      await expect.poll(() => sw.evaluate(() => (globalThis as unknown as { textSelectionDownload: string }).textSelectionDownload)).toBe(dataUrl)
      // A stroke on the framed preview still belongs to the original capture's coordinates.
      await toolbarButton(page, '矩形').click()
      const box = (await page.locator(CANVAS).boundingBox())!
      const factor = box.width / shown.width
      await page.mouse.move(box.x + (shown.x + 20 * scale) * factor, box.y + (shown.y + 20 * scale) * factor)
      await page.mouse.down()
      await page.mouse.move(box.x + (shown.x + 90 * scale) * factor, box.y + (shown.y + 45 * scale) * factor, { steps: 4 })
      await page.mouse.up()
      await openPanel(page)
      await panel.getByRole('switch', { name: '启用美化' }).click()
      await page.keyboard.press('Escape')
      const editedPlain = await page.locator(CANVAS).evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())
      const red = (await analyze(page, { source: 'canvas' })).red!
      expect(Math.abs(red.x / scale - 20)).toBeLessThanOrEqual(3)
      expect(Math.abs(red.y / scale - 20)).toBeLessThanOrEqual(3)
      await toolbarButton(page, '确认').click()
      await expect(page.locator(SESSION)).toHaveCount(0)
      expect((await savedAsset(context)).dataUrl).toBe(editedPlain)
    })
  }
}
