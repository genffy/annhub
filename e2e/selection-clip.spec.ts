import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getEntries, getCapturePageUrl, selectText, selectUntilMenu, stopServiceWorker, waitForClipToast } from './helpers'

test.describe('selection clip (capture.md §6.1, extension.md §2.1)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('the menu offers exactly clip and screenshot, in that order, and clips in one click', async ({ page }) => {
    test.slow()
    await page.goto(`${getCapturePageUrl()}?token=abc&utm_source=rss`)
    const menu = await selectUntilMenu(page, '#intro-p')

    const actions = menu.locator('.ann-menu-action')
    await expect(actions).toHaveCount(2)
    await expect(actions.nth(0)).toHaveText(/剪藏/)
    await expect(actions.nth(1)).toHaveText(/截图/)

    await actions.nth(0).click()
    const toast = await waitForClipToast(page)
    await expect(toast).toContainText('已剪藏')
    await expect(toast.getByRole('button', { name: '撤销' })).toBeVisible()
    await expect(toast.getByRole('button', { name: '编辑' })).toBeVisible()

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.type).toBe('clip')
    // markdown conversion kept emphasis and resolved the link absolutely
    expect(entry.content).toContain('**base × 2^n**')
    expect(entry.content).toContain('https://engineering.example.com/jitter')
    expect(entry.content).toContain('random factor between 0 and 1')
    // context contains the selection's sentence
    expect(entry.context).toContain('saturated')
    // Q-13: token-shaped query params never survive the save
    expect(entry.sourceUrl).not.toContain('token=')
    expect(entry.sourceUrl).toContain('utm_source=rss')
    // type presets attached the page title
    expect(entry.properties['title']).toBe('Backoff and retry — capture fixture')
  })

  test('undo deletes the entry that was just saved', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    const toast = await waitForClipToast(page)
    await toast.getByRole('button', { name: '撤销' }).click()
    await expect(page.locator('[data-ann-ui="clip-toast"] .ann-clip-toast-undone')).toBeVisible()
    await expect.poll(() => getEntries(page.context())).toHaveLength(0)
    const sw = await ensureServiceWorker(page.context())
    await expect
      .poll(() =>
        sw.evaluate(async () => {
          const metrics = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
          return Object.values(metrics?.['capture.undone'] ?? {})
            .flatMap(day => Object.keys(day.byProps))
            .some(key => key.includes('type=clip') && key.includes('via=menu'))
        }),
      )
      .toBe(true)
  })

  test('the toast’s undo and edit are real targets, and the quick edit shows the title from its start', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    // a title long enough that its end would scroll the start out of the box
    await page.evaluate(() => {
      document.title = 'Why retries need jitter and a budget before the outage spreads — engineering.example.com'
    })
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    const toast = await waitForClipToast(page)

    const buttons = await toast.locator('button').evaluateAll(buttons =>
      buttons.map(button => {
        const box = button.getBoundingClientRect()
        return { name: button.textContent?.trim(), height: box.height, rightOfCard: Math.round(box.right) }
      }),
    )
    expect(buttons.map(button => button.name)).toEqual(['撤销', '编辑'])
    for (const button of buttons) expect(button.height, `${button.name} is a 24px target`).toBeGreaterThanOrEqual(24)

    await toast.getByRole('button', { name: '编辑' }).click()
    const bubble = page.locator('[data-ann-ui="clip-edit"]')
    await expect(bubble).toBeVisible()
    const title = bubble.locator('input').nth(0)
    await expect(title).toBeFocused()
    expect(await title.evaluate(input => input.scrollLeft), 'the title box shows its beginning').toBe(0)
    await bubble.getByRole('button', { name: '完成' }).click()
    await expect(bubble).not.toBeVisible()
  })

  test('the quick edit bubble edits title, tags and note on the saved entry', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    const toast = await waitForClipToast(page)
    await toast.getByRole('button', { name: '编辑' }).click()

    const bubble = page.locator('[data-ann-ui="clip-edit"]')
    await expect(bubble).toBeVisible()
    await bubble.locator('input').nth(1).fill('retry, backoff')
    await bubble.locator('input').nth(2).fill('对照复盘文档')
    await bubble.getByRole('button', { name: '完成' }).click()
    await expect(bubble).not.toBeVisible()

    await expect
      .poll(() => getEntries(page.context()), { timeout: 15_000 })
      .toMatchObject([
        expect.objectContaining({
          type: 'clip',
          note: '对照复盘文档',
          properties: expect.objectContaining({ tags: ['retry', 'backoff'] }),
        }),
      ])
    // the tags are a property edit like one in the drawer (metrics.md §9, M-20); the untouched title is not sent, so not counted
    const sw = await ensureServiceWorker(page.context())
    await expect
      .poll(() =>
        sw.evaluate(async () => {
          const metrics = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
          const merged: Record<string, number> = {}
          for (const day of Object.values(metrics?.['entry.property_edited'] ?? {}))
            for (const [key, count] of Object.entries(day.byProps)) merged[key] = (merged[key] ?? 0) + count
          return merged
        }),
      )
      .toEqual({ 'property_type=list|scope=builtin': 1 })
  })

  test('a real triple-click keeps the context to that paragraph alone (RV-CAP-07)', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    // Chrome ends a triple-click selection at the very start of the next block
    // at the start of the line: the middle of this paragraph is a link, and a triple-click on it would follow it
    await page.locator('#intro-p').click({ clickCount: 3, position: { x: 24, y: 10 } })
    const menu = page.locator('[data-ann-ui="selection-menu"]')
    await expect(menu).toBeVisible({ timeout: 8_000 })
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)
    const entry = (await getEntries(page.context()))[0]!
    const paragraph = (await page.locator('#intro-p').innerText()).replace(/\s+/g, ' ').trim()
    expect(entry.context?.replace(/\s+/g, ' ').trim()).toBe(paragraph)
    // nothing of the share bar or the next section came along
    expect(entry.context).not.toContain('Share')
    expect(entry.context).not.toContain('Exponential backoff')
  })

  test('the quick edit bubble still saves after the service worker was recycled (RV-BG-02)', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    const toast = await waitForClipToast(page)
    await toast.getByRole('button', { name: '编辑' }).click()
    const bubble = page.locator('[data-ann-ui="clip-edit"]')
    await expect(bubble).toBeVisible()

    // MV3 recycles the worker after ~30 s idle — long before a note is typed
    await stopServiceWorker(page.context(), page)
    await bubble.locator('input').nth(2).fill('note typed after the restart')
    await bubble.getByRole('button', { name: '完成' }).click()
    await expect(bubble).not.toBeVisible()
    await expect.poll(async () => (await getEntries(page.context()))[0]?.note, { timeout: 15_000 }).toBe('note typed after the restart')
  })

  test('quick edit reports tags beyond the length and count limits (RV-CAP-03)', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    const toast = await waitForClipToast(page)
    await toast.getByRole('button', { name: '编辑' }).click()
    const bubble = page.locator('[data-ann-ui="clip-edit"]')
    const tags = bubble.locator('input').nth(1)
    await tags.fill('x'.repeat(33))
    await bubble.getByRole('button', { name: '完成' }).click()
    await expect(bubble.locator('.ann-clip-edit-error')).toContainText('32')
    await expect(bubble).toBeVisible()
    await tags.fill(Array.from({ length: 21 }, (_, i) => `tag${i}`).join(', '))
    await bubble.getByRole('button', { name: '完成' }).click()
    await expect(bubble.locator('.ann-clip-edit-error')).toContainText('20')
    await expect(bubble).toBeVisible()
    await page.close()
  })

  test('capture duration runs from the user trigger to the committed write, in fine buckets (RV-CAP-10, metrics.md §9)', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sample.html`)
    const save = (id: string, startedAt: number) =>
      page.evaluate(
        payload =>
          chrome.runtime.sendMessage({
            type: 'SAVE_CLIP',
            draft: {
              id: payload.id,
              content: 'A saved clip with enough text.',
              sourceUrl: 'https://example.com/duration',
              properties: { title: 'Duration check' },
              via: 'menu',
              startedAt: payload.startedAt,
            },
          }),
        { id, startedAt },
      )
    // triggered 20 s ago: the whole wait counts, and lands in the slowest bucket
    expect((await save('ent_duration_slow', Date.now() - 20_000)).success).toBe(true)
    // triggered just now: a local write, in one of the fast buckets
    expect((await save('ent_duration_fast', Date.now())).success).toBe(true)
    const durations = () =>
      page.evaluate(async () => {
        const metrics = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
        return Object.values(metrics?.['capture.saved'] ?? {}).flatMap(day => Object.keys(day.byProps).map(key => /duration=([^|]+)/.exec(key)?.[1]))
      })
    await expect.poll(durations).toContain('>=5s')
    await expect.poll(async () => (await durations()).some(bucket => bucket === '<150ms' || bucket === '150-300ms' || bucket === '300-600ms')).toBe(true)
  })

  test('the menu hugs the selection inside a narrow column, including after that column scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:8173/columns.html')
    await page.locator('#tweet-text').evaluate(element => element.scrollIntoView({ block: 'center' }))
    const scrolled = await page.evaluate(() => ({ column: document.querySelector('#column')!.scrollTop, window: window.scrollY }))
    expect(scrolled.column).toBeGreaterThan(400)
    expect(scrolled.window).toBe(0)

    const hugs = async (selector: string) => {
      const menu = await selectUntilMenu(page, selector)
      await page.waitForTimeout(150)
      const boxes = await page.evaluate(sel => {
        const menuBox = document.querySelector('[data-ann-ui="selection-menu"]')!.getBoundingClientRect()
        const textBox = document.querySelector(sel)!.getBoundingClientRect()
        const columnBox = document.querySelector('#column')!.getBoundingClientRect()
        const sideBox = document.querySelector('#sidebar')!.getBoundingClientRect()
        return { menu: menuBox, text: textBox, column: columnBox, side: sideBox }
      }, selector)
      expect(boxes.menu.left, selector).toBeLessThan(boxes.text.right)
      expect(boxes.menu.right, selector).toBeGreaterThan(boxes.text.left)
      const above = boxes.menu.bottom <= boxes.text.top + 8
      const below = boxes.menu.top >= boxes.text.bottom - 8
      expect(above || below, selector).toBe(true)
      expect(boxes.menu.left, selector).toBeGreaterThanOrEqual(boxes.column.left - 1)
      expect(boxes.menu.right, selector).toBeLessThanOrEqual(boxes.column.right + 1)
      expect(boxes.menu.right, selector).toBeLessThanOrEqual(boxes.side.left + 1)
      await menu.locator('.ann-menu-action').first().click({ trial: true })
    }

    await hugs('#tweet-text')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="selection-menu"]')).toHaveCount(0)
    await hugs('#end-line')
  })

  test('a whitespace-only selection never shows the menu', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    await page.waitForLoadState('networkidle')
    await selectText(page, '#blank-target')
    await page.waitForTimeout(600)
    await expect(page.locator('[data-ann-ui="selection-menu"]')).toHaveCount(0)
  })
})
