import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getCapturePageUrl, getEntries, selectUntilMenu, sendMessage, updateEntry, waitForClipToast } from './helpers'

/**
 * download.md §3 (the library's entrances) and §9's measurable acceptance:
 * the drawer's and reading view's 下载 start one entry straight away with a
 * status bar that never moves the content; the three lists' 选择 replaces the
 * filter bar at the same height (cards do not move), turns cards into
 * checkboxes (click, Shift-click, Space, Ctrl/Cmd+A, Esc), and 下载所选 walks
 * the dialog — counts, form, media — to a folder per entry under the dated
 * root, or one ZIP.
 */

const ARTICLE_URL = `${getCapturePageUrl().replace(/capture\.html$/, '')}download-article.html`
const SLOW_MEDIA = 'http://media.annhub.test:8173/download-media.png?delay=15000'
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qMwAAAAASUVORK5CYII='

async function saveClipViaMenu(page: import('@playwright/test').Page, selector: string): Promise<void> {
  const menu = await selectUntilMenu(page, selector)
  await menu.locator('.ann-menu-action').nth(0).click()
  await waitForClipToast(page)
}

/** The run's landed downloads: kinds and contents (Playwright renames the files, so assertions use MIME and data-URL text). */
async function landed(page: import('@playwright/test').Page): Promise<{ mime: string; url: string; name: string; state: string }[]> {
  const worker = await ensureServiceWorker(page.context())
  return worker.evaluate(async () =>
    (await chrome.downloads.search({}))
      .filter(item => item.byExtensionId === chrome.runtime.id)
      .map(item => ({ mime: item.mime ?? '', url: item.url ?? '', name: (item.filename ?? '').split(/[\\/]/).pop() ?? '', state: item.state })),
  )
}

function markdownsOf(items: { url: string; state?: string }[]): string[] {
  return items
    .filter(item => item.state === 'complete' && item.url.startsWith('data:text/markdown'))
    .map(item => Buffer.from(item.url.split(',')[1] ?? '', 'base64').toString('utf8'))
}

async function libraryPage(page: import('@playwright/test').Page, extensionId: string, hash = ''): Promise<import('@playwright/test').Page> {
  const library = await page.context().newPage()
  await library.goto(`chrome-extension://${extensionId}/library.html${hash}`)
  return library
}

/** Entries made of a title and a little text: enough to fill the 200-entry selection cap without network work. */
async function seedClips(context: import('@playwright/test').BrowserContext, count: number, mediaDelay?: number): Promise<void> {
  const worker = await ensureServiceWorker(context)
  await worker.evaluate(
    ({ total, mediaDelay }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('annhub')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('entries', 'readwrite')
          const entries = tx.objectStore('entries')
          for (let i = 0; i < total; i++) {
            entries.put({
              id: `ent_dl_${String(i).padStart(4, '0')}`,
              type: 'clip',
              content:
                mediaDelay === undefined
                  ? `Retry note ${i}`
                  : `Record ${i}\n\n![first](http://media.annhub.test:8173/download-media.png?entry=${i}&image=1&delay=${mediaDelay})\n\n![second](http://media.annhub.test:8173/download-media.png?entry=${i}&image=2&delay=${mediaDelay})`,
              sourceUrl: `https://host-${i % 5}.example.com/${i}`,
              sourceHost: `host-${i % 5}.example.com`,
              properties: { title: `Record ${i}`, tags: ['retry'] },
              createdAt: i + 1,
              updatedAt: i + 1,
            })
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
    { total: count, mediaDelay },
  )
}

async function enterSelection(library: import('@playwright/test').Page): Promise<void> {
  await library.getByTestId('enter-select').click()
  await expect(library.getByTestId('selection-bar')).toBeVisible()
}

async function openSelectionDialog(library: import('@playwright/test').Page): Promise<import('@playwright/test').Locator> {
  await library.getByTestId('download-selected').click()
  const dialog = library.getByTestId('download-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('library downloads (download.md §3)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  for (const cancel of [false, true]) {
    test(`50 entries with 100 images can ${cancel ? 'cancel' : 'finish'} using the keyboard (§9)`, async ({ page, extensionId }) => {
      test.slow()
      await seedClips(page.context(), 50, cancel ? 15_000 : 0)
      const library = await libraryPage(page, extensionId)
      await expect(library.locator('.entry-card')).toHaveCount(50)
      await library.getByTestId('enter-select').focus()
      await library.keyboard.press('Space')
      await expect(library.getByTestId('selection-bar')).toBeVisible()
      await library.keyboard.press('Control+a')
      await expect(library.getByTestId('selection-bar')).toContainText('已选 50 条')
      for (let i = 0; i < 3; i++) await library.keyboard.press('Tab')
      await expect(library.getByTestId('download-selected')).toBeFocused()
      await library.keyboard.press('Enter')
      const dialog = library.getByTestId('download-dialog')
      await expect(dialog.getByTestId('download-summary')).toContainText('50 条 · 剪藏 50')
      await expect(dialog.getByTestId('download-start')).toBeFocused()
      await library.keyboard.press('Enter')
      if (cancel) {
        await expect(dialog.getByTestId('download-cancel')).toBeFocused()
        await library.keyboard.press('Enter')
        await expect(dialog.getByTestId('download-cancelled-banner')).toBeVisible()
        expect((await landed(library)).filter(item => item.state === 'complete')).toHaveLength(0)
      } else {
        await expect(dialog.getByTestId('download-done-banner')).toBeVisible({ timeout: 60_000 })
        const files = (await landed(library)).filter(item => item.state === 'complete')
        expect(files.filter(item => item.mime === 'image/png')).toHaveLength(100)
        const bodies = markdownsOf(files).filter(text => text.includes('annhub_id:'))
        expect(bodies).toHaveLength(50)
        for (const body of bodies) {
          const images = [...body.matchAll(/\]\(assets\/([^)]+)\)/g)].map(match => match[1])
          expect(images).toHaveLength(2)
          for (const image of images) expect(files.some(file => file.name === image)).toBe(true)
        }
        await expect(dialog.getByTestId('download-finish')).toBeFocused()
        await library.keyboard.press('Enter')
        await expect(dialog).toHaveCount(0)
      }
      await expect(library.getByTestId('selection-bar')).toContainText('已选 50 条')
    })
  }

  test("the drawer's 下载 starts one entry with a status bar over the content (§3.1)", async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')

    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(1)
    const cardBox = await library.locator('.entry-card').boundingBox()
    await library.locator('.entry-card').click()
    const drawer = library.locator('.drawer')
    await expect(drawer).toBeVisible()
    const button = drawer.getByTestId('drawer-download')
    await expect(button).toContainText('下载')
    await expect(button).toHaveAttribute('title', '下载为 Markdown')
    await button.click()
    const bar = library.getByTestId('download-status-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText(/正在下载|已下载/, { timeout: 20_000 })
    await expect(bar).toContainText('已下载', { timeout: 20_000 })
    await expect(bar.getByRole('button', { name: '显示文件' })).toBeVisible()
    // floating: the card under it did not move (download.md §3.1, §9)
    expect(await library.locator('.entry-card').boundingBox()).toEqual(cardBox)
    const css = await bar.evaluate(element => ({ position: getComputedStyle(element).position, bottom: getComputedStyle(element).bottom }))
    expect(css.position).toBe('absolute')
    expect(css.bottom).not.toBe('auto')

    const items = await landed(library)
    expect(items.filter(item => item.state === 'complete' && item.mime === 'image/png').length).toBeGreaterThan(0)
    const markdown = markdownsOf(items)[0] ?? ''
    // the export's frontmatter and sections (§3.4, storage.md §6)
    expect(markdown).toContain('annhub_id:')
    expect(markdown).toMatch(/\]\(assets\/[^)]+\)/)

    // 完整 disappears by itself after a few seconds (download.md §3.1)
    await expect(bar).toHaveCount(0, { timeout: 10_000 })
  })

  test('a screenshot downloads its stored bytes, and its two 下载s read differently (§3.1, §3.4)', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    const library = await libraryPage(page, extensionId, '#/screenshots')
    await sendMessage(library, {
      type: 'SAVE_SCREENSHOT',
      data: { dataUrl: PNG_1PX, width: 1, height: 1, sourceUrl: 'https://example.com/shot', title: 'Shot title', via: 'shortcut' },
    })
    await library.reload()
    await expect(library.locator('.entry-card')).toHaveCount(1)

    // the card's hover action and the drawer's image action say 下载图片; the header says 下载 for the Markdown folder
    await expect(library.getByRole('button', { name: '下载图片' })).toHaveAttribute('aria-label', '下载图片')
    await library.locator('.entry-card').click()
    const drawer = library.locator('.drawer')
    await expect(drawer.getByTestId('drawer-download')).toContainText('下载')
    await expect(drawer.getByTestId('drawer-download')).toHaveAttribute('title', '下载为 Markdown')
    const imageButton = drawer.getByRole('button', { name: '下载图片' })
    await expect(imageButton).toHaveText('下载图片')
    await expect(imageButton).toHaveAttribute('aria-label', '下载图片')

    await drawer.getByTestId('drawer-download').click()
    const bar = library.getByTestId('download-status-bar')
    await expect(bar).toContainText('已下载', { timeout: 20_000 })
    const items = await landed(library)
    expect(items.some(item => item.state === 'complete' && item.mime === 'image/png')).toBe(true)
    const markdown = markdownsOf(items)[0] ?? ''
    // the stored bytes land as the picture the Markdown links, not from the network (download.md §3.4).
    // Playwright renames the files, so the link is the file's actual landed name, never the asset id.
    const link = /!\[Shot title\]\(assets\/([^)]+)\)/.exec(markdown)?.[1]
    expect(link).toBeTruthy()
    const image = items.find(item => item.state === 'complete' && item.mime === 'image/png')
    expect(link).toBe(image?.name)
    expect(markdown).not.toContain('annhub-asset://')
  })

  test("the reading view's 下载 downloads the open entry (§3.1)", async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')
    const library = await libraryPage(page, extensionId)
    await library.locator('.entry-card').click()
    await library.getByTestId('drawer-read').click()
    await expect(library.locator('.reading')).toBeVisible()
    await library.getByTestId('reading-download').click()
    const bar = library.getByTestId('download-status-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('已下载', { timeout: 20_000 })
    expect(markdownsOf(await landed(library)).length).toBeGreaterThan(0)
  })

  test('选择 replaces the filter bar at the same height and the cards do not move (§3.2, §9)', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')
    await saveClipViaMenu(page, '#section-body')
    // a tag on both cards: the card's tags must never act as a filter in selection mode (download.md §3.2)
    for (const entry of await getEntries(page.context())) {
      await updateEntry(page.context(), extensionId, entry.id, { properties: { set: { tags: ['retry'] } } })
    }
    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(2)

    const filter = library.locator('.toolbar-slot > .toolbar')
    await expect(filter).toBeVisible()
    const filterBox = await filter.boundingBox()
    const cardBox = await library.locator('.entry-card').first().boundingBox()
    const listScroll = await library.locator('.list').evaluate(element => element.scrollTop)

    await enterSelection(library)
    const bar = library.getByTestId('selection-bar')
    const barBox = await bar.boundingBox()
    // the same slot, the same top and height: the filter bar's place, not a grid cell (download.md §3.2)
    expect(Math.round(barBox!.y)).toBe(Math.round(filterBox!.y))
    expect(Math.round(barBox!.height)).toBe(Math.round(filterBox!.height))
    expect(await bar.evaluate(element => element.parentElement?.className)).toContain('toolbar-slot')
    expect(await bar.evaluate(element => Boolean(element.closest('.entry-grid')))).toBe(false)
    // cards keep their boxes and the scroll position; the search box is gone and says why
    expect(await library.locator('.entry-card').first().boundingBox()).toEqual(cardBox)
    expect(await library.locator('.list').evaluate(element => element.scrollTop)).toBe(listScroll)
    await expect(library.getByTestId('enter-select')).toHaveAttribute('aria-pressed', 'true')
    await expect(library.locator('.search-field.is-off')).toContainText('选择时无法搜索')
    await expect(library.locator('.search-field input')).toHaveCount(0)
    await page.keyboard.press('/')
    expect(await library.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT')

    // a click picks the card: the marker is drawn at the card's corner and the state is not colour alone
    const first = library.locator('.entry-card').first()
    await first.click()
    await expect(first.locator('.entry-card-open')).toHaveAttribute('aria-checked', 'true')
    await expect(bar).toContainText('已选 1 条')
    const checkedCard = await first.boundingBox()
    const marker = await first.locator('.entry-card-mark').boundingBox()
    const title = await first.locator('.entry-card-title').boundingBox()
    expect(Math.abs(marker!.x + marker!.width / 2 - checkedCard!.x)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(marker!.y + marker!.height / 2 - checkedCard!.y)).toBeLessThanOrEqual(1.5)
    // the marker only covers the outer corner; the title starts clear of it
    expect(marker!.x + marker!.width).toBeLessThanOrEqual(title!.x)
    expect(marker!.y + marker!.height).toBeLessThanOrEqual(title!.y + title!.height)
    expect(await first.locator('.entry-card-mark svg').evaluate(element => getComputedStyle(element).opacity)).toBe('1')

    // Shift-click extends from the last pick, and Ctrl/Cmd+A takes the whole filtered list
    await library
      .locator('.entry-card')
      .nth(1)
      .click({ modifiers: ['Shift'] })
    await expect(bar).toContainText('已选 2 条')
    await library.locator('.entry-card').first().locator('.entry-card-open').focus()
    await library.keyboard.press('Control+a')
    await expect(bar).toContainText('已选 2 条')
    await expect(library.getByTestId('select-all')).toBeDisabled()

    // Space toggles the focused card and Enter does not: the card is a checkbox, not a button (download.md §3.2)
    await library.keyboard.press('Space')
    await expect(bar).toContainText('已选 1 条')
    await library.keyboard.press('Space')
    await expect(bar).toContainText('已选 2 条')
    await library.keyboard.press('Enter')
    await expect(bar).toContainText('已选 2 条')
    await expect(library.locator('.drawer')).toHaveCount(0)

    // a tag is part of the card, never a filter: the address stays where it was
    const hash = library.url()
    await first.locator('.tag').first().click()
    expect(library.url()).toBe(hash)
    await expect(library.locator('.filter-chip')).toHaveCount(0)

    // Esc leaves and hands the keyboard back to 选择; the filter bar returns in place
    await library.keyboard.press('Escape')
    await expect(bar).toHaveCount(0)
    await expect(library.getByTestId('enter-select')).toBeFocused()
    await expect(library.locator('.toolbar-slot > .toolbar')).toBeVisible()
    expect(await library.locator('.entry-card').first().boundingBox()).toEqual(cardBox)
  })

  test('switching the view leaves selection mode and empties it (§3.2)', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')
    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await enterSelection(library)
    await library.locator('.entry-card').click()
    await expect(library.getByTestId('selection-bar')).toContainText('已选 1 条')
    await library.locator('a.nav-item[data-view="screenshots"]').click()
    await expect(library.getByTestId('selection-bar')).toHaveCount(0)
    await expect(library.locator('a.nav-item[data-view="screenshots"]')).toHaveAttribute('aria-current', 'page')
    // back in the list view, the search box is live again and no selection survives the navigation
    await expect(library.locator('.search-field input')).toBeVisible()
  })

  test('the selection bar keeps its one line in a narrow window (§3.2)', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')
    await saveClipViaMenu(page, '#section-body')
    const library = await libraryPage(page, extensionId)
    await library.setViewportSize({ width: 560, height: 800 })
    await expect(library.locator('.entry-card').first()).toBeVisible()
    await enterSelection(library)
    const bar = library.getByTestId('selection-bar')
    const box = await bar.boundingBox()
    expect(Math.round(box!.height)).toBe(36)
    // no second line: the content still fits the bar's line box
    const overflow = await bar.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }))
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client)
    await expect(bar.locator('.selection-hint')).toBeHidden()
  })

  test('the dialog states the selection, downloads it and keeps selection mode afterwards (§3.3)', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')
    await saveClipViaMenu(page, '#section-body')
    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(2)
    await enterSelection(library)
    await library.locator('.entry-card').nth(0).click()
    await library
      .locator('.entry-card')
      .nth(1)
      .click({ modifiers: ['Shift'] })
    await expect(library.getByTestId('selection-bar')).toContainText('已选 2 条')

    let dialog = await openSelectionDialog(library)
    await expect(dialog.getByRole('heading', { name: '下载所选条目' })).toBeVisible()
    await expect(dialog).toContainText('准备')
    // the summary: entries by kind and the expected files (download.md §3.3)
    await expect(dialog.getByTestId('download-summary')).toContainText('2 条 · 剪藏 2 · 截图 0', { timeout: 10_000 })
    await expect(dialog.getByTestId('download-summary')).toContainText('预计约')
    await expect(dialog.locator('input[name="download-form"]').first()).toBeChecked()
    await expect(dialog.getByRole('checkbox')).toBeChecked()
    await expect(dialog.getByTestId('download-start')).toBeFocused()

    // Esc closes the prepare state and leaves the selection exactly as it was
    await library.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(library.getByTestId('selection-bar')).toContainText('已选 2 条')
    await expect(library.getByTestId('download-selected')).toBeFocused()

    dialog = await openSelectionDialog(library)
    await library.clock.install()
    await dialog.getByTestId('download-start').click()
    await expect(dialog.getByTestId('download-done-banner')).toBeVisible({ timeout: 30_000 })
    // Dialog results persist until dismissed; only the single-entry bar expires.
    await library.clock.runFor(5000)
    await expect(dialog.getByTestId('download-done-banner')).toBeVisible()
    await expect(dialog.getByTestId('download-show-files')).toBeVisible()
    await dialog.getByTestId('download-finish').click()
    await expect(dialog).toHaveCount(0)
    // the selection survives the dialog; its own exit ends it (download.md §3.3)
    await expect(library.getByTestId('selection-bar')).toContainText('已选 2 条')
    await expect(library.getByTestId('download-selected')).toBeFocused()

    const markdowns = markdownsOf(await landed(library))
    expect(markdowns.length).toBeGreaterThanOrEqual(3)
    expect(markdowns.some(text => text.includes('# 下载清单'))).toBe(true)

    await library.getByRole('button', { name: '退出选择' }).click()
    await expect(library.getByTestId('selection-bar')).toHaveCount(0)
    await expect(library.getByTestId('enter-select')).toBeFocused()
  })

  test('a running dialog resists Esc and the scrim; cancel deletes its files and keeps the selection (§3.3, §2.5)', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')
    const [entry] = await getEntries(page.context())
    await updateEntry(page.context(), extensionId, entry!.id, { content: `Slow media\n\n![slow](${SLOW_MEDIA})`, context: null })

    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await enterSelection(library)
    await library.locator('.entry-card').click()
    const dialog = await openSelectionDialog(library)
    await dialog.getByTestId('download-start').click()
    await expect(dialog.getByTestId('download-progress')).toBeVisible({ timeout: 10_000 })

    // only 取消 stops a long download: Esc and the scrim do nothing while it runs (download.md §3.3)
    await library.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await library.locator('.export-backdrop').click({ position: { x: 8, y: 8 } })
    await expect(dialog).toBeVisible()

    await library.clock.install()
    await dialog.getByTestId('download-cancel').click()
    await expect(dialog.getByTestId('download-cancelled-banner')).toBeVisible({ timeout: 10_000 })
    await library.clock.runFor(5000)
    await expect(dialog.getByTestId('download-cancelled-banner')).toBeVisible()
    await expect(dialog).toContainText('已取消')
    await expect(dialog).toContainText('已写好的文件已删除')
    await expect(dialog.getByTestId('download-again')).toBeVisible()
    await expect(library.getByTestId('selection-bar')).toContainText('已选 1 条')
    // the cancelled run leaves no Markdown behind
    expect((await landed(library)).filter(item => item.state === 'complete' && item.url.startsWith('data:text/markdown'))).toHaveLength(0)

    await dialog.getByRole('button', { name: '关闭' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(library.getByTestId('selection-bar')).toContainText('已选 1 条')
  })

  test('a rejected start shows its failure and can retry the same selection (§3.3)', async ({ page, extensionId }) => {
    await seedClips(page.context(), 1)
    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await enterSelection(library)
    await library.locator('.entry-card').click()
    const dialog = await openSelectionDialog(library)
    await library.evaluate(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime)
      chrome.runtime.sendMessage = ((message: { type: string }) => {
        if (message.type === 'START_LIBRARY_DOWNLOAD') {
          chrome.runtime.sendMessage = original
          return Promise.resolve({ success: false, error: 'DOWNLOAD_FAILED' })
        }
        return original(message)
      }) as typeof chrome.runtime.sendMessage
    })
    await dialog.getByTestId('download-start').click()
    await expect(dialog.getByTestId('download-failed-banner')).toBeVisible()
    await expect(dialog).not.toContainText('上一个还在进行')
    await dialog.getByTestId('download-retry').click()
    await expect(dialog.getByTestId('download-done-banner')).toBeVisible()
    await dialog.getByTestId('download-finish').click()
    await expect(library.getByTestId('selection-bar')).toContainText('已选 1 条')
  })

  test('unchecking media writes Markdown only and says so in the README (§3.4, §4.2)', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')
    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await enterSelection(library)
    await library.locator('.entry-card').click()
    const dialog = await openSelectionDialog(library)
    await dialog.getByRole('checkbox').uncheck()
    await dialog.getByTestId('download-start').click()
    await expect(dialog.getByTestId('download-done-banner')).toBeVisible({ timeout: 20_000 })

    const items = await landed(library)
    expect(items.filter(item => item.state === 'complete' && item.mime.startsWith('image/'))).toHaveLength(0)
    const markdowns = markdownsOf(items)
    expect(markdowns.some(text => text.includes('# 下载说明'))).toBe(true)
    const markdown = markdowns.find(text => text.includes('annhub_id: ')) ?? ''
    expect(markdown).toMatch(/https?:\/\/[^)\s]+/)
    expect(markdown).not.toContain('](assets/')
  })

  test('the ZIP form lands one archive (§4.1)', async ({ page, extensionId }) => {
    test.slow()
    await page.goto(ARTICLE_URL)
    await saveClipViaMenu(page, '#intro-p')
    const library = await libraryPage(page, extensionId)
    await enterSelection(library)
    await library.locator('.entry-card').click()
    const dialog = await openSelectionDialog(library)
    await dialog.locator('label', { hasText: 'ZIP' }).click()
    await dialog.getByTestId('download-start').click()
    await expect(dialog.getByTestId('download-done-banner')).toBeVisible({ timeout: 20_000 })

    const items = await landed(library)
    const complete = items.filter(item => item.state === 'complete')
    expect(complete).toHaveLength(1)
    expect(complete[0]!.mime).toBe('application/zip')
  })

  test('a ZIP packing failure retries the same selection as a real Markdown folder (§8)', async ({ page, extensionId }) => {
    await seedClips(page.context(), 1)
    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(1)
    await enterSelection(library)
    await library.locator('.entry-card').click()
    const dialog = await openSelectionDialog(library)
    await dialog.locator('label', { hasText: 'ZIP' }).click()
    // Simulate the failed packing boundary; the retry uses the real service and downloads.
    await library.evaluate(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime)
      chrome.runtime.sendMessage = ((message: { type: string; clientRunId?: string }) => {
        if (message.type === 'START_LIBRARY_DOWNLOAD') {
          chrome.runtime.sendMessage = original
          document.documentElement.dataset.downloadTestRunId = message.clientRunId
          return Promise.resolve({ type: 'RESPONSE', success: true })
        }
        return original(message)
      }) as typeof chrome.runtime.sendMessage
    })
    await dialog.getByTestId('download-start').click()
    await expect(dialog.getByTestId('download-progress')).toBeVisible()
    const worker = await ensureServiceWorker(page.context())
    const clientRunId = await library.evaluate(() => document.documentElement.dataset.downloadTestRunId)
    await worker.evaluate(
      clientRunId =>
        chrome.runtime.sendMessage({ type: 'DOWNLOAD_NOTICE', clientRunId, phase: 'failed', errorCode: 'DOWNLOAD_ZIP_FAILED', processed: 0, total: 0, missingCount: 0 }),
      clientRunId,
    )
    await expect(dialog.getByTestId('download-failed-banner')).toContainText('重试将改用文件夹')
    await dialog.getByTestId('download-retry').click()
    await expect(dialog.getByTestId('download-done-banner')).toBeVisible()
    const files = await landed(library)
    expect(files.some(file => file.mime === 'application/zip')).toBe(false)
    expect(markdownsOf(files).some(markdown => markdown.includes('Record 0'))).toBe(true)
    await dialog.getByTestId('download-finish').click()
    await expect(library.getByTestId('selection-bar')).toContainText('已选 1 条')
  })

  test('the 200-entry cap: 全选 is unavailable, a range stops at 200, the rest is aria-disabled (§3.2)', async ({ page, extensionId }) => {
    test.slow()
    await seedClips(page.context(), 205)
    const library = await libraryPage(page, extensionId)
    await expect(library.locator('.entry-card')).toHaveCount(50)
    await enterSelection(library)

    const bar = library.getByTestId('selection-bar')
    await expect(library.getByTestId('select-all')).toBeDisabled()
    await expect(bar).toContainText('一次最多选 200 条')
    // the list scrolls under the bar; the bar stays at the scroll area's top (download.md §3.2)
    const barTop = Math.round((await bar.boundingBox())!.y)
    await library.locator('.list').evaluate(element => {
      element.scrollTop = 500
    })
    await expect.poll(async () => Math.round((await bar.boundingBox())!.y)).toBe(barTop)
    await library.locator('.list').evaluate(element => {
      element.scrollTop = 0
    })
    // Ctrl+A does nothing over the cap: the selection stays at zero
    await library.keyboard.press('Control+a')
    await expect(bar).toContainText('已选 0 条')

    const loadMore = library.getByTestId('load-more')
    for (const expected of [100, 150, 200, 205]) {
      await loadMore.click()
      await expect(library.locator('.entry-card')).toHaveCount(expected)
    }

    await library.locator('.entry-card').first().click()
    await library
      .locator('.entry-card')
      .nth(199)
      .click({ modifiers: ['Shift'] })
    await expect(bar).toContainText('已选 200 条')
    await expect(bar).toContainText('已选满 200 条')
    const beyond = library.locator('.entry-card').nth(200)
    await expect(beyond.locator('.entry-card-open')).toHaveAttribute('aria-disabled', 'true')
    await beyond.click()
    await expect(bar).toContainText('已选 200 条')
    await expect(beyond.locator('.entry-card-open')).toHaveAttribute('aria-checked', 'false')
  })

  test('the settings card holds the form and the media toggle (§4.1)', async ({ page, extensionId }) => {
    const library = await libraryPage(page, extensionId, '#/settings')
    const card = library.getByTestId('download-card')
    await expect(card).toBeVisible()
    await card.locator('label', { hasText: 'ZIP' }).locator('input').click()
    await expect
      .poll(async () => {
        const stored = await library.evaluate(() => chrome.storage.local.get('annhub.settings'))
        return (stored['annhub.settings'] as { downloadForm?: string }).downloadForm
      })
      .toBe('zip')
    await card.getByTestId('download-media-toggle').click()
    await expect
      .poll(async () => {
        const stored = await library.evaluate(() => chrome.storage.local.get('annhub.settings'))
        return (stored['annhub.settings'] as { downloadMedia?: boolean }).downloadMedia
      })
      .toBe(false)
  })
})
