/**
 * Session-draft restore E2E (extension PRD §9): an unsaved capture survives
 * navigation (SW/session storage keyed by tab + source URL) and is offered
 * back when the same source is captured again; explicit abandon clears it.
 */
import { test, expect } from './fixtures'
import {
  navigateToFragmentPage,
  selectText,
  waitForHoverMenu,
  clickShadowButton,
  waitForCaptureModal,
  getAnnShadowRoot,
  clearFragmentStoreViaServiceWorker,
  setCaptureConfigViaServiceWorker,
} from './helpers'

test.describe('采集草稿恢复 (PRD §9)', () => {
  test.beforeEach(async ({ page, context }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    await navigateToFragmentPage(page)
  })

  test('navigation keeps the unsaved draft; reopening the same source restores it', async ({ page }) => {
    // Start a capture and type an application sentence (debounced 300ms write).
    await selectText(page, '[data-testid="fragment-target"]')
    let hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: 'Fragment' }))
    let modal = await waitForCaptureModal(page)
    await modal.getByRole('button', { name: '已回看原文，确认' }).click()
    await modal.getByRole('button', { name: '去应用 →' }).click()
    await modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]').fill('导航后还想找回这句话。')
    await page.waitForTimeout(700) // debounce + session write

    // Navigate away mid-capture (no explicit abandon → draft must survive).
    await page.reload()
    await page.waitForSelector('ann-selection', { state: 'attached' })
    await page.waitForTimeout(500)

    await selectText(page, '[data-testid="fragment-target"]')
    hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: 'Fragment' }))
    modal = await waitForCaptureModal(page)
    await expect(modal.getByText(/已恢复上次未提交的草稿/)).toBeVisible({ timeout: 5000 })
    // The restored draft keeps its verification — jump to the apply step.
    await expect(modal.getByText(/已确认核对/)).toBeVisible()
    await modal.getByRole('button', { name: '去应用 →' }).click()
    await expect(modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]')).toHaveValue('导航后还想找回这句话。')

    // Explicit abandon (confirm discard) clears the draft for good.
    page.once('dialog', dialog => dialog.accept())
    await modal.locator('button[title="关闭 (Esc)"]').click()
    await getAnnShadowRoot(page).locator('[data-ann-ui="capture-modal"]').waitFor({ state: 'detached' })

    await selectText(page, '[data-testid="fragment-target"]')
    const menu2 = await waitForHoverMenu(page)
    await clickShadowButton(menu2.locator('button', { hasText: 'Fragment' }))
    const modal2 = await waitForCaptureModal(page)
    await expect(modal2.getByText(/已恢复上次未提交的草稿/)).toHaveCount(0)
    await modal2.getByRole('button', { name: '已回看原文，确认' }).click()
    await modal2.getByRole('button', { name: '去应用 →' }).click()
    await expect(modal2.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]')).toHaveValue('')
  })
})
