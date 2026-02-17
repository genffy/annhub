/**
 * Mode Switching E2E Tests
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

test.describe('Mode Switching', () => {
    test.beforeEach(async ({ page }) => {
        await navigateToTestPage(page)
    })

    test('🖍️ button in hover menu enters Mode B', async ({ page }) => {
        await tripleClickSelect(page, '[data-testid="english-hello"]')
        const hoverMenu = await waitForHoverMenu(page)

        // Click highlighter button (3rd action)
        const highlighterBtn = hoverMenu.locator('button').nth(2)
        await clickShadowButton(highlighterBtn)
        await page.waitForTimeout(500)

        // Capsule should appear
        await waitForCapsule(page)

        // Hover menu should be gone
        const menuCount = await getAnnShadowRoot(page).locator('[data-ann-ui="hover-menu"]').count()
        expect(menuCount).toBe(0)
    })

    test('Esc exits Mode B back to Mode A', async ({ page }) => {
        await pressToggleHighlighter(page)
        await waitForCapsule(page)

        await page.keyboard.press('Escape')
        await waitForCapsuleHidden(page)

        // Back in Mode A: select text → should show hover menu
        await tripleClickSelect(page, '[data-testid="english-hello"]')
        await waitForHoverMenu(page)
    })

    test('keyboard shortcut toggles Mode B on/off', async ({ page }) => {
        await pressToggleHighlighter(page)
        await waitForCapsule(page)

        await pressToggleHighlighter(page)
        await waitForCapsuleHidden(page)
    })

    test('✖️ button exits Mode B', async ({ page }) => {
        await pressToggleHighlighter(page)
        const capsule = await waitForCapsule(page)

        // Click close button
        const closeBtn = capsule.locator('button')
        await clickShadowButton(closeBtn)
        await waitForCapsuleHidden(page)
    })
})
