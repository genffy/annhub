import { test, expect } from './fixtures'
import { clearLibrary, getEntries, selectUntilMenu, triggerScreenshot } from './helpers'

/**
 * Page-entry boundaries (RV-CAP-04, RV-CAP-05): editable areas never offer
 * the capture menu, and a screenshot's element pick never fires the page's
 * own link or button actions.
 */

test.describe('editable areas (capture.md §3, US-CAP-01)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('a contenteditable selection shows no menu and Enter keeps editing', async ({ page }) => {
    await page.goto('http://localhost:8173/editable.html')
    const editor = page.locator('#editor')
    const box = (await editor.boundingBox())!

    // real drag-select inside the editable block
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 260, box.y + 20, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    await expect(page.locator('[data-ann-ui="selection-menu"]')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(0)
    // the caret still works inside the editor
    await page.keyboard.type('still editing')
    await expect(editor).toContainText('still editing')
  })

  test('a plain paragraph next to the editor still offers the menu', async ({ page }) => {
    await page.goto('http://localhost:8173/editable.html')
    const menu = await selectUntilMenu(page, '#plain')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

test.describe('screenshot element pick never fires page actions (screenshot.md §2)', () => {
  test('picking a link does not navigate; picking a button does not run it', async ({ page }) => {
    await clearLibrary(page.context())
    await page.goto('http://localhost:8173/links.html')
    const url = page.url()

    await triggerScreenshot(page)

    // pick the link card element by a click on the link itself
    const link = page.locator('#nav-link')
    const linkBox = (await link.boundingBox())!
    await page.mouse.click(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2)
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    expect(page.url()).toBe(url)
    await page.keyboard.press('Escape')

    // pick the button
    await triggerScreenshot(page)
    const button = page.locator('#action')
    const buttonBox = (await button.boundingBox())!
    await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2)
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    expect(await page.locator('#count').textContent()).toBe('0')
  })
})
