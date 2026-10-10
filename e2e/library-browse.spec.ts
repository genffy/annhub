import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getCapturePageUrl, getEntries, selectUntilMenu, stopServiceWorker, updateEntry, waitForClipToast } from './helpers'

/**
 * Browsing scale and freshness (RV-LIB-02, RV-LIB-03): every entry is
 * reachable through “显示更多”, the oldest entry's tag is a filter candidate,
 * and a drawer delete updates the list DOM, not just the database. The search
 * and filter bar belongs to the list views, and an empty view tells “nothing
 * here yet” from “nothing matches” (extension.md §2.3, §5).
 */

async function saveClips(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page, count: number, expectedTotal = count): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.goto(`${getCapturePageUrl()}?seed=${Date.now()}-${i}`)
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)
    await page.waitForTimeout(120)
  }
  expect(await getEntries(context)).toHaveLength(expectedTotal)
}

/**
 * The nav has its counts. The counts and the list answer arrive separately, so an empty state read before the
 * counts land can differ from the settled one; assert an empty state only after this.
 */
async function expectNavTotal(library: import('@playwright/test').Page, total: number): Promise<void> {
  await expect(library.locator('a[href="#/all"] .nav-count')).toHaveText(String(total))
}

/**
 * A library with the body sizes the review measured (RV-BG-04): 70% about 0.5 KB, 20% about 6 KB, 10% about
 * 50 KB — roughly 65 MB for 10,000 clips. Written straight into IndexedDB, so the derived search documents
 * do not exist yet; the first query builds them.
 */
async function seedRealisticLibrary(context: import('@playwright/test').BrowserContext, count = 10_000): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(
    total =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('annhub')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('entries', 'readwrite')
          const entries = tx.objectStore('entries')
          const small = 'retry '.repeat(85)
          const medium = 'backoff '.repeat(750)
          const large = 'jitter '.repeat(7_100)
          for (let i = 0; i < total; i++) {
            entries.put({
              id: `ent_perf_${String(i).padStart(5, '0')}`,
              type: 'clip',
              content: i % 10 === 0 ? large : i % 10 < 3 ? medium : small,
              sourceUrl: `https://host-${i % 40}.example.com/${i}`,
              sourceHost: `host-${i % 40}.example.com`,
              properties: { title: `Record ${i}`, tags: [i % 10 === 0 ? 'jitter' : 'retry'] },
              createdAt: i + 1,
              updatedAt: i + 1,
            })
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
    count,
  )
}

test.describe('library browsing (search.md §4, extension.md §2.3)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('an empty library opens its sample page without adding sample data (RV-LIB-12)', async ({ page, extensionId }) => {
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    const samplePage = library.context().waitForEvent('page')
    await library.getByTestId('guide-card').getByRole('button', { name: '打开示例页面' }).click()
    await expect(await samplePage).toHaveURL(new RegExp(`chrome-extension://${extensionId}/sample.html`))
    expect(await getEntries(library.context())).toHaveLength(0)
    await library.close()
  })

  test('the filter bar wraps instead of running over its neighbours or past the window edge (extension.md §2.2)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 3)
    const library = await page.context().newPage()
    for (const [width, height] of [
      [1180, 760],
      [1024, 700],
      [390, 844],
    ] as const) {
      await library.setViewportSize({ width, height })
      // `prop=title` adds the operator and value controls: the widest the bar gets
      await library.goto(`chrome-extension://${extensionId}/library.html#/clips?prop=title`)
      await library.reload()
      await expect(library.locator('.row')).toHaveCount(3)
      const problems = await library.evaluate(() => {
        const bar = document.querySelector('.toolbar')!
        const edge = bar.getBoundingClientRect()
        const parts = [...bar.children].map(child => ({ name: child.className || child.tagName, box: child.getBoundingClientRect() }))
        const found: string[] = []
        for (const part of parts) if (part.box.right > edge.right + 1 || part.box.left < edge.left - 1) found.push(`${part.name} leaves the bar`)
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i]!.box
            const b = parts[j]!.box
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) found.push(`${parts[i]!.name} overlaps ${parts[j]!.name}`)
          }
        }
        const label = bar.querySelector('.filter-time-label')
        if (label && label.getBoundingClientRect().height > 20) found.push('the time label breaks over two lines')
        return found
      })
      expect(problems, `filter bar at ${width}px`).toEqual([])
    }
    await library.close()
  })

  test('an empty view says how to fill it until a filter is on, whatever else the library holds (extension.md §5)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 3)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/screenshots`)
    await expectNavTotal(library, 3)
    await expect(library.getByTestId('list-count')).toHaveText('共 0 条')

    // three clips and no screenshot: nothing is filtered, so nothing "did not match"
    const empty = library.locator('.empty')
    await expect(empty).toContainText('还没有截图')
    await expect(empty).toContainText('Shift+S')
    await expect(empty).not.toContainText('没有匹配的结果')
    await expect(library.getByRole('button', { name: '清除筛选' })).toHaveCount(0)

    // the same empty answer under a filter is "no results", and the way out is offered
    await library.locator('.search').fill('anything')
    await expect(empty).toContainText('没有匹配的结果')
    await expect(library.locator('.search')).toHaveValue('anything')
    await library.getByRole('button', { name: '清除筛选' }).click()
    await expect(empty).toContainText('还没有截图')
    await expect(library.locator('.search')).toHaveValue('')
    await expect(library.getByRole('button', { name: '清除筛选' })).toHaveCount(0)
    await library.close()
  })

  test('a search with no match keeps its filter and offers to clear it; every kind of filter counts (extension.md §5)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 3)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await expect(library.locator('.row')).toHaveCount(3)

    await library.locator('.search').fill('nosuchword')
    await expect(library.locator('.empty')).toContainText('没有匹配的结果')
    await expect(library.locator('.empty')).not.toContainText('还没有剪藏')
    // the filter stays where it was typed: in the box, in the URL, across a reload (extension.md §2.2)
    await expect(library.locator('.search')).toHaveValue('nosuchword')
    expect(library.url()).toContain('q=nosuchword')
    await library.reload()
    await expect(library.locator('.search')).toHaveValue('nosuchword')
    await expect(library.locator('.empty')).toContainText('没有匹配的结果')
    await library.getByRole('button', { name: '清除筛选' }).click()
    await expect(library.locator('.row')).toHaveCount(3)
    await expect(library.locator('.search')).toHaveValue('')
    expect(library.url()).not.toContain('q=')

    // source, tag, property and time filters read the same way
    for (const filter of ['host=nowhere.example', 'tag=no-such-tag', 'prop=title&op=contains&val=no-such-title', 'from=2099-01-01']) {
      await library.goto(`chrome-extension://${extensionId}/library.html#/clips?${filter}`)
      await library.reload()
      await expect(library.locator('.empty'), filter).toContainText('没有匹配的结果')
      await library.getByRole('button', { name: '清除筛选' }).click()
      await expect(library.locator('.row'), filter).toHaveCount(3)
    }
    await library.close()
  })

  test('the highlights view tells "no highlights yet" from "no highlight matches", and clears its colour filter too (extension.md §2.3, §5)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 1)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/highlights`)
    await expectNavTotal(library, 1)

    // a clip without highlights: the view says how to make one
    await expect(library.locator('.empty')).toContainText('还没有高亮')
    await expect(library.getByRole('button', { name: '清除筛选' })).toHaveCount(0)

    // one highlight, added through the extension's own write path
    const [clip] = await getEntries(page.context())
    const quote = clip!.content.slice(0, 7)
    const added = await library.evaluate(
      payload =>
        chrome.runtime.sendMessage({
          type: 'ADD_HIGHLIGHT',
          id: payload.id,
          highlight: { id: 'hl_browse', start: 0, end: payload.quote.length, quote: payload.quote, color: 'yellow', createdAt: Date.now() },
        }),
      { id: clip!.id, quote },
    )
    expect(added.success).toBe(true)
    await library.reload()
    await expect(library.locator('.hl-quote')).toHaveText(quote)

    // a filter that excludes it: the view says nothing matches instead of claiming there are no highlights
    await library.locator('.search').fill('nosuchword')
    await expect(library.locator('.empty')).toContainText('没有匹配的结果')
    await expect(library.locator('.empty')).not.toContainText('还没有高亮')
    await expect(library.locator('.search')).toHaveValue('nosuchword')
    await library.getByRole('button', { name: '清除筛选' }).click()
    await expect(library.locator('.hl-quote')).toHaveText(quote)

    // the colour is the one filter only this view has, and clearing resets it as well
    const color = library.locator('select[aria-label="颜色"]')
    await color.selectOption('blue')
    await expect(library.locator('.empty')).toContainText('没有匹配的结果')
    await expect(color).toHaveValue('blue')
    await library.getByRole('button', { name: '清除筛选' }).click()
    await expect(library.locator('.hl-quote')).toHaveText(quote)
    await expect(color).toHaveValue('')
    expect(library.url()).not.toContain('color=')
    await library.close()
  })

  test('settings and properties are pages of their own: no list toolbar, and a reload leaves no loading count behind (extension.md §2.3)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 3)
    const library = await page.context().newPage()
    for (const [view, marker] of [
      ['settings', 'settings-view'],
      ['properties', 'props-page'],
    ] as const) {
      await library.goto(`chrome-extension://${extensionId}/library.html#/${view}`)
      await library.reload()
      await expect(library.getByTestId(marker), view).toBeVisible()
      // the search box, the filters and the count describe a list; these pages have none
      await expect(library.locator('.toolbar'), view).toHaveCount(0)
      await expect(library.locator('.search'), view).toHaveCount(0)
      await expect(library.getByTestId('list-count'), view).toHaveCount(0)
      await expect(library.getByText('加载中…'), view).toHaveCount(0)
    }

    // back in a list view the toolbar is there and its count settles
    await library.getByRole('link', { name: '剪藏', exact: true }).click()
    await expect(library.locator('.search')).toBeVisible()
    await expect(library.getByTestId('list-count')).toHaveText('共 3 条')
    await library.close()
  })

  test('the first list view after settings waits for its answer instead of saying nothing is there (extension.md §5)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 1)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/settings`)
    await library.reload()
    await expect(library.getByTestId('settings-view')).toBeVisible()

    // hold the list's answer back until the test lets it go, the way a big library does
    await library.evaluate(() => {
      const runtime = chrome.runtime as unknown as { sendMessage: (...args: unknown[]) => Promise<unknown> }
      const send = runtime.sendMessage.bind(chrome.runtime)
      const gate = new Promise<void>(resolve => {
        ;(window as unknown as { releaseList: () => void }).releaseList = () => resolve()
      })
      runtime.sendMessage = (...args) => ((args[0] as { type?: string }).type === 'QUERY_ENTRIES' ? gate.then(() => send(...args)) : send(...args))
    })
    await library.getByRole('link', { name: '剪藏', exact: true }).click()

    // while the answer is on its way the list says so; "nothing here" would be wrong, and the library is not empty
    await expect(library.locator('.list-loading')).toBeVisible()
    await expect(library.locator('.empty')).toHaveCount(0)
    await expect(library.getByTestId('list-count')).toHaveText('加载中…')
    await library.evaluate(() => (window as unknown as { releaseList: () => void }).releaseList())
    await expect(library.locator('.row')).toHaveCount(1)
    await expect(library.getByTestId('list-count')).toHaveText('共 1 条')
    await library.close()
  })

  test('120 entries: load more reaches the oldest, whose tag filters (RV-LIB-02)', async ({ page, extensionId }) => {
    test.setTimeout(300_000)
    await saveClips(page.context(), page, 60)

    // tag the oldest entry distinctively, the way a user edit does (through the extension's own write path)
    const oldest = (await getEntries(page.context())).sort((a, b) => a.createdAt - b.createdAt)[0]!
    await updateEntry(page.context(), extensionId, oldest.id, { properties: { set: { tags: ['oldest-tag'] } } })

    await saveClips(page.context(), page, 60, 120) // 120 total; the oldest now sits below two pages

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await expect(library.locator('.row')).toHaveCount(50)
    await expect(library.getByTestId('list-count')).toContainText('120')

    await library.getByTestId('load-more').click()
    await expect(library.locator('.row')).toHaveCount(100)
    await library.getByTestId('load-more').click()
    await expect(library.locator('.row')).toHaveCount(120)
    await expect(library.getByTestId('load-more')).toHaveCount(0)

    // the oldest entry's unique tag is a filter candidate from the whole library
    const tagFilter = library.locator('select[aria-label*="标签"], select[aria-label*="tag"], select[aria-label*="Tag"]').first()
    await tagFilter.selectOption('oldest-tag')
    await expect(library.locator('.row')).toHaveCount(1)
    expect(library.url()).toContain('tag=oldest-tag')
    await library.close()
  })

  test('a drawer delete updates the list DOM and count immediately (RV-LIB-03)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 3)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await expect(library.locator('.row')).toHaveCount(3)
    await expect(library.getByTestId('list-count')).toContainText('3')

    await library.locator('.row').first().click()
    const drawer = library.locator('.drawer')
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: '删除' }).click()
    await drawer.getByRole('alertdialog').getByRole('button', { name: '删除' }).click()

    await expect(drawer).toHaveCount(0)
    await expect(library.locator('.row')).toHaveCount(2)
    await expect(library.getByTestId('list-count')).toContainText('2')
    expect(await getEntries(library.context())).toHaveLength(2)
    await library.close()
  })

  test('75 MB of clip content does not break counts, candidates or the first page (RV-LIB-18)', async ({ page, extensionId }) => {
    test.setTimeout(120_000)
    const sw = await ensureServiceWorker(page.context())
    await sw.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('annhub')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const tx = open.result.transaction('entries', 'readwrite')
            const entries = tx.objectStore('entries')
            const content = 'x'.repeat(50_000)
            for (let i = 0; i < 1500; i++) {
              entries.put({
                id: `ent_bulk_${String(i).padStart(4, '0')}`,
                type: 'clip',
                content,
                sourceUrl: `https://${i === 1499 ? 'oldest' : 'bulk'}.example/${i}`,
                sourceHost: i === 1499 ? 'oldest.example' : 'bulk.example',
                properties: { title: `Bulk ${i}`, tags: [i === 1499 ? 'oldest-tag' : 'bulk-tag'] },
                createdAt: 2_000_000 - i,
                updatedAt: 2_000_000 - i,
              })
            }
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
          }
        }),
    )
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await expect(library.getByTestId('list-count')).toContainText('1500', { timeout: 60_000 })
    await expect(library.locator('.row')).toHaveCount(50)
    await expect(library.getByTestId('guide-card')).toHaveCount(0)
    await expect(library.locator('select option[value="oldest.example"]')).toHaveCount(1)
    await expect(library.locator('select option[value="oldest-tag"]')).toHaveCount(1)
    await library.close()
  })

  test('closing a late drawer keeps loaded pages and refreshes an edited row (RV-LIB-15)', async ({ page, extensionId }) => {
    const sw = await ensureServiceWorker(page.context())
    await sw.evaluate(
      () =>
        new Promise<void>(resolve => {
          const open = indexedDB.open('annhub')
          open.onsuccess = () => {
            const tx = open.result.transaction('entries', 'readwrite')
            for (let i = 0; i < 120; i++) {
              tx.objectStore('entries').put({
                id: `ent_page_${String(i).padStart(3, '0')}`,
                type: 'clip',
                content: `Body ${i}`,
                sourceUrl: `https://example.com/${i}`,
                sourceHost: 'example.com',
                properties: { title: `Row ${i}` },
                createdAt: i + 1,
                updatedAt: i + 1,
              })
            }
            tx.oncomplete = () => resolve()
          }
        }),
    )
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.getByTestId('load-more').click()
    await library.getByTestId('load-more').click()
    await expect(library.locator('.row')).toHaveCount(120)
    const late = library.locator('.row[data-entry-id="ent_page_000"]')
    await late.click()
    await library.locator('.drawer').getByRole('button', { name: '关闭' }).click()
    await expect(library.locator('.row')).toHaveCount(120)
    await expect(late).toBeVisible()
    await late.click()
    const title = library.locator('.drawer .prop-row').filter({ hasText: 'title' }).locator('input')
    await title.fill('Edited late row')
    await title.blur()
    await library.locator('.drawer').getByRole('button', { name: '关闭' }).click()
    await expect(library.locator('.row')).toHaveCount(120)
    await expect(late).toContainText('Edited late row')
    await library.close()
  })

  test('closing reading consumes its history entry instead of adding another (RV-LIB-01)', async ({ page, extensionId }) => {
    await saveClips(page.context(), page, 1)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    await expect(library.getByTestId('reading-view')).toBeVisible()
    await library.getByTestId('reading-view').getByRole('button', { name: '关闭' }).click()
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await library.goBack()
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await library.close()
  })

  test('10,000 realistic clips answer first-page and search queries within the R1 budget (RV-BG-04)', async ({ page, extensionId }) => {
    test.setTimeout(180_000)
    await seedRealisticLibrary(page.context())
    const extensionPage = await page.context().newPage()
    await extensionPage.goto(`chrome-extension://${extensionId}/sample.html`)
    const timings = await extensionPage.evaluate(async () => {
      const measure = async (query: Record<string, unknown>) => {
        const started = performance.now()
        const response = await chrome.runtime.sendMessage({ type: 'QUERY_ENTRIES', query })
        if (!response.success || response.data.result.items.length !== 50) throw new Error('query failed')
        return performance.now() - started
      }
      const list = [await measure({ limit: 50 }), await measure({ limit: 50 }), await measure({ limit: 50 })]
      const search = [await measure({ search: 'jitter', limit: 50 }), await measure({ search: 'jitter', limit: 50 }), await measure({ search: 'jitter', limit: 50 })]
      return { list: Math.min(...list), search: Math.min(...search) }
    })
    expect(timings.list, `indexed list took ${timings.list.toFixed(1)}ms`).toBeLessThan(200)
    expect(timings.search, `search took ${timings.search.toFixed(1)}ms`).toBeLessThan(200)
    await extensionPage.close()
  })

  test('after a worker restart every view of a 10,000-clip library opens within budget (RV-BG-04)', async ({ page, extensionId }) => {
    test.setTimeout(300_000)
    await seedRealisticLibrary(page.context())
    const extensionPage = await page.context().newPage()
    await extensionPage.goto(`chrome-extension://${extensionId}/sample.html`)
    // build the derived documents once; a library only ever written through the store never needs this
    await extensionPage.evaluate(() => chrome.runtime.sendMessage({ type: 'QUERY_ENTRIES', query: { search: 'jitter', limit: 50 } }))

    const opened: Record<string, number> = {}
    for (const view of ['all', 'clips', 'highlights', 'screenshots']) {
      // a recycled worker: the first query of every view runs against a cold process
      await stopServiceWorker(page.context(), extensionPage)
      const library = await page.context().newPage()
      const started = Date.now()
      await library.goto(`chrome-extension://${extensionId}/library.html#/${view}`)
      await expect(library.getByTestId('list-count')).not.toContainText('加载', { timeout: 60_000 })
      await expect(library.locator('.nav-count').first()).toBeVisible({ timeout: 60_000 })
      opened[view] = Date.now() - started
      if (view === 'clips') await expect(library.getByTestId('list-count')).toContainText('10000')
      await library.close()
    }
    console.log(`[cold views, ms] ${JSON.stringify(opened)}`)
    // generous: this guards against an order-of-magnitude regression (a pass over every entry took ~3.4 s here), not a stopwatch
    for (const [view, ms] of Object.entries(opened)) expect(ms, `${view} opened in ${ms}ms`).toBeLessThan(2_500)
    await extensionPage.close()
  })
})
