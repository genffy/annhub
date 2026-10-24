import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getCapturePageUrl, getEntries, getSettings, hoverForCapsule, triggerBlockMode, waitForClipToast } from './helpers'

test.describe('block clip (capture.md §6.2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('keyboard block mode starts at focus and Tab visits peer units in document order (RV-CAP-08)', async ({ page }) => {
    await page.goto('http://localhost:8173/keyboard-blocks.html')
    await page.locator('#unit-two').focus()
    await triggerBlockMode(page)
    const status = page.locator('.ann-block-mode-status')
    await expect(status).toHaveAttribute('role', 'status')
    await expect(status).toContainText('Second unit')
    await page.keyboard.press('Tab')
    await expect(status).toContainText('Third unit')
    await page.keyboard.press('Tab')
    await expect(status).toContainText('First unit')
    await page.keyboard.press('Shift+Tab')
    await expect(status).toContainText('Third unit')
    await page.keyboard.press('Escape')
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

  test('the capsule stays inside a timeline post and off the sidebar', async ({ page }) => {
    // Browser zoom keeps the capsule and the post in the same CSS pixels, so 110%
    // does not change this geometry. A 164px capsule (the width whose half is the
    // reported 82px) is covered in the unit test. The narrower viewport is the
    // layout a 1280px window has at 110% zoom.
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

    const expectInside = async (hoverSelector: string, boundsSelector: string) => {
      // A capsule already on screen satisfies hoverForCapsule immediately, before the
      // 400ms dwell repaints it for the new target. Rest, then measure.
      await page.locator(hoverSelector).hover()
      await page.waitForTimeout(500)
      const capsule = page.locator('[data-ann-ui="block-capsule"]')
      await expect(capsule).toBeVisible()
      const capsuleBox = (await capsule.boundingBox())!
      const bounds = (await page.locator(boundsSelector).boundingBox())!
      const sidebar = (await page.locator('#sidebar').boundingBox())!
      const caret = (await page.locator('#caret').boundingBox())!
      const overflow = capsuleBox.x + capsuleBox.width - (bounds.x + bounds.width)
      expect(overflow).toBeLessThanOrEqual(1)
      expect(capsuleBox.x).toBeGreaterThanOrEqual(bounds.x - 1)
      expect(overlaps(capsuleBox, sidebar)).toBe(false)
      expect(overlaps(capsuleBox, caret)).toBe(false)
    }

    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1164, height: 727 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('http://localhost:8173/timeline.html')
      await expectInside('#body', '#post')
      await expectInside('#media', '#media')
    }
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

  test('closing the block entry from the capsule disables the global setting (RV-CAP-08)', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const capsule = await hoverForCapsule(page, '[data-testid="section-body"]')
    await capsule.getByRole('button', { name: '更多' }).click()
    await page.locator('[data-ann-ui="block-more"]').getByRole('button', { name: '关闭区块剪藏入口' }).click()
    await expect.poll(async () => (await getSettings(page.context())) as { blockEntryEnabled?: boolean }).toMatchObject({ blockEntryEnabled: false })
    await expect(page.locator('[data-ann-ui="block-capsule"]')).toHaveCount(0)
  })

  test('resting on six blocks asks for the settings once, not twice per rest (RV-CAP-08)', async ({ page, context }) => {
    test.slow()
    const worker = await ensureServiceWorker(context)
    await worker.evaluate(() => {
      const counter = globalThis as unknown as { __settingsAsked?: number }
      counter.__settingsAsked = 0
      chrome.runtime.onMessage.addListener(message => {
        if (message?.type === 'GET_SETTINGS') counter.__settingsAsked = (counter.__settingsAsked ?? 0) + 1
        return false
      })
    })
    await page.goto(getCapturePageUrl())
    for (const selector of [
      '[data-testid="section-body"]',
      '#intro-p',
      '[data-testid="code-card"]',
      '#exponential-backoff li:nth-child(1)',
      '#exponential-backoff li:nth-child(2)',
      '#the-code h2',
    ]) {
      await page.locator(selector).first().hover()
      await page.waitForTimeout(700)
    }
    const asked = await worker.evaluate(() => (globalThis as unknown as { __settingsAsked?: number }).__settingsAsked ?? 0)
    // the page script asks once when it first needs the answer and listens for changes after that
    expect(asked).toBeLessThanOrEqual(2)
  })

  test('Parent on a timeline climbs one post, and leave or Escape clears the outline (issue #107)', async ({ page }) => {
    await page.goto('http://localhost:8173/timeline.html')
    const heightOf = (selector: string) => page.locator(selector).evaluate(el => el.getBoundingClientRect().height)
    const columnHeight = await heightOf('#feed')
    expect(columnHeight).toBeGreaterThan(5000)

    const quoteCapsule = await hoverForCapsule(page, '#a-quote-p')
    const quoteHeight = await heightOf('[data-ann-ui="block-outline"]')
    expect(quoteHeight).toBeLessThan(400)
    await quoteCapsule.getByRole('button', { name: /上一级|⌃/ }).click()
    const postHeight = await heightOf('[data-ann-ui="block-outline"]')
    const tweetHeight = await heightOf('#a')
    expect(postHeight).toBeGreaterThan(quoteHeight)
    expect(Math.abs(postHeight - tweetHeight)).toBeLessThan(8)
    expect(postHeight).toBeLessThan(columnHeight / 4)

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="block-outline"]')).toHaveCount(0)
    await expect(page.locator('[data-ann-ui="block-capsule"]')).toHaveCount(0)

    const nested = await hoverForCapsule(page, '#b-inner-body')
    await nested.getByRole('button', { name: /上一级|⌃/ }).click()
    expect(Math.abs((await heightOf('[data-ann-ui="block-outline"]')) - (await heightOf('#b')))).toBeLessThan(8)
    await page.keyboard.press('Escape')

    const top = await hoverForCapsule(page, '#c-body')
    await expect(top.getByRole('button', { name: /上一级|⌃/ })).toBeDisabled()
    const rail = (await page.locator('#sidebar').boundingBox())!
    await page.mouse.move(rail.x + 24, rail.y + 40)
    await expect(page.locator('[data-ann-ui="block-outline"]')).toHaveCount(0)
  })
})
