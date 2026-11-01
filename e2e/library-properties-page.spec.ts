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
      // the box's name says the entry type in words, as the type chip does (library.type.*), not the internal name
      const typeName: Record<string, string> = { clip: '剪藏', screenshot: '截图' }
      for (const type of ['clip', 'screenshot']) {
        const box = row.getByRole('checkbox', { name: `${name} ${typeName[type]}` })
        await expect(box, `${name} is attached to a ${type}`).toBeChecked()
        await expect(box, `${name}'s ${type} preset cannot be turned off`).toBeDisabled()
        await expect(box).toHaveAttribute('title', '固定附加，不可取消')
      }
    }
    // a locked box stays as it is even when something forces a click through
    await library.locator('tr[data-prop="title"]').getByRole('checkbox', { name: 'title 截图' }).click({ force: true })
    const listed = await sendMessage<{ definitions: Array<{ name: string; presets: string[] }> }>(page, { type: 'LIST_PROPERTIES' })
    expect(listed.definitions.find(definition => definition.name === 'title')?.presets.sort()).toEqual(['clip', 'screenshot'])

    // the other built-ins are not locked: their presets are the user's to change
    for (const name of ['author', 'published', 'description']) {
      const row = library.locator(`tr[data-prop="${name}"]`)
      await expect(row.getByTestId(`fixed-${name}`), name).toHaveCount(0)
      await expect(row.locator('.tag'), name).toHaveText('内置')
      await expect(row.getByRole('checkbox', { name: `${name} 剪藏` }), name).toBeEnabled()
    }
    await library.close()
  })

  test('every row says its type in words, not only an icon (visual.md §3)', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openProperties(page, extensionId)
    await expect(library.getByRole('columnheader', { name: '类型' })).toBeVisible()
    const words = await library.locator('[data-testid^="type-"]').allTextContents()
    expect(words.length, 'a type word on every row').toBeGreaterThanOrEqual(6)
    for (const word of ['文本', '列表', '数字', '复选框', '日期', '日期时间']) expect(words, `the type word "${word}" is on the page`).toContain(word)
    await library.close()
  })

  test('delete is always on the row; where it cannot work it is dimmed and the reason is written next to it', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openProperties(page, extensionId)

    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      for (const [name, reason, short] of [
        ['title', '内置属性不可删除', '内置'],
        ['tags', '内置属性不可删除', '内置'],
        ['author', '内置属性不可删除', '内置'],
        ['project', '使用中，不可删除', '使用中'],
        ['seen', '使用中，不可删除', '使用中'],
      ] as const) {
        const row = library.locator(`tr[data-prop="${name}"]`)
        const button = row.getByTestId(`delete-${name}`)
        const written = row.getByTestId(`delete-reason-${name}`)
        await expect(button, `${name}: the delete button is there`).toBeVisible()
        await expect(button, `${name}: it cannot be used`).toBeDisabled()
        // the visible word is short (extension.md §2.4); the sentence stays for the reader and the tooltip
        await expect(written, `${name}: the reason is on the page, not only in a tooltip`).toHaveText(short)
        await expect(button, `${name}: a reader of the button hears the reason`).toHaveAccessibleDescription(reason)
        await expect(button, `${name}: the tooltip says it too`).toHaveAttribute('title', reason)
        const colours = await button.evaluate(element => ({ borderTop: getComputedStyle(element).borderTopColor, colour: getComputedStyle(element).color }))
        const danger = await library.evaluate(() => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--ann-danger)'
          document.body.append(probe)
          const colour = getComputedStyle(probe).color
          probe.remove()
          return colour
        })
        expect(colours.borderTop, `${name}: a delete that cannot happen is not red (${scheme})`).not.toBe(danger)
        expect(colours.colour, `${name}: quiet text, not a red shout (${scheme})`).not.toBe(danger)

        const look = await button.evaluate(element => ({ opacity: Number(getComputedStyle(element).opacity), cursor: getComputedStyle(element).cursor }))
        expect(look.opacity, `${name}: the dimmed button looks unavailable`).toBeLessThan(0.7)
        expect(look.cursor, `${name}: and does not invite a click`).toBe('not-allowed')
        const [buttonBox, reasonBox] = await Promise.all([button.boundingBox(), written.boundingBox()])
        expect(reasonBox!.y, `${name}: the reason is under the button`).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height - 1)
        // the delete is an icon square at the column's right end, so the word under it shares that edge
        expect(Math.abs(reasonBox!.x + reasonBox!.width - (buttonBox!.x + buttonBox!.width)), `${name}: and hangs under the button's edge`).toBeLessThanOrEqual(2)
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

    /** What each row draws in front of its name: the icon's name, and the name's own characters. On the page the
     * name sits in its own span (it has to truncate); in the drawer it is the label's own text node. */
    const iconsOf = (selector: string, nameOf: string) =>
      library.locator(selector).evaluateAll(
        (rows, nameSelector) =>
          rows.map(row => {
            const cell = row.querySelector(nameSelector)
            if (!cell) return { typed: `(no ${nameSelector} in the row)`, icons: [] as Array<string | undefined> }
            const typed = (
              cell.querySelector('.prop-name-text')?.textContent ??
              [...cell.childNodes]
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent)
                .join('')
            ).trim()
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
    // the editable rows carry the property names; the read-only system rows below them are named by the interface
    const inDrawer = await iconsOf('.drawer .prop-row:not(.prop-ro)', '.prop-name')
    const drawerNames = inDrawer.map(row => row.typed)
    for (const name of ['title', ...CUSTOM.map(property => property.name as string)]) expect(drawerNames, "the drawer lists the clip's properties").toContain(name)
    for (const row of inDrawer) expect(row.icons, `the icon of ${row.typed}`).toEqual([ICONS[row.typed]])
    await library.close()
  })

  test('the page head counts the registry, and "delete unused" carries the count and waits for one (extension.md §2.4)', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openProperties(page, extensionId)

    // the subtitle counts the whole registry, built-ins and the rest
    await expect(library.locator('.props-page .page-sub')).toHaveText('12 个属性 · 内置 5 · 自定义 7')
    const unused = library.getByTestId('delete-unused')
    await expect(unused, 'scratch is the one unused property').toHaveText('删除未使用（1）')
    await expect(unused).toBeEnabled()

    library.once('dialog', dialog => void dialog.accept())
    await unused.click()
    await expect(library.locator('tr[data-prop="scratch"]')).toHaveCount(0)
    await expect(unused, 'nothing left to delete').toHaveText('删除未使用（0）')
    await expect(unused).toBeDisabled()
    // a disabled button does not even open the confirm
    let asked = false
    library.once('dialog', () => {
      asked = true
    })
    await unused.click({ force: true })
    expect(asked, 'no confirm with nothing to delete').toBe(false)
    await library.close()
  })

  test('the registry lays out as one grid: a 38px header, rows at least 48 tall, seven columns, usage right-aligned', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openProperties(page, extensionId)

    const shape = await library.evaluate(() => {
      const table = document.querySelector<HTMLElement>('.props-table')!
      const head = table.querySelector<HTMLElement>('thead tr')!
      const row = table.querySelector<HTMLElement>('tr[data-prop]')!
      const usage = row.querySelector<HTMLElement>('[data-testid^="usage-"]')!
      const nameHead = [...head.querySelectorAll<HTMLElement>('th')].find(cell => cell.textContent?.trim() === '名称')!
      const usageHead = [...head.querySelectorAll<HTMLElement>('th')].find(cell => cell.textContent?.trim() === '使用数')!
      const nameText = row.querySelector<HTMLElement>('.prop-name-text')!
      const nameTag = row.querySelector<HTMLElement>('.prop-name-cell .tag')
      const icon = row.querySelector<HTMLElement>('.prop-name-cell svg')!
      return {
        headerHeight: Math.round(head.getBoundingClientRect().height),
        rowHeights: [...table.querySelectorAll<HTMLElement>('tr[data-prop]')].map(item => Math.round(item.getBoundingClientRect().height)),
        columns: getComputedStyle(row).gridTemplateColumns.split(' ').length,
        role: table.getAttribute('role'),
        rowRole: row.getAttribute('role'),
        headerCells: [...head.querySelectorAll('th')].map(cell => (cell.textContent ?? '').trim()),
        usageAlign: getComputedStyle(usage).textAlign,
        tableLeft: Math.round(table.getBoundingClientRect().x),
        titleLeft: Math.round(document.querySelector<HTMLElement>('.page-title')!.getBoundingClientRect().x),
        tableRight: Math.round(table.getBoundingClientRect().right),
        contentRight: Math.round(document.querySelector<HTMLElement>('.props-page .page-body')!.getBoundingClientRect().right - 32),
        nameHeadLeft: Math.round(nameHead.getBoundingClientRect().x),
        iconLeft: Math.round(icon.getBoundingClientRect().x),
        usageHeadRight: Math.round(usageHead.getBoundingClientRect().right),
        usageRight: Math.round(usage.getBoundingClientRect().right),
        tagGap: nameTag ? Math.round(nameTag.getBoundingClientRect().x - nameText.getBoundingClientRect().right) : null,
      }
    })
    expect(shape.headerHeight, 'the header row is 38 tall').toBe(38)
    expect(Math.min(...shape.rowHeights), 'every row is at least 48 tall').toBeGreaterThanOrEqual(48)
    expect(shape.columns, 'name, type, default, usage, two presets, delete').toBe(7)
    expect(shape.role, 'the grid display drops the implicit roles; they are spelled out').toBe('table')
    expect(shape.rowRole).toBe('row')
    // the two preset columns are named after the entry types, in words
    expect(shape.headerCells.slice(4, 6)).toEqual(['剪藏', '截图'])
    expect(shape.usageAlign, 'the usage counts read from the right').toBe('right')
    // the table fills the content area (extension.md §2.2): it starts at the title's edge and runs to the content's right edge, not a centred column
    expect(Math.abs(shape.tableLeft - shape.titleLeft), 'the table starts at the title edge').toBeLessThanOrEqual(1)
    expect(Math.abs(shape.tableRight - shape.contentRight), 'the table fills the content width').toBeLessThanOrEqual(1)
    // the header cells read left (the UA centres th): 名称 sits over the row's icon, 使用数 ends with its numbers
    expect(Math.abs(shape.nameHeadLeft - shape.iconLeft), 'the 名称 header starts with the column').toBeLessThanOrEqual(2)
    expect(Math.abs(shape.usageHeadRight - shape.usageRight), 'the 使用数 header ends with the numbers').toBeLessThanOrEqual(2)
    // the 固定/内置 tag follows the name (design .ptab .nm), not the cell's far end
    expect(shape.tagGap, 'the tag sits right after the name').not.toBeNull()
    expect(shape.tagGap!, 'the tag sits right after the name').toBeLessThanOrEqual(16)
    await library.close()
  })

  test('a new definition opens in the table: the save button waits, the reason is written under the name', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await openProperties(page, extensionId)

    await library.getByTestId('new-property').click()
    const form = library.locator('tr.prop-new-row')
    await expect(form).toBeVisible()
    const name = form.getByLabel('名称', { exact: true })
    const save = form.getByRole('button', { name: '保存' })

    await expect(save, 'an empty name cannot be saved').toBeDisabled()
    await name.fill('source')
    await expect(form.locator('.prop-new-error'), 'the reserved name is refused in place').toContainText('属性名无效')
    await expect(save, 'a refused name cannot be saved either').toBeDisabled()

    await name.fill('owner')
    await form.getByRole('radio', { name: '列表' }).click()
    await expect(form.locator('.prop-new-error')).toHaveCount(0)
    await expect(save).toBeEnabled()
    await save.click()
    const row = library.locator('tr[data-prop="owner"]')
    await expect(row).toBeVisible()
    await expect(row.getByTestId('type-owner')).toHaveText('列表')
    await expect(form, 'the form closes on success').toHaveCount(0)
    await expect(library.getByTestId('delete-unused'), 'the new unused property counts').toHaveText('删除未使用（2）')
    await library.close()
  })
})
