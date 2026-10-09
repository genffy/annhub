import { test, expect } from './fixtures'
import { clearLibrary, getCapturePageUrl, getEntries, selectUntilMenu, waitForClipToast } from './helpers'

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

    // select rendered text and create a highlight with the yellow dot
    const surface = reading.locator('.md-view')
    await surface.getByText('Retries can amplify an outage').first().click({ trial: true })
    await library.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.md-view span[data-s]')).find(node => node.textContent?.includes('Retries can amplify'))
      if (!el) throw new Error('run not found')
      const range = document.createRange()
      range.setStart(el.firstChild!, 0)
      range.setEnd(el.firstChild!, 6)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 200, clientY: 200 }))
    })
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

    // Esc closes back to the list route that opened it
    await library
      .getByTestId('reading-view')
      .locator('.md-view')
      .click({ position: { x: 4, y: 4 } })
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
    // export runs from the page context (a worker's message to itself does not loop back)
    const zip = await library.evaluate(async () => {
      const send = (globalThis as unknown as { chrome: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } } }).chrome.runtime.sendMessage
      return send({ type: 'EXPORT_ZIP', lang: 'zh', requestId: 't' }) as Promise<{ success: boolean; data?: { clips: number } }>
    })
    expect(zip).toMatchObject({ success: true, data: expect.objectContaining({ clips: 1 }) })
    const entries = await getEntries(library.context())
    expect(entries[0]!.highlights?.length).toBe(1)
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
})
