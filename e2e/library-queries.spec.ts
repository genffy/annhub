import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getEntries, sendMessage, updateEntry } from './helpers'

/**
 * What the library asks and reports when the user searches and filters (search.md §6, metrics.md §9):
 * one query and one `library.queried` event per settled input, buckets rather than numbers, and the same
 * filters in the highlights view as in the lists (extension.md §2.3, US-LIB-01).
 */

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qMwAAAAASUVORK5CYII='

async function saveClip(page: import('@playwright/test').Page, extensionId: string, id: string, content: string, properties: Record<string, unknown> = {}): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/sample.html`)
  const saved = await page.evaluate(
    payload =>
      chrome.runtime.sendMessage({
        type: 'SAVE_CLIP',
        requestId: `r-${payload.id}`,
        draft: {
          id: payload.id,
          content: payload.content,
          sourceUrl: `https://${payload.id}.example.com/page`,
          properties: { title: payload.id, ...payload.properties },
          via: 'menu',
        },
      }),
    { id, content, properties },
  )
  expect(saved.success).toBe(true)
}

async function metricsOf(context: import('@playwright/test').BrowserContext, event: string): Promise<Record<string, number>> {
  const worker = await ensureServiceWorker(context)
  return worker.evaluate(async name => {
    const stored = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>> | undefined
    const merged: Record<string, number> = {}
    for (const day of Object.values(stored?.[name] ?? {})) for (const [key, count] of Object.entries(day.byProps)) merged[key] = (merged[key] ?? 0) + count
    return merged
  }, event)
}

test.describe('searching and filtering in the library', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('typing a word asks once and reports one query, with the search words kept out of the filters', async ({ page, context, extensionId }) => {
    await saveClip(page, extensionId, 'ent_one', 'Retries can amplify an outage.')
    await saveClip(page, extensionId, 'ent_two', 'Backoff with jitter spreads the load.')

    const worker = await ensureServiceWorker(context)
    await worker.evaluate(() => {
      const counter = globalThis as unknown as { __searches?: number }
      counter.__searches = 0
      chrome.runtime.onMessage.addListener(message => {
        if (message?.type === 'QUERY_ENTRIES' && message.query?.search) counter.__searches = (counter.__searches ?? 0) + 1
        return false
      })
    })

    const library = await context.newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await expect(library.locator('.entry-card')).toHaveCount(2)
    expect(await metricsOf(context, 'library.queried')).toEqual({}) // opening the page is not a query

    await library.locator('.search').pressSequentially('jitter', { delay: 30 })
    await expect(library.locator('.entry-card')).toHaveCount(1)
    expect(await worker.evaluate(() => (globalThis as unknown as { __searches?: number }).__searches)).toBe(1)
    await expect.poll(() => metricsOf(context, 'library.queried')).toEqual({ 'filters=0|has_text=true|results=1-2': 1 })

    // a source filter is one filter, and the words typed before it are no longer a "query" of their own
    await library.locator('.search').fill('')
    await expect(library.locator('.entry-card')).toHaveCount(2)
    await library.getByRole('button', { name: '来源', exact: true }).click()
    await library.getByRole('option', { name: 'ent_one.example.com', exact: true }).click()
    await library.keyboard.press('Escape')
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await expect.poll(async () => (await metricsOf(context, 'library.queried'))['filters=1-2|has_text=false|results=1-2']).toBe(1)
    await library.close()
  })

  test('the type filter is the "all" view\'s alone: it narrows that list like the type lists do and lives in the URL (extension.md §2.3)', async ({
    page,
    context,
    extensionId,
  }) => {
    await saveClip(page, extensionId, 'ent_type_one', 'Retries can amplify an outage.')
    await saveClip(page, extensionId, 'ent_type_two', 'Backoff with jitter spreads the load.')
    await sendMessage(page, {
      type: 'SAVE_SCREENSHOT',
      requestId: 'r-type-shot',
      data: { id: 'ent_type_shot', dataUrl: PNG_1PX, width: 1, height: 1, sourceUrl: 'https://sre.example.org/latency', title: 'p99 latency', via: 'shortcut' },
    })

    const library = await context.newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await expect(library.locator('.entry-card')).toHaveCount(3)
    const type = library.getByRole('button', { name: '类型', exact: true })
    const typeChip = () => library.locator('.filter-chip-on')
    expect(await metricsOf(context, 'library.queried')).toEqual({}) // opening the page is not a query

    await type.click()
    const typePopover = library.getByRole('dialog', { name: '类型' })
    await expect(typePopover).toBeVisible()
    // the popover opens with the keyboard in it, and its two options are the two entry types
    await expect(typePopover.getByRole('option')).toHaveText(['剪藏', '截图'])
    await typePopover.getByRole('option', { name: '剪藏' }).click()
    await expect(typePopover).toHaveCount(0) // one choice closes the popover
    await expect(type).toBeFocused() // the keyboard goes back to what opened it
    await expect(library.locator('.entry-card')).toHaveCount(2)
    await expect(library.locator('.entry-card[data-type="screenshot"]')).toHaveCount(0)
    await expect(library.getByTestId('list-count')).toHaveText('共 2 条')
    await expect(typeChip()).toHaveText(['类型：剪藏'])
    expect(library.url()).toContain('type=clip')
    await expect.poll(() => metricsOf(context, 'library.queried')).toEqual({ 'filters=1-2|has_text=false|results=1-2': 1 }) // the type is one filter

    await type.click()
    await typePopover.getByRole('option', { name: '截图' }).click()
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await expect(library.locator('.entry-card[data-type="screenshot"]')).toHaveCount(1)

    await library.reload()
    await expect(typeChip()).toHaveText(['类型：截图'])
    await expect(library.locator('.entry-card')).toHaveCount(1)

    // the chip's body reopens the dimension's popover; picking the chosen option again clears it
    await typeChip().getByRole('button', { name: '类型：截图', exact: true }).click()
    await typePopover.getByRole('option', { name: '截图' }).click()
    await expect(typeChip()).toHaveCount(0)
    await expect(library.locator('.entry-card')).toHaveCount(3)

    await type.click()
    await typePopover.getByRole('option', { name: '截图' }).click()
    await expect(library.locator('.entry-card')).toHaveCount(1)

    // the other views are one type already: no type filter there, and the nav does not carry the choice over
    for (const view of ['clips', 'screenshots', 'highlights']) {
      await library.getByRole('link', { name: { clips: '剪藏', screenshots: '截图', highlights: '高亮' }[view]!, exact: true }).click()
      await expect(library.getByRole('heading', { level: 1 })).toHaveText({ clips: '剪藏', screenshots: '截图', highlights: '高亮' }[view]!)
      await expect(library.getByRole('button', { name: '类型', exact: true }), view).toHaveCount(0)
      expect(library.url(), view).not.toContain('type=')
    }
    await library.getByRole('link', { name: '全部', exact: true }).click()
    await expect(typeChip()).toHaveCount(0)
    await expect(library.locator('.entry-card')).toHaveCount(3)

    // with the only screenshot gone, the filter has nothing to show: that reads as "no results" and offers the way out
    await sendMessage(page, { type: 'DELETE_ENTRY', id: 'ent_type_shot' })
    await library.goto(`chrome-extension://${extensionId}/library.html#/all?type=screenshot`)
    await library.reload()
    await expect(library.locator('.empty')).toContainText('没有匹配的结果')
    await library.locator('.empty').getByRole('button', { name: '清除筛选' }).click()
    await expect(typeChip()).toHaveCount(0)
    await expect(library.locator('.entry-card')).toHaveCount(2)
    await library.close()
  })

  test('the highlights view filters by property like the lists do, and the filter survives a reload', async ({ page, context, extensionId }) => {
    await saveClip(page, extensionId, 'ent_alpha', 'Alpha beta gamma delta epsilon zeta.')
    await saveClip(page, extensionId, 'ent_omega', 'Omega psi chi phi upsilon tau.')
    const added = await page.evaluate(() =>
      Promise.all([
        chrome.runtime.sendMessage({ type: 'ADD_HIGHLIGHT', id: 'ent_alpha', highlight: { id: 'hl_a', start: 0, end: 5, quote: 'Alpha', color: 'yellow', createdAt: Date.now() } }),
        chrome.runtime.sendMessage({ type: 'ADD_HIGHLIGHT', id: 'ent_omega', highlight: { id: 'hl_o', start: 0, end: 5, quote: 'Omega', color: 'blue', createdAt: Date.now() } }),
        chrome.runtime.sendMessage({
          type: 'UPDATE_ENTRY',
          id: 'ent_alpha',
          patch: { properties: { set: { project: 'apollo' }, newDefinitions: [{ name: 'project', type: 'text', builtin: false, presets: [] }] } },
        }),
      ]),
    )
    expect(added.every(response => response.success)).toBe(true)

    const library = await context.newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/highlights`)
    await expect(library.locator('.hl-group')).toHaveCount(2)

    // the property popover: pick the property first, then the operator's value (search.md §3)
    await library.getByRole('button', { name: '属性', exact: true }).click()
    const propPopover = library.getByRole('dialog', { name: '属性' })
    await propPopover.getByRole('option').filter({ hasText: 'project' }).click()
    await propPopover.locator('input[aria-label="值"]').fill('apollo')
    await library.keyboard.press('Escape')
    await expect(library.locator('.hl-group')).toHaveCount(1)
    await expect(library.locator('.hl-item-quote').first()).toHaveText('Alpha')
    expect(library.url()).toContain('prop=project')

    await library.reload()
    await expect(library.locator('.hl-group')).toHaveCount(1)
    await expect(library.locator('.hl-item-quote').first()).toHaveText('Alpha')
    await library.close()
  })

  test('editing an existing custom list property reports its real scope and type', async ({ page, context, extensionId }) => {
    await saveClip(page, extensionId, 'ent_props', 'A clip that carries a reviewers list.')
    await updateEntry(context, extensionId, 'ent_props', {
      properties: { set: { reviewers: ['ada'] }, newDefinitions: [{ name: 'reviewers', type: 'list', builtin: false, presets: [] }] },
    })
    // the worker counts every saved property write, whichever page sent it: the seeding above is one too
    await expect.poll(() => metricsOf(context, 'entry.property_edited')).toEqual({ 'property_type=list|scope=custom': 1 })

    const library = await context.newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.entry-card').first().click()
    const row = library.locator('.drawer .prop-row', { has: library.locator('.prop-name', { hasText: 'reviewers' }) })
    await row.locator('input[type="text"]').fill('grace')
    await row.locator('input[type="text"]').press('Enter')
    await expect.poll(async () => (await getEntries(context)).find(entry => entry.id === 'ent_props')?.properties.reviewers).toEqual(['ada', 'grace'])
    // the drawer's edit adds exactly one: the page does not record it a second time
    await expect.poll(() => metricsOf(context, 'entry.property_edited')).toEqual({ 'property_type=list|scope=custom': 2 })
    await library.close()
  })

  test('several sources and tags of one dimension OR together, across dimensions AND (search.md §3)', async ({ page, context, extensionId }) => {
    await saveClip(page, extensionId, 'ent_or_one', 'Retries can amplify an outage.', { tags: ['reliability'] })
    await saveClip(page, extensionId, 'ent_or_two', 'Backoff with jitter spreads the load.', { tags: ['retry'] })
    await saveClip(page, extensionId, 'ent_or_three', 'Idempotency keys belong on the write path.', { tags: ['reliability', 'payments'] })

    const library = await context.newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await expect(library.locator('.entry-card')).toHaveCount(3)

    // the popover stays open while a multi-select dimension collects values
    await library.getByRole('button', { name: '来源', exact: true }).click()
    const host = library.getByRole('dialog', { name: '来源' })
    await host.getByRole('option', { name: 'ent_or_one.example.com', exact: true }).click()
    await expect(library.locator('.entry-card')).toHaveCount(1)
    // a second source of the same dimension joins with OR, not AND, and both show as removable chips
    await host.getByRole('option', { name: 'ent_or_two.example.com', exact: true }).click()
    await library.keyboard.press('Escape')
    await expect(library.locator('.entry-card')).toHaveCount(2)
    await expect(library.locator('.filter-chip-on')).toHaveCount(2)
    expect(library.url()).toContain('host=ent_or_one.example.com')
    expect(library.url()).toContain('host=ent_or_two.example.com')
    await library.locator('.filter-chip-on', { hasText: 'ent_or_one.example.com' }).locator('.filter-chip-x').click()
    await expect(library.locator('.entry-card')).toHaveCount(1)

    // a tag of the same dimension ORs; the source dimension still ANDs with it
    await library.getByRole('button', { name: '标签', exact: true }).click()
    const tags = library.getByRole('dialog', { name: '标签' })
    await tags.getByRole('option', { name: 'reliability', exact: true }).click()
    await expect(library.locator('.entry-card')).toHaveCount(0) // the remaining source carries only "retry"
    await tags.getByRole('option', { name: 'retry', exact: true }).click()
    await library.keyboard.press('Escape')
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await library.close()
  })

  test('several property conditions AND together and survive a reload (search.md §3)', async ({ page, context, extensionId }) => {
    await saveClip(page, extensionId, 'ent_and_one', 'Alpha beta gamma.')
    await saveClip(page, extensionId, 'ent_and_two', 'Omega psi chi.')
    const definitions = [
      { name: 'project', type: 'text', builtin: false, presets: [] },
      { name: 'rating', type: 'number', builtin: false, presets: [] },
    ]
    const added = await page.evaluate(
      defs =>
        Promise.all([
          chrome.runtime.sendMessage({
            type: 'UPDATE_ENTRY',
            id: 'ent_and_one',
            patch: { properties: { set: { project: 'apollo', rating: 5 }, newDefinitions: defs } },
          }),
          chrome.runtime.sendMessage({
            type: 'UPDATE_ENTRY',
            id: 'ent_and_two',
            patch: { properties: { set: { project: 'apollo', rating: 2 }, newDefinitions: defs } },
          }),
        ]),
      definitions,
    )
    expect(added.every(response => response.success)).toBe(true)

    const library = await context.newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.getByRole('button', { name: '属性', exact: true }).click()
    const prop = library.getByRole('dialog', { name: '属性' })
    await prop.getByRole('option').filter({ hasText: 'project' }).click()
    await prop.locator('input[aria-label="值"]').fill('apollo')
    await expect(library.locator('.entry-card')).toHaveCount(2)
    // the trigger always opens the picker again, so a second condition is another pick
    await library.keyboard.press('Escape')
    await library.getByRole('button', { name: '属性', exact: true }).click()
    await prop.getByRole('option').filter({ hasText: 'rating' }).click()
    await prop.locator('input[aria-label="值"]').fill('5')
    await library.keyboard.press('Escape')
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await expect(library.locator('.filter-chip-on').filter({ hasText: 'project' })).toHaveCount(1)
    await expect(library.locator('.filter-chip-on').filter({ hasText: 'rating' })).toHaveCount(1)
    // both conditions live in the URL, index-aligned, and come back after a reload
    expect(library.url()).toContain('prop=project')
    expect(library.url()).toContain('prop=rating')
    await library.reload()
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await library.close()
  })

  test('opening the reading view from a highlight counts as reopening the entry (metrics.md §9)', async ({ page, context, extensionId }) => {
    await saveClip(page, extensionId, 'ent_hl_read', 'Backoff with jitter spreads the load.')
    const highlighted = await page.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'ADD_HIGHLIGHT',
        id: 'ent_hl_read',
        highlight: { id: 'hl_r', start: 0, end: 7, quote: 'Backoff', color: 'yellow', createdAt: Date.now() },
      }),
    )
    expect(highlighted.success).toBe(true)

    const library = await context.newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/highlights`)
    await expect(library.locator('.hl-item')).toHaveCount(1)
    expect(await metricsOf(context, 'entry.reopened')).toEqual({})
    await library.locator('.hl-item').click()
    await expect(library.locator('.reading')).toBeVisible()
    await expect.poll(() => metricsOf(context, 'entry.reopened')).toEqual({ 'type=clip': 1 })
    await library.close()
  })
})
