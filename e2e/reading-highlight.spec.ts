import { test, expect } from './fixtures'
import { clearLibrary, ensureServiceWorker, getCapturePageUrl, getEntries, selectUntilMenu, waitForClipToast } from './helpers'

test.describe('reading view and in-library highlights (extension.md §4.2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('create, note, recolor, delete with undo; refresh keeps the marks', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)

    const library = await page.context().newPage()
    library.on('console', msg => {
      if (msg.type() === 'error') console.log('[library error]', msg.text())
    })
    await library.goto(`chrome-extension://${extensionId}/library.html`)
    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    const reading = library.getByTestId('reading-view')
    await expect(reading).toBeVisible()

    // select rendered text with a real double-click (the word under the pointer) and create a highlight with the yellow dot
    const surface = reading.locator('.md-view')
    await surface
      .locator('span[data-s]', { hasText: 'Retries can amplify' })
      .first()
      .dblclick({ position: { x: 10, y: 8 } })
    const toolbar = library.getByTestId('hl-toolbar')
    await expect(toolbar).toBeVisible()
    await toolbar.locator('.hl-dot-yellow').click()

    const marks = reading.locator('.md-hl')
    await expect(marks).toHaveCount(1)
    await expect(marks.first()).toHaveClass(/md-hl-yellow/)

    // click the mark: popover recolors to green and takes a note
    await marks.first().click()
    const popover = library.getByTestId('hl-popover')
    await expect(popover).toBeVisible()
    await popover.locator('.hl-dot-green').click()
    await expect(reading.locator('.md-hl-green')).toHaveCount(1)

    await marks.first().click()
    await library.getByTestId('hl-note-input').fill('why this matters')
    await library.getByTestId('hl-note-input').blur()
    await expect(reading.locator('.md-hl-note')).toHaveCount(1)

    // the side list carries the quote and note
    await expect(reading.getByTestId('hl-list')).toContainText('Retrie')
    await expect(reading.getByTestId('hl-list')).toContainText('why this matters')

    // refresh keeps the highlight AND the reading view (extension.md §4.2:
    // the route lives in the URL; RV-TEST-01 replaced the old “view is gone”
    // assertion that had codified the defect)
    await library.reload()
    await expect(library.getByTestId('reading-view')).toBeVisible()
    await expect(library.getByTestId('reading-view').locator('.md-hl-green')).toHaveCount(1)

    // Esc closes back to the list route that opened it (nothing is open inside the view: no popover, no toolbar)
    await library.keyboard.press('Escape')
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await expect(library.locator('.row').first()).toBeVisible()

    // a deep link restores the reading view; closing falls back to the type list
    const entryId = (await getEntries(library.context()))[0]!.id
    await library.goto(`chrome-extension://${extensionId}/library.html#/read/${entryId}`)
    await expect(library.getByTestId('reading-view')).toBeVisible()
    await library.keyboard.press('Escape')
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await expect(library.locator('.row').first()).toBeVisible()

    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    await expect(library.getByTestId('reading-view').locator('.md-hl-green')).toHaveCount(1)

    // delete shows the notice, undo brings it back
    await library.getByTestId('reading-view').locator('.md-hl').first().click()
    await library.getByTestId('hl-delete').click()
    await expect(library.getByTestId('hl-notice')).toContainText('已删除')
    await library.getByTestId('hl-notice').getByRole('button', { name: '撤销' }).click()
    await expect(library.getByTestId('reading-view').locator('.md-hl-green')).toHaveCount(1)

    // the content lock explains itself while highlights exist (entry.md §4.7)
    await expect(library.getByTestId('reading-view').locator('.reading-lock')).toBeVisible()

    // the highlight view groups by clip and jumps back into reading
    await library.goto(`chrome-extension://${extensionId}/library.html#/highlights`)
    const groups = library.getByTestId('hl-groups')
    await expect(groups).toBeVisible()
    await expect(groups.locator('.hl-group')).toHaveCount(1)
    await groups.locator('.hl-row').first().click()
    await expect(library.getByTestId('reading-view')).toBeVisible()

    // export writes the mark back as ==…== (storage.md §6)
    await library.getByTestId('reading-view').getByRole('button', { name: '返回' }).click()
    await library.locator('.nav-export').click()
    await expect(library.locator('.nav-note').first()).toContainText('导出完成')
    const entries = await getEntries(library.context())
    expect(entries[0]!.highlights?.length).toBe(1)
    await library.close()
  })

  test('popover buttons survive a note edit: blur saves, clicks still land (RV-LIB-08)', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html`)
    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    const reading = library.getByTestId('reading-view')
    await expect(reading).toBeVisible()

    // create one yellow highlight
    await library.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.md-view span[data-s]'))[0]!
      const range = document.createRange()
      range.setStart(el.firstChild!, 0)
      range.setEnd(el.firstChild!, 6)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 200, clientY: 200 }))
    })
    const toolbar = library.getByTestId('hl-toolbar')
    await toolbar.locator('.hl-dot-yellow').click()
    const mark = reading.locator('.md-hl').first()

    // type a note, then click delete: the click must not be swallowed by blur
    await mark.click()
    await library.getByTestId('hl-note-input').fill('note before delete')
    await library.getByTestId('hl-delete').click()
    await expect(reading.locator('.md-hl')).toHaveCount(0)

    // undo brings it back (without the half-saved note interfering)
    await library.getByTestId('hl-notice').getByRole('button', { name: '撤销' }).click()
    await expect(reading.locator('.md-hl')).toHaveCount(1)

    // type a note and click a color: the recolor lands while the note saves
    await mark.click()
    await library.getByTestId('hl-note-input').fill('note with color')
    await library.getByTestId('hl-popover').locator('.hl-dot-green').click()
    await expect(reading.locator('.md-hl-green')).toHaveCount(1)
    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return (entries[0]!.highlights as { note?: string }[] | undefined)?.[0]?.note
      })
      .toBe('note with color')
    await library.close()
  })

  test('Escape closes the highlight popover before the reading view and keeps its note (RV-LIB-08)', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    const reading = library.getByTestId('reading-view')
    await reading.locator('.md-view span[data-s]').first().dblclick()
    await library.getByTestId('hl-toolbar').locator('.hl-dot-yellow').click()
    await reading.locator('.md-hl').first().click()
    await library.getByTestId('hl-note-input').fill('Keep this note')
    await library.getByTestId('hl-note-input').press('Escape')
    await expect(library.getByTestId('hl-popover')).toHaveCount(0)
    await expect(reading).toBeVisible()
    await expect.poll(async () => ((await getEntries(library.context()))[0]?.highlights as Array<{ note?: string }> | undefined)?.[0]?.note).toBe('Keep this note')
    await reading.press('Escape')
    await expect(reading).toHaveCount(0)
    await library.close()
  })

  test('the note action records has_note=true for a new highlight (RV-LIB-09)', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').first().click()
    await waitForClipToast(page)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    await library.getByTestId('reading-view').locator('.md-view span[data-s]').first().dblclick()
    await library.getByTestId('hl-toolbar').getByRole('button', { name: '备注' }).click()
    await expect(library.getByTestId('hl-popover')).toBeVisible()
    await expect
      .poll(() =>
        library.evaluate(async () => {
          const metrics = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
          return Object.values(metrics?.['highlight.created'] ?? {})
            .flatMap(day => Object.keys(day.byProps))
            .some(key => key.includes('has_note=true'))
        }),
      )
      .toBe(true)
    await library.close()
  })

  test('a table cell selection highlights and quotes the right cell (RV-LIB-09)', async ({ page, extensionId }) => {
    await clearLibrary(page.context())
    const content = '| Name | Role |\n| --- | --- |\n| Bob | Engineer |\n| Ann | Designer |'
    const sw = await ensureServiceWorker(page.context())
    await sw.evaluate(body => {
      return new Promise<null>(resolve => {
        const open = indexedDB.open('annhub')
        open.onsuccess = () => {
          const tx = open.result.transaction('entries', 'readwrite')
          tx.objectStore('entries').put({
            id: 'ent_table_rv_lib_09',
            type: 'clip',
            content: body,
            sourceUrl: 'https://table.example/roles',
            sourceHost: 'table.example',
            properties: { title: 'Roles table' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          tx.oncomplete = () => resolve(null)
        }
      })
    }, content)

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html`)
    await library.locator('.row', { hasText: 'Roles table' }).click()
    await library.getByTestId('drawer-read').click()
    const reading = library.getByTestId('reading-view')
    await expect(reading).toBeVisible()
    await expect(reading.locator('table.md-table td', { hasText: 'Engineer' })).toBeVisible()

    // dblclick "Bob": the quote and offsets must point at Bob, not at the
    // previous row's characters (the old renderer dropped the separator row
    // and mis-anchored every later cell)
    await reading.locator('table.md-table td', { hasText: 'Bob' }).dblclick()
    const toolbar = library.getByTestId('hl-toolbar')
    await expect(toolbar).toBeVisible()
    await toolbar.locator('.hl-dot-yellow').click()

    await expect
      .poll(async () => {
        const entries = await getEntries(library.context())
        return (entries[0]!.highlights as { quote?: string }[] | undefined)?.[0]?.quote
      })
      .toBe('Bob')
    const entries = await getEntries(library.context())
    const highlight = (entries[0]!.highlights as unknown as { start: number; end: number }[])[0]!
    expect(highlight.start).toBe(content.indexOf('Bob'))
    expect(highlight.end).toBe(content.indexOf('Bob') + 3)
    await library.close()
  })

  test('an overlapping selection merges into one highlight (entry.md §4.6)', async ({ page, extensionId }) => {
    await page.goto(getCapturePageUrl())
    const menu = await selectUntilMenu(page, '#intro-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html`)
    await library.locator('.row').first().click()
    await library.getByTestId('drawer-read').click()
    const reading = library.getByTestId('reading-view')
    await expect(reading).toBeVisible()

    // source offsets: the paragraph starts at 0, so run indices are content indices
    const select = (from: number, length: number) =>
      library.evaluate(
        ([from2, length2]) => {
          const spans = Array.from(document.querySelectorAll('.md-view span[data-s]')).filter(node => {
            const base = Number((node as HTMLElement).dataset.s)
            return base < from2 + length2 && from2 < base + (node.textContent?.length ?? 0)
          })
          if (spans.length === 0) throw new Error('run not found')
          const range = document.createRange()
          const first = spans[0]!
          const firstBase = Number((first as HTMLElement).dataset.s)
          range.setStart(first.firstChild!, from2 - firstBase)
          const last = spans[spans.length - 1]!
          const lastBase = Number((last as HTMLElement).dataset.s)
          range.setEnd(last.lastChild!, from2 + length2 - lastBase)
          const selection = window.getSelection()!
          selection.removeAllRanges()
          selection.addRange(range)
          last.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 240, clientY: 240 }))
        },
        [from, length] as [number, number],
      )

    await select(0, 6)
    await library.getByTestId('hl-toolbar').locator('.hl-dot-yellow').click()
    await expect(reading.locator('.md-hl')).toHaveCount(1)

    // overlapping selection that starts inside and extends beyond
    await select(3, 10)
    await library.getByTestId('hl-toolbar').locator('.hl-dot-blue').click()
    const marks = reading.locator('.md-hl')
    await expect(marks).toHaveCount(1)
    // entry.md §4.6: the union keeps the earliest highlight's color
    await expect(marks.first()).toHaveClass(/md-hl-yellow/)
    await expect(marks.first()).toContainText('Retries')

    const entries = await getEntries(library.context())
    const highlights = entries[0]!.highlights as Array<{ start: number; end: number }>
    expect(highlights).toHaveLength(1)
    expect(highlights[0]!.end - highlights[0]!.start).toBe(13)
    await library.close()
  })

  test('real double-click keeps offsets after escaped characters (RV-LIB-14)', async ({ page, extensionId }) => {
    const content = 'alpha beta \\* gamma delta \\* epsilon zeta \\* eta theta iota'
    const sw = await ensureServiceWorker(page.context())
    await sw.evaluate(
      body =>
        new Promise<void>(resolve => {
          const open = indexedDB.open('annhub')
          open.onsuccess = () => {
            const tx = open.result.transaction('entries', 'readwrite')
            tx.objectStore('entries').put({
              id: 'ent_escape_rv_lib_14',
              type: 'clip',
              content: body,
              sourceUrl: 'https://text.example/offsets',
              sourceHost: 'text.example',
              properties: { title: 'Escaped offsets' },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
            tx.oncomplete = () => resolve()
          }
        }),
      content,
    )
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/read/ent_escape_rv_lib_14`)
    const reading = library.getByTestId('reading-view')
    for (const word of ['gamma', 'epsilon', 'theta']) {
      // the middle of the word itself, not of the run that holds it: a run's middle can fall on a neighbour
      const center = await reading.locator('.md-view').evaluate((view, text) => {
        const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = (node.textContent ?? '').indexOf(text)
          if (at < 0) continue
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + text.length)
          const box = range.getBoundingClientRect()
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        }
        return null
      }, word)
      expect(center, `"${word}" is on screen`).not.toBeNull()
      await library.mouse.dblclick(center!.x, center!.y)
      await library.getByTestId('hl-toolbar').locator('.hl-dot-yellow').click()
      await expect.poll(async () => (await getEntries(library.context()))[0]?.highlights?.length).toBe(['gamma', 'epsilon', 'theta'].indexOf(word) + 1)
      const highlights = (await getEntries(library.context()))[0]!.highlights as Array<{ start: number; end: number; quote: string }>
      const highlight = highlights.find(item => item.quote === word)!
      expect(content.slice(highlight.start, highlight.end)).toBe(word)
    }
    await library.close()
  })

  test('a highlight made inside fenced code is drawn, survives a reload and can be removed (US-LIB-03)', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sample.html`)
    const content = 'Intro paragraph before the code.\n\n```js\nconst answer = 42\nconsole.log(answer)\n```\n\nOutro paragraph after the code.'
    const saved = await page.evaluate(
      body =>
        chrome.runtime.sendMessage({
          type: 'SAVE_CLIP',
          requestId: 'r-code-hl',
          draft: { id: 'ent_code_hl', content: body, sourceUrl: 'https://example.com/code', properties: { title: 'Code' }, via: 'menu' },
        }),
      content,
    )
    expect(saved.success).toBe(true)

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/read/ent_code_hl`)
    const code = library.locator('.md-view pre code')
    await expect(code).toBeVisible()
    const box = (await code.boundingBox())!
    // a real drag across the first words of the first code line
    await library.mouse.move(box.x + 3, box.y + 8)
    await library.mouse.down()
    await library.mouse.move(box.x + 90, box.y + 8, { steps: 6 })
    await library.mouse.up()
    await library.getByTestId('hl-toolbar').locator('.hl-dot-yellow').click()

    const mark = library.locator('.md-view pre .md-hl')
    await expect(mark).toHaveCount(1)
    expect((await getEntries(library.context())).find(entry => entry.id === 'ent_code_hl')?.highlights).toHaveLength(1)
    // the code itself is untouched by the marks
    await expect(code).toHaveText('const answer = 42\nconsole.log(answer)')

    await library.reload()
    await expect(library.locator('.md-view pre .md-hl')).toHaveCount(1)

    await library.locator('.md-view pre .md-hl').first().click()
    await library.getByTestId('hl-delete').click()
    await expect(library.locator('.md-view pre .md-hl')).toHaveCount(0)
    await expect.poll(async () => (await getEntries(library.context())).find(entry => entry.id === 'ent_code_hl')?.highlights?.length ?? 0).toBe(0)
    await library.close()
  })

  /** Saves a clip through the message the content script uses, from an extension page. */
  async function saveClip(page: import('@playwright/test').Page, extensionId: string, id: string, content: string): Promise<void> {
    await page.goto(`chrome-extension://${extensionId}/sample.html`)
    const saved = await page.evaluate(
      payload =>
        chrome.runtime.sendMessage({
          type: 'SAVE_CLIP',
          requestId: `r-${payload.id}`,
          draft: { id: payload.id, content: payload.content, sourceUrl: `https://example.com/${payload.id}`, properties: { title: payload.id }, via: 'menu' },
        }),
      { id, content },
    )
    expect(saved.success).toBe(true)
  }

  test('a row of the highlights view opens the reading view at that highlight (US-LIB-03)', async ({ page, extensionId }) => {
    const paragraphs = Array.from({ length: 70 }, (_, index) => `Paragraph ${index} ${'filler words to make the page long. '.repeat(6)}`)
    const content = paragraphs.join('\n\n')
    await saveClip(page, extensionId, 'ent_locate', content)
    const start = content.indexOf('Paragraph 62')
    const added = await page.evaluate(
      range =>
        chrome.runtime.sendMessage({
          type: 'ADD_HIGHLIGHT',
          id: 'ent_locate',
          highlight: { id: 'hl_locate', start: range.start, end: range.end, quote: 'Paragraph 62', color: 'green', createdAt: Date.now() },
        }),
      { start, end: start + 'Paragraph 62'.length },
    )
    expect(added.success).toBe(true)

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/highlights`)
    await library.locator('.hl-row').first().click()
    await expect(library).toHaveURL(/#\/read\/ent_locate\?h=hl_locate/)
    await expect(library.getByTestId('reading-view')).toBeVisible()
    // the mark is on screen without any scrolling by the user
    await expect(library.locator('[data-hl-id="hl_locate"]').first()).toBeInViewport()
    // closing returns to the highlights view, and a plain reading link carries no anchor
    await library.keyboard.press('Escape')
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await expect(library).toHaveURL(/#\/highlights/)
    await library.close()
  })

  test('a selection extended with the keyboard offers the toolbar; Escape dismisses it before the view; H highlights (US-LIB-03)', async ({ page, extensionId }) => {
    await saveClip(page, extensionId, 'ent_keys', 'Alpha beta gamma delta epsilon zeta eta theta.')
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/read/ent_keys`)
    const reading = library.getByTestId('reading-view')
    // Chrome extends a selection with the arrow keys once one exists: start with the first word
    await library
      .locator('.md-view p span[data-s]')
      .first()
      .dblclick({ position: { x: 6, y: 8 } })
    await expect(library.getByTestId('hl-toolbar')).toBeVisible()
    // the first Escape closes the toolbar only, and the selection stays to be extended
    await library.keyboard.press('Escape')
    await expect(library.getByTestId('hl-toolbar')).toHaveCount(0)
    await expect(reading).toBeVisible()
    for (let i = 0; i < 6; i++) await library.keyboard.press('Shift+ArrowRight')
    await expect(library.getByTestId('hl-toolbar')).toBeVisible()
    // H creates the highlight from the extended selection
    await library.keyboard.press('h')
    await expect
      .poll(async () => ((await getEntries(library.context())).find(entry => entry.id === 'ent_keys')?.highlights as Array<{ quote: string }> | undefined)?.[0]?.quote)
      .toBe('Alpha beta')
    // and the next Escape leaves the view
    await library.keyboard.press('Escape')
    await expect(reading).toHaveCount(0)
    await library.close()
  })

  test('Escape closes a popover that was only opened, not the reading view with it (RV-LIB-08)', async ({ page, extensionId }) => {
    await saveClip(page, extensionId, 'ent_pop', 'First paragraph with some words to mark.\n\nSecond paragraph.')
    const added = await page.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'ADD_HIGHLIGHT',
        id: 'ent_pop',
        highlight: { id: 'hl_pop', start: 16, end: 26, quote: 'with some', color: 'yellow', createdAt: Date.now() },
      }),
    )
    expect(added.success).toBe(true)
    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/read/ent_pop`)
    const mark = library.locator('.md-hl').first()
    await mark.click()
    await expect(library.getByTestId('hl-popover')).toBeVisible()
    await library.keyboard.press('Escape')
    await expect(library.getByTestId('hl-popover')).toHaveCount(0)
    await expect(library.getByTestId('reading-view')).toBeVisible()
    // focus is back on the mark it was opened from
    await expect(library.locator('.md-hl-hit').first()).toBeFocused()
    await library.keyboard.press('Escape')
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await library.close()
  })
})
