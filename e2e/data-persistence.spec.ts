/**
 * Data Persistence E2E Tests
 */
import { test, expect } from './fixtures'
import {
    navigateToTestPage,
    selectText,
    tripleClickSelect,
    waitForHoverMenu,
    waitForCapsule,
    pressToggleHighlighter,
    clickShadowButton,
    getClipsFromServiceWorker,
    clearClipsFromServiceWorker,
} from './helpers'

test.describe('Data Persistence — ClipRecord Schema', () => {
    test.beforeEach(async ({ page, context }) => {
        await clearClipsFromServiceWorker(context)
        await navigateToTestPage(page)
    })

    test('Mode A collect saves ClipRecord with correct fields', async ({ page, context }) => {
        await tripleClickSelect(page, '[data-testid="english-hello"]')
        const hoverMenu = await waitForHoverMenu(page)

        const collectBtn = hoverMenu.locator('button').first()
        await clickShadowButton(collectBtn)
        await page.waitForTimeout(1500)

        const clips = await getClipsFromServiceWorker(context)
        expect(clips.length).toBeGreaterThanOrEqual(1)

        const clip = clips[0]
        expect(clip).toHaveProperty('id')
        expect(clip.id).toMatch(/^clip_/)
        expect(clip).toHaveProperty('source_url')
        expect(clip).toHaveProperty('source_title')
        expect(clip).toHaveProperty('capture_time')
        expect(clip).toHaveProperty('mode_used', 'Mode A')
        expect(clip).toHaveProperty('content')
        expect(clip.content.length).toBeGreaterThan(0)
    })

    test('Mode A note saves ClipRecord with user_note', async ({ page, context }) => {
        await tripleClickSelect(page, '[data-testid="english-tech"]')
        const hoverMenu = await waitForHoverMenu(page)

        const noteBtn = hoverMenu.locator('button').nth(1)
        await clickShadowButton(noteBtn)
        await page.waitForTimeout(300)

        const input = hoverMenu.locator('input')
        await input.evaluate((el: Element) => (el as HTMLInputElement).focus())
        await page.keyboard.type('我的测试备注')
        await page.keyboard.press('Enter')
        await page.waitForTimeout(1500)

        const clips = await getClipsFromServiceWorker(context)
        expect(clips.length).toBeGreaterThanOrEqual(1)
        expect(clips[0].user_note).toBe('我的测试备注')
        expect(clips[0].mode_used).toBe('Mode A')
    })

    test('Mode B capture saves ClipRecord', async ({ page, context }) => {
        await pressToggleHighlighter(page)
        await waitForCapsule(page)

        await selectText(page, '[data-testid="english-hello"]')
        await page.waitForTimeout(1500)

        const clips = await getClipsFromServiceWorker(context)
        expect(clips.length).toBeGreaterThanOrEqual(1)
        expect(clips[0].mode_used).toBe('Mode B')
    })

    test('capture_time is valid ISO 8601', async ({ page, context }) => {
        await tripleClickSelect(page, '[data-testid="english-hello"]')
        const hoverMenu = await waitForHoverMenu(page)

        const collectBtn = hoverMenu.locator('button').first()
        await clickShadowButton(collectBtn)
        await page.waitForTimeout(1500)

        const clips = await getClipsFromServiceWorker(context)
        expect(clips.length).toBeGreaterThanOrEqual(1)

        const date = new Date(clips[0].capture_time)
        expect(date.toISOString()).toBe(clips[0].capture_time)
    })
})
