import { test, expect } from './fixtures'
import { clearLibrary, getEntries, selectUntilMenu, triggerBlockMode, triggerScreenshot } from './helpers'

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

test('same-origin iframe offers clipping while a cross-origin iframe stays quiet (RV-CAP-04)', async ({ page }) => {
  await clearLibrary(page.context())
  await page.goto('http://localhost:8173/iframe-host.html')
  const selectFrame = async (name: string) => {
    const frame = page.frameLocator(`iframe[name="${name}"]`)
    const box = (await frame.locator('#frame-text').boundingBox())!
    await page.mouse.move(box.x + 4, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 10 })
    await page.mouse.up()
    return frame.locator('[data-ann-ui="selection-menu"]')
  }
  const sameMenu = await selectFrame('same')
  await expect(sameMenu).toBeVisible()
  await sameMenu.locator('.ann-menu-action').first().click()
  await expect.poll(() => getEntries(page.context())).toHaveLength(1)
  const crossMenu = await selectFrame('cross')
  await expect(crossMenu).toHaveCount(0)
})

test('open shadow root selection offers and saves a clip (RV-CAP-04)', async ({ page }) => {
  await clearLibrary(page.context())
  await page.goto('http://localhost:8173/shadow.html')
  const text = page.locator('#host').locator('#shadow-text')
  const box = (await text.boundingBox())!
  await page.mouse.move(box.x + 4, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
  const menu = page.locator('[data-ann-ui="selection-menu"]')
  await expect(menu).toBeVisible()
  await menu.locator('.ann-menu-action').first().click()
  await expect.poll(() => getEntries(page.context())).toHaveLength(1)
  expect((await getEntries(page.context()))[0]!.content).toContain('shadow paragraph')
})

test.describe('child frames (capture.md §3, D-25, D-29)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('a same-origin iframe offers clipping only: the screenshot belongs to the top frame (D-29)', async ({ page }) => {
    await page.goto('http://localhost:8173/iframe-host.html')
    const frame = page.frameLocator('iframe[name="same"]')
    const box = (await frame.locator('#frame-text').boundingBox())!
    await page.mouse.move(box.x + 4, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 10 })
    await page.mouse.up()
    const menu = frame.locator('[data-ann-ui="selection-menu"]')
    await expect(menu).toBeVisible()
    await expect(menu.locator('.ann-menu-action')).toHaveCount(1)
    await expect(menu.locator('.ann-menu-clip')).toBeVisible()
    await expect(menu.locator('.ann-menu-shot')).toHaveCount(0)
  })

  test('the shortcuts start one session, in the top frame, and Esc ends it (D-29)', async ({ page }) => {
    await page.goto('http://localhost:8173/iframe-host.html')
    const frame = page.frameLocator('iframe[name="same"]')
    await expect(frame.locator('#frame-text')).toBeVisible()
    // let the content script of the child frame come up too: a broadcast would reach it
    await page.waitForTimeout(800)

    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(1)
    await expect(frame.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    await triggerBlockMode(page)
    await expect(page.locator('.ann-block-mode-status')).toHaveCount(1)
    await expect(frame.locator('.ann-block-mode-status')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.ann-block-mode-status')).toHaveCount(0)
  })
})
