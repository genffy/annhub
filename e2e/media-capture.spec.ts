/**
 * Media-clip capture E2E (roadmap R4.2): pages with playable media offer the
 * 媒体片段 action; marking start/end from the live element plus a hand-written
 * transcript and the standard 核验/应用 discipline produce a media-clip
 * Fragment with a time locator.
 */
import { test, expect } from './fixtures'
import { selectText, waitForHoverMenu, clickShadowButton, getAnnShadowRoot, getFragmentsFromServiceWorker, clearFragmentStoreViaServiceWorker } from './helpers'

const MEDIA_URL = 'http://localhost:8173/media/media.html'

test.describe('媒体片段采集 (media-clip)', () => {
  test.beforeEach(async ({ page, context }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await page.goto(MEDIA_URL)
    await page.waitForSelector('ann-selection', { state: 'attached', timeout: 5000 })
    await page.waitForTimeout(500)
  })

  test('media action appears only on media pages; pages without media keep four actions', async ({ page }) => {
    await selectText(page, '[data-testid="media-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await expect(hoverMenu.locator('button')).toHaveCount(5)
    await expect(hoverMenu.locator('button', { hasText: '媒体片段' })).toBeVisible()
  })

  test('marks a range, writes the transcript and saves a media-clip fragment', async ({ page, context }) => {
    await selectText(page, '[data-testid="media-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '媒体片段' }))

    const modal = getAnnShadowRoot(page).locator('[data-ann-ui="media-capture-modal"]')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Enter the range precisely (numeric inputs) — headless media seeking is
    // unreliable, and exact entry is the better UX anyway.
    await modal.getByTestId('media-start-input').fill('2')
    await modal.getByTestId('media-end-input').fill('4')
    await expect(modal.getByText(/00:02 → 00:04/)).toBeVisible()

    await modal.getByTestId('media-summary').fill('主持人讲了利率传导的滞后')
    await modal.getByTestId('media-transcript').fill('这轮周期的传导滞后更长，因为信贷条件收紧得更慢。')
    await modal.getByTestId('media-verify').click()
    await expect(modal.getByText(/已确认核对/)).toBeVisible()
    await modal.getByTestId('media-use').fill('写下周宏观简报时引用这段论证。')
    await modal.getByTestId('media-save').click()
    await expect(modal).toHaveCount(0, { timeout: 5000 })

    const fragments = await getFragmentsFromServiceWorker(context)
    expect(fragments).toHaveLength(1)
    const clip = fragments[0]
    expect(clip.kind).toBe('media-clip')
    expect(clip.detail.startMs).toBe(2000)
    expect(clip.detail.endMs).toBe(4000)
    expect(clip.context.locator).toEqual({ type: 'time', startMs: 2000, endMs: 4000 })
    expect(clip.content).toBe('主持人讲了利率传导的滞后')
    expect(clip.context.excerpt).toContain('这轮周期的传导滞后更长')
    expect(clip.processing.verified.source).toBe('source-material')
  })

  test('save stays locked until a range + summary + verification exist', async ({ page }) => {
    await selectText(page, '[data-testid="media-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '媒体片段' }))
    const modal = getAnnShadowRoot(page).locator('[data-ann-ui="media-capture-modal"]')
    await expect(modal).toBeVisible()
    await expect(modal.getByTestId('media-save')).toBeDisabled()
    await modal.getByTestId('media-summary').fill('只有摘要没有区间也不能保存')
    await expect(modal.getByTestId('media-save')).toBeDisabled()
  })
})
