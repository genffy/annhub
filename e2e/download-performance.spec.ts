import type { TabMessage } from '../types/messages'
import { stat } from 'node:fs/promises'
import { test, expect } from './fixtures'
import { ensureServiceWorker, getCapturePageUrl } from './helpers'

test('ten near-2MB images reach disk below the local p95 budget (download.md §9)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const bytesPerImage = (await stat(new URL('./download-benchmark.png', import.meta.url))).size
  expect(bytesPerImage).toBeGreaterThan(1_900_000)
  expect(bytesPerImage).toBeLessThanOrEqual(2 * 1024 * 1024)
  await page.goto(getCapturePageUrl().replace('capture.html', 'download-article.html'))
  const worker = await ensureServiceWorker(page.context())
  const durations: number[] = []
  for (let sample = 0; sample < 20; sample++) {
    await page.locator('#post').evaluate((element, index) => {
      element.innerHTML =
        '<h1>Performance sample</h1><p>Ten full size image files for the local download budget.</p>' +
        Array.from({ length: 10 }, (_, image) => `<img src="http://media.annhub.test:8173/download-benchmark.png?sample=${index}&image=${image}" width="1024" height="640">`).join(
          '',
        )
    }, sample)
    await expect
      .poll(() => page.locator('#post img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)))
      .toBe(true)
    const started = performance.now()
    await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(item => item.url === url)!
      await chrome.tabs.sendMessage(tab.id!, { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'popup' } satisfies TabMessage, { frameId: 0 })
    }, page.url())
    await expect
      .poll(() => worker.evaluate(async () => (await chrome.downloads.search({})).filter(item => item.byExtensionId === chrome.runtime.id && item.state === 'complete').length), {
        timeout: 15_000,
        intervals: [50],
      })
      .toBe((sample + 1) * 11)
    durations.push(performance.now() - started)
    await expect(page.locator('[data-ann-ui="download-notice"]')).toContainText('已下载')
  }
  const sorted = [...durations].sort((a, b) => a - b)
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1]!
  await testInfo.attach('download-performance.json', {
    body: JSON.stringify({ environment: 'local fixture server', samples: durations.length, bytesPerImage, imagesPerSample: 10, p95Ms, durations }, null, 2),
    contentType: 'application/json',
  })
  console.log(`Local download p95: ${Math.round(p95Ms)} ms; ${durations.length} samples, 10 × ${bytesPerImage} bytes`)
  expect(p95Ms).toBeLessThan(5000)
})
