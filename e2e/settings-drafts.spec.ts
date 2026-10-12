import { test, expect } from './fixtures'
import { ensureServiceWorker } from './helpers'

test('screenshot settings keep local drafts until commit (RV-LIB-05)', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/library.html#/settings`)
  const watermarkText = page.locator('input[maxlength="40"]')
  await expect(watermarkText).toBeVisible()
  await watermarkText.fill('Draft watermark')
  const readSettings = () =>
    page.evaluate(async () => {
      const stored = await chrome.storage.local.get('annhub.settings')
      return stored['annhub.settings'] as { watermark?: { text?: string }; downloadQuality?: number } | undefined
    })
  expect((await readSettings())?.watermark?.text).not.toBe('Draft watermark')
  await watermarkText.blur()
  await expect.poll(async () => (await readSettings())?.watermark?.text).toBe('Draft watermark')

  await page.getByRole('combobox', { name: /下载格式|Download format/ }).selectOption('jpeg')
  const quality = page.locator('input[type="range"][min="0.5"]')
  await quality.focus()
  await quality.press('ArrowLeft')
  await expect.poll(async () => (await readSettings())?.downloadQuality).toBe(0.85)
})

test('default highlight color and watermark image removal persist (RV-LIB-11)', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/library.html#/settings`)
  const readSettings = () =>
    page.evaluate(
      async () => (await chrome.storage.local.get('annhub.settings'))['annhub.settings'] as { defaultHighlightColor?: string; watermark?: { image?: string } } | undefined,
    )
  await page.getByRole('group', { name: '默认高亮颜色' }).getByRole('button', { name: '绿色' }).click()
  await expect.poll(async () => (await readSettings())?.defaultHighlightColor).toBe('green')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qMwAAAAASUVORK5CYII=', 'base64')
  await page.locator('input[type="file"][accept="image/png"]').setInputFiles({ name: 'mark.png', mimeType: 'image/png', buffer: png })
  await expect.poll(async () => Boolean((await readSettings())?.watermark?.image)).toBe(true)
  await page.getByRole('button', { name: '移除' }).last().click()
  await expect.poll(async () => Boolean((await readSettings())?.watermark?.image)).toBe(false)
  await expect(page.getByRole('button', { name: '管理快捷键' })).toBeVisible()
})

test('the watermark preview paints the picture beside the text (screenshot.md §4.3)', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/library.html#/settings`)
  // a solid red square, drawn by the browser itself so the bytes are a readable PNG
  const redPng = Buffer.from(
    (await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 16
      canvas.height = 16
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#f00'
      ctx.fillRect(0, 0, 16, 16)
      return canvas.toDataURL('image/png')
    }))!.split(',')[1]!,
    'base64',
  )
  await page.locator('input[type="file"][accept="image/png"]').setInputFiles({ name: 'mark.png', mimeType: 'image/png', buffer: redPng })
  // the preview paints the strip at the watermark's opacity: red over the light grey canvas keeps a red-dominant pixel
  const preview = page.getByTestId('watermark-preview')
  await expect
    .poll(() =>
      preview.evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        for (let i = 0; i < data.length; i += 4) if (data[i]! > 180 && data[i + 1]! < 90 && data[i + 2]! < 90) return true
        return false
      }),
    )
    .toBe(true)
})

test('an unreadable watermark image keeps the preview textual and asks for a re-upload (screenshot.md §5)', async ({ page, extensionId }) => {
  const sw = await ensureServiceWorker(page.context())
  await sw.evaluate(async () => {
    // PNG magic bytes, truncated: passes the size-and-magic check, fails the browser's decode
    const stored = ((await chrome.storage.local.get('annhub.settings'))['annhub.settings'] ?? {}) as { watermark?: Record<string, unknown> }
    stored.watermark = { ...(stored.watermark ?? {}), image: 'data:image/png;base64,iVBORw0KGgoAAAA' }
    await chrome.storage.local.set({ 'annhub.settings': stored })
  })
  await page.goto(`chrome-extension://${extensionId}/library.html#/settings`)
  await expect(page.getByRole('alert')).toContainText(/重新上传|upload it again/)
  // the text watermark still paints on the preview — its font is canvas-scaled (≈4 px here), so any pixel
  // clearly darker than the light grey background counts as ink
  const preview = page.getByTestId('watermark-preview')
  await expect
    .poll(() =>
      preview.evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        for (let i = 0; i < data.length; i += 4) if (data[i]! < 190 && data[i + 1]! < 195 && data[i + 2]! < 200) return true
        return false
      }),
    )
    .toBe(true)
})

test('orphan asset IDs are visible and cleanup keeps referenced assets (RV-LIB-11)', async ({ page, extensionId }) => {
  const sw = await ensureServiceWorker(page.context())
  await sw.evaluate(
    () =>
      new Promise<void>(resolve => {
        const open = indexedDB.open('annhub')
        open.onsuccess = () => {
          const tx = open.result.transaction('assets', 'readwrite')
          tx.objectStore('assets').put({ metadata: { id: 'asset_orphan_settings' }, bytes: new Blob(['image']) }, 'asset_orphan_settings')
          tx.oncomplete = () => resolve()
        }
      }),
  )
  await page.goto(`chrome-extension://${extensionId}/library.html#/settings`)
  await page.getByRole('button', { name: '检查异常残留资产' }).click()
  const report = page.getByTestId('orphan-report')
  await expect(report).toContainText('asset_orphan_settings')
  page.once('dialog', dialog => void dialog.accept())
  await report.getByRole('button', { name: '清理未引用的资产' }).click()
  await expect(report).not.toContainText('asset_orphan_settings')
  expect(
    await sw.evaluate(
      () =>
        new Promise<boolean>(resolve => {
          const open = indexedDB.open('annhub')
          open.onsuccess = () => {
            const get = open.result.transaction('assets').objectStore('assets').get('asset_orphan_settings')
            get.onsuccess = () => resolve(Boolean(get.result))
          }
        }),
    ),
  ).toBe(false)
})
