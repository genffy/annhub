/**
 * Mode A (Sniper Mode) — Hover Menu E2E Tests
 */
import { test, expect } from './fixtures'
import {
    navigateToTestPage,
    tripleClickSelect,
    waitForHoverMenu,
    waitForHoverMenuHidden,
    clickShadowButton,
    getAnnShadowRoot,
} from './helpers'

test.describe('Mode A — Sniper Mode (Hover Menu)', () => {
    test.beforeEach(async ({ page }) => {
        await navigateToTestPage(page)
    })

    test('hover menu appears on text selection with 3 buttons', async ({ page }) => {
        await tripleClickSelect(page, '[data-testid="english-hello"]')
        const hoverMenu = await waitForHoverMenu(page)

        const buttonCount = await hoverMenu.locator('button').count()
        expect(buttonCount).toBe(3)
    })

    test('hover menu does NOT appear for short selection (≤2 chars)', async ({ page }) => {
        await page.click('[data-testid="english-hello"]')
        await page.keyboard.press('Home')
        await page.keyboard.press('Shift+ArrowRight')
        await page.keyboard.press('Shift+ArrowRight')
        await page.mouse.up()

        await page.waitForTimeout(500)
        const shadowHost = getAnnShadowRoot(page)
        const count = await shadowHost.locator('[data-ann-ui="hover-menu"]').count()
        expect(count).toBe(0)
    })

    test('direct collect (🎯) shows success feedback then dismisses', async ({ page }) => {
        await tripleClickSelect(page, '[data-testid="english-hello"]')
        const hoverMenu = await waitForHoverMenu(page)

        const collectBtn = hoverMenu.locator('button').first()
        await clickShadowButton(collectBtn)

        // After success feedback, the hover menu dismisses
        await waitForHoverMenuHidden(page)
    })

    test('add note (💬) expands inline input', async ({ page }) => {
        await tripleClickSelect(page, '[data-testid="english-tech"]')
        const hoverMenu = await waitForHoverMenu(page)

        const noteBtn = hoverMenu.locator('button').nth(1)
        await clickShadowButton(noteBtn)

        await page.waitForTimeout(300)
        const input = hoverMenu.locator('input')
        const count = await input.count()
        expect(count).toBe(1)
    })

    test('hover menu dismisses on blank click', async ({ page }) => {
        await tripleClickSelect(page, '[data-testid="english-hello"]')
        await waitForHoverMenu(page)

        await page.mouse.click(10, 10)
        await waitForHoverMenuHidden(page)
    })
})
