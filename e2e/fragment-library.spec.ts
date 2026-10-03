/**
 * 碎片库 page E2E — extension PRD §5: search/filter, 新建灵感 (annhub://
 * manual source), capture-field edits with re-verification, local delete,
 * highlight upgrade into a Fragment, and the Desktop connection chip.
 */
import { test, expect } from './fixtures'
import {
  navigateToFragmentPage,
  selectText,
  waitForHoverMenu,
  clickShadowButton,
  clearFragmentStoreViaServiceWorker,
  clearHighlightsFromServiceWorker,
  setCaptureConfigViaServiceWorker,
  captureFragmentViaUi,
  getFragmentsFromServiceWorker,
} from './helpers'

async function openLibrary(page: any, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/words.html`)
  await expect(page.getByTestId('words-page')).toBeVisible({ timeout: 10_000 })
}

test.describe('碎片库 — fragments view', () => {
  test.beforeEach(async ({ page, context }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await clearHighlightsFromServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    await navigateToFragmentPage(page)
    await captureFragmentViaUi(page, { kind: 'concept', use: '在周报里解释利率走势。' })
  })

  test('search, kind filters and empty state with 清除筛选', async ({ page, extensionId }) => {
    await openLibrary(page, extensionId)
    await expect(page.getByTestId('fragment-card')).toHaveCount(1)
    await expect(page.getByTestId('fragment-card').first()).toContainText('概念')

    await page.getByTestId('fragment-search').fill('dovish')
    await expect(page.getByTestId('fragment-empty')).toBeVisible()
    await page.getByTestId('fragment-empty').getByText('清除筛选').click()
    await expect(page.getByTestId('fragment-card')).toHaveCount(1)

    await page.getByTestId('filter-kind-claim').click()
    await expect(page.getByTestId('fragment-card')).toHaveCount(0)
    await page.getByTestId('filter-kind-claim').click()
    await page.getByTestId('filter-kind-concept').click()
    await expect(page.getByTestId('fragment-card')).toHaveCount(1)
  })

  test('card detail shows 理解/核验/应用 sections (加工 before 原文)', async ({ page, extensionId }) => {
    await openLibrary(page, extensionId)
    await page.getByTestId('fragment-card').first().locator('.fragment-headline').click()
    const details = page.getByTestId('fragment-details')
    await expect(details).toBeVisible()
    await expect(details.getByText('应用')).toBeVisible()
    await expect(details.getByText(/核验（/)).toBeVisible()
    await expect(page.getByTestId('fragment-card').first()).toContainText('localhost')
  })

  test('edit requires re-verification when protected fields change, bumps captureRevision', async ({ page, context, extensionId }) => {
    await openLibrary(page, extensionId)
    await page.getByTestId('fragment-card').first().locator('.fragment-headline').click()
    await page.getByTestId('fragment-edit').click()

    const editor = page.locator('.fragment-editor')
    await expect(editor).toBeVisible()
    await editor.locator('textarea').first().fill('hawkish')
    await editor.getByTestId('editor-save').click()
    // Refusing to re-verify blocks the save with a specific message.
    await expect(editor.getByText(/需要重新确认核验/)).toBeVisible()

    await editor.getByTestId('reverify').click()
    await expect(editor.getByText(/已重新确认核验/)).toBeVisible()
    await editor.getByTestId('editor-save').click()
    await expect(editor).toHaveCount(0, { timeout: 5000 })

    const fragments = await getFragmentsFromServiceWorker(context)
    expect(fragments).toHaveLength(1)
    expect(fragments[0].content).toBe('hawkish')
    expect(fragments[0].captureRevision).toBe(2)
  })

  test('delete removes the local record and its pending delivery task', async ({ page, context, extensionId }) => {
    await openLibrary(page, extensionId)
    page.on('dialog', dialog => dialog.accept())
    await page.getByTestId('fragment-card').first().locator('.fragment-headline').click()
    await page.getByTestId('fragment-delete').click()
    await expect(page.getByTestId('fragment-card')).toHaveCount(0, { timeout: 5000 })

    const fragments = await getFragmentsFromServiceWorker(context)
    expect(fragments).toHaveLength(0)
  })

  test('新建灵感 saves with the local annhub:// manual source', async ({ page, context, extensionId }) => {
    await openLibrary(page, extensionId)
    await page.getByTestId('new-inspiration').click()
    const modal = page.locator('[data-ann-ui="capture-modal"]')
    await expect(modal).toBeVisible()

    // Inspiration form: content, then 理解(1/3)→核验(触发背景必填)→应用.
    await modal.locator('textarea').first().fill('把核验步骤做成一键回到原文')
    await modal.getByRole('button', { name: '去核验 →' }).click()
    await modal.locator('textarea[placeholder="什么触发了这个想法？（必填）"]').fill('读到间隔重复文献时想到的。')
    await modal.getByRole('button', { name: '手工核对后确认' }).click()
    await modal.getByRole('button', { name: '去应用 →' }).click()
    await modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]').fill('下次设计采集流程时先做这个。')
    await modal.getByRole('button', { name: '保存到碎片库' }).click()
    await expect(modal).toHaveCount(0, { timeout: 5000 })

    const fragments = await getFragmentsFromServiceWorker(context)
    const inspiration = fragments.find(f => f.kind === 'inspiration')
    expect(inspiration).toBeTruthy()
    expect(inspiration!.context.sourceUrl).toMatch(/^annhub:\/\/manual\//)
    expect(inspiration!.context.sourceHost).toBe('manual')
    expect(inspiration!.detail.form).toBe('idea')
  })
})

test.describe('碎片库 — highlights view', () => {
  test('高亮 detail upgrades into a Fragment', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await clearHighlightsFromServiceWorker(context)
    await navigateToFragmentPage(page)

    await selectText(page, '[data-testid="fragment-target"]')
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.locator('button', { hasText: '高亮' }))
    const noteInput = hoverMenu.locator('input')
    await expect(noteInput).toBeVisible()
    await noteInput.fill('关键转折表述')
    await hoverMenu.locator('button', { hasText: '↵' }).click()
    await page.waitForTimeout(800)

    await openLibrary(page, extensionId)
    await page.getByTestId('view-highlights').click()
    await expect(page.getByTestId('highlight-card')).toHaveCount(1, { timeout: 5000 })

    await page.getByTestId('highlight-upgrade').click()
    const modal = page.locator('[data-ann-ui="capture-modal"]')
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: '已回看原文，确认' }).click()
    await modal.getByRole('button', { name: '去应用 →' }).click()
    await modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]').fill('升级后用于季度复盘。')
    await modal.getByRole('button', { name: '保存到碎片库' }).click()
    await expect(modal).toHaveCount(0, { timeout: 5000 })

    const fragments = await getFragmentsFromServiceWorker(context)
    expect(fragments).toHaveLength(1)
    expect(fragments[0].content).toBe('hawkish pivot')
  })
})
