import { test, expect } from './fixtures'
import { clearLibrary, hoverForCapsule } from './helpers'

/**
 * What only a real browser does with the hover (capture.md §6.2 悬停入口, 标注怎样写):
 * it reports a leave when an element comes up under a pointer that has not moved, and it
 * lays out the label and the capsule the unit tests only stub.
 */
test.describe('hover geometry (capture.md §6.2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('a capsule that comes up under the resting pointer stays: that is no leave', async ({ page }) => {
    await page.goto('http://localhost:8173/hover-geometry.html')
    // the block is narrower than the capsule, so the capsule lands on the pointer
    const capsule = await hoverForCapsule(page, '#tiny')
    const box = (await page.locator('#tiny').boundingBox())!
    const capsuleBox = (await capsule.boundingBox())!
    const pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    expect(pointer.x).toBeGreaterThan(capsuleBox.x)
    expect(pointer.x).toBeLessThan(capsuleBox.x + capsuleBox.width)
    expect(pointer.y).toBeGreaterThan(capsuleBox.y)
    expect(pointer.y).toBeLessThan(capsuleBox.y + capsuleBox.height)
    // long past the 150ms a leave takes
    await page.waitForTimeout(900)
    await expect(capsule).toBeVisible()
    await expect(page.locator('[data-ann-ui="block-outline"]')).toBeVisible()
  })

  test('the label stays inside the window when the block starts just under its top edge', async ({ page }) => {
    await page.goto('http://localhost:8173/hover-geometry.html')
    await hoverForCapsule(page, '#first')
    const label = page.locator('[data-ann-ui="block-label"]')
    await expect(label).toContainText('段落')
    const box = (await label.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
  })

  test('a narrow block writes the kind alone, a wide one its words too', async ({ page }) => {
    await page.goto('http://localhost:8173/hover-geometry.html')
    const label = page.locator('[data-ann-ui="block-label"]')
    await hoverForCapsule(page, '#narrow')
    await expect(label).toHaveText('段落')
    await page.mouse.move(2, 2)
    await expect(label).toHaveCount(0)
    await hoverForCapsule(page, '#first')
    await expect(label).toContainText('段落 · ')
  })

  test('the label never runs into the capsule', async ({ page }) => {
    await page.goto('http://localhost:8173/hover-geometry.html')
    const capsule = await hoverForCapsule(page, '#narrow')
    const label = page.locator('[data-ann-ui="block-label"]')
    await expect(label).toBeVisible()
    const labelBox = (await label.boundingBox())!
    const capsuleBox = (await capsule.boundingBox())!
    const apart =
      labelBox.x + labelBox.width <= capsuleBox.x ||
      capsuleBox.x + capsuleBox.width <= labelBox.x ||
      labelBox.y + labelBox.height <= capsuleBox.y ||
      capsuleBox.y + capsuleBox.height <= labelBox.y
    expect(apart).toBe(true)
  })

  test('a code block counts the lines of its code, not the newline that ends them', async ({ page }) => {
    await page.goto('http://localhost:8173/hover-geometry.html')
    await hoverForCapsule(page, '#code')
    await expect(page.locator('[data-ann-ui="block-label"]')).toHaveText('代码块 · 4 行')
  })

  test('a section too short to be one is a block: its heading is the start', async ({ page }) => {
    await page.goto('http://localhost:8173/hover-geometry.html')
    await hoverForCapsule(page, '#short-h')
    const label = page.locator('[data-ann-ui="block-label"]')
    await expect(label).not.toContainText('一节')
    await page.mouse.move(2, 2)
    await expect(label).toHaveCount(0)
    // a real section, by contrast, is the heading's start
    await hoverForCapsule(page, '#full h2')
    await expect(label).toContainText('一节')
  })
})
