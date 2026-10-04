/**
 * Extension surfaces (extension.md §2.2, §2.3, §5, D-11/D-12/D-13): toolbar
 * popup, the three first-level pages, the more menu, and the localized wording.
 */
import { test, expect } from './fixtures'
import {
  clearClipsFromServiceWorker,
  clearFragmentStoreViaServiceWorker,
  captureFragmentViaUi,
  navigateToFragmentPage,
  setCaptureConfigViaServiceWorker,
  setStorageViaServiceWorker,
} from './helpers'

test.describe('toolbar popup (§2.3)', () => {
  test('shows the connection state and three entries, with no review block while unpaired', async ({ context, extensionId }) => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(popup.getByTestId('popup')).toHaveAttribute('data-loaded', 'true')

    await expect(popup.getByTestId('popup-status')).toContainText('未配置')
    await expect(popup.getByTestId('popup-new-inspiration')).toContainText('新建灵感')
    await expect(popup.getByTestId('popup-new-inspiration')).toContainText('无需选区')
    await expect(popup.getByTestId('popup-open-library')).toContainText('打开碎片库')
    await expect(popup.getByTestId('popup-open-screenshots')).toContainText('打开截图集')
    await expect(popup.getByTestId('popup-desktop-review')).toHaveCount(0)
    await expect(popup.locator('.ann-popup__hint')).toContainText('选中网页文字即可保存')
  })

  test('新建灵感 opens the library with the inspiration form; no selection needed', async ({ context, extensionId }) => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    const [opened] = await Promise.all([context.waitForEvent('page'), popup.getByTestId('popup-new-inspiration').click()])
    await opened.waitForLoadState()
    expect(opened.url()).toContain('library.html')
    await expect(opened.locator('[data-ann-ui="capture-modal"]')).toContainText('新建灵感', { timeout: 10_000 })
  })

  test('打开碎片库 and 打开截图集 open the right views', async ({ context, extensionId }) => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    const [library] = await Promise.all([context.waitForEvent('page'), popup.getByTestId('popup-open-library').click()])
    await library.waitForLoadState()
    await expect(library.getByTestId('view-fragments')).toHaveAttribute('aria-current', 'page')

    const popup2 = await context.newPage()
    await popup2.goto(`chrome-extension://${extensionId}/popup.html`)
    const [shots] = await Promise.all([context.waitForEvent('page'), popup2.getByTestId('popup-open-screenshots').click()])
    await shots.waitForLoadState()
    await expect(shots.getByTestId('view-screenshots')).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('library navigation (§2.2, §5.1, D-13)', () => {
  test('three first-level pages; the more menu holds export, 高亮列表 and 剪藏列表 — not 设置', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    const nav = page.getByTestId('primary-nav')
    await expect(nav.getByText('碎片库')).toBeVisible()
    await expect(nav.getByText('截图集')).toBeVisible()
    await expect(nav.getByTestId('nav-settings')).toHaveAttribute('href', /options\.html#\/settings$/)

    await page.getByTestId('more-menu').click()
    await expect(page.getByTestId('export-content')).toBeVisible()
    await expect(page.getByTestId('view-highlights')).toBeVisible()
    await expect(page.getByTestId('view-clips')).toBeVisible()
    await expect(page.locator('.more-menu')).not.toContainText('设置')

    await page.getByTestId('view-clips').click()
    await expect(page.getByTestId('list-crumb')).toContainText('剪藏列表')
    await page.getByTestId('list-crumb').getByText('← 碎片库').click()
    await expect(page.getByTestId('fragment-list')).toBeVisible()
  })

  test('剪藏列表 shows the saved clips and offers the upgrade into a fragment', async ({ page, context, extensionId }) => {
    await setStorageViaServiceWorker(context, {
      'ann-clips': [
        {
          id: 'clip_e2e_1',
          source_url: 'https://example.com/post',
          source_title: 'Example post',
          capture_time: '2026-10-04T00:00:00.000Z',
          content: 'A clipped sentence worth keeping.',
          context_before: 'Before ',
          context_after: ' after.',
        },
      ],
    })
    try {
      await page.goto(`chrome-extension://${extensionId}/library.html#/clips`)
      await expect(page.getByTestId('clip-card')).toHaveCount(1)
      await expect(page.getByTestId('clip-card')).toContainText('A clipped sentence worth keeping.')
      await expect(page.getByTestId('clip-empty')).toHaveCount(0)
      await page.getByTestId('clip-upgrade').click()
      await expect(page.locator('[data-ann-ui="capture-modal"]')).toContainText('A clipped sentence worth keeping.', { timeout: 10_000 })
    } finally {
      await clearClipsFromServiceWorker(context)
    }
  })

  test('settings page offers the same first-level pages', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html#/settings`)
    await expect(page.getByTestId('nav-library')).toBeVisible()
    await expect(page.getByTestId('nav-screenshots')).toBeVisible()
  })

  test('first use: guide card, empty state and the connect hint after the first fragment (Chinese wording)', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await expect(page.getByTestId('onboarding-guide')).toContainText('高亮 ≠ 碎片')
    await expect(page.getByTestId('fragment-empty')).toContainText('保存你的第一个知识碎片')
    await expect(page.getByTestId('fragment-search')).toHaveAttribute('placeholder', '搜索碎片…')
    await expect(page.getByTestId('connect-hint')).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toMatch(/Fragment/)

    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    await navigateToFragmentPage(page)
    await captureFragmentViaUi(page, { kind: 'concept', use: '连接提示验收。' })

    await page.goto(`chrome-extension://${extensionId}/library.html`)
    const hint = page.getByTestId('connect-hint')
    await expect(hint).toContainText('连接 Desktop 开始复习')
    await expect(hint).toContainText('在 Desktop 的「系统」页复制配对码')
    await hint.getByTestId('connect-hint-dismiss').click()
    await expect(hint).toHaveCount(0)
  })
})

test.describe('English UI wording (D-11)', () => {
  test.use({ uiLocale: 'en-US' })

  test('the first menu item and library strings say “Fragment”', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await expect(page.getByTestId('fragment-search')).toHaveAttribute('placeholder', 'Search Fragments…')
    await expect(page.getByTestId('onboarding-guide')).toContainText('Highlight ≠ Fragment')

    await navigateToFragmentPage(page)
    const { selectText, waitForHoverMenu } = await import('./helpers')
    await selectText(page, '[data-testid="fragment-target"]')
    const menu = await waitForHoverMenu(page)
    await expect(menu.getByTestId('hover-action-save-fragment')).toContainText('Fragment')
    await expect(menu.getByTestId('hover-action-clip')).toContainText('Clip')
  })
})
