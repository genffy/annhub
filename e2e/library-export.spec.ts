import { test, expect } from './fixtures'
import { clearLibrary, getCapturePageUrl, getEntries, selectUntilMenu, waitForClipToast } from './helpers'

async function saveClipViaMenu(page: import('@playwright/test').Page, selector: string): Promise<void> {
  const menu = await selectUntilMenu(page, selector)
  await menu.locator('.ann-menu-action').nth(0).click()
  await waitForClipToast(page)
}

test.describe('the library page and the single export (extension.md §2.2, storage.md §6)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('lists saved clips, searches them, opens the drawer and exports one ZIP', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(getCapturePageUrl())
    await saveClipViaMenu(page, '#intro-p')
    await saveClipViaMenu(page, '[data-testid="section-body"]')

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html`)

    // both clips are listed with type, source and relative time
    await expect(library.locator('.entry-card')).toHaveCount(2)
    await expect(library.locator('.entry-card').first()).toContainText('localhost')

    // search narrows to the matching clip and writes the URL hash
    await library.locator('.search').fill('lockstep')
    await expect(library.locator('.entry-card')).toHaveCount(1)
    expect(library.url()).toContain('q=lockstep')

    // no-result state keeps the filter and offers its own solid clear (the filter bar keeps its link)
    await library.locator('.search').fill('nosuchword')
    await expect(library.locator('.empty')).toContainText('没有匹配的结果')
    await library.locator('.empty').getByRole('button', { name: '清除筛选' }).click()
    await expect(library.locator('.entry-card')).toHaveCount(2)

    // the drawer renders the markdown, never raw HTML, and links back to the source
    await library.locator('.entry-card', { hasText: 'Retries can amplify' }).click()
    const drawer = library.locator('.drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.md-view a[href="https://engineering.example.com/jitter"]')).toHaveCount(1)
    const link = drawer.locator('.drawer-header a[href^="http"]').first()
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    // editing from the drawer persists: create a custom text property through the combo
    await drawer.getByTestId('add-property').click()
    await drawer.locator('.prop-combo-input').fill('project')
    await drawer.getByRole('button', { name: /创建属性/ }).click()
    await drawer.getByRole('button', { name: /创建并添加/ }).click()
    await expect(drawer.locator('.prop-row', { hasText: 'project' })).toBeVisible()
    await drawer.locator('.prop-row', { hasText: 'project' }).locator('input').fill('支付重试')
    await drawer.locator('.prop-row', { hasText: 'project' }).locator('input').blur()
    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return entries.some(entry => entry.properties['project'] === '支付重试')
      })
      .toBe(true)

    // a written-then-cleared note really clears (null semantics, RV-BG-03)
    const noteBox = drawer.locator('textarea')
    await expect(noteBox).toHaveCount(1)
    await noteBox.fill('temporary note')
    await noteBox.blur()
    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return entries.find(entry => entry.properties['project'] === '支付重试')?.note
      })
      .toBe('temporary note')
    await noteBox.fill('')
    await noteBox.blur()
    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return entries.find(entry => entry.properties['project'] === '支付重试')?.note
      })
      .toBeUndefined()

    // The drawer is modal (its backdrop covers the navigation): close it, then export.
    // The application page downloads a Blob URL; the archive is not sent
    // through the service worker as a large base64 message.
    await drawer.getByRole('button', { name: '关闭' }).click()
    await expect(drawer).toHaveCount(0)

    // the export command opens a dialog that states its scope, then runs the one export (extension.md §2.2)
    await library.locator('.nav-export').click()
    const dialog = library.getByTestId('export-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('包含')
    await expect(dialog).toContainText('不包含')
    await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused()
    // the cancel is a quiet ghost (design .btn-ghost): no border until hover warms it
    const cancel = dialog.getByRole('button', { name: '取消' })
    expect(await cancel.evaluate(button => getComputedStyle(button).borderTopColor)).toBe('rgba(0, 0, 0, 0)')
    await cancel.hover()
    await expect.poll(() => cancel.evaluate(button => getComputedStyle(button).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    await dialog.getByRole('button', { name: '导出 ZIP' }).click()
    await expect(dialog).toContainText('完整', { timeout: 20_000 })
    await expect(library.locator('.nav-note:not(.nav-storage)').first()).toContainText('导出完成', { timeout: 20_000 })
    await dialog.getByRole('button', { name: '完成' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(library.locator('.nav-export')).toBeFocused()
    await expect
      .poll(async () => {
        return library.evaluate(() =>
          chrome.downloads.search({ limit: 10 }).then(items => items.some(item => (item.filename ?? '').includes('AnnHub-export') || (item.url ?? '').startsWith('blob:'))),
        )
      })
      .toBe(true)
    await library.close()
  })

  test('the filter survives a reload from the URL hash', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    await saveClipViaMenu(page, '#intro-p')

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all?q=lockstep`)
    await expect(library.locator('.search')).toHaveValue('lockstep')
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await library.close()
  })

  test('a partial export lists the missing asset ID in the library (RV-LIB-12)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/screenshots`)
    await library.evaluate(
      () =>
        new Promise<void>(resolve => {
          const open = indexedDB.open('annhub')
          open.onsuccess = () => {
            const tx = open.result.transaction('entries', 'readwrite')
            tx.objectStore('entries').put({
              id: 'ent_missing_export',
              type: 'screenshot',
              content: '',
              assetId: 'asset_missing_export',
              sourceUrl: 'https://example.com/missing',
              sourceHost: 'example.com',
              properties: { title: 'Missing screenshot' },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
            tx.oncomplete = () => resolve()
          }
        }),
    )
    await library.reload()
    await library.locator('.nav-export').click()
    const dialog = library.getByTestId('export-dialog')
    await dialog.getByRole('button', { name: '导出 ZIP' }).click()
    await expect(dialog.getByTestId('export-partial-banner')).toContainText('asset_missing_export', { timeout: 20_000 })
    await expect(library.locator('.nav-note-warn')).toContainText('asset_missing_export')
    await library.close()
  })

  test('an export that is running is not abandoned by Escape, and the dialog answers with the result', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    await saveClipViaMenu(page, '#intro-p')

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html`)
    // hold the download open so the busy state is still there when the Escape lands
    await library.evaluate(() => {
      const gate: { release: null | (() => void) } = { release: null }
      ;(globalThis as unknown as { __exportGate: typeof gate }).__exportGate = gate
      const real = chrome.downloads.download.bind(chrome.downloads)
      chrome.downloads.download = ((options: chrome.downloads.DownloadOptions, callback?: (downloadId: number) => void) => {
        // the export awaits this call, so it parks here until the gate opens
        return new Promise<void>(resolve => {
          gate.release = resolve
        }).then(async () => {
          await (callback ? real(options, callback) : real(options))
        })
      }) as typeof chrome.downloads.download
    })

    await library.locator('.nav-export').click()
    const dialog = library.getByTestId('export-dialog')
    await dialog.getByRole('button', { name: '导出 ZIP' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('progress')).toBeVisible()

    // the running export cannot be stopped: this Escape changes nothing, and the export keeps going (storage.md §6)
    await library.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('progress')).toBeVisible()

    // let the download through: the dialog answers with the result, and only then does Escape close it.
    // The gate is only armed once the export reaches the download call, so wait for it — an early
    // optional call would do nothing and the export would stay parked at the gate forever
    await library.waitForFunction(() => Boolean((globalThis as unknown as { __exportGate: { release: unknown } }).__exportGate.release))
    await library.evaluate(() => (globalThis as unknown as { __exportGate: { release: () => void } }).__exportGate.release())
    await expect(dialog).toContainText('完整', { timeout: 20_000 })
    // the Escape reaches the dialog only through a keydown whose target sits inside it; the focus
    // effect runs after paint, so a press that beats it lands on body and closes nothing (RV-TEST-16)
    await expect(dialog.getByRole('button', { name: '完成' })).toBeFocused()
    await library.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(library.locator('.nav-export')).toBeFocused()
    await library.close()
  })

  test('deleting from the drawer removes the entry', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    await saveClipViaMenu(page, '#intro-p')

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html`)
    await library.locator('.entry-card').first().click()
    await library.locator('.drawer').getByRole('button', { name: '删除' }).click()
    await library.locator('.modal .danger').click()
    await expect.poll(() => getEntries(library.context())).toHaveLength(0)
    await library.close()
  })
})
