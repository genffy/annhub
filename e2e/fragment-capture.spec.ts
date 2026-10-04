/**
 * Fragment capture E2E — the L1+L2 loop against the v4 contract
 * (docs/v2/processing.md, extension PRD §4).
 * Covers: standard mode 核验→应用 with explicit confirmation, the generic
 * application gate (no language token thresholds), deep mode 理解 step,
 * per-kind detail (concept), duplicate prompt, and persistence via the
 * background fragment-store (schema v4 + delivery outbox).
 */
import { test, expect } from './fixtures'
import {
  navigateToFragmentPage,
  selectText,
  waitForHoverMenu,
  waitForCaptureModal,
  clickShadowButton,
  getAnnShadowRoot,
  getFragmentsFromServiceWorker,
  getOutboxFromServiceWorker,
  clearFragmentStoreViaServiceWorker,
  setCaptureConfigViaServiceWorker,
} from './helpers'

test.describe('Fragment capture — explicit verification lock', () => {
  test.beforeEach(async ({ page, context }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    await navigateToFragmentPage(page)
  })

  test('standard mode: 核验 → 应用 saves a v4 fragment with confirmed verification', async ({ page, context }) => {
    await selectText(page, '[data-testid="fragment-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '碎片' }))

    const modal = await waitForCaptureModal(page)
    // Standard mode: 核验 › 应用 (two steps), currently on 核验.
    await expect(modal.getByRole('listitem')).toHaveCount(2)
    await expect(modal.locator('li[aria-current="step"]')).toContainText('核验')
    // The apply step must not be reachable before an explicit confirmation.
    await expect(modal.getByTestId('modal-next')).toBeDisabled()

    await modal.getByTestId('kind-concept').click()
    await modal.getByRole('checkbox', { name: '确认已核对' }).check()
    await expect(modal.getByText(/已确认核对（原文材料/)).toBeVisible()
    await modal.getByTestId('modal-next').click()

    await expect(modal.locator('li[aria-current="step"]')).toContainText('应用')

    // Generic gate: copying the content is rejected — no token-count thresholds.
    const useInput = modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]')
    await useInput.fill('hawkish pivot')
    await expect(modal.getByText('应用不能只复述原文')).toBeVisible()
    await expect(modal.getByRole('button', { name: '保存到碎片库' })).toBeDisabled()

    await useInput.fill('在下周的宏观复盘文章里解释这轮债券抛售。')
    await modal.getByRole('button', { name: '保存到碎片库' }).click()

    await getAnnShadowRoot(page).locator('[data-ann-ui="capture-modal"]').waitFor({ state: 'detached', timeout: 5000 })

    const fragments = await getFragmentsFromServiceWorker(context)
    expect(fragments).toHaveLength(1)
    const fragment = fragments[0]
    expect(fragment.schemaVersion).toBe(4)
    expect(fragment.kind).toBe('concept')
    expect(fragment.captureRevision).toBe(1)
    expect(fragment.content).toBe('hawkish pivot')
    expect(fragment.context.excerpt).toContain('hawkish pivot')
    expect(fragment.context.sourceUrl).toContain('localhost:8173/fragment.html')
    expect(fragment.context.sourceHost).toBe('localhost')
    // 网页载体默认带 DOM 定位符（capture.md §4/§6），复用稳定 selector 规则
    expect(fragment.context.locator.type).toBe('dom')
    expect(fragment.context.locator.selector).toContain('fragment-target')
    expect(fragment.processing.use).toBe('在下周的宏观复盘文章里解释这轮债券抛售。')
    expect(fragment.processing.verified.source).toBe('source-material')
    expect(fragment.processing.verified.confirmedAt).toBeGreaterThan(0)
    expect(fragment.review.state).toBe('new')
    expect(fragment.review.easeFactor).toBe(2.5)

    // Local write + delivery event share the transaction (storage.md §4).
    const outbox = await getOutboxFromServiceWorker(context)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].type).toBe('fragment.created')
    expect(outbox[0].payload).toEqual({ fragmentId: fragment.id, revision: 1 })
  })

  test('deep mode adds the 理解 step (1/3) before verification', async ({ page, context }) => {
    await setCaptureConfigViaServiceWorker(context, { deepMode: true })
    await page.reload()
    await page.waitForSelector('ann-selection', { state: 'attached' })

    await selectText(page, '[data-testid="fragment-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '碎片' }))

    const modal = await waitForCaptureModal(page)
    // Deep mode: 理解 › 核验 › 应用 (three steps), currently on 理解 — the verification card is not open yet.
    await expect(modal.getByRole('listitem')).toHaveCount(3)
    await expect(modal.locator('li[aria-current="step"]')).toContainText('理解')
    await expect(modal.getByRole('checkbox', { name: '确认已核对' })).toHaveCount(0)

    await modal.locator('textarea[placeholder="写下当前的解释、判断或问题（可留空）"]').fill('应该是收紧政策的信号')
    await modal.getByTestId('modal-next').click()

    await expect(modal.locator('li[aria-current="step"]')).toContainText('核验')
    await expect(modal.getByText('你的理解')).toBeVisible()
    await expect(modal.getByText('应该是收紧政策的信号')).toBeVisible()
  })

  test('editing protected fields after confirmation clears it', async ({ page }) => {
    await selectText(page, '[data-testid="fragment-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '碎片' }))
    const modal = await waitForCaptureModal(page)

    await modal.getByRole('checkbox', { name: '确认已核对' }).check()
    await expect(modal.getByText(/已确认核对/)).toBeVisible()

    // Editing the content clears the confirmation (fragments.md §7).
    const contentInput = modal.locator('textarea').first()
    await contentInput.fill('hawkish pivots')
    await expect(modal.getByText(/已确认核对/)).toHaveCount(0)
    await expect(modal.getByRole('checkbox', { name: '确认已核对' })).not.toBeChecked()
  })

  test('required kind details are gated client-side with kind-specific hints', async ({ page }) => {
    await selectText(page, '[data-testid="fragment-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '碎片' }))
    const modal = await waitForCaptureModal(page)

    // claim 没选立场不能保存，且不会被静默默认（A3）
    await modal.getByTestId('kind-claim').click()
    await modal.getByRole('checkbox', { name: '确认已核对' }).check()
    await modal.getByTestId('modal-next').click()
    await modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]').fill('用于验证门控。')
    await expect(modal.getByTestId('detail-invalid')).toHaveText('请先选择你的立场（支持 / 反对 / 存疑）')
    await expect(modal.getByRole('button', { name: '保存到碎片库' })).toBeDisabled()

    // procedure 至少一步（B1）
    await modal.getByTestId('kind-procedure').click()
    await expect(modal.getByTestId('detail-invalid')).toHaveText('至少写出一个步骤（每行一条）')
    await modal.getByTestId('claim-stance') // detail 表单仍渲染
  })

  test('duplicate capture prompts instead of silently saving twice', async ({ page, context }) => {
    await selectText(page, '[data-testid="fragment-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '碎片' }))
    const modal = await waitForCaptureModal(page)
    await modal.getByRole('checkbox', { name: '确认已核对' }).check()
    await modal.getByTestId('modal-next').click()
    await modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]').fill('第一次保存这条碎片。')
    await modal.getByRole('button', { name: '保存到碎片库' }).click()
    await getAnnShadowRoot(page).locator('[data-ann-ui="capture-modal"]').waitFor({ state: 'detached' })

    // Same selection again → duplicate prompt with force-save path.
    await selectText(page, '[data-testid="fragment-target"]')
    const menu2 = await waitForHoverMenu(page)
    await clickShadowButton(menu2.locator('button', { hasText: '碎片' }))
    const modal2 = await waitForCaptureModal(page)
    await modal2.getByRole('checkbox', { name: '确认已核对' }).check()
    await modal2.getByTestId('modal-next').click()
    await modal2.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]').fill('换个应用场景再保存一次。')
    await modal2.getByRole('button', { name: '保存到碎片库' }).click()
    await expect(modal2.getByText(/已保存过相同内容/)).toBeVisible({ timeout: 5000 })

    await modal2.getByRole('button', { name: '仍要保存' }).click()
    await getAnnShadowRoot(page).locator('[data-ann-ui="capture-modal"]').waitFor({ state: 'detached' })

    const fragments = await getFragmentsFromServiceWorker(context)
    expect(fragments).toHaveLength(2)
  })
})
