import { test, expect } from './fixtures'
import { clearLibrary, getCapturePageUrl, getEntries, getSettings, hoverForCapsule, triggerBlockMode, waitForClipToast } from './helpers'

test.describe('block clip (capture.md §6.2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('hovering a paragraph clips its whole section with the heading and list', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const capsule = await hoverForCapsule(page, '[data-testid="section-body"]')
    await expect(capsule.getByRole('button', { name: '剪藏' })).toBeVisible()

    await capsule.getByRole('button', { name: '剪藏' }).click()
    await expect(page.locator('[data-ann-ui="clip-toast"]')).toBeVisible()

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.type).toBe('clip')
    expect(entry.content).toContain('## Exponential backoff')
    expect(entry.content).toContain('- Compute the delay from the attempt number')
    // the share bar is page chrome and never survives the conversion
    expect(entry.content).not.toContain('Share')
    // section blocks take the page URL plus the heading anchor
    expect(entry.sourceUrl).toContain('#exponential-backoff')
    // block clips carry no context
    expect(entry.context).toBeUndefined()
  })

  test('上一级 climbs to the article and clips it whole', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const capsule = await hoverForCapsule(page, '[data-testid="section-body"]')
    await capsule.getByRole('button', { name: /上一级|⌃/ }).click()

    await page.locator('[data-ann-ui="block-capsule"]').getByRole('button', { name: '剪藏' }).click()
    await expect(page.locator('[data-ann-ui="clip-toast"]')).toBeVisible()

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]!.content).toContain('# Backoff and retry')
    expect(entries[0]!.content).toContain('Timeline')
  })

  test('the capsule never covers the code block’s own copy button', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const capsule = await hoverForCapsule(page, '[data-testid="code-card"] pre')
    const capsuleBox = await capsule.boundingBox()
    const copyBox = await page.locator('.copy-btn').boundingBox()
    expect(capsuleBox).toBeTruthy()
    expect(copyBox).toBeTruthy()
    const overlap = !(
      capsuleBox!.x + capsuleBox!.width < copyBox!.x ||
      copyBox!.x + copyBox!.width < capsuleBox!.x ||
      capsuleBox!.y + capsuleBox!.height < copyBox!.y ||
      copyBox!.y + copyBox!.height < capsuleBox!.y
    )
    expect(overlap).toBe(false)
  })

  test('an X post clips with its own status permalink', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const capsule = await hoverForCapsule(page, '[data-testid="tweet"] p')
    await capsule.getByRole('button', { name: '剪藏' }).click()
    await expect(page.locator('[data-ann-ui="clip-toast"]')).toBeVisible()

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]!.sourceUrl).toBe('http://localhost:8173/status/1748113923456')
    expect(entries[0]!.content).toContain('@sre_notes')
  })

  test('block mode: keyboard navigation clips with Enter', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    await triggerBlockMode(page)
    await expect(page.locator('[data-ann-ui="block-mode-overlay"]')).toBeVisible()

    // the overlay swallows pointer events by design (links do not answer), so
    // the mouse moves over coordinates; wait until the mode actually holds a
    // target (the outline paints) before pressing Enter
    const box = (await page.locator('[data-testid="section-body"]').boundingBox())!
    const outline = page.locator('[data-ann-ui="block-outline"]')
    const deadline = Date.now() + 6000
    while (Date.now() < deadline) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      try {
        await outline.waitFor({ state: 'visible', timeout: 800 })
        break
      } catch {
        /* move again */
      }
    }
    await expect(outline).toBeVisible()
    await page.keyboard.press('Enter')
    await waitForClipToast(page)

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]!.content).toContain('## Exponential backoff')
  })

  test('“在此网站停用” records the host and the capsule stops appearing', async ({ page }) => {
    test.slow()
    await page.goto(getCapturePageUrl())
    const capsule = await hoverForCapsule(page, '[data-testid="section-body"]')
    await capsule.getByRole('button', { name: '更多' }).click()
    await page.locator('[data-ann-ui="block-more"]').getByRole('button', { name: '在此网站停用' }).click()

    await expect
      .poll(async () => (await getSettings(page.context())) as { blockDisabledSites?: string[] }, { timeout: 20_000 })
      .toMatchObject({ blockDisabledSites: expect.arrayContaining(['localhost']) })

    await page.waitForTimeout(800)
    await expect(page.locator('[data-ann-ui="block-capsule"]')).toHaveCount(0)
  })
})
