import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, getEntries, sendMessage } from './helpers'

/**
 * Editing a clip's original text and its context in the drawer (extension.md §4.1, entry.md §4.7, §5): both can be
 * changed, a clip that has highlights keeps its original read-only and says why, a refused edit keeps what was typed and
 * leaves a way out, and every way of closing writes an open edit first (AGENTS.md rule 5).
 */

// a cold service worker now and then holds `clearLibrary` for ~20s; that is not what these tests measure
test.describe.configure({ timeout: 90_000 })

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qMwAAAAASUVORK5CYII='

const PLAIN_CONTENT = 'Retries amplify the load when clients retry together.'
const PLAIN_CONTEXT = 'In a saturated service, retries amplify the load when clients retry together, and the outage lasts longer.'
const MARKED_CONTENT = 'Backoff with jitter spreads the load across time.'
const MARKED_CONTEXT = 'Exponential backoff with jitter spreads the load across time, which keeps clients from retrying in lockstep.'

/** A clip without highlights, a clip with one, and a screenshot. Leaves `page` on an extension page. */
async function seed(page: Page, extensionId: string): Promise<void> {
  await clearLibrary(page.context())
  await page.goto(`chrome-extension://${extensionId}/sample.html`)
  const clips = [
    ['ent_edit_plain', 'Retries', PLAIN_CONTENT, PLAIN_CONTEXT],
    ['ent_edit_marked', 'Backoff', MARKED_CONTENT, MARKED_CONTEXT],
  ] as const
  for (const [index, [id, title, content, context]] of clips.entries()) {
    await sendMessage(page, {
      type: 'SAVE_CLIP',
      requestId: `r-edit-${index}`,
      draft: { id, content, context, sourceUrl: `https://engineering.example.com/${index}`, properties: { title }, via: 'menu' },
    })
  }
  await sendMessage(page, {
    type: 'ADD_HIGHLIGHT',
    id: 'ent_edit_marked',
    highlight: { id: 'hl_edit_one', start: 0, end: 7, quote: 'Backoff', color: 'yellow', createdAt: Date.now() },
  })
  await sendMessage(page, {
    type: 'SAVE_SCREENSHOT',
    requestId: 'r-edit-shot',
    data: { id: 'ent_edit_shot', dataUrl: PNG_1PX, width: 1, height: 1, sourceUrl: 'https://sre.example.org/latency', title: 'p99 latency', via: 'shortcut' },
  })
}

async function openDrawer(page: Page, extensionId: string, id: string): Promise<Page> {
  const library = await page.context().newPage()
  await library.setViewportSize({ width: 1180, height: 900 })
  await library.goto(`chrome-extension://${extensionId}/library.html#/all?e=${id}`)
  await library.reload()
  await expect(library.locator(`.drawer[data-entry-id="${id}"]`)).toBeVisible()
  return library
}

const stored = async (page: Page, id: string) => (await getEntries(page.context())).find(entry => entry.id === id)!

test.describe('editing the original and the context in the drawer (extension.md §4.1)', () => {
  test('a clip without highlights has its original edited in place; a refused edit keeps the draft and can be cancelled', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openDrawer(page, extensionId, 'ent_edit_plain')
    const drawer = library.locator('.drawer')
    await expect(drawer.getByTestId('drawer-lock')).toHaveCount(0)

    await drawer.getByTestId('edit-original').click()
    const editor = drawer.getByRole('textbox', { name: '原文（Markdown）' })
    await expect(editor, 'the editor takes the keyboard').toBeFocused()
    await expect(editor, 'it holds the Markdown source').toHaveValue(PLAIN_CONTENT)

    // the context must still contain the original: an edit that breaks that is refused, says so, and keeps what was typed
    const stray = 'A sentence that the context never mentions.'
    await editor.fill(stray)
    await drawer.locator('.drawer-title').click() // leaving the editor writes it
    await expect(drawer.getByRole('alert')).toContainText('语境必须仍然包含原文')
    await expect(editor, 'the draft is still there').toHaveValue(stray)
    expect((await stored(page, 'ent_edit_plain')).content, 'nothing was written').toBe(PLAIN_CONTENT)

    // closing does not drop it either: the drawer stays open on the draft and its error
    await library.keyboard.press('Escape')
    await library.waitForTimeout(400) // a close that was going to happen has happened by now
    await expect(drawer).toBeVisible()
    await expect(editor).toHaveValue(stray)
    await expect(drawer.getByRole('alert')).toBeVisible()

    // the way out: Cancel drops the draft and the saved text stays
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(drawer.getByRole('alert')).toHaveCount(0)
    await expect(drawer.getByTestId('edit-original'), 'the keyboard goes back to the button that opened the editor').toBeFocused()
    expect((await stored(page, 'ent_edit_plain')).content).toBe(PLAIN_CONTENT)

    // a text the context still contains is written, by Save
    const shorter = 'retries amplify the load'
    await drawer.getByTestId('edit-original').click()
    await editor.fill(shorter)
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(drawer.getByTestId('edit-original')).toBeFocused()
    await expect.poll(async () => (await stored(page, 'ent_edit_plain')).content).toBe(shorter)
    await expect(drawer.locator('.md-view')).toHaveText(shorter)

    // and by leaving the editor
    await drawer.getByTestId('edit-original').click()
    await editor.fill('when clients retry together')
    await drawer.locator('.drawer-title').click()
    await expect(editor).toHaveCount(0)
    await expect.poll(async () => (await stored(page, 'ent_edit_plain')).content).toBe('when clients retry together')
    await library.close()
  })

  test('closing the drawer writes an open edit first', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openDrawer(page, extensionId, 'ent_edit_plain')
    const drawer = library.locator('.drawer')

    await drawer.getByTestId('edit-original').click()
    await drawer.getByRole('textbox', { name: '原文（Markdown）' }).fill('when clients retry together')
    await library.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect.poll(async () => (await stored(page, 'ent_edit_plain')).content).toBe('when clients retry together')

    await library.locator('.row-main').filter({ hasText: 'Retries' }).click()
    await drawer.getByTestId('edit-context').click()
    await drawer.getByRole('textbox', { name: '语境' }).fill(`Then, ${'when clients retry together'}, the queue grows.`)
    await library.locator('.drawer-backdrop').click({ position: { x: 20, y: 20 } })
    await expect(drawer).toHaveCount(0)
    await expect.poll(async () => (await stored(page, 'ent_edit_plain')).context).toBe('Then, when clients retry together, the queue grows.')
    await library.close()
  })

  test('the context is edited the same way: it must contain the original, and emptying it removes it', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openDrawer(page, extensionId, 'ent_edit_plain')
    const drawer = library.locator('.drawer')

    await drawer.getByTestId('edit-context').click()
    const editor = drawer.getByRole('textbox', { name: '语境' })
    await expect(editor).toHaveValue(PLAIN_CONTEXT)
    await editor.fill('Nothing about the clip in here.')
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(drawer.getByRole('alert')).toContainText('语境没有保存')
    await expect(editor, 'the draft stays').toHaveValue('Nothing about the clip in here.')
    expect((await stored(page, 'ent_edit_plain')).context).toBe(PLAIN_CONTEXT)

    const longer = `${PLAIN_CONTEXT} A second sentence follows.`
    await editor.fill(longer)
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(drawer.locator('.drawer-context')).toContainText('A second sentence follows.')
    await expect.poll(async () => (await stored(page, 'ent_edit_plain')).context).toBe(longer)

    // an emptied context is no context: the section goes and the clip keeps its original
    await drawer.getByTestId('edit-context').click()
    await editor.fill('')
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(drawer.locator('.drawer-context')).toHaveCount(0)
    await expect.poll(async () => (await stored(page, 'ent_edit_plain')).context).toBeUndefined()
    expect((await stored(page, 'ent_edit_plain')).content).toBe(PLAIN_CONTENT)
    await library.close()
  })

  test('with highlights the original is read-only and says why; the context stays editable', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openDrawer(page, extensionId, 'ent_edit_marked')
    const drawer = library.locator('.drawer')

    await expect(drawer.getByTestId('edit-original'), 'no way to edit the original').toHaveCount(0)
    await expect(drawer.getByTestId('drawer-lock'), 'and the reason is written beside it').toContainText('有高亮时原文只读')
    await expect(drawer.locator('[data-hl-id]'), 'the original still shows its highlight').not.toHaveCount(0)
    await expect(drawer.getByRole('textbox', { name: '原文（Markdown）' })).toHaveCount(0)

    // the context is a separate text and can still change
    await drawer.getByTestId('edit-context').click()
    const editor = drawer.getByRole('textbox', { name: '语境' })
    await editor.fill(`${MARKED_CONTEXT} Jitter matters most under load.`)
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect.poll(async () => (await stored(page, 'ent_edit_marked')).context).toBe(`${MARKED_CONTEXT} Jitter matters most under load.`)
    expect((await stored(page, 'ent_edit_marked')).content, 'the original is as it was').toBe(MARKED_CONTENT)

    // the lock follows the highlights: with the last one gone the original can be edited
    await sendMessage(page, { type: 'REMOVE_HIGHLIGHT', id: 'ent_edit_marked', highlightId: 'hl_edit_one' })
    await library.reload()
    await expect(drawer.getByTestId('drawer-lock')).toHaveCount(0)
    await expect(drawer.getByTestId('edit-original')).toBeVisible()
    await library.close()
  })

  test('a screenshot has no original text to edit', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openDrawer(page, extensionId, 'ent_edit_shot')
    const drawer = library.locator('.drawer')
    await expect(drawer.locator('.drawer-image')).toBeVisible()
    await expect(drawer.getByTestId('edit-original')).toHaveCount(0)
    await expect(drawer.getByTestId('edit-context')).toHaveCount(0)
    await expect(drawer.getByTestId('drawer-lock')).toHaveCount(0)
    await library.close()
  })
})
