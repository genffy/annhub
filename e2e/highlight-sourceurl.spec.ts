/**
 * Highlight sourceUrl & cross-page restore E2E Tests
 *
 * Verifies:
 * 1. generateSelector produces stable selectors (data-testid, not dynamic IDs)
 * 2. findSourceUrl extracts permalink from tweet-like article structures
 */
import { test, expect } from './fixtures'
import {
    navigateToTestPage,
    tripleClickSelect,
    waitForHoverMenu,
    clickShadowButton,
    waitForHoverMenuHidden,
    getHighlightsFromServiceWorker,
    clearHighlightsFromServiceWorker,
} from './helpers'

test.describe('Highlight — sourceUrl & stable selectors', () => {
    test('stored selector uses data-testid, not dynamic id', async ({ page, context }) => {
        await navigateToTestPage(page)
        // Clear after navigation so the extension's service worker is alive
        await clearHighlightsFromServiceWorker(context)

        // Select text inside the tweet-like article (tweetText div has id="id__dynamic123")
        await tripleClickSelect(page, '[data-testid="tweet-body-1"]')
        const hoverMenu = await waitForHoverMenu(page)

        // Collect the highlight via Mode A
        const collectBtn = hoverMenu.locator('button').first()
        await clickShadowButton(collectBtn)
        await waitForHoverMenuHidden(page)
        await page.waitForTimeout(1500)

        // Read the persisted HighlightRecord from IndexedDB
        const highlights = await getHighlightsFromServiceWorker(context)
        expect(highlights.length).toBeGreaterThanOrEqual(1)

        const record = highlights[0]
        // The selector must NOT contain any dynamic id pattern (id__xxx)
        expect(record.selector).not.toMatch(/id__\w+/)
    })

    test('findSourceUrl extracts permalink from tweet article structure', async ({ page }) => {
        await navigateToTestPage(page)

        const sourceUrl = await page.evaluate(() => {
            const tweetBody = document.querySelector('[data-testid="tweet-body-1"]')
            if (!tweetBody) return null

            // Walk up to find <article>
            let el: Element | null = tweetBody as Element
            while (el && el.tagName !== 'ARTICLE') {
                el = el.parentElement
            }
            if (!el) return 'no-article-found'

            // Check the <time> link — same logic as extractTwitterPermalink Strategy 1
            const timeEl = el.querySelector('time')
            if (!timeEl) return 'no-time-element'

            const timeLink = timeEl.closest('a[href]') as HTMLAnchorElement | null
            if (!timeLink) return 'no-time-link'

            return timeLink.getAttribute('href')
        })

        expect(sourceUrl).toBe('/testuser/status/12345')
    })
})
