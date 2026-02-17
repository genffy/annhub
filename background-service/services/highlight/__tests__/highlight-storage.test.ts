import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { HighlightRecord } from '../../../../types/highlight'

/**
 * Since HighlightStorage relies on IndexedDB (via idb), and jsdom doesn't
 * support real IDB, we test the getCurrentPageHighlights **logic** by
 * extracting and testing the sourceUrl matching algorithm directly.
 *
 * The actual DB interaction is thin (getAll by index), and is covered by
 * e2e tests with a real browser.
 */

// Simulate the matching logic from getCurrentPageHighlights
function getCurrentPageHighlightsLogic(
    url: string,
    allHighlights: HighlightRecord[]
): HighlightRecord[] {
    const domain = new URL(url).hostname

    // By exact URL
    const byUrl = allHighlights.filter(h => h.url === url && h.status === 'active')

    // By sourceUrl (same domain, different url)
    const bySourceUrl = allHighlights.filter(
        h => h.status === 'active' &&
            h.domain === domain &&
            h.metadata?.sourceUrl === url &&
            h.url !== url
    )

    // Merge and deduplicate
    const seen = new Set(byUrl.map(h => h.id))
    for (const h of bySourceUrl) {
        if (!seen.has(h.id)) {
            byUrl.push(h)
            seen.add(h.id)
        }
    }

    return byUrl
}

function makeHighlight(overrides: Partial<HighlightRecord>): HighlightRecord {
    return {
        id: 'test-id',
        url: 'https://x.com/home',
        domain: 'x.com',
        selector: '[data-testid="tweetText"]',
        originalText: 'test text',
        textHash: 'abc123',
        color: '#ffeb3b',
        timestamp: Date.now(),
        lastModified: Date.now(),
        position: { x: 0, y: 0, width: 100, height: 20 },
        context: { before: 'before', after: 'after' },
        status: 'active',
        metadata: {
            pageTitle: 'Home / X',
            pageUrl: 'https://x.com/home',
        },
        ...overrides,
    }
}

describe('getCurrentPageHighlights — sourceUrl matching logic', () => {
    const listPageUrl = 'https://x.com/home'
    const detailPageUrl = 'https://x.com/lewangx/status/2023473037404938471'

    it('returns highlights by exact URL match', () => {
        const highlights = [
            makeHighlight({ id: 'h1', url: listPageUrl }),
            makeHighlight({ id: 'h2', url: detailPageUrl }),
        ]

        const result = getCurrentPageHighlightsLogic(listPageUrl, highlights)
        expect(result.map(h => h.id)).toEqual(['h1'])
    })

    it('returns highlights where sourceUrl matches current page', () => {
        const highlights = [
            makeHighlight({
                id: 'h1',
                url: listPageUrl,
                metadata: {
                    pageTitle: 'Home / X',
                    pageUrl: listPageUrl,
                    sourceUrl: detailPageUrl,
                },
            }),
        ]

        const result = getCurrentPageHighlightsLogic(detailPageUrl, highlights)
        expect(result.map(h => h.id)).toEqual(['h1'])
    })

    it('merges both exact and sourceUrl matches without duplicates', () => {
        const highlights = [
            makeHighlight({
                id: 'h1',
                url: detailPageUrl,
                domain: 'x.com',
            }),
            makeHighlight({
                id: 'h2',
                url: listPageUrl,
                domain: 'x.com',
                metadata: {
                    pageTitle: 'Home / X',
                    pageUrl: listPageUrl,
                    sourceUrl: detailPageUrl,
                },
            }),
        ]

        const result = getCurrentPageHighlightsLogic(detailPageUrl, highlights)
        expect(result.map(h => h.id).sort()).toEqual(['h1', 'h2'])
    })

    it('does not return sourceUrl matches from different domains', () => {
        const highlights = [
            makeHighlight({
                id: 'h1',
                url: 'https://other.com/page',
                domain: 'other.com',
                metadata: {
                    pageTitle: 'Other',
                    pageUrl: 'https://other.com/page',
                    sourceUrl: detailPageUrl,
                },
            }),
        ]

        const result = getCurrentPageHighlightsLogic(detailPageUrl, highlights)
        expect(result).toHaveLength(0)
    })

    it('excludes archived/deleted highlights', () => {
        const highlights = [
            makeHighlight({
                id: 'h1',
                url: listPageUrl,
                status: 'deleted',
                metadata: {
                    pageTitle: 'Home / X',
                    pageUrl: listPageUrl,
                    sourceUrl: detailPageUrl,
                },
            }),
            makeHighlight({
                id: 'h2',
                url: detailPageUrl,
                status: 'archived',
            }),
        ]

        const result = getCurrentPageHighlightsLogic(detailPageUrl, highlights)
        expect(result).toHaveLength(0)
    })

    it('does not duplicate when url === sourceUrl', () => {
        const highlights = [
            makeHighlight({
                id: 'h1',
                url: detailPageUrl,
                domain: 'x.com',
                metadata: {
                    pageTitle: 'Tweet',
                    pageUrl: detailPageUrl,
                    sourceUrl: detailPageUrl,
                },
            }),
        ]

        const result = getCurrentPageHighlightsLogic(detailPageUrl, highlights)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('h1')
    })

    it('handles highlights without metadata.sourceUrl', () => {
        const highlights = [
            makeHighlight({
                id: 'h1',
                url: detailPageUrl,
                metadata: {
                    pageTitle: 'Tweet',
                    pageUrl: detailPageUrl,
                },
            }),
        ]

        const result = getCurrentPageHighlightsLogic(detailPageUrl, highlights)
        expect(result).toHaveLength(1)
    })
})
