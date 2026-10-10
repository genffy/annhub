import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, sendMessage, textContrast } from './helpers'

/**
 * The properties page (extension.md §2.4): `title` and `tags` on top and locked, a delete that is always there and says
 * why when it cannot work, and a type icon rather than a glyph in front of every name. Asserted from the table's
 * rows, computed style and rendered icons — never from screenshots (e2e/AGENTS.md).
 */

// a cold service worker now and then holds `clearLibrary` for ~20s; that is not what these tests measure
test.describe.configure({ timeout: 90_000 })

/** lucide-react draws its `Text` icon under the name of the icon it is an alias of, and that is the class on the svg. */
const TEXT_ICON = 'text-align-start'

/** One custom property of every type, all in use by the seeded clip; `scratch` is defined and used by nothing. */
const CUSTOM = [
  { name: 'project', type: 'text', icon: TEXT_ICON, value: 'apollo' },
  { name: 'reviewers', type: 'list', icon: 'list', value: ['ada'] },
  { name: 'score', type: 'number', icon: 'hash', value: 3 },
  { name: 'reviewed', type: 'checkbox', icon: 'square-check', value: true },
  { name: 'due', type: 'date', icon: 'calendar', value: '2026-09-12' },
  { name: 'seen', type: 'datetime', icon: 'calendar-clock', value: '2026-09-12T10:30:00' },
] as const

/** Every property of the registry and the icon its type is drawn with. */
const ICONS: Record<string, string> = {
  title: TEXT_ICON,
  author: 'list',
  published: 'calendar',
  tags: 'list',
  description: TEXT_ICON,
  scratch: TEXT_ICON,
  ...Object.fromEntries(CUSTOM.map(property => [property.name, property.icon])),
}

/** Leaves `page` on an extension page, so a test can send one more message of its own. */
async function seed(page: Page, extensionId: string): Promise<void> {
  await clearLibrary(page.context())
  await page.goto(`chrome-extension://${extensionId}/sample.html`)
  await sendMessage(page, {
    type: 'SAVE_CLIP',
    requestId: 'r-props-one',
    draft: { id: 'ent_props_one', content: 'Retries amplify the load.', sourceUrl: 'https://engineering.example.com/retries', properties: { title: 'Retries' }, via: 'menu' },
  })
  await sendMessage(page, {
    type: 'UPDATE_ENTRY',
    id: 'ent_props_one',
    patch: {
      properties: {
        set: Object.fromEntries(CUSTOM.map(property => [property.name, property.value])),
        newDefinitions: CUSTOM.map(property => ({ name: property.name, type: property.type, builtin: false, presets: [] })),
      },
    },
  })
  await sendMessage(page, { type: 'UPSERT_PROPERTY', def: { name: 'scratch', type: 'text', builtin: false, presets: [] } })
}

async function openProperties(page: Page, extensionId: string): Promise<Page> {
  const library = await page.context().newPage()
  await library.setViewportSize({ width: 1180, height: 900 })
  await library.goto(`chrome-extension://${extensionId}/library.html#/properties`)
  await library.reload()
  await expect(library.getByTestId('props-page')).toBeVisible()
  await expect(library.locator('tr[data-prop]')).toHaveCount(5 + CUSTOM.length + 1)
  return library
}

test.describe('the properties page (extension.md §2.4)', () => {
  test("title and tags sit on top and are locked; the other built-ins follow, then the user's own by name", async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openProperties(page, extensionId)

    const names = await library.locator('tr[data-prop]').evaluateAll(rows => rows.map(row => row.getAttribute('data-prop')!))
    expect(names.slice(0, 2), 'the pinned pair').toEqual(['title', 'tags'])
    expect([...names.slice(2, 5)].sort(), 'the other built-ins come next').toEqual(['author', 'description', 'published'])
    const custom = [...CUSTOM.map(property => property.name as string), 'scratch'].sort((a, b) => a.localeCompare(b))
    expect(names.slice(5), 'then the properties the user made').toEqual(custom)

    for (const name of ['title', 'tags']) {
      const row = library.locator(`tr[data-prop="${name}"]`)
      await expect(row.getByTestId(`fixed-${name}`), `${name} says it is locked`).toHaveText('固定')
      await expect(row.getByTestId(`fixed-${name}`).locator('svg.lucide-lock'), `${name} wears the lock`).toHaveCount(1)
      for (const type of ['clip', 'screenshot']) {
        const box = row.getByRole('checkbox', { name: `${name} ${type}` })
        await expect(box, `${name} is attached to a ${type}`).toBeChecked()
        await expect(box, `${name}'s ${type} preset cannot be turned off`).toBeDisabled()
        await expect(box).toHaveAttribute('title', '固定附加，不可取消')
      }
    }
    // a locked box stays as it is even when something forces a click through
    await library.locator('tr[data-prop="title"]').getByRole('checkbox', { name: 'title screenshot' }).click({ force: true })
    const listed = await sendMessage<{ definitions: Array<{ name: string; presets: string[] }> }>(page, { type: 'LIST_PROPERTIES' })
    expect(listed.definitions.find(definition => definition.name === 'title')?.presets.sort()).toEqual(['clip', 'screenshot'])

    // the other built-ins are not locked: their presets are the user's to change
    for (const name of ['author', 'published', 'description']) {
      const row = library.locator(`tr[data-prop="${name}"]`)
      await expect(row.getByTestId(`fixed-${name}`), name).toHaveCount(0)
      await expect(row.locator('.tag'), name).toHaveText('内置')
      await expect(row.getByRole('checkbox', { name: `${name} clip` }), name).toBeEnabled()
    }
    await library.close()
  })

  test('delete is always on the row; where it cannot work it is dimmed and the reason is written next to it', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openProperties(page, extensionId)

    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      for (const [name, reason] of [
        ['title', '内置属性不可删除'],
        ['tags', '内置属性不可删除'],
        ['author', '内置属性不可删除'],
        ['project', '使用中，不可删除'],
        ['seen', '使用中，不可删除'],
      ] as const) {
        const row = library.locator(`tr[data-prop="${name}"]`)
        const button = row.getByTestId(`delete-${name}`)
        const written = row.getByTestId(`delete-reason-${name}`)
        await expect(button, `${name}: the delete button is there`).toBeVisible()
        await expect(button, `${name}: it cannot be used`).toBeDisabled()
        await expect(written, `${name}: the reason is on the page, not only in a tooltip`).toHaveText(reason)
        await expect(button, `${name}: a reader of the button hears the reason`).toHaveAccessibleDescription(reason)
        await expect(button, `${name}: the tooltip says it too`).toHaveAttribute('title', reason)

        const look = await button.evaluate(element => ({ opacity: Number(getComputedStyle(element).opacity), cursor: getComputedStyle(element).cursor }))
        expect(look.opacity, `${name}: the dimmed button looks unavailable`).toBeLessThan(0.7)
        expect(look.cursor, `${name}: and does not invite a click`).toBe('not-allowed')
        const [buttonBox, reasonBox] = await Promise.all([button.boundingBox(), written.boundingBox()])
        expect(reasonBox!.y, `${name}: the reason is under the button`).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height - 1)
        expect(reasonBox!.x, `${name}: and starts at the button's edge`).toBeLessThanOrEqual(buttonBox!.x + 4)
        const [ratio] = await textContrast(written)
        expect(ratio, `${name}: the reason is readable (${scheme})`).toBeGreaterThanOrEqual(4.5)
      }
    }

    // an unused property of the user's own is the one that can go
    const scratch = library.locator('tr[data-prop="scratch"]')
    await expect(scratch.getByTestId('delete-scratch')).toBeEnabled()
    await expect(scratch.getByTestId('delete-reason-scratch')).toHaveCount(0)
    expect(await scratch.getByTestId('delete-scratch').evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1)
    await scratch.getByTestId('delete-scratch').click()
    await expect(library.locator('tr[data-prop="scratch"]')).toHaveCount(0)
    const listed = await sendMessage<{ definitions: Array<{ name: string }> }>(page, { type: 'LIST_PROPERTIES' })
    expect(listed.definitions.some(definition => definition.name === 'scratch')).toBe(false)
    await library.close()
  })

  test('a property type is an icon in front of the name, never a typed glyph — on the page and in the drawer', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openProperties(page, extensionId)

    /** What each row draws in front of its name: the icon's name, and the characters typed besides the name itself. */
    const iconsOf = (selector: string, nameOf: string) =>
      library.locator(selector).evaluateAll(
        (rows, nameSelector) =>
          rows.map(row => {
            const cell = row.querySelector(nameSelector)
            if (!cell) return { typed: `(no ${nameSelector} in the row)`, icons: [] as Array<string | undefined> }
            const typed = [...cell.childNodes]
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent)
              .join('')
              .trim()
            return { typed, icons: [...cell.querySelectorAll(':scope > svg')].map(svg => [...svg.classList].find(name => name.startsWith('lucide-'))?.replace('lucide-', '')) }
          }),
        nameOf,
      )

    const onPage = await iconsOf('tr[data-prop]', '.prop-name-cell')
    const pageNames = await library.locator('tr[data-prop]').evaluateAll(rows => rows.map(row => row.getAttribute('data-prop')!))
    expect(onPage).toEqual(pageNames.map(name => ({ typed: name, icons: [ICONS[name]] })))

    await library.goto(`chrome-extension://${extensionId}/library.html#/clips?e=ent_props_one`)
    await library.reload()
    await expect(library.locator('.drawer .prop-row')).not.toHaveCount(0)
    const inDrawer = await iconsOf('.drawer .prop-row', '.prop-name')
    const drawerNames = inDrawer.map(row => row.typed)
    for (const name of ['title', ...CUSTOM.map(property => property.name as string)]) expect(drawerNames, "the drawer lists the clip's properties").toContain(name)
    for (const row of inDrawer) expect(row.icons, `the icon of ${row.typed}`).toEqual([ICONS[row.typed]])
    await library.close()
  })
})
