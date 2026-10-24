import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, hoverForCapsule } from './helpers'

/**
 * Element shots of media posts (screenshot.md §2): the offscreen clone must
 * carry what a style copy cannot — the current frame of a `<video>` (a
 * serialized video has no frame and rasterizes as a black box, issue #102)
 * and the scroll position of a carousel (not a style, so the strip otherwise
 * rasterizes its first slide again, issue #103).
 */
const MEDIA_PAGE = 'http://localhost:8173/media.html'

type ColorCounts = { amber: number; black: number; green: number; red: number; blue: number }

/** Samples the preview canvas for the fixture's color families, mapped onto the captured article's own box. */
function regionColors(page: Page, region: 'video' | 'carousel'): Promise<ColorCounts> {
  return page.evaluate(target => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-ann-ui="screenshot-preview"] canvas')!
    const article = document.querySelector<HTMLElement>('[data-testid="tweet"]')!
    const media = document.querySelector<HTMLElement>(target === 'video' ? '#stream-video' : '#carousel')!
    const articleBox = article.getBoundingClientRect()
    const box = media.getBoundingClientRect()
    const scale = canvas.width / articleBox.width
    const x0 = Math.max(0, Math.round((box.left - articleBox.left) * scale))
    const x1 = Math.min(canvas.width, Math.round((box.right - articleBox.left) * scale))
    const y0 = Math.max(0, Math.round((box.top - articleBox.top) * scale))
    const y1 = Math.min(canvas.height, Math.round((box.bottom - articleBox.top) * scale))
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const counts: ColorCounts = { amber: 0, black: 0, green: 0, red: 0, blue: 0 }
    for (let y = y0; y < y1; y += 3) {
      for (let x = x0; x < x1; x += 3) {
        const i = (y * canvas.width + x) * 4
        const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!]
        if (r > 200 && g > 120 && b < 90) counts.amber++
        else if (r < 25 && g < 25 && b < 25) counts.black++
        if (g > 120 && r < 80 && b < 80) counts.green++
        if (r > 180 && g < 70 && b < 110) counts.red++
        if (b > 180 && r < 80 && g < 130) counts.blue++
      }
    }
    return counts
  }, region)
}

test.describe('element shots of media posts (screenshot.md §2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('a video post keeps the playing frame instead of a black box, and a scrolled carousel keeps its slide', async ({ page }) => {
    await page.goto(MEDIA_PAGE)
    await page.waitForLoadState('networkidle')
    await expect(async () => {
      await page.evaluate(() => {
        document.getElementById('carousel')!.scrollLeft = 640
      })
    }).toPass()

    const capsule = await hoverForCapsule(page, '[data-testid="tweet"] p')
    await capsule.getByRole('button', { name: '截图' }).click()
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible({ timeout: 15_000 })

    const video = await regionColors(page, 'video')
    expect(video.amber, 'the playing frame is in the shot').toBeGreaterThan(8_000)
    expect(video.black, 'the video box is not a black rectangle').toBeLessThan(500)

    const carousel = await regionColors(page, 'carousel')
    expect(carousel.green, 'the carousel shows the slide it is scrolled to').toBeGreaterThan(8_000)
    expect(carousel.red, 'the first slide is not back in view').toBeLessThan(500)
    expect(carousel.blue, 'the third slide is not in view').toBeLessThan(500)

    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
  })
})
