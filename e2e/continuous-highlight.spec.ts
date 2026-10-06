/**
 * Continuous highlight mode E2E tests (extension.md §9: Alt+H / Cmd+Shift+H)
 *
 * Uses `selectText` (programmatic JS selection + single mouseup) instead of
 * triple-click, because triple-click fires 3 mouseup events that each
 * create a highlight in the continuous mode.
 */
import { test, expect } from './fixtures'
import { navigateToTestPage, selectText, waitForCapsule, pressToggleHighlighter, getAnnShadowRoot } from './helpers'

test.describe('Continuous highlight mode', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToTestPage(page)
    await pressToggleHighlighter(page)
    await waitForCapsule(page)
  })

  test('hover menu does NOT appear in the continuous mode', async ({ page }) => {
    await selectText(page, '[data-testid="english-hello"]')
    await page.waitForTimeout(500)

    const shadowHost = getAnnShadowRoot(page)
    const menuCount = await shadowHost.locator('[data-ann-ui="hover-menu"]').count()
    expect(menuCount).toBe(0)
  })

  test('selected text gets a highlight in the continuous mode', async ({ page }) => {
    await selectText(page, '[data-testid="english-hello"]')
    // Wait for the async highlight pipeline (message → IDB → DOM) to complete
    await page.waitForSelector('.ann-highlight', { state: 'attached', timeout: 5000 })

    const markCount = await page.locator('.ann-highlight').count()
    expect(markCount).toBeGreaterThanOrEqual(1)
  })

  test('capsule shows the highlight count after a selection', async ({ page }) => {
    await selectText(page, '[data-testid="english-hello"]')

    const capsule = await waitForCapsule(page)
    // Poll instead of a fixed sleep: the capture pipeline (message → storage →
    // capsule count) is async and can exceed any fixed wait under load.
    await expect.poll(async () => capsule.evaluate((el: Element) => el.textContent || '')).toMatch(/\b1\b/)
  })

  test('multiple selections increment the counter', async ({ page }) => {
    await selectText(page, '[data-testid="english-hello"]')
    const capsule = await waitForCapsule(page)
    await expect.poll(async () => capsule.evaluate((el: Element) => el.textContent || '')).toMatch(/\b1\b/)

    await selectText(page, '[data-testid="english-tech"]')
    await expect.poll(async () => capsule.evaluate((el: Element) => el.textContent || '')).toMatch(/\b2\b/)
  })
})
