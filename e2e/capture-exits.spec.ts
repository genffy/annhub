/**
 * Capture-window safe exits and feedback (extension.md §3.3, §4.1, §9):
 * selection-menu consequence hints, the clip undo toast, 回到原文 collapsing to a
 * bottom bar, the four-way close confirmation, and the save-failure exits.
 */
import { test, expect } from './fixtures'
import {
  clearClipsFromServiceWorker,
  clearFragmentStoreViaServiceWorker,
  clearHighlightsFromServiceWorker,
  clickShadowButton,
  ensureServiceWorker,
  getAnnShadowRoot,
  getClipsFromServiceWorker,
  getFragmentsFromServiceWorker,
  getHighlightsFromServiceWorker,
  navigateToFragmentPage,
  selectText,
  setCaptureConfigViaServiceWorker,
  waitForCaptureModal,
  waitForHoverMenu,
} from './helpers'

const TARGET = '[data-testid="fragment-target"]'
const APPLY_PLACEHOLDER = 'textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]'

test.beforeEach(async ({ page, context }) => {
  await clearFragmentStoreViaServiceWorker(context)
  await clearClipsFromServiceWorker(context)
  await clearHighlightsFromServiceWorker(context)
  await setCaptureConfigViaServiceWorker(context, { deepMode: false })
  await navigateToFragmentPage(page)
})

async function openCapture(page: import('@playwright/test').Page) {
  await selectText(page, TARGET)
  const hoverMenu = await waitForHoverMenu(page)
  await clickShadowButton(hoverMenu.locator('button', { hasText: '碎片' }))
  return waitForCaptureModal(page)
}

test.describe('selection menu hints', () => {
  test('hovering an action shows its “time · output · review” consequence after ~300ms', async ({ page }) => {
    await selectText(page, TARGET)
    const hoverMenu = await waitForHoverMenu(page)
    const hint = hoverMenu.getByTestId('hover-hint')

    await hoverMenu.getByTestId('hover-action-clip').hover()
    await expect(hint).toHaveText('保存原文和语境，之后查阅 · 不进入复习')
    await hoverMenu.getByTestId('hover-action-save-fragment').hover()
    await expect(hint).toHaveText('理解并应用 · 约 30–90 秒 · 进入复习')
  })

  test('keyboard focus shows the hint too', async ({ page }) => {
    await selectText(page, TARGET)
    const hoverMenu = await waitForHoverMenu(page)
    await hoverMenu.getByTestId('hover-action-screenshot').focus()
    await expect(hoverMenu.getByTestId('hover-hint')).toHaveText('框选区域或单击元素 · 先进入截图集')
  })
})

test.describe('clip toast', () => {
  test('shows 已剪藏 with 撤销, which deletes the clip that was just saved', async ({ page, context }) => {
    await selectText(page, TARGET)
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.getByTestId('hover-action-clip'))

    const toast = getAnnShadowRoot(page).getByTestId('clip-toast')
    await expect(toast).toContainText('已剪藏 · 不进入复习')
    await expect.poll(async () => (await getClipsFromServiceWorker(context)).length).toBe(1)

    await toast.getByTestId('clip-undo').click()
    await expect(toast).toContainText('已撤销')
    await expect.poll(async () => (await getClipsFromServiceWorker(context)).length).toBe(0)
  })

  test('the undo window closes by itself after ~3 seconds and the clip stays', async ({ page, context }) => {
    await selectText(page, TARGET)
    const hoverMenu = await waitForHoverMenu(page)
    await clickShadowButton(hoverMenu.getByTestId('hover-action-clip'))
    const toast = getAnnShadowRoot(page).getByTestId('clip-toast')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveCount(0, { timeout: 6000 })
    expect(await getClipsFromServiceWorker(context)).toHaveLength(1)
  })
})

test.describe('回到原文', () => {
  test('collapses the window into a bottom bar, keeps the input, and expands again', async ({ page }) => {
    const modal = await openCapture(page)
    await modal.getByRole('checkbox', { name: '确认已核对' }).check()
    await modal.getByTestId('modal-next').click()
    await modal.locator(APPLY_PLACEHOLDER).fill('收起再展开后这句话还在。')

    await modal.getByTestId('back-to-source').click()
    const bar = getAnnShadowRoot(page).getByTestId('capture-collapsed')
    await expect(bar).toBeVisible()
    await expect(getAnnShadowRoot(page).getByTestId('save-fragment')).toHaveCount(0)

    await bar.getByTestId('capture-expand').click()
    await expect(modal.locator(APPLY_PLACEHOLDER)).toHaveValue('收起再展开后这句话还在。')
  })
})

test.describe('closing with input', () => {
  async function typeInput(page: import('@playwright/test').Page) {
    const modal = await openCapture(page)
    await modal.getByRole('checkbox', { name: '确认已核对' }).check()
    await modal.getByTestId('modal-next').click()
    await modal.locator(APPLY_PLACEHOLDER).fill('关闭前写下的应用。')
    await modal.locator('button[title="关闭 (Esc)"]').click()
    return getAnnShadowRoot(page)
  }

  test('offers 继续编辑 / 改存为高亮 / 改存为剪藏 / 放弃, and 继续编辑 keeps the window', async ({ page }) => {
    const root = await typeInput(page)
    for (const id of ['close-continue', 'close-as-highlight', 'close-as-clip', 'close-discard']) {
      await expect(root.getByTestId(id)).toBeVisible()
    }
    await root.getByTestId('close-continue').click()
    await expect(root.getByTestId('close-continue')).toHaveCount(0)
    await expect(root.locator(APPLY_PLACEHOLDER)).toHaveValue('关闭前写下的应用。')
  })

  test('改存为高亮 saves a highlight whose note keeps the typed text — never a fragment', async ({ page, context }) => {
    const root = await typeInput(page)
    await root.getByTestId('close-as-highlight').click()
    await expect(root.getByTestId('fallback-done')).toContainText('已改存为高亮')

    await expect.poll(async () => (await getHighlightsFromServiceWorker(context)).length).toBe(1)
    const [highlight] = await getHighlightsFromServiceWorker(context)
    expect(highlight.user_note).toContain('应用：关闭前写下的应用。')
    expect(await getFragmentsFromServiceWorker(context)).toHaveLength(0)
    expect(await getClipsFromServiceWorker(context)).toHaveLength(0)
  })

  test('改存为剪藏 saves a clip whose note keeps the typed text — never a fragment', async ({ page, context }) => {
    const root = await typeInput(page)
    await root.getByTestId('close-as-clip').click()
    await expect(root.getByTestId('fallback-done')).toContainText('已改存为剪藏')

    await expect.poll(async () => (await getClipsFromServiceWorker(context)).length).toBe(1)
    const [clip] = await getClipsFromServiceWorker(context)
    expect(clip.user_note).toContain('应用：关闭前写下的应用。')
    expect(await getFragmentsFromServiceWorker(context)).toHaveLength(0)
    expect(await getHighlightsFromServiceWorker(context)).toHaveLength(0)
  })

  test('放弃 closes without saving anything', async ({ page, context }) => {
    const root = await typeInput(page)
    await root.getByTestId('close-discard').click()
    await root.locator('[data-ann-ui="capture-modal"]').waitFor({ state: 'detached' })
    expect(await getFragmentsFromServiceWorker(context)).toHaveLength(0)
    expect(await getClipsFromServiceWorker(context)).toHaveLength(0)
    expect(await getHighlightsFromServiceWorker(context)).toHaveLength(0)
  })

  test('closing an untouched window needs no confirmation', async ({ page }) => {
    const modal = await openCapture(page)
    await modal.locator('button[title="关闭 (Esc)"]').click()
    await getAnnShadowRoot(page).locator('[data-ann-ui="capture-modal"]').waitFor({ state: 'detached' })
  })
})

test.describe('save failure exits', () => {
  test('a full origin refuses the save up front, keeps every input and offers the safe exits', async ({ page, context }) => {
    // Quota is checked BEFORE the write (storage.md §5): simulate an exhausted origin in the service worker.
    const worker = await ensureServiceWorker(context)
    await worker.evaluate(() => {
      navigator.storage.estimate = async () => ({ usage: 100, quota: 100 })
    })

    const modal = await openCapture(page)
    await modal.getByRole('checkbox', { name: '确认已核对' }).check()
    await modal.getByTestId('modal-next').click()
    await modal.locator(APPLY_PLACEHOLDER).fill('空间不足时输入也不能丢。')
    await modal.getByRole('button', { name: '保存到碎片库' }).click()

    const failed = modal.getByTestId('save-failed')
    await expect(failed).toContainText('本地存储空间不足')
    await expect(modal.locator(APPLY_PLACEHOLDER)).toHaveValue('空间不足时输入也不能丢。')
    for (const id of ['save-retry', 'save-copy-input', 'save-as-clip', 'save-export']) {
      await expect(failed.getByTestId(id)).toBeVisible()
    }
    expect(await getFragmentsFromServiceWorker(context)).toHaveLength(0)

    // 改存为剪藏 keeps the typed text as the note.
    await failed.getByTestId('save-as-clip').click()
    await expect(getAnnShadowRoot(page).getByTestId('fallback-done')).toContainText('已改存为剪藏')
    const [clip] = await getClipsFromServiceWorker(context)
    expect(clip.user_note).toContain('空间不足时输入也不能丢。')
  })
})
