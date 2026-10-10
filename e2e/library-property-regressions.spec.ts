import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getCapturePageUrl, getEntries, selectUntilMenu, waitForClipToast } from './helpers'

test.describe('library property regressions', () => {
  test.beforeEach(async ({ context, page }) => {
    await clearLibrary(context)
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)
  })

  test('reading panel keeps successive edits and updates the header (RV-LIB-16)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    const reading = library.getByTestId('reading-view')
    await reading.getByRole('tab', { name: /属性|Properties/ }).click()
    const title = reading.locator('.prop-row').filter({ hasText: 'title' }).locator('input')
    await title.fill('Updated title')
    await title.blur()
    await expect(reading.locator('.reading-title')).toHaveText('Updated title')
    await expect(title).toHaveValue('Updated title')
    expect((await getEntries(library.context()))[0]?.properties.title).toBe('Updated title')
    await library.close()
  })

  test('clicking a list property name focuses its input without removing a value (RV-LIB-17)', async ({ page, extensionId }) => {
    const entry = (await getEntries(page.context()))[0]!
    const sw = await ensureServiceWorker(page.context())
    await sw.evaluate(
      id =>
        new Promise<void>(resolve => {
          const open = indexedDB.open('annhub')
          open.onsuccess = () => {
            const tx = open.result.transaction('entries', 'readwrite')
            const request = tx.objectStore('entries').get(id)
            request.onsuccess = () => {
              request.result.properties.tags = ['keep-me', 'second']
              tx.objectStore('entries').put(request.result)
            }
            tx.oncomplete = () => resolve()
          }
        }),
      entry.id,
    )
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    const row = library.locator('.drawer .prop-row', { has: library.locator('.prop-name', { hasText: 'tags' }) })
    await row.locator('.prop-name').click()
    await expect(row.locator('.tag')).toHaveCount(2)
    await expect(row.locator('input')).toBeFocused()
    await library.close()
  })

  test('Escape saves an active title draft before closing the drawer (RV-LIB-05)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    const title = library.locator('.drawer .prop-row').filter({ hasText: 'title' }).locator('input')
    await title.fill('Saved by Escape')
    await title.press('Escape')
    await expect(library.locator('.drawer')).toHaveCount(0)
    await library.locator('.row').first().click()
    await expect(library.locator('.drawer .prop-row').filter({ hasText: 'title' }).locator('input')).toHaveValue('Saved by Escape')
    await library.close()
  })

  test('browser Back saves an unblurred drawer note before leaving (RV-LIB-05)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    await library.locator('.drawer textarea').fill('Kept across Back')
    await library.goBack()
    await expect(library.locator('.drawer')).toHaveCount(0)
    await expect.poll(async () => (await getEntries(library.context()))[0]?.note).toBe('Kept across Back')
    await library.close()
  })

  test('a rejected long value keeps its draft and explains the limit (RV-LIB-05)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    await library.getByTestId('add-property').click()
    await library.locator('.prop-add input').fill('custom_text')
    await library
      .locator('.prop-add')
      .getByRole('button', { name: /保存|Save/ })
      .click()
    const input = library.getByTestId('prop-row-pending').locator('input')
    await input.fill('x'.repeat(1001))
    await input.blur()
    await expect(input).toHaveValue('x'.repeat(1001))
    await expect(library.locator('.prop-panel .warn')).toContainText('1000')
    await library.close()
  })

  test('a pending list saves the item entered with one Enter (RV-LIB-06)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    await library.getByTestId('add-property').click()
    await library.locator('.prop-add input').fill('reviewers')
    await library.locator('.prop-add select').selectOption('list')
    await library
      .locator('.prop-add')
      .getByRole('button', { name: /保存|Save/ })
      .click()
    const input = library.getByTestId('prop-row-pending').locator('input')
    await input.fill('first')
    await input.press('Enter')
    await expect.poll(async () => (await getEntries(library.context()))[0]?.properties.reviewers).toEqual(['first'])
    await library.close()
  })

  test('a new property default is applied to the next clip (RV-LIB-07)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/properties`)
    await library.getByTestId('new-property').click()
    await library.locator('.prop-add input[aria-label="名称"]').fill('project')
    await library.locator('.prop-add input[aria-label="默认值"]').fill('alpha')
    await library.locator('.prop-add input[type="checkbox"]').first().check()
    await library.locator('.prop-add').getByRole('button', { name: '保存' }).click()
    await expect(library.locator('tr[data-prop="project"]')).toBeVisible()

    await page.goto(`${getCapturePageUrl()}?new-property=1`)
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)
    expect((await getEntries(library.context())).some(entry => entry.properties.project === 'alpha')).toBe(true)
    await library.close()
  })

  test('the property panel shows read-only system fields (RV-LIB-07)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    const system = library.locator('.drawer-system')
    await expect(system).toContainText('剪藏')
    await expect(system).toContainText('localhost')
    await expect(system.locator('dt')).toHaveCount(4)
    await library.close()
  })

  test('drawer traps Tab, closes from the backdrop and restores row focus (RV-LIB-10)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    const row = library.locator('.row-main').first()
    await row.click()
    const drawer = library.locator('.drawer')
    await expect(drawer).toBeVisible()
    await expect.poll(() => drawer.evaluate(node => node.contains(document.activeElement))).toBe(true)
    await library.keyboard.press('Shift+Tab')
    await expect.poll(() => drawer.evaluate(node => node.contains(document.activeElement))).toBe(true)
    await library.keyboard.press('Tab')
    await expect.poll(() => drawer.evaluate(node => node.contains(document.activeElement))).toBe(true)
    await library.locator('.drawer-backdrop').click({ position: { x: 20, y: 20 } })
    await expect(drawer).toHaveCount(0)
    await expect(row).toBeFocused()
    await library.close()
  })

  test('narrow library keeps distinct navigation and reading properties reachable (RV-LIB-10)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 390, height: 844 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await expect(library.locator('.side .nav-item svg')).toHaveCount(6)
    await expect(library.getByRole('link', { name: '截图' })).toBeVisible()
    await expect(library.getByRole('link', { name: '设置' })).toBeVisible()
    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    await expect(library.locator('.reading-side')).toBeVisible()
    await library.getByRole('tab', { name: /属性/ }).click()
    await expect(library.getByTestId('reading-properties')).toBeVisible()
    await library.close()
  })

  /** Gives the saved clip a checkbox property through the same message the panel uses. */
  async function giveCheckbox(library: import('@playwright/test').Page, entryId: string): Promise<void> {
    const updated = await library.evaluate(
      id =>
        chrome.runtime.sendMessage({
          type: 'UPDATE_ENTRY',
          id,
          patch: { properties: { set: { reviewed: true }, newDefinitions: [{ name: 'reviewed', type: 'checkbox', builtin: false, presets: [] }] } },
        }),
      entryId,
    )
    expect(updated.success).toBe(true)
  }

  test('a stored checkbox row never blocks closing the drawer (RV-LIB-05)', async ({ page, extensionId }) => {
    const entry = (await getEntries(page.context()))[0]!
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await giveCheckbox(library, entry.id)
    await library.reload()
    const drawer = library.locator('.drawer')

    await library.locator('.row').first().click()
    await expect(drawer.locator('.prop-row', { hasText: 'reviewed' }).locator('input[type="checkbox"]')).toBeChecked()
    await library.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)

    // the close button and the backdrop share the same flush
    await library.locator('.row').first().click()
    await drawer.getByRole('button', { name: '关闭' }).click()
    await expect(drawer).toHaveCount(0)
    await library.locator('.row').first().click()
    await library.locator('.drawer-backdrop').click({ position: { x: 20, y: 20 } })
    await expect(drawer).toHaveCount(0)

    // closing never rewrites the value
    expect((await getEntries(library.context()))[0]?.properties.reviewed).toBe(true)
    await library.close()
  })

  test('browser Back leaves a drawer that holds a checkbox row (RV-LIB-05)', async ({ page, extensionId }) => {
    const entry = (await getEntries(page.context()))[0]!
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await giveCheckbox(library, entry.id)
    await library.reload()
    await library.locator('.row').first().click()
    await expect(library.locator('.drawer')).toBeVisible()
    await library.goBack()
    await expect(library.locator('.drawer')).toHaveCount(0)
    await library.close()
  })

  test('a drawer whose entry cannot be loaded still closes from Escape and from the backdrop (RV-LIB-19)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    const gone = `chrome-extension://${extensionId}/library.html#/clips?e=ent_gone`
    const drawer = library.locator('.drawer')
    await library.goto(gone)
    await expect(drawer).toContainText('未找到该条目')
    await library.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(library).not.toHaveURL(/ent_gone/)

    await library.goto(gone)
    await expect(drawer).toContainText('未找到该条目')
    await library.locator('.drawer-backdrop').click({ position: { x: 20, y: 20 } })
    await expect(drawer).toHaveCount(0)
    await library.close()
  })

  test('an Escape that lands as soon as the loaded drawer is drawn closes it (RV-LIB-19)', async ({ page, extensionId }) => {
    const entry = (await getEntries(page.context()))[0]!
    const library = await page.context().newPage()
    // fired from a MutationObserver: after React committed the entry, before its passive effects re-subscribed the key handler
    await library.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('.drawer .prop-row')) return
        observer.disconnect()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        Object.assign(window, { escapeFired: true })
      })
      observer.observe(document, { childList: true, subtree: true })
    })
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips?e=${entry.id}`)
    // the Escape really was sent at the loaded drawer — otherwise "no drawer" below would prove nothing
    await library.waitForFunction(() => (window as unknown as { escapeFired?: boolean }).escapeFired === true)
    await expect(library.locator('.drawer')).toHaveCount(0)
    await library.close()
  })

  test('a pending checkbox row can be left unset and the drawer still closes (RV-LIB-06)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    await library.getByTestId('add-property').click()
    await library.locator('.prop-add input').fill('approved')
    await library.locator('.prop-add select').selectOption('checkbox')
    await library
      .locator('.prop-add')
      .getByRole('button', { name: /保存|Save/ })
      .click()
    await expect(library.getByTestId('prop-row-pending').locator('input[type="checkbox"]')).toBeVisible()
    await library.keyboard.press('Escape')
    await expect(library.locator('.drawer')).toHaveCount(0)
    // nothing was written for the untouched box; the definition stays registered
    expect((await getEntries(library.context()))[0]?.properties.approved).toBeUndefined()
    const listed = await library.evaluate(() => chrome.runtime.sendMessage({ type: 'LIST_PROPERTIES' }))
    expect(listed.data.definitions.some((definition: { name: string }) => definition.name === 'approved')).toBe(true)
    await library.close()
  })

  test('a checkbox row in the reading side panel does not trap Escape (RV-LIB-05)', async ({ page, extensionId }) => {
    const entry = (await getEntries(page.context()))[0]!
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await giveCheckbox(library, entry.id)
    await library.goto(`chrome-extension://${extensionId}/library.html#/read/${entry.id}`)
    await library.reload()
    await library.getByRole('tab', { name: /属性/ }).click()
    await expect(library.getByTestId('reading-properties').locator('input[type="checkbox"]')).toBeChecked()
    await library.keyboard.press('Escape')
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await library.close()
  })
})
