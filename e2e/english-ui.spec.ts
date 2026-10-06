/**
 * English interface (D-15): with an English browser UI language every extension surface says
 * English only — no Chinese leaks from a surface that forgot to localize — and the whole capture
 * path works. The Chinese wording is covered by the other specs, which run in a Chinese browser.
 */
import { test, expect } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import {
  clearFragmentStoreViaServiceWorker,
  ensureServiceWorker,
  getAnnShadowRoot,
  getFragmentsFromServiceWorker,
  navigateToFragmentPage,
  selectText,
  setCaptureConfigViaServiceWorker,
  triggerScreenshot,
  waitForCaptureModal,
  waitForHoverMenu,
} from './helpers'

const HAN = /\p{Script=Han}/u

/** Asserts the surface shows text at all (an empty read would pass vacuously) and none of it is Chinese. */
async function expectEnglishOnly(target: Page | Locator): Promise<void> {
  const text = await ('locator' in target && 'goto' in target ? (target as Page).locator('body') : (target as Locator)).innerText()
  expect(text.trim().length).toBeGreaterThan(10)
  expect(text).not.toMatch(HAN)
}

test.use({ uiLocale: 'en-US' })

test.describe('English interface (D-15)', () => {
  test('popup, library, more menu and settings contain no Chinese', async ({ context, page, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(popup.getByTestId('popup')).toHaveAttribute('data-loaded', 'true')
    await expect(popup.getByTestId('popup-new-inspiration')).toContainText('New inspiration')
    await expect(popup.getByTestId('popup-open-library')).toContainText('Open Fragment library')
    await expect(popup.getByTestId('popup-open-screenshots')).toContainText('Open screenshots')
    await expectEnglishOnly(popup)
    await expect(popup.locator('html')).toHaveAttribute('lang', 'en')

    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await expect(page.getByTestId('view-fragments')).toHaveText('Fragment library')
    await expect(page.getByTestId('view-screenshots')).toHaveText('Screenshots')
    await expect(page.getByTestId('nav-settings')).toHaveText('Settings')
    await expect(page.getByTestId('onboarding-guide')).toContainText('Highlight ≠ Fragment')
    await expect(page.getByTestId('fragment-empty')).toContainText('save your first Fragment')
    await page.getByTestId('more-menu').click()
    await expect(page.getByTestId('export-content')).toHaveText('Export content (Markdown ZIP)')
    await expect(page.getByTestId('view-highlights')).toHaveText('Highlights')
    await expect(page.getByTestId('view-clips')).toHaveText('Clips')
    await expectEnglishOnly(page)

    await page.getByTestId('view-clips').click()
    await expect(page.getByTestId('clip-empty')).toContainText('No clips yet')
    await expectEnglishOnly(page)

    await page.getByTestId('view-screenshots').click()
    await expect(page.getByTestId('screenshots-empty')).toContainText('No screenshots yet.')
    await expectEnglishOnly(page)

    await page.goto(`chrome-extension://${extensionId}/options.html#/settings`)
    await expect(page.getByTestId('nav-library')).toContainText('Fragment library')
    await expect(page.getByRole('heading', { name: 'Capture preferences' })).toBeVisible()
    await expectEnglishOnly(page)
  })

  test('captures a Fragment end to end in English', async ({ context, page }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    await navigateToFragmentPage(page)

    await selectText(page, '[data-testid="fragment-target"]')
    const menu = await waitForHoverMenu(page)
    await expect(menu.getByTestId('hover-action-save-fragment')).toHaveText('Fragment')
    await expectEnglishOnly(menu)
    await menu.getByTestId('hover-action-save-fragment').click({ force: true })

    const modal = await waitForCaptureModal(page)
    await expect(modal.locator('li[aria-current="step"]')).toContainText('Verify')
    await expect(modal.getByTestId('modal-next')).toBeDisabled()
    await modal.getByTestId('kind-concept').click()
    await expect(modal.getByTestId('kind-concept')).toHaveText('Concept')
    await modal.getByTestId('verify-confirm').check()
    await expect(modal.getByText(/Confirmed \(source material/)).toBeVisible()
    await expectEnglishOnly(modal)

    await modal.getByTestId('modal-next').click()
    await expect(modal.locator('li[aria-current="step"]')).toContainText('Apply')
    const use = modal.getByPlaceholder('Write how you plan to use, verify or transfer it (required)')
    await use.fill('hawkish pivot')
    await expect(modal.getByText('“Apply” cannot just repeat the original text')).toBeVisible()
    await expect(modal.getByTestId('save-fragment')).toBeDisabled()
    await use.fill('Explain this quarter’s bond sell-off in next week’s macro review.')
    await expectEnglishOnly(modal)
    await expect(modal.getByTestId('save-fragment')).toHaveText('Save to Fragment library')
    await modal.getByTestId('save-fragment').click()
    await getAnnShadowRoot(page).locator('[data-ann-ui="capture-modal"]').waitFor({ state: 'detached', timeout: 5000 })

    const fragments = await getFragmentsFromServiceWorker(context)
    expect(fragments).toHaveLength(1)
    expect(fragments[0].kind).toBe('concept')
    expect(fragments[0].processing.use).toBe('Explain this quarter’s bond sell-off in next week’s macro review.')
  })

  test('closing a filled capture window offers the English exits', async ({ context, page }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: true })
    await navigateToFragmentPage(page)
    await selectText(page, '[data-testid="fragment-target"]')
    const menu = await waitForHoverMenu(page)
    await menu.getByTestId('hover-action-save-fragment').click({ force: true })
    const modal = await waitForCaptureModal(page)

    await expect(modal.locator('li[aria-current="step"]')).toContainText('Understand')
    await modal.locator('textarea').nth(2).fill('My first reading of this passage.')
    await modal.getByTestId('modal-cancel').click()
    const dialog = getAnnShadowRoot(page).locator('[data-ann-ui="capture-close-dialog"]')
    await expect(dialog).toContainText('Discard what you typed?')
    await expect(dialog.getByTestId('close-continue')).toHaveText('Keep editing')
    await expect(dialog.getByTestId('close-as-highlight')).toHaveText('Save as highlight')
    await expect(dialog.getByTestId('close-as-clip')).toHaveText('Save as clip')
    await expect(dialog.getByTestId('close-discard')).toHaveText('Discard')
    await expectEnglishOnly(dialog)
    await dialog.getByTestId('close-discard').click()
  })

  test('the screenshot overlay, toolbar and error panel speak English', async ({ context, page }) => {
    await page.goto('http://localhost:8173/screenshot.html')
    await page.waitForSelector('ann-selection', { state: 'attached' })
    await triggerScreenshot(page)
    const overlay = page.locator('[data-ann-ui="screenshot-overlay"]')
    await expect(overlay).toContainText('Drag = area · Click = element · Esc to cancel · A Anonymize: on')

    const box = (await page.getByTestId('screenshot-post').boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 480, box.y + 160, { steps: 6 })
    await page.mouse.up()
    const toolbar = page.locator('[data-ann-ui="screenshot-toolbar"]')
    await expect(toolbar).toBeVisible({ timeout: 10_000 })
    await expect(toolbar.getByRole('button', { name: 'Rectangle' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Mosaic' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Download PNG' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Save to screenshot library' })).toBeVisible()
    // The toolbar is icons: its words are the accessible names.
    const names = await toolbar.locator('[aria-label]').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))
    expect(names.length).toBeGreaterThan(8)
    expect(names.join(' ')).not.toMatch(HAN)
    await page.keyboard.press('Escape')

    // A failed capture is reported in English too.
    const worker = await ensureServiceWorker(context)
    await worker.evaluate(() => {
      chrome.tabs.captureVisibleTab = ((_win: unknown, _opts: unknown, cb: (dataUrl?: string) => void) => {
        cb(undefined)
      }) as unknown as typeof chrome.tabs.captureVisibleTab
    })
    await triggerScreenshot(page)
    await expect(overlay).toBeVisible()
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 480, box.y + 160, { steps: 6 })
    await page.mouse.up()
    const error = page.locator('[data-ann-ui="screenshot-error"]')
    await expect(error).toBeVisible({ timeout: 10_000 })
    await expect(error).toContainText('Screenshot failed:')
    await expectEnglishOnly(error)
  })

  test('the sample page is English too', async ({ context, page, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    const [sample] = await Promise.all([context.waitForEvent('page'), page.getByTestId('onboarding-sample').click()])
    await sample.waitForLoadState()
    await expect(sample).toHaveURL(/sample\.en\.html$/)
    await expect(sample.locator('.tip')).toContainText('Select any text below')
    await expectEnglishOnly(sample)
  })
})
