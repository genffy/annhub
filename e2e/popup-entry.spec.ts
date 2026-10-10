import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, getCapturePageUrl, getEntries, selectUntilMenu, waitForClipToast } from './helpers'

test('a popup entry opens that entry in the library (RV-LIB-12)', async ({ page, extensionId }) => {
  await clearLibrary(page.context())
  await page.goto(getCapturePageUrl())
  const menu = await selectUntilMenu(page, '#intro-p')
  await menu.locator('.ann-menu-action').first().click()
  await waitForClipToast(page)
  const id = (await getEntries(page.context()))[0]!.id
  const popup = await page.context().newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const opened = page.context().waitForEvent('page')
  await popup.locator('.popup-list button').first().click()
  const library = await opened
  await expect(library).toHaveURL(new RegExp(`#/entry/${id}$`))
  await expect(library.locator(`.drawer[data-entry-id="${id}"]`)).toBeVisible()
  await library.close()
  await popup.close()
})

/** Opens the popup page with two saved clips, saved through the same message the page menu uses. */
async function openPopupWithClips(page: Page, extensionId: string): Promise<Page> {
  await clearLibrary(page.context())
  const popup = await page.context().newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  for (const [index, title] of ['Retries and backpressure', 'Exponential backoff with jitter'].entries()) {
    const saved = await popup.evaluate(
      payload =>
        chrome.runtime.sendMessage({
          type: 'SAVE_CLIP',
          requestId: `r-pop-${payload.index}`,
          draft: {
            id: `ent_pop_${payload.index}`,
            content: `Body of ${payload.title}`,
            sourceUrl: `https://example.com/${payload.index}`,
            properties: { title: payload.title },
            via: 'menu',
          },
        }),
      { index, title },
    )
    expect(saved.success).toBe(true)
  }
  await popup.reload()
  await expect(popup.locator('.popup-list button')).toHaveCount(2)
  return popup
}

test('the popup list keeps the room the rail leaves, and the hint sits under it (extension.md §2.6)', async ({ page, extensionId }) => {
  const popup = await openPopupWithClips(page, extensionId)
  const geometry = await popup.evaluate(() => {
    const box = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect()
    return { shell: box('.popup-shell'), rail: box('.popup-rail'), body: box('.popup-body'), list: box('.popup-list'), foot: box('.popup-foot'), title: box('.popup-title') }
  })
  expect(geometry.body.left).toBeGreaterThanOrEqual(geometry.rail.right - 1)
  expect(geometry.body.width).toBeGreaterThan(geometry.shell.width - geometry.rail.width - 8)
  expect(geometry.title.width, 'a row title has room to read').toBeGreaterThan(80)
  // the hint is the last thing in the body, below the list rather than a column beside it
  expect(geometry.foot.top).toBeGreaterThanOrEqual(geometry.list.bottom - 1)
  expect(geometry.foot.bottom).toBeLessThanOrEqual(geometry.shell.bottom + 1)
  // the "open in library" action is a link, not a browser-default button
  expect(await popup.locator('.popup-head .link').evaluate(element => getComputedStyle(element).borderTopStyle)).toBe('none')
  await popup.close()
})

test('in dark mode the popup text stays readable on the popup background (extension.md §2.6)', async ({ page, extensionId }) => {
  const popup = await openPopupWithClips(page, extensionId)
  await popup.emulateMedia({ colorScheme: 'dark' })
  const ratios = await popup.evaluate(() => {
    const channels = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).map(Number)
    const luminance = ([r, g, b]: number[]): number => {
      const linear = [r, g, b].map(channel => {
        const unit = (channel ?? 0) / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
    }
    // the first ancestor that paints a background; the canvas itself is white
    const backdrop = (element: Element): number[] => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const [r, g, b, a = 1] = channels(getComputedStyle(node).backgroundColor)
        if (a > 0) return [r!, g!, b!]
      }
      return [255, 255, 255]
    }
    const contrast = (selector: string): number => {
      const element = document.querySelector(selector)!
      const [text, ground] = [luminance(channels(getComputedStyle(element).color)), luminance(backdrop(element))]
      return (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)
    }
    return { title: contrast('.popup-title'), head: contrast('.popup-head'), hint: contrast('.popup-foot') }
  })
  for (const [part, ratio] of Object.entries(ratios)) expect(ratio, `${part} contrast in dark mode`).toBeGreaterThanOrEqual(4.5)
  await popup.close()
})
