import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, sendMessage } from './helpers'

/**
 * The library's shell, asserted from geometry, computed style and the icons that are drawn — never from screenshots
 * (e2e/AGENTS.md): the reading view lives in the content column instead of covering the nav (extension.md §4.2), the
 * nav folds by hand, every page opens with its title (§2.2), every control draws in the page's own font and every
 * nav item and type chip carries the icon visual.md §3 names. Each of these once shipped different from the design
 * while the suite stayed green, because nothing measured it.
 */

// a cold service worker now and then holds `clearLibrary` for ~20s; that is not what these tests measure
test.describe.configure({ timeout: 90_000 })

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qMwAAAAASUVORK5CYII='

const NAV_FOLDED_KEY = 'annhub.navFolded'

/**
 * A library of clips and, optionally, one screenshot. Leaves `page` on an extension page, so a test can send one more
 * message of its own. The newest clip (the first row) is the one with the highest index.
 */
async function seed(page: Page, extensionId: string, options: { clips?: number; screenshot?: boolean } = {}): Promise<void> {
  const { clips = 3, screenshot = false } = options
  await clearLibrary(page.context())
  await page.goto(`chrome-extension://${extensionId}/sample.html`)
  for (let index = 0; index < clips; index++) {
    await sendMessage(page, {
      type: 'SAVE_CLIP',
      requestId: `r-shell-${index}`,
      draft: {
        id: `ent_shell_${String(index).padStart(2, '0')}`,
        content: `Retries amplify the load when every client backs off together (clip ${index}).`,
        sourceUrl: `https://engineering.example.com/${index}`,
        properties: { title: `Clip ${index}` },
        via: 'menu',
      },
    })
  }
  if (screenshot) {
    await sendMessage(page, {
      type: 'SAVE_SCREENSHOT',
      requestId: 'r-shell-shot',
      data: { id: 'ent_shell_shot', dataUrl: PNG_1PX, width: 1, height: 1, sourceUrl: 'https://sre.example.org/latency', title: 'p99 latency', via: 'shortcut' },
    })
  }
}

/** Opens the library at a list and reads its first clip the way a user does: row, drawer, 阅读. */
async function openReading(library: Page, extensionId: string, view = 'clips'): Promise<void> {
  await library.goto(`chrome-extension://${extensionId}/library.html#/${view}`)
  await library.reload()
  await library.locator('.row-main').first().click()
  await library.getByTestId('drawer-read').click()
  await expect(library.getByTestId('reading-view').locator('.reading-title')).not.toHaveText('')
}

test.describe('the reading view takes the content area and nothing more (extension.md §4.2)', () => {
  test('it fills the content column and leaves every nav control uncovered', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    await openReading(library, extensionId)

    const layout = await library.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector(selector)!.getBoundingClientRect()
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      }
      // what the pointer would reach at the middle of each nav control
      const controls = [...document.querySelectorAll<HTMLElement>('.side .nav-item, .side .nav-export')].map(control => {
        const box = control.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return { name: control.getAttribute('aria-label') ?? control.textContent, reachable: Boolean(hit && control.contains(hit)) }
      })
      return { nav: rect('.side'), content: rect('main.content'), reading: rect('[data-testid="reading-view"]'), controls }
    })
    expect(layout.reading.left, 'the reading view starts where the content column does, not under the nav').toBeGreaterThanOrEqual(layout.nav.right - 1)
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) expect(layout.reading[edge], `the reading view's ${edge} edge`).toBeCloseTo(layout.content[edge], 0)
    expect(layout.controls.length, 'nav controls measured').toBeGreaterThanOrEqual(7)
    expect(
      layout.controls.filter(control => !control.reachable).map(control => control.name),
      'nav controls the reading view covers',
    ).toEqual([])
    await library.close()
  })

  test('the nav stays usable: a nav link leaves the reading view for that list', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    await openReading(library, extensionId)

    // a short timeout: where the nav is covered the click would wait for the pointer to reach it for the whole test
    await library.getByRole('link', { name: '截图', exact: true }).click({ timeout: 5_000 })
    await expect(library).toHaveURL(/#\/screenshots/)
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await expect(library.getByRole('heading', { level: 1 })).toHaveText('截图')
    await library.close()
  })

  test('focus stays in the reading view and the nav: the list behind it cannot be tabbed into', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    await openReading(library, extensionId)

    const whereIsFocus = () =>
      library.evaluate(() => {
        const active = document.activeElement
        if (!active || active === document.body) return 'body'
        if (active.closest('[data-testid="reading-view"]')) return 'reading view'
        if (active.closest('.side')) return 'nav'
        return `behind the reading view: <${active.tagName.toLowerCase()} class="${active.className}">`
      })

    // the view takes the keyboard from the drawer's button it replaced
    await expect.poll(whereIsFocus).toBe('reading view')

    const visited = new Set<string>()
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let step = 0; step < 40; step++) {
        await library.keyboard.press(key)
        visited.add(await whereIsFocus())
      }
    }
    expect(
      [...visited].filter(place => place.startsWith('behind')),
      'places the keyboard reached outside the reading view and the nav',
    ).toEqual([])
    expect(visited.has('reading view') && visited.has('nav'), `focus moved through both (saw ${[...visited].join(', ')})`).toBe(true)

    // and the pointer cannot reach the list either: the row under the reading view is not what a click there would hit
    const blocked = await library.evaluate(() => {
      const row = document.querySelector('.row-main')!.getBoundingClientRect()
      const hit = document.elementFromPoint(row.left + row.width / 2, row.top + row.height / 2)
      return Boolean(hit?.closest('[data-testid="reading-view"]'))
    })
    expect(blocked, 'a click over the list lands on the reading view').toBe(true)
    await library.close()
  })

  test('the nav marks the list the clip is read from', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    for (const [view, name] of [
      ['all', '全部'],
      ['clips', '剪藏'],
    ] as const) {
      await openReading(library, extensionId, view)
      await expect(library.locator('.nav-item[aria-current="page"]'), `reading from the ${name} list`).toHaveAccessibleName(name)
    }
    await library.close()
  })

  test('Back returns to the list where it was left, not to its top', async ({ page, extensionId }) => {
    await seed(page, extensionId, { clips: 16 })
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 520 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.reload()
    await expect(library.locator('.row')).toHaveCount(16)

    const list = library.locator('.list')
    await list.evaluate(element => {
      element.scrollTop = 260
    })
    const before = await list.evaluate(element => element.scrollTop)
    expect(before, 'the list scrolls at all').toBeGreaterThan(200)

    // a row that is on screen now, so that opening it does not scroll the list
    const visible = await library.locator('.row').evaluateAll(rows => {
      const frame = document.querySelector('.list')!.getBoundingClientRect()
      return rows.findIndex(row => {
        const box = row.getBoundingClientRect()
        return box.top >= frame.top + 4 && box.bottom <= frame.bottom - 4
      })
    })
    expect(visible).toBeGreaterThanOrEqual(0)
    await library.locator('.row-main').nth(visible).click()
    await library.getByTestId('drawer-read').click()
    await expect(library.getByTestId('reading-view').locator('.reading-title')).not.toHaveText('')

    await library.keyboard.press('Escape') // out of the reading view, back to the drawer
    await expect(library.getByTestId('reading-view')).toHaveCount(0)
    await library.keyboard.press('Escape') // out of the drawer
    await expect(library.locator('.drawer')).toHaveCount(0)
    expect(await list.evaluate(element => element.scrollTop), 'the list is where it was left').toBeCloseTo(before, -1)
    await library.close()
  })
})

test.describe('the nav folds to an icon rail by hand (extension.md §2.2)', () => {
  test('the fold button toggles the rail by pointer and keyboard, the choice survives a reload, and the content takes the room', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.reload()

    const fold = library.locator('.nav-fold')
    const widths = () =>
      library.evaluate(() => ({
        nav: document.querySelector('.side')!.getBoundingClientRect().width,
        content: document.querySelector('main.content')!.getBoundingClientRect().width,
      }))

    await expect(fold).toHaveAccessibleName('折叠导航')
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await expect(library.locator('.nav-label').first()).toBeVisible()
    const wide = await widths()
    expect(wide.nav, 'the nav is the full nav').toBeGreaterThan(180)

    await fold.click()
    await expect(fold).toHaveAccessibleName('展开导航')
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(async () => (await widths()).nav, 'the nav is the 52px rail').toBeLessThanOrEqual(60)
    expect((await widths()).content - wide.content, 'the content column takes the room the nav gave up').toBeGreaterThan(140)
    await expect(library.locator('.nav-label').first()).toBeHidden()
    // the rail keeps names for the pointer (tooltip) and the reader, and the counts
    await expect(library.getByRole('link', { name: '截图', exact: true })).toHaveAttribute('title', '截图')
    await expect(library.locator('a[href="#/all"] .nav-count')).toHaveText('3')
    expect(await library.evaluate(key => localStorage.getItem(key), NAV_FOLDED_KEY), 'a fold is remembered').toBe('1')

    await library.reload()
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect((await widths()).nav, 'still the rail after a reload').toBeLessThanOrEqual(60)

    // the keyboard unfolds it; unfolding is no preference worth keeping
    await fold.focus()
    await library.keyboard.press('Enter')
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(async () => (await widths()).nav).toBeGreaterThan(180)
    expect(await library.evaluate(key => localStorage.getItem(key), NAV_FOLDED_KEY)).toBeNull()
    await library.reload()
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await library.close()
  })

  test('a narrow window starts as the rail, and unfolding it lasts for this visit only', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 390, height: 844 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.reload()

    const fold = library.locator('.nav-fold')
    const navWidth = () => library.locator('.side').evaluate(element => element.getBoundingClientRect().width)
    await expect(fold).toHaveAccessibleName('展开导航')
    expect(await navWidth(), 'a 390px window starts with the rail').toBeLessThanOrEqual(60)

    await fold.click()
    await expect(fold).toHaveAccessibleName('折叠导航')
    await expect.poll(navWidth, 'the user asked for the full nav').toBeGreaterThan(180)
    expect(await library.evaluate(key => localStorage.getItem(key), NAV_FOLDED_KEY), 'unfolding is not remembered').toBeNull()

    await library.reload()
    expect(await navWidth(), 'the next visit starts with the rail again').toBeLessThanOrEqual(60)
    await library.close()
  })

  test('the fold button is part of the rail: nothing in it leaves the 52px column', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 390, height: 844 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.reload()
    await expect(library.locator('.nav-fold')).toBeVisible()
    const outside = await library.evaluate(() => {
      const side = document.querySelector('.side')!.getBoundingClientRect()
      return [...document.querySelectorAll('.side *')]
        .filter(element => {
          const box = element.getBoundingClientRect()
          return box.width > 0 && (box.left < side.left - 1 || box.right > side.right + 1)
        })
        .map(element => `${element.tagName.toLowerCase()}.${(element as HTMLElement).className}`)
    })
    expect(outside, 'elements of the rail that leave it').toEqual([])
    await library.close()
  })
})

test.describe('every page opens with its title (extension.md §2.2)', () => {
  for (const width of [1180, 390]) {
    test(`on a list the title and the search share a row and the filters follow, at ${width}px`, async ({ page, extensionId }) => {
      await seed(page, extensionId, { screenshot: true })
      const library = await page.context().newPage()
      await library.setViewportSize({ width, height: 800 })
      for (const [hash, title] of [
        ['all', '全部'],
        ['clips', '剪藏'],
        ['highlights', '高亮'],
        ['screenshots', '截图'],
      ] as const) {
        await library.goto(`chrome-extension://${extensionId}/library.html#/${hash}`)
        await library.reload()
        await expect(library.getByRole('heading', { level: 1 }), hash).toHaveText(title)
        const row = await library.evaluate(() => {
          const box = (selector: string) => {
            const rect = document.querySelector(selector)!.getBoundingClientRect()
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
          }
          return {
            title: box('h1'),
            search: box('.search'),
            toolbar: box('.toolbar'),
            content: box('main.content'),
            sideways: document.documentElement.scrollWidth - innerWidth,
          }
        })
        const middle = (box: { top: number; bottom: number }) => (box.top + box.bottom) / 2
        expect(row.search.left, `${hash}: the search is to the right of the title`).toBeGreaterThanOrEqual(row.title.right + 8)
        expect(Math.abs(middle(row.search) - middle(row.title)), `${hash}: title and search sit on one row`).toBeLessThanOrEqual(8)
        expect(row.search.right, `${hash}: the search stays inside the content column`).toBeLessThanOrEqual(row.content.right)
        expect(row.toolbar.top, `${hash}: the filters come under the title row`).toBeGreaterThanOrEqual(Math.max(row.title.bottom, row.search.bottom) - 1)
        expect(row.sideways, `${hash}: the page does not scroll sideways`).toBeLessThanOrEqual(0)
      }
      await library.close()
    })
  }

  test('the properties and settings pages open with their own title and no list controls', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    for (const [hash, title] of [
      ['properties', '属性'],
      ['settings', '设置'],
    ] as const) {
      await library.goto(`chrome-extension://${extensionId}/library.html#/${hash}`)
      await library.reload()
      await expect(library.getByRole('heading', { level: 1 }), hash).toHaveText(title)
      await expect(library.locator('.search'), hash).toHaveCount(0)
      await expect(library.locator('.nav-item[aria-current="page"]'), hash).toHaveAccessibleName(title)
    }
    await library.close()
  })
})

test.describe('icons and type (visual.md §3)', () => {
  /** The lucide icon an element draws: its class, `lucide-<name>`. */
  const iconsOf = (selector: string) => (page: Page) =>
    page.locator(selector).evaluateAll(elements =>
      elements.map(element => {
        const icons = [...element.querySelectorAll('svg')].map(svg => [...svg.classList].find(name => name.startsWith('lucide-'))?.replace('lucide-', ''))
        return { target: element.getAttribute('href') ?? element.className, icons }
      }),
    )

  test('the nav draws library, bookmark, highlighter, scan, tags and settings; the fold button draws the panel', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.reload()
    // polled: `evaluateAll` does not wait for the shell to be there, and a sampled answer of "nothing yet" is no answer
    await expect
      .poll(() => iconsOf('.side .nav-item')(library))
      .toEqual([
        { target: '#/all', icons: ['library'] },
        { target: '#/clips', icons: ['bookmark'] },
        { target: '#/highlights', icons: ['highlighter'] },
        { target: '#/screenshots', icons: ['scan'] },
        { target: '#/properties', icons: ['tags'] },
        { target: '#/settings', icons: ['settings'] },
      ])
    const foldIcons = async () => (await iconsOf('.nav-fold')(library))[0]?.icons
    await expect.poll(foldIcons).toEqual(['panel-left-close'])
    await library.locator('.nav-fold').click()
    await expect.poll(foldIcons).toEqual(['panel-left-open'])
    await library.close()
  })

  test('an entry type is its icon and its name together, in the list and in the drawer', async ({ page, extensionId }) => {
    await seed(page, extensionId, { clips: 1, screenshot: true })
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.reload()
    await expect(library.locator('.row')).toHaveCount(2)

    const chips = (container: string) =>
      library.locator(`${container} .type-chip`).evaluateAll(elements =>
        elements.map(chip => {
          const svg = chip.querySelector('svg')
          const text = document.createRange()
          text.selectNodeContents(chip.lastChild!)
          const [iconBox, textBox, chipBox] = [svg?.getBoundingClientRect(), text.getBoundingClientRect(), chip.getBoundingClientRect()]
          return {
            type: chip.getAttribute('data-type'),
            icon: svg ? [...svg.classList].find(name => name.startsWith('lucide-')) : null,
            text: chip.textContent!.trim(),
            iconBeforeText: iconBox ? iconBox.right <= textBox.left + 1 : false,
            iconInsideChip: iconBox ? iconBox.left >= chipBox.left - 1 && iconBox.right <= chipBox.right + 1 : false,
            iconSize: iconBox ? Math.round(iconBox.width) : 0,
          }
        }),
      )
    const expectedChips = [
      { type: 'screenshot', icon: 'lucide-scan', text: '截图', iconBeforeText: true, iconInsideChip: true, iconSize: 12 },
      { type: 'clip', icon: 'lucide-bookmark', text: '剪藏', iconBeforeText: true, iconInsideChip: true, iconSize: 12 },
    ]
    await expect.poll(() => chips('.list')).toEqual(expectedChips) // the screenshot was saved last, so it is the first row

    // polled: the drawer opens a beat after the click, and `evaluateAll` does not wait for it
    await library.locator('.row[data-type="screenshot"] .row-main').click()
    await expect.poll(() => chips('.drawer-header')).toEqual([expectedChips[0]])
    await library.keyboard.press('Escape')
    await expect(library.locator('.drawer')).toHaveCount(0)
    await library.locator('.row[data-type="clip"] .row-main').click()
    await expect.poll(() => chips('.drawer-header')).toEqual([expectedChips[1]])
    await library.close()
  })
})

test.describe('controls draw in the interface font (visual.md §2)', () => {
  /** Every rendered button, input, select and textarea whose font is not the page's own. */
  async function strangers(page: Page): Promise<{ checked: number; strangers: string[] }> {
    return page.evaluate(() => {
      const family = getComputedStyle(document.body).fontFamily
      // the Markdown editor of the drawer is monospace on purpose: it shows source
      const controls = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea')].filter(
        control => control.getClientRects().length > 0 && !control.matches('textarea.drawer-edit'),
      )
      return {
        checked: controls.length,
        strangers: controls
          .filter(control => getComputedStyle(control).fontFamily !== family)
          .map(control => `<${control.tagName.toLowerCase()} class="${control.className}"> in ${getComputedStyle(control).fontFamily}`),
      }
    })
  }

  test('buttons, inputs, selects and text areas inherit it on every page of the library', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    for (const [hash, minimum] of [
      ['#/all', 6],
      ['#/all?e=ent_shell_00', 8],
      ['#/read/ent_shell_00', 4],
      ['#/properties', 10],
      ['#/settings', 10],
    ] as const) {
      await library.goto(`chrome-extension://${extensionId}/library.html${hash}`)
      await library.reload()
      await expect(library.locator('.shell')).toBeVisible()
      await expect.poll(async () => (await strangers(library)).checked, `${hash}: controls on the page`).toBeGreaterThanOrEqual(minimum)
      const found = await strangers(library)
      expect(found.strangers, `${hash}: controls in a font of their own`).toEqual([])
    }
    await library.close()
  })
})
