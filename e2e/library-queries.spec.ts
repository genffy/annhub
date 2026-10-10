import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getEntries, updateEntry } from './helpers'

/**
 * What the library asks and reports when the user searches and filters (search.md §6, metrics.md §9):
 * one query and one `library.queried` event per settled input, buckets rather than numbers, and the same
 * filters in the highlights view as in the lists (extension.md §2.3, US-LIB-01).
 */

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
    await expect(library.locator('.row')).toHaveCount(2)
    expect(await metricsOf(context, 'library.queried')).toEqual({}) // opening the page is not a query

    await library.locator('.search').pressSequentially('jitter', { delay: 30 })
    await expect(library.locator('.row')).toHaveCount(1)
    expect(await worker.evaluate(() => (globalThis as unknown as { __searches?: number }).__searches)).toBe(1)
    await expect.poll(() => metricsOf(context, 'library.queried')).toEqual({ 'filters=0|has_text=true|results=1-2': 1 })

    // a source filter is one filter, and the words typed before it are no longer a "query" of their own
    await library.locator('.search').fill('')
    await expect(library.locator('.row')).toHaveCount(2)
    await library.locator('select[aria-label*="来源"]').selectOption('ent_one.example.com')
    await expect(library.locator('.row')).toHaveCount(1)
    await expect.poll(async () => (await metricsOf(context, 'library.queried'))['filters=1-2|has_text=false|results=1-2']).toBe(1)
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

    await library.locator('select[aria-label*="属性"]').first().selectOption('project')
    await library.locator('input[aria-label="值"], input.filter-value').first().fill('apollo')
    await expect(library.locator('.hl-group')).toHaveCount(1)
    await expect(library.locator('.hl-quote')).toHaveText('Alpha')
    expect(library.url()).toContain('prop=project')

    await library.reload()
    await expect(library.locator('.hl-group')).toHaveCount(1)
    await expect(library.locator('.hl-quote')).toHaveText('Alpha')
    await library.close()
  })

  test('editing an existing custom list property reports its real scope and type', async ({ page, context, extensionId }) => {
    await saveClip(page, extensionId, 'ent_props', 'A clip that carries a reviewers list.')
    await updateEntry(context, extensionId, 'ent_props', {
      properties: { set: { reviewers: ['ada'] }, newDefinitions: [{ name: 'reviewers', type: 'list', builtin: false, presets: [] }] },
    })

    const library = await context.newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    const row = library.locator('.drawer .prop-row', { has: library.locator('.prop-name', { hasText: 'reviewers' }) })
    await row.locator('input[type="text"]').fill('grace')
    await row.locator('input[type="text"]').press('Enter')
    await expect.poll(async () => (await getEntries(context)).find(entry => entry.id === 'ent_props')?.properties.reviewers).toEqual(['ada', 'grace'])
    await expect.poll(() => metricsOf(context, 'entry.property_edited')).toEqual({ 'property_type=list|scope=custom': 1 })
    await library.close()
  })
})
