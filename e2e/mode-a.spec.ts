/**
 * Mode A (Sniper Mode) — Hover Menu E2E Tests
 * v2 four-action contract (extension PRD §2.1): Fragment / 高亮 / 剪藏 / 截图.
 */
import { test, expect } from './fixtures'
import {
  navigateToTestPage,
  tripleClickSelect,
  waitForHoverMenu,
  waitForHoverMenuHidden,
  clickShadowButton,
  getAnnShadowRoot,
  getClipsFromServiceWorker,
  getHighlightsFromServiceWorker,
  clearClipsFromServiceWorker,
  clearHighlightsFromServiceWorker,
} from './helpers'

test.describe('Mode A — Sniper Mode (Hover Menu)', () => {
  test.beforeEach(async ({ page, context }) => {
    await clearClipsFromServiceWorker(context)
    await clearHighlightsFromServiceWorker(context)
    await navigateToTestPage(page)
  })

  test('hover menu offers exactly the four v2 actions', async ({ page }) => {
    await tripleClickSelect(page, '[data-testid="english-hello"]')
    const hoverMenu = await waitForHoverMenu(page)

    const buttons = hoverMenu.locator('button')
    await expect(buttons).toHaveCount(4)
    for (const label of ['Fragment', '高亮', '剪藏', '截图']) {
      await expect(hoverMenu.locator('button', { hasText: label })).toBeVisible()
    }
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

  test('高亮 saves a highlight (with optional note) — no clip, no fragment', async ({ page, context }) => {
    await tripleClickSelect(page, '[data-testid="english-hello"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '高亮' }))

    // Expandable: the note row appears; submitting creates the highlight.
    const noteInput = hoverMenu.locator('input')
    await expect(noteInput).toBeVisible()
    await noteInput.fill('重要表述')
    await hoverMenu.locator('button', { hasText: '↵' }).click()
    await waitForHoverMenuHidden(page)

    const [highlights, clips] = await Promise.all([getHighlightsFromServiceWorker(context), getClipsFromServiceWorker(context)])
    expect(highlights).toHaveLength(1)
    expect(highlights[0].user_note).toBe('重要表述')
    expect(clips).toHaveLength(0)
  })

  test('剪藏 saves a clip only — no highlight, no fragment', async ({ page, context }) => {
    await tripleClickSelect(page, '[data-testid="english-hello"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '剪藏' }))
    await waitForHoverMenuHidden(page)

    const [highlights, clips] = await Promise.all([getHighlightsFromServiceWorker(context), getClipsFromServiceWorker(context)])
    expect(highlights).toHaveLength(0)
    expect(clips).toHaveLength(1)
    expect(clips[0].content).toContain('Hello')
  })

  test('高亮 with note expands an inline input first', async ({ page }) => {
    await tripleClickSelect(page, '[data-testid="english-tech"]')
    const hoverMenu = await waitForHoverMenu(page)

    const noteBtn = hoverMenu.locator('button', { hasText: '高亮' })
    await clickShadowButton(noteBtn)

    await page.waitForTimeout(300)
    const input = hoverMenu.locator('input')
    const count = await input.count()
    expect(count).toBe(1)
  })

  test('Esc closes the hover menu (PRD §10)', async ({ page }) => {
    await tripleClickSelect(page, '[data-testid="english-hello"]')
    await waitForHoverMenu(page)
    await page.keyboard.press('Escape')
    await waitForHoverMenuHidden(page)
  })

  test('hover menu dismisses on blank click', async ({ page }) => {
    await tripleClickSelect(page, '[data-testid="english-hello"]')
    await waitForHoverMenu(page)

    await page.mouse.click(10, 10)
    await waitForHoverMenuHidden(page)
  })
})
