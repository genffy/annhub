import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { getSettings, hoverForCapsule, selectUntilMenu, setSettings, triggerScreenshot } from './helpers'

/** A post whose avatar is pure red and whose name and handle sit on pure blue (`identity.html`). */
const IDENTITY_PAGE = 'http://localhost:8173/identity.html'

/** Pixels of the avatar's red and of the name's blue in the capture the preview shows: what anonymization left in. */
function identityLeft(page: Page): Promise<{ avatar: number; name: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-ann-ui="screenshot-preview"] canvas')!
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    let avatar = 0
    let name = 0
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!]
      if (r > 200 && g < 60 && b < 60) avatar++
      if (b > 200 && r < 60 && g < 60) name++
    }
    return { avatar, name }
  })
}

/** Drags a frame around the whole post and confirms it. */
async function shootPost(page: Page): Promise<void> {
  await triggerScreenshot(page)
  await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()
  const box = (await page.getByTestId('tweet').boundingBox())!
  await page.mouse.move(box.x - 8, box.y - 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 8, box.y + box.height + 8, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
}

test.describe('what anonymization covers (screenshot.md §3)', () => {
  // the tests below set one kind and then another, and rely on the first staying set
  test('settings patches add up, and nothing but the settings is stored', async ({ context }) => {
    await setSettings(context, { anonymizeNames: false })
    await setSettings(context, { anonymizeDefault: false })
    const settings = await getSettings(context)
    expect(settings).toMatchObject({ anonymizeNames: false, anonymizeDefault: false })
    expect(Object.keys(settings)).not.toContain('annhub.settings')
  })

  test('a region shot covers the avatar and leaves the name when names are unchecked', async ({ page }) => {
    await setSettings(page.context(), { anonymizeNames: false })
    await page.goto(IDENTITY_PAGE)
    await shootPost(page)
    const left = await identityLeft(page)
    expect(left.avatar, 'the avatar is covered').toBeLessThan(10)
    expect(left.name, 'the name and handle are in the picture').toBeGreaterThan(1000)
  })

  test('a region shot covers the name and leaves the avatar when avatars are unchecked', async ({ page }) => {
    await setSettings(page.context(), { anonymizeAvatars: false })
    await page.goto(IDENTITY_PAGE)
    await shootPost(page)
    const left = await identityLeft(page)
    expect(left.avatar, 'the avatar is in the picture').toBeGreaterThan(1000)
    expect(left.name, 'the name and handle are covered').toBeLessThan(10)
  })

  test('with anonymization off, only the kinds still checked are proposed as mosaic', async ({ page }) => {
    await setSettings(page.context(), { anonymizeDefault: false })
    await page.goto(IDENTITY_PAGE)
    await shootPost(page)
    await expect(page.locator('[data-ann-ui="mask-box"]'), 'the avatar and the name').toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    await setSettings(page.context(), { anonymizeDefault: false, anonymizeNames: false })
    await shootPost(page)
    await expect(page.locator('[data-ann-ui="mask-box"]'), 'the avatar alone').toHaveCount(1)
  })

  // the capsule's shot starts together with the session, before the settings arrive (真机走查复核)
  test("the block capsule's shot takes the default and the kinds from the settings", async ({ page }) => {
    await setSettings(page.context(), { anonymizeDefault: false })
    await page.goto(IDENTITY_PAGE)
    let capsule = await hoverForCapsule(page, '[data-testid="identity-body"]')
    await capsule.getByRole('button', { name: '截图' }).click()
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    let left = await identityLeft(page)
    expect(left.avatar, 'anonymization is off: the avatar is in the picture').toBeGreaterThan(1000)
    expect(left.name, 'anonymization is off: the name is in the picture').toBeGreaterThan(1000)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    await setSettings(page.context(), { anonymizeDefault: true, anonymizeAvatars: false })
    await page.mouse.move(0, 0)
    capsule = await hoverForCapsule(page, '[data-testid="identity-body"]')
    await capsule.getByRole('button', { name: '截图' }).click()
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    left = await identityLeft(page)
    expect(left.avatar, 'avatars are unchecked: the avatar is in the picture').toBeGreaterThan(1000)
    expect(left.name, 'the name and handle are covered').toBeLessThan(10)
  })

  test('A switches anonymization for a frame the selection menu hands over', async ({ page }) => {
    await page.goto(IDENTITY_PAGE)
    // the menu's frame is the selected text: the name and handle
    let menu = await selectUntilMenu(page, '[data-testid="identity-name"]')
    await menu.getByRole('menuitem', { name: '截图' }).click()
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    expect((await identityLeft(page)).name, 'anonymized by default').toBeLessThan(10)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    menu = await selectUntilMenu(page, '[data-testid="identity-name"]')
    await menu.getByRole('menuitem', { name: '截图' }).click()
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]'), 'the settings have arrived').toBeVisible()
    await page.keyboard.press('a')
    await expect(page.locator('.ann-shot-hint')).toContainText('匿名：关')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    expect((await identityLeft(page)).name, 'A turned anonymization off for this shot').toBeGreaterThan(300)
  })

  test('the settings page switches each kind on its own', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/library.html#/settings`)
    await expect(page.getByTestId('anonymize-avatars')).toBeChecked()
    await expect(page.getByTestId('anonymize-names')).toBeChecked()
    // a controlled box: it shows the stored value, so it changes once the save has gone through
    await page.getByTestId('anonymize-avatars').click()
    await expect(page.getByTestId('anonymize-avatars')).not.toBeChecked()
    await expect.poll(async () => (await getSettings(page.context())) as { anonymizeAvatars?: boolean }).toMatchObject({ anonymizeAvatars: false })

    await page.reload()
    await expect(page.getByTestId('anonymize-avatars')).not.toBeChecked()
    await expect(page.getByTestId('anonymize-names')).toBeChecked()
  })
})
