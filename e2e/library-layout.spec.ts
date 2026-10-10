import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary } from './helpers'

/**
 * Layout of the library page's own surfaces, asserted from geometry and computed colours — never from
 * screenshots (e2e/AGENTS.md): the settings page's labelled rows, the Markdown tables in the drawer and the
 * reading view, and the narrow window's icon rail. Each of them once shipped looking broken because a class
 * had no rule at all (`.settings-grid`, `.md-table`) or a rule was overridden by a more specific one
 * (`.settings-view button` painted over `.hl-dot`, the current item's badge colour beat the rail's).
 */

// a cold service worker now and then holds `clearLibrary` for ~20s; that is not what these tests measure
test.describe.configure({ timeout: 90_000 })

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qMwAAAAASUVORK5CYII='

const TABLE_CLIP = [
  'A retry budget caps the extra load that retries add.',
  '',
  '| Strategy | Max attempts | Backoff | Notes |',
  '| --- | --- | --- | --- |',
  '| Fixed | 3 | none | Simple, but synchronises clients |',
  '| Exponential | 5 | 2^n | Spreads the load out over time |',
  '| Exponential + jitter | 5 | 2^n ± rand | Best default for most services |',
  '',
  'After the table.',
].join('\n')

/** Eight columns of unbreakable words: wider than the 520px drawer at any window width. */
const WIDE_TABLE_CLIP = [
  `| ${Array.from({ length: 8 }, (_, index) => `column-heading-${index}`).join(' | ')} |`,
  `| ${Array.from({ length: 8 }, () => '---').join(' | ')} |`,
  `| ${Array.from({ length: 8 }, (_, index) => `unbreakable-cell-value-${index}`).join(' | ')} |`,
].join('\n')

/** An extension page can send the same messages the library does; the seeded entries are real saves. */
async function seed(page: Page, extensionId: string, settings: Record<string, unknown> = {}): Promise<void> {
  await clearLibrary(page.context())
  await page.goto(`chrome-extension://${extensionId}/sample.html`)
  const send = async (message: Record<string, unknown>) => {
    const response = await page.evaluate(payload => chrome.runtime.sendMessage(payload), message)
    expect(response?.success, `${String(message.type)}: ${response?.error}`).toBe(true)
  }
  const clips: Array<[string, string, string]> = [
    ['ent_layout_table', 'Retries and backpressure', TABLE_CLIP],
    ['ent_layout_wide', 'Wide table', WIDE_TABLE_CLIP],
    ['ent_layout_plain', 'Exponential backoff with jitter', 'Jitter spreads retries so clients do not stampede.'],
  ]
  for (const [index, [id, title, content]] of clips.entries()) {
    await send({
      type: 'SAVE_CLIP',
      requestId: `r-layout-${index}`,
      draft: { id, content, sourceUrl: `https://engineering.example.com/${index}`, properties: { title }, via: 'menu' },
    })
  }
  await send({ type: 'SET_SETTINGS', requestId: 'r-layout-settings', patch: settings })
}

/** WCAG contrast of each element's text colour against the first painted background behind it. */
function textContrast(locator: Locator): Promise<number[]> {
  return locator.evaluateAll(elements => {
    const channels = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).map(Number)
    const luminance = ([r, g, b]: number[]): number => {
      const linear = [r, g, b].map(channel => {
        const unit = (channel ?? 0) / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
    }
    const backdrop = (element: Element): number[] => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const [r, g, b, a = 1] = channels(getComputedStyle(node).backgroundColor)
        if (a > 0) return [r!, g!, b!]
      }
      return [255, 255, 255]
    }
    return elements.map(element => {
      const [text, ground] = [luminance(channels(getComputedStyle(element).color)), luminance(backdrop(element))]
      return (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)
    })
  })
}

for (const [uiLocale, shortcutLabels] of [
  ['zh-CN', ['截图', '区块模式']],
  ['en-US', ['Screenshot', 'Block mode']],
] as const) {
  test.describe(`settings page layout in ${uiLocale} (extension.md §2.5)`, () => {
    test.use({ uiLocale })

    test('labels, controls, preview, colour dots and shortcut rows sit in aligned rows, light and dark', async ({ page, extensionId }) => {
      await seed(page, extensionId, {
        downloadFormat: 'jpeg', // the quality slider only exists for JPEG and WebP
        blockDisabledSites: ['example.com', 'news.example.org'],
        watermark: { enabled: true, text: 'AnnHub demo', image: PNG_1PX }, // a stored image adds the remove button
      })
      const library = await page.context().newPage()
      for (const [width, height, stacked] of [
        [1180, 800, false],
        [1024, 700, false],
        [390, 844, true],
      ] as const) {
        await library.setViewportSize({ width, height })
        for (const scheme of ['light', 'dark'] as const) {
          await library.emulateMedia({ colorScheme: scheme })
          await library.goto(`chrome-extension://${extensionId}/library.html#/settings`)
          await library.reload()
          await expect(library.getByTestId('settings-view')).toBeVisible()
          await expect(library.locator('.keys')).toHaveCount(2)
          const where = `${uiLocale}, ${width}px, ${scheme}`

          const problems = await library.evaluate(isStacked => {
            const found: string[] = []
            const box = (element: Element): DOMRect => element.getBoundingClientRect()
            const view = document.querySelector<HTMLElement>('.settings-view')!
            const edge = box(view)
            if (view.scrollWidth > view.clientWidth + 1) found.push(`the settings view scrolls sideways (${view.scrollWidth} > ${view.clientWidth})`)
            for (const card of view.querySelectorAll('section')) {
              const cardBox = box(card)
              if (cardBox.left < edge.left - 1 || cardBox.right > edge.right + 1) found.push(`a card leaves the view: ${card.querySelector('h2')?.textContent}`)
            }

            // labelled rows: the label never runs into its control; the columns line up row to row
            for (const grid of view.querySelectorAll('.settings-grid')) {
              const gridBox = box(grid)
              const controlLefts = new Set<number>()
              let previousBottom = -Infinity
              for (const row of grid.querySelectorAll(':scope > .settings-field')) {
                const label = row.querySelector(':scope > .settings-label')!
                const control = row.querySelector(':scope > :not(.settings-label)')!
                const name = (label.textContent ?? '').trim()
                const text = document.createRange()
                text.selectNodeContents(label)
                const [textBox, controlBox, rowBox] = [text.getBoundingClientRect(), box(control), box(row)]
                if (rowBox.top < previousBottom - 1) found.push(`${name}: the row overlaps the one above`)
                previousBottom = rowBox.bottom
                if (controlBox.right > gridBox.right + 1) found.push(`${name}: the control leaves the card`)
                if (isStacked) {
                  if (controlBox.top < textBox.bottom - 1) found.push(`${name}: the control is not below its label`)
                  if (Math.abs(controlBox.left - box(label).left) > 1) found.push(`${name}: label and control do not share a left edge`)
                } else {
                  if (controlBox.left < textBox.right + 8) found.push(`${name}: the label runs into its control`)
                  controlLefts.add(Math.round(controlBox.left))
                }
              }
              if (controlLefts.size > 1) found.push(`the controls of one card start at ${[...controlLefts].join(' and ')}`)
            }

            // one height for every field control and button, so mixed rows do not step
            const heights = new Set(
              [...view.querySelectorAll('select, input[type="text"], input[type="file"], input[type="range"], .settings-field button, .settings-inline .prop-preset')].map(
                control => Math.round(box(control).height),
              ),
            )
            if (heights.size > 1) found.push(`controls differ in height: ${[...heights].join(', ')}`)

            // the preview comes after every watermark control
            const preview = view.querySelector('[data-testid="watermark-preview"]')!
            const previewBox = box(preview)
            if (previewBox.width < 100 || previewBox.height < 30) found.push(`the preview is ${previewBox.width}×${previewBox.height}`)
            for (const control of preview.closest('.settings-group')!.querySelectorAll('select, input, button')) {
              if (box(control).bottom > previewBox.top + 1) found.push('a watermark control sits below the preview')
            }

            // the default-colour dots keep the paint .hl-dot gives them
            const dots = [...view.querySelectorAll<HTMLElement>('.hl-colors button')]
            if (dots.length !== 5) found.push(`${dots.length} colour dots`)
            const fills = new Set(dots.map(dot => getComputedStyle(dot).backgroundColor))
            if (fills.size !== dots.length || fills.has('rgba(0, 0, 0, 0)')) found.push(`the colour dots share or lack a fill: ${[...fills].join(' | ')}`)
            dots.forEach((dot, index) => {
              const style = getComputedStyle(dot)
              const dotBox = box(dot)
              if (dotBox.width < 20 || Math.abs(dotBox.width - dotBox.height) > 1 || style.borderRadius !== '50%') found.push(`dot ${index} is not a round 20px+ swatch`)
              if ((dot.getAttribute('aria-pressed') === 'true') !== (style.outlineStyle !== 'none')) found.push(`dot ${index}: the selected ring does not follow aria-pressed`)
              const next = dots[index + 1]
              if (next && box(next).left - dotBox.right < 6) found.push(`dots ${index} and ${index + 1} touch`)
            })

            // shortcut rows: the name on the left, the key (or "not assigned") on the right
            for (const row of view.querySelectorAll('.keys')) {
              const [name, key] = [row.children[0]!, row.children[1]!]
              const rowBox = box(row)
              if (!key || box(name).right > box(key).left) found.push(`the shortcut row "${name.textContent}" is not name-then-key`)
              if (key && box(key).right < rowBox.right - 1) found.push(`the key of "${name.textContent}" is not at the row's right edge`)
              if (key?.tagName === 'KBD' && getComputedStyle(key).borderTopStyle !== 'solid') found.push('a shortcut key is not drawn as a key')
            }
            return found
          }, stacked)
          expect(problems, `settings layout (${where})`).toEqual([])

          expect(await library.locator('.keys > :first-child').allTextContents(), `shortcut names (${where})`).toEqual(shortcutLabels)

          // text is readable on whatever it sits on, in both colour schemes
          const readable = library.locator(
            '.settings-view :is(h2, h3, .hint, .settings-label, .settings-value, .keys, kbd, .switch-row span, select, input[type="text"], input[type="file"], .prop-preset, button:not(.hl-dot))',
          )
          const ratios = await textContrast(readable)
          expect(ratios.length, `readable settings text (${where})`).toBeGreaterThan(20)
          expect(Math.min(...ratios), `lowest text contrast (${where})`).toBeGreaterThanOrEqual(4.5)
        }
      }
      await library.close()
    })

    test('the settings page scrolls inside the content column and leaves the nav where it is (visual.md §4)', async ({ page, extensionId }) => {
      await seed(page, extensionId)
      const library = await page.context().newPage()
      await library.setViewportSize({ width: 1180, height: 600 })
      await library.goto(`chrome-extension://${extensionId}/library.html#/settings`)
      await library.reload()
      await expect(library.getByTestId('settings-view')).toBeVisible()
      const scroll = await library.evaluate(() => {
        const view = document.querySelector<HTMLElement>('.settings-view')!
        const side = document.querySelector('.side')!
        const sideBefore = side.getBoundingClientRect().top
        view.scrollTop = 400
        return {
          scrollable: view.scrollHeight > view.clientHeight,
          moved: view.scrollTop,
          documentTop: document.scrollingElement!.scrollTop,
          sideBefore,
          sideAfter: side.getBoundingClientRect().top,
        }
      })
      expect(scroll.scrollable, 'the settings content is taller than the window').toBe(true)
      expect(scroll.moved, 'the view itself scrolled').toBeGreaterThan(0)
      expect(scroll.documentTop, 'the page did not scroll').toBe(0)
      expect(scroll.sideAfter, 'the nav stayed put').toBe(scroll.sideBefore)
      await library.close()
    })
  })
}

test.describe('Markdown tables (RV-LIB-09)', () => {
  /** The drawer and the reading view render the same component; both are checked, in both colour schemes. */
  for (const [surface, route, container] of [
    ['the detail drawer', '#/all?e=ent_layout_table', '.drawer'],
    ['the reading view', '#/read/ent_layout_table', '[data-testid="reading-view"]'],
  ] as const) {
    test(`a table in ${surface} has borders, padded cells and a header row`, async ({ page, extensionId }) => {
      await seed(page, extensionId)
      const library = await page.context().newPage()
      await library.setViewportSize({ width: 1180, height: 800 })
      for (const scheme of ['light', 'dark'] as const) {
        await library.emulateMedia({ colorScheme: scheme })
        await library.goto(`chrome-extension://${extensionId}/library.html${route}`)
        await library.reload()
        const table = library.locator(`${container} table.md-table`)
        await expect(table).toBeVisible()
        const problems = await table.evaluate(element => {
          const found: string[] = []
          const cells = [...element.querySelectorAll<HTMLElement>('th, td')]
          const body = element.querySelector('td')!
          const head = element.querySelector('th')!
          const tableBox = element.getBoundingClientRect()
          const parentBox = element.parentElement!.getBoundingClientRect()
          if (tableBox.right > parentBox.right + 1) found.push('the table is wider than the text column')
          for (const cell of cells) {
            const style = getComputedStyle(cell)
            const name = (cell.textContent ?? '').trim()
            if (parseFloat(style.paddingLeft) < 8 || parseFloat(style.paddingRight) < 8 || parseFloat(style.paddingTop) < 4) found.push(`"${name}" has no room around its text`)
            if (style.borderLeftStyle !== 'solid' || parseFloat(style.borderLeftWidth) < 1 || style.borderLeftColor === style.backgroundColor)
              found.push(`"${name}" has no visible border`)
            const text = document.createRange()
            text.selectNodeContents(cell)
            if (text.getBoundingClientRect().left - cell.getBoundingClientRect().left < 8) found.push(`"${name}" touches the cell's left border`)
          }
          if (getComputedStyle(head).textAlign !== 'left') found.push('the header cells are not left-aligned like the body')
          if (getComputedStyle(head).backgroundColor === getComputedStyle(body).backgroundColor) found.push('the header row is not set apart from the body')
          return found
        })
        expect(problems, `${surface}, ${scheme}`).toEqual([])
        const ratios = await textContrast(table.locator('th, td'))
        expect(Math.min(...ratios), `table text contrast in ${surface}, ${scheme}`).toBeGreaterThanOrEqual(4.5)
      }
      await library.close()
    })
  }

  test('a table wider than the drawer scrolls on its own instead of widening the drawer', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    for (const width of [1180, 390]) {
      await library.setViewportSize({ width, height: 800 })
      await library.goto(`chrome-extension://${extensionId}/library.html#/all?e=ent_layout_wide`)
      await library.reload()
      const table = library.locator('.drawer table.md-table')
      await expect(table).toBeVisible()
      const fit = await library.evaluate(() => {
        const body = document.querySelector<HTMLElement>('.drawer-body')!
        const wide = document.querySelector<HTMLElement>('.drawer table.md-table')!
        return {
          bodyOverflow: body.scrollWidth - body.clientWidth,
          tableOverflow: wide.scrollWidth - wide.clientWidth,
          tableRight: wide.getBoundingClientRect().right,
          bodyRight: body.getBoundingClientRect().right,
        }
      })
      expect(fit.bodyOverflow, `the drawer scrolls sideways at ${width}px`).toBeLessThanOrEqual(1)
      expect(fit.tableOverflow, `the table is what scrolls at ${width}px`).toBeGreaterThan(0)
      expect(fit.tableRight, `the table stays inside the drawer at ${width}px`).toBeLessThanOrEqual(fit.bodyRight + 1)
    }
    await library.close()
  })
})

test.describe('the icon rail in a narrow window (extension.md §2.2)', () => {
  test("the brand fits the rail and every badge, the current item's included, is legible", async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      await library.setViewportSize({ width: 390, height: 844 })
      await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
      await library.reload()
      await expect(library.locator('.nav-item-current .nav-count')).toHaveText('3')

      const rail = await library.evaluate(() => {
        const found: string[] = []
        const side = document.querySelector('.side')!.getBoundingClientRect()
        const brand = document.querySelector('.brand')!
        // everything in the rail, the brand's text included, stays inside the rail
        const inside = (name: string, box: DOMRect) => {
          if (box.width > 0 && (box.left < side.left - 1 || box.right > side.right + 1))
            found.push(`${name} leaves the rail (${Math.round(box.left)}–${Math.round(box.right)} of ${Math.round(side.left)}–${Math.round(side.right)})`)
        }
        for (const element of document.querySelectorAll('.side *')) inside(`.${(element as HTMLElement).className || element.tagName}`, element.getBoundingClientRect())
        const text = document.createRange()
        text.selectNodeContents(brand)
        inside('the brand text', text.getBoundingClientRect())
        inside('the brand', brand.getBoundingClientRect())
        // something is drawn in the brand's place: a mark of a usable size
        const mark = getComputedStyle(brand, '::before')
        if (mark.content === 'none' || parseFloat(mark.width) < 20 || parseFloat(mark.height) < 20) found.push('the brand shows no mark in the rail')

        const pill = (element: Element) => {
          const style = getComputedStyle(element)
          return { text: element.textContent, color: style.color, background: style.backgroundColor, box: element.getBoundingClientRect() }
        }
        return {
          found,
          count: document.querySelectorAll('.nav-count').length,
          current: pill(document.querySelector('.nav-item-current .nav-count')!),
          siblings: [...document.querySelectorAll('.nav-item:not(.nav-item-current) .nav-count')].map(pill),
        }
      })
      expect(rail.found, `the rail at 390px, ${scheme}`).toEqual([])
      expect(rail.count, 'badges in the rail').toBeGreaterThanOrEqual(3)
      expect(rail.siblings.length).toBeGreaterThan(0)
      for (const other of rail.siblings) {
        expect({ color: rail.current.color, background: rail.current.background }, `the current badge looks like the others (${scheme})`).toEqual({
          color: other.color,
          background: other.background,
        })
      }
      expect(rail.current.box.width, 'the current badge has room for its number').toBeGreaterThanOrEqual(12)

      // accent text on an accent fill measures 1:1; 3:1 is the floor for a UI indicator, and the shared pair clears it in both schemes
      const [ratio] = await textContrast(library.locator('.nav-item-current .nav-count'))
      expect(ratio, `the current item's badge contrast (${scheme})`).toBeGreaterThanOrEqual(3)
    }

    // the wide layout keeps its quiet badge: text in the item's colour, no fill
    await library.setViewportSize({ width: 1180, height: 800 })
    await library.reload()
    await expect(library.locator('.nav-item-current .nav-count')).toHaveText('3') // the counts arrive after the first paint
    const wide = await library.evaluate(() => {
      const badge = document.querySelector('.nav-item-current .nav-count')!
      return {
        background: getComputedStyle(badge).backgroundColor,
        color: getComputedStyle(badge).color,
        item: getComputedStyle(document.querySelector('.nav-item-current')!).color,
        position: getComputedStyle(badge).position,
      }
    })
    expect({ background: wide.background, position: wide.position }, 'the wide badge is unfilled and in the flow of the item').toEqual({
      background: 'rgba(0, 0, 0, 0)',
      position: 'static',
    })
    expect(wide.color, "the wide badge takes the item's own colour").toBe(wide.item)
    await library.close()
  })
})
