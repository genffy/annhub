/**
 * Entering and leaving the continuous highlight mode
 */
import { test, expect } from './fixtures'
import {
  navigateToTestPage,
  tripleClickSelect,
  waitForHoverMenu,
  waitForCapsule,
  waitForCapsuleHidden,
  pressToggleHighlighter,
  clickShadowButton,
  getAnnShadowRoot,
} from './helpers'

test.describe('Continuous highlight mode switching', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToTestPage(page)
  })

  test('Alt+H shortcut enters the continuous mode from a selection', async ({ page }) => {
    await tripleClickSelect(page, '[data-testid="english-hello"]')
    await waitForHoverMenu(page)

    // The menu has no toggle for it — the shortcut is the entry point (extension.md §10).
    await pressToggleHighlighter(page)
    await page.waitForTimeout(500)

    // Capsule should appear
    await waitForCapsule(page)

    // Hover menu should be gone
    const menuCount = await getAnnShadowRoot(page).locator('[data-ann-ui="hover-menu"]').count()
    expect(menuCount).toBe(0)
  })

  test('Esc leaves the continuous mode and brings the hover menu back', async ({ page }) => {
    await pressToggleHighlighter(page)
    await waitForCapsule(page)

    await page.keyboard.press('Escape')
    await waitForCapsuleHidden(page)

    // Back to the default: select text → should show the hover menu
    await tripleClickSelect(page, '[data-testid="english-hello"]')
    await waitForHoverMenu(page)
  })

  test('keyboard shortcut toggles the continuous mode on/off', async ({ page }) => {
    await pressToggleHighlighter(page)
    await waitForCapsule(page)

    await pressToggleHighlighter(page)
    await waitForCapsuleHidden(page)
  })

  test('✖️ button leaves the continuous mode', async ({ page }) => {
    await pressToggleHighlighter(page)
    const capsule = await waitForCapsule(page)

    // Click close button
    const closeBtn = capsule.locator('button')
    await clickShadowButton(closeBtn)
    await waitForCapsuleHidden(page)
  })
})
