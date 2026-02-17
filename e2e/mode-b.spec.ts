/**
 * Mode B (Machine-Gun Mode) E2E Tests
 *
 * Uses `selectText` (programmatic JS selection + single mouseup) instead of
 * triple-click, because triple-click fires 3 mouseup events that each
 * trigger a capture in Mode B.
 */
import { test, expect } from './fixtures'
import {
    navigateToTestPage,
    selectText,
    waitForCapsule,
    pressToggleHighlighter,
    getAnnShadowRoot,
} from './helpers'

test.describe('Mode B — Machine-Gun Mode (Silent Capture)', () => {
    test.beforeEach(async ({ page }) => {
        await navigateToTestPage(page)
        await pressToggleHighlighter(page)
        await waitForCapsule(page)
    })

    test('hover menu does NOT appear in Mode B', async ({ page }) => {
        await selectText(page, '[data-testid="english-hello"]')
        await page.waitForTimeout(500)

        const shadowHost = getAnnShadowRoot(page)
        const menuCount = await shadowHost.locator('[data-ann-ui="hover-menu"]').count()
        expect(menuCount).toBe(0)
    })

    test('selected text gets <mark> highlight in Mode B', async ({ page }) => {
        await selectText(page, '[data-testid="english-hello"]')
        // Wait for the async highlight pipeline (message → IDB → DOM) to complete
        await page.waitForSelector('.ann-highlight', { state: 'attached', timeout: 5000 })

        const markCount = await page.locator('.ann-highlight').count()
        expect(markCount).toBeGreaterThanOrEqual(1)
    })

    test('capsule shows capture count after selection', async ({ page }) => {
        await selectText(page, '[data-testid="english-hello"]')
        await page.waitForTimeout(800)

        const capsule = await waitForCapsule(page)
        const capsuleText = await capsule.evaluate((el: Element) => el.textContent || '')
        // Should contain "1" as the capture count
        expect(capsuleText).toMatch(/\b1\b/)
    })

    test('multiple captures increment counter', async ({ page }) => {
        await selectText(page, '[data-testid="english-hello"]')
        await page.waitForTimeout(800)

        await selectText(page, '[data-testid="english-tech"]')
        await page.waitForTimeout(800)

        const capsule = await waitForCapsule(page)
        const capsuleText = await capsule.evaluate((el: Element) => el.textContent || '')
        // Should contain "2" as the capture count
        expect(capsuleText).toMatch(/\b2\b/)
    })
})
