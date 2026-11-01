import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, textContrast } from './helpers'

/**
 * Layout of the library page's own surfaces, asserted from geometry and computed colours — never from
 * screenshots (e2e/AGENTS.md): the settings page's card grid and rows, the Markdown tables in the drawer and the
 * reading view, and the narrow window's icon rail. Each of them once shipped looking broken because a class
 * had no rule at all (the settings card grid, `.md-table`) or a rule was overridden by a more specific one
 * (a settings button rule once painted over `.hl-dot`, the current item's badge colour beat the rail's).
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

/** Headings at the levels the renderer emits (`#` is an h2, `##` an h3, `###` an h4), each with a paragraph to measure against. */
const HEADINGS_CLIP = [
  '# Level one',
  '',
  'Paragraph under level one.',
  '',
  '## Level two',
  '',
  'Paragraph under level two.',
  '',
  '### Level three',
  '',
  'Paragraph under level three.',
].join('\n')

/** An extension page can send the same messages the library does; the seeded entries are real saves. */
async function send(page: Page, message: Record<string, unknown>): Promise<void> {
  const response = await page.evaluate(payload => chrome.runtime.sendMessage(payload), message)
  expect(response?.success, `${String(message.type)}: ${response?.error}`).toBe(true)
}

/** Leaves `page` on an extension page, so a test can send one more message of its own. */
async function seed(page: Page, extensionId: string, settings: Record<string, unknown> = {}): Promise<void> {
  await clearLibrary(page.context())
  await page.goto(`chrome-extension://${extensionId}/sample.html`)
  const clips: Array<[string, string, string]> = [
    ['ent_layout_table', 'Retries and backpressure', TABLE_CLIP],
    ['ent_layout_wide', 'Wide table', WIDE_TABLE_CLIP],
    ['ent_layout_plain', 'Exponential backoff with jitter', 'Jitter spreads retries so clients do not stampede.'],
  ]
  for (const [index, [id, title, content]] of clips.entries()) {
    await send(page, {
      type: 'SAVE_CLIP',
      requestId: `r-layout-${index}`,
      draft: { id, content, sourceUrl: `https://engineering.example.com/${index}`, properties: { title }, via: 'menu' },
    })
  }
  await send(page, { type: 'SET_SETTINGS', requestId: 'r-layout-settings', patch: settings })
}

for (const [uiLocale, shortcutLabels] of [
  ['zh-CN', ['截图', '区块模式']],
  ['en-US', ['Screenshot', 'Block mode']],
] as const) {
  test.describe(`settings page layout in ${uiLocale} (extension.md §2.5)`, () => {
    test.use({ uiLocale })

    test('two columns of cards, a row per setting, controls level, light and dark', async ({ page, extensionId }) => {
      await seed(page, extensionId, {
        downloadFormat: 'jpeg', // the quality slider is enabled for JPEG and WebP
        blockDisabledSites: ['example.com', 'news.example.org'],
        watermark: { enabled: true, text: 'AnnHub demo', image: PNG_1PX }, // a stored image adds the thumbnail and the remove button
      })
      const library = await page.context().newPage()
      // the grid measures the content area (nav aside): at 1180 it is ~960 wide (two columns), at 1024 ~804 and
      // at 390 ~338 — both under the ~860 where the cards become one column
      for (const [width, height, columns] of [
        [1180, 800, 2],
        [1024, 700, 1],
        [390, 844, 1],
      ] as const) {
        await library.setViewportSize({ width, height })
        for (const scheme of ['light', 'dark'] as const) {
          await library.emulateMedia({ colorScheme: scheme })
          await library.goto(`chrome-extension://${extensionId}/library.html#/settings`)
          await library.reload()
          await expect(library.getByTestId('settings-view')).toBeVisible()
          // chrome.commands.getAll can omit a freshly added unbound command, so the
          // row count races; the two bound shortcuts are always listed
          expect(await library.locator('.set-r:has(kbd)').count()).toBeGreaterThanOrEqual(2)
          const where = `${uiLocale}, ${width}px, ${scheme}`

          const problems = await library.evaluate(expectedColumns => {
            const found: string[] = []
            const box = (element: Element): DOMRect => element.getBoundingClientRect()
            const view = document.querySelector<HTMLElement>('.settings-view')!
            const body = view.querySelector<HTMLElement>('.page-body')!
            if (body.scrollWidth > body.clientWidth + 1) found.push(`the settings body scrolls sideways (${body.scrollWidth} > ${body.clientWidth})`)

            // the card grid: as many columns as the width holds, equal widths, one 16px gap between them
            const cols = [...view.querySelectorAll<HTMLElement>('.settings-col')]
            const lefts = [...new Set(cols.map(col => Math.round(box(col).left)))]
            if (lefts.length !== expectedColumns) found.push(`${lefts.length} columns of cards at this width, expected ${expectedColumns}`)
            if (lefts.length === 2) {
              const [a, b] = cols.map(col => box(col))
              if (Math.abs(a.width - b.width) > 1) found.push(`the card columns differ in width: ${Math.round(a.width)} vs ${Math.round(b.width)}`)
              if (Math.abs(b.left - a.right - 16) > 1) found.push(`the gap between the card columns is ${Math.round(b.left - a.right)}`)
            }

            // every card stays inside the body, and in every row the name and the control keep to their sides
            const bodyBox = box(body)
            for (const card of view.querySelectorAll<HTMLElement>('.set')) {
              const cardBox = box(card)
              if (cardBox.left < bodyBox.left - 1 || cardBox.right > bodyBox.right + 1) found.push(`a card leaves the body: ${card.querySelector('h2')?.textContent}`)
              for (const row of card.querySelectorAll<HTMLElement>(':scope > .set-r')) {
                const label = row.querySelector<HTMLElement>(':scope > .set-l')
                const control = row.querySelector<HTMLElement>(':scope > .set-ctl')
                // the metrics card opens with a banner row, which is no name-and-control row
                if (!label?.querySelector('b') || !control) continue
                const name = (label.querySelector('b')?.textContent ?? '').trim()
                const labelBox = box(label)
                const controlBox = box(control)
                if (controlBox.right > cardBox.right + 1) found.push(`${name}: the control leaves the card`)
                if (controlBox.top >= labelBox.bottom - 1) {
                  // stacked by the card's own container query: the control goes under the whole label, at its left edge
                  if (Math.abs(controlBox.left - labelBox.left) > 1) found.push(`${name}: a stacked control does not line up under its name`)
                } else if (controlBox.left < box(label.querySelector('b')!).right + 8) {
                  found.push(`${name}: the name runs into its control`)
                }
              }
            }

            // one height for every small button and every text input, so mixed rows do not step
            const smalls = [...view.querySelectorAll<HTMLElement>('.ghost.sm')].map(button => Math.round(box(button).height))
            if (new Set(smalls).size > 1) found.push(`the small buttons differ in height: ${[...new Set(smalls)].join(', ')}`)
            for (const input of view.querySelectorAll<HTMLElement>('.wm-text'))
              if (Math.round(box(input).height) !== 30) found.push(`a watermark text input is ${Math.round(box(input).height)} tall`)

            // the preview comes after every watermark control
            const preview = view.querySelector('[data-testid="watermark-preview"]')!
            const previewBox = box(preview)
            if (previewBox.width < 100 || previewBox.height < 30) found.push(`the preview is ${Math.round(previewBox.width)}×${Math.round(previewBox.height)}`)
            for (const control of preview.closest('.set')!.querySelectorAll('select, input, button')) {
              if (control !== preview && box(control).bottom > previewBox.top + 1) found.push('a watermark control sits below the preview')
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

            // shortcut rows: the name on the left, the keycaps (or "not assigned") at the row's right edge —
            // under the name and at its left edge once the card stacks its rows
            for (const row of view.querySelectorAll<HTMLElement>('.set-r')) {
              if (!row.querySelector('kbd, .keys-unassigned')) continue
              const label = row.querySelector<HTMLElement>(':scope > .set-l')!
              const [name, key] = [label.querySelector<HTMLElement>('b')!, row.querySelector<HTMLElement>(':scope > .set-ctl')!]
              const [labelBox, nameBox, keyBox] = [box(label), box(name), box(key)]
              if (keyBox.top >= labelBox.bottom - 1) {
                if (Math.abs(keyBox.left - labelBox.left) > 1) found.push(`the key of "${name.textContent}" does not line up under its name`)
              } else {
                const contentRight = box(row).right - parseFloat(getComputedStyle(row).paddingRight)
                if (keyBox.left < nameBox.right) found.push(`the shortcut row "${name.textContent}" is not name-then-key`)
                if (keyBox.right < contentRight - 1) found.push(`the key of "${name.textContent}" is not at the row's right edge`)
              }
              for (const cap of row.querySelectorAll('kbd')) if (getComputedStyle(cap).borderTopStyle !== 'solid') found.push('a shortcut key is not drawn as a key')
            }

            // the metrics card opens with its banner beside the refresh button
            const metricsBanner = view.querySelector('.banner-info')
            if (!metricsBanner || !metricsBanner.closest('.set')) found.push('the metrics card has no banner')
            return found
          }, columns)
          expect(problems, `settings layout (${where})`).toEqual([])

          const shortcutNames = await library.locator('.set-r:has(kbd) .set-l b').allTextContents()
          expect(
            shortcutNames.filter(name => (shortcutLabels as readonly string[]).includes(name)),
            `the bound shortcuts are listed in order (${where})`,
          ).toEqual(shortcutLabels)

          // text is readable on whatever it sits on, in both colour schemes
          const readable = library.locator(
            '.settings-view :is(h1.page-title, .page-sub, .set-h h2, .set-l b, .set-l small, .set-note, .mic-status, .keys-unassigned, kbd, .seg-opt, .sl-val, .wm-count, .rcheck, .cv-tag, .banner, button:not(.hl-dot))',
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
        const view = document.querySelector<HTMLElement>('.settings-view .page-body')!
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
      expect(scroll.moved, 'the settings body itself scrolled').toBeGreaterThan(0)
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

test.describe('Markdown headings in the drawer (extension.md §4.2)', () => {
  test('a heading in the drawer looks like the same heading in the reading view, not like a section label', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    await send(page, {
      type: 'SAVE_CLIP',
      requestId: 'r-layout-headings',
      draft: { id: 'ent_layout_headings', content: HEADINGS_CLIP, sourceUrl: 'https://engineering.example.com/headings', properties: { title: 'Headings' }, via: 'menu' },
    })
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })

    /** Each heading's size, weight and colour against the first paragraph of the same rendered Markdown. */
    const measure = async (route: string, container: string) => {
      await library.goto(`chrome-extension://${extensionId}/library.html${route}`)
      await library.reload()
      await expect(library.locator(`${container} .md-view h3`)).toBeVisible()
      return library.evaluate(selector => {
        const view = document.querySelector(`${selector} .md-view`)!
        const paragraph = getComputedStyle(view.querySelector('p')!)
        const bodySize = parseFloat(paragraph.fontSize)
        const heading = (tag: string) => {
          const style = getComputedStyle(view.querySelector(tag)!)
          return { ratio: parseFloat(style.fontSize) / bodySize, weight: Number(style.fontWeight), sameColourAsText: style.color === paragraph.color }
        }
        const labels = [...document.querySelectorAll('.drawer-section > h3')].map(label => {
          const style = getComputedStyle(label)
          return { text: label.textContent, ratio: parseFloat(style.fontSize) / bodySize, sameColourAsText: style.color === paragraph.color }
        })
        return { h2: heading('h2'), h3: heading('h3'), h4: heading('h4'), labels }
      }, container)
    }

    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      const drawer = await measure('#/all?e=ent_layout_headings', '.drawer')
      const ratios = await textContrast(library.locator('.drawer .md-view :is(h2, h3, h4)'))
      expect(Math.min(...ratios), `heading contrast in the drawer (${scheme})`).toBeGreaterThanOrEqual(4.5)
      const reading = await measure('#/read/ent_layout_headings', '[data-testid="reading-view"]')

      for (const level of ['h2', 'h3', 'h4'] as const) {
        // the drawer renders the same component as the reading view: a heading keeps its place against the text under it
        expect(drawer[level].ratio, `${level} against its paragraph, drawer vs reading view (${scheme})`).toBeCloseTo(reading[level].ratio, 1)
        expect(drawer[level].weight, `${level} weight in the drawer (${scheme})`).toBeGreaterThanOrEqual(600)
        expect(drawer[level].sameColourAsText, `${level} is in the text colour, not a muted label colour (${scheme})`).toBe(true)
      }
      // `#` and `##` are real headings: bigger than the paragraph they introduce, the `#` one the biggest
      expect(drawer.h3.ratio, `a ## heading is bigger than its paragraph (${scheme})`).toBeGreaterThan(1)
      expect(drawer.h2.ratio, `a # heading is bigger than a ## heading (${scheme})`).toBeGreaterThan(drawer.h3.ratio)

      // the drawer's own section titles are the small muted labels, and stay so
      expect(drawer.labels.length, 'the drawer has its own section titles').toBeGreaterThanOrEqual(2)
      for (const label of drawer.labels) {
        expect(label.ratio, `"${label.text}" is smaller than the text (${scheme})`).toBeLessThan(1)
        expect(label.sameColourAsText, `"${label.text}" is muted (${scheme})`).toBe(false)
      }
    }
    await library.close()
  })
})

test.describe('accent text on the accent tint (visual.md §3)', () => {
  test('the Clip chip and the current reading tab read at 4.5:1 or more, light and dark', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
      await library.reload()
      await expect(library.locator('.type-chip.type-clip')).toHaveCount(3)
      for (const ratio of await textContrast(library.locator('.type-chip.type-clip'))) expect(ratio, `the Clip chip (${scheme})`).toBeGreaterThanOrEqual(4.5)
      await library.goto(`chrome-extension://${extensionId}/library.html#/read/ent_layout_plain`)
      await expect(library.locator('.reading-tab-current')).toBeVisible()
      const [tab] = await textContrast(library.locator('.reading-tab-current'))
      expect(tab, `the current reading tab (${scheme})`).toBeGreaterThanOrEqual(4.5)
    }
    await library.close()
  })
})

/** Clips of every length, some tagged and some highlighted, and two screenshots: the cards' shapes vary the way a library's do. */
async function seedCards(page: Page, extensionId: string): Promise<void> {
  await clearLibrary(page.context())
  await page.goto(`chrome-extension://${extensionId}/sample.html`)
  const long = 'Retries amplify the load when every client backs off together and tries again at once. '.repeat(8).trim()
  const clips: Array<[string, string, string[], number]> = [
    ['Retries and backpressure: why a saturated dependency gets worse when every client retries at once', long, ['reliability', 'retry', 'distributed-systems'], 3],
    ['Inbox', 'A short clip.', [], 0],
    ['Exponential backoff with jitter', 'Jitter spreads retries so clients do not stampede.', ['retry'], 1],
    ['Load shedding', 'Reject the request at the edge before it consumes a thread.', [], 2],
    ['Circuit breakers', long, ['sre'], 1],
    ['为什么重试会放大故障', '当下游已经饱和时，每个超时的客户端都会再试一次。', ['可靠性', '重试'], 0],
  ]
  for (const [index, [title, content, tags, highlights]] of clips.entries()) {
    const id = `ent_card_${index}`
    await send(page, {
      type: 'SAVE_CLIP',
      requestId: `r-card-${index}`,
      draft: { id, content, sourceUrl: `https://engineering.example.com/${index}`, properties: { title, ...(tags.length ? { tags } : {}) }, via: 'menu' },
    })
    for (let n = 0; n < highlights; n++) {
      const quote = content.slice(n * 6, n * 6 + 5)
      await send(page, { type: 'ADD_HIGHLIGHT', id, highlight: { id: `hl_card_${index}_${n}`, start: n * 6, end: n * 6 + 5, quote, color: 'yellow', createdAt: Date.now() } })
    }
  }
  for (const [index, title] of ['p99 latency', 'Error budget'].entries()) {
    await send(page, {
      type: 'SAVE_SCREENSHOT',
      requestId: `r-card-shot-${index}`,
      data: { id: `ent_card_shot_${index}`, dataUrl: PNG_1PX, width: 1, height: 1, sourceUrl: 'https://sre.example.org/latency', title, via: 'shortcut' },
    })
  }
}

/**
 * Where the cards of the open list view are, and what is wrong with how they sit. `grid` adds the checks only a grid
 * passes: a row of cards is the same height with its previews and meta lines level, and the cards fill the width
 * (only when there are enough of them to fill a row).
 */
function measureCards(library: Page, card: string, grid: boolean): Promise<{ columns: number; widths: number[]; found: string[] }> {
  return library.evaluate(
    ({ card, grid }) => {
      const found: string[] = []
      const listElement = document.querySelector('.list')!
      const list = listElement.getBoundingClientRect()
      const title = document.querySelector('.page-title')!.getBoundingClientRect()
      const cards = [...document.querySelectorAll(card)].map(element => ({
        element,
        box: element.getBoundingClientRect(),
        preview: element.querySelector('.entry-card-preview')?.getBoundingClientRect(),
        meta: element.querySelector('.entry-card-meta')?.getBoundingClientRect(),
      }))
      const name = (element: Element) => element.getAttribute('data-entry-id') ?? element.querySelector('.hl-group-title')?.textContent
      const lefts = [...new Set(cards.map(({ box }) => Math.round(box.left)))]
      // lined up with the page head
      const left = Math.min(...cards.map(({ box }) => box.left))
      if (Math.abs(left - title.left) > 1) found.push(`the cards start at ${Math.round(left)}, the page title at ${Math.round(title.left)}`)
      if (document.documentElement.scrollWidth > innerWidth) found.push('the page scrolls sideways')
      for (const [index, a] of cards.entries()) {
        if (a.box.right > list.left + listElement.clientLeft + listElement.clientWidth + 1) found.push(`${name(a.element)} runs past the list`)
        for (const b of cards.slice(index + 1)) {
          const across = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left)
          const down = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top)
          if (across > 1 && down > 1) found.push(`${name(a.element)} and ${name(b.element)} overlap`)
        }
      }
      if (grid) {
        // filling the content area rather than a column in its middle, once there are cards enough for a row
        const right = Math.max(...cards.map(({ box }) => box.right))
        const inner = list.left + listElement.clientLeft + listElement.clientWidth
        const rowFull = cards.filter(({ box }) => Math.round(box.top) === Math.round(cards[0]!.box.top)).length === lefts.length
        if (rowFull && cards.length > lefts.length && inner - right > title.left - list.left + 1) found.push(`${Math.round(inner - right)}px left empty on the right`)
        const rows = new Map<number, typeof cards>()
        for (const item of cards) rows.set(Math.round(item.box.top), [...(rows.get(Math.round(item.box.top)) ?? []), item])
        const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
        for (const [top, row] of rows) {
          if (spread(row.map(({ box }) => box.height)) > 1) found.push(`the row at ${top} has cards of different heights`)
          if (spread(row.map(({ meta }) => meta!.bottom)) > 1) found.push(`the row at ${top} has its meta lines at different heights`)
        }
        const previews = new Set(cards.map(({ preview }) => Math.round(preview!.height)))
        if (previews.size > 1) found.push(`previews of ${[...previews].join(', ')}px`)
      }
      return { columns: lefts.length, widths: [...new Set(cards.map(({ box }) => Math.round(box.width)))], found }
    },
    { card, grid },
  )
}

test.describe('the list views are grids of cards (extension.md §2.3)', () => {
  test('All, Clips and Screenshots fill the content area with columns of same-sized cards, as many as fit', async ({ page, extensionId }) => {
    await seedCards(page, extensionId)
    const library = await page.context().newPage()
    for (const [width, columns] of [
      [1440, (n: number) => n >= 4],
      // the wider shell (232 nav, 32 page padding) leaves 728px at 1024: the design's auto-fill holds two columns of 240+
      [1024, (n: number) => n >= 2],
      [390, (n: number) => n === 1],
    ] as const) {
      await library.setViewportSize({ width, height: 900 })
      const widths = new Set<number>()
      for (const [view, count] of [
        ['all', 8],
        ['clips', 6],
        ['screenshots', 2],
      ] as const) {
        await library.goto(`chrome-extension://${extensionId}/library.html#/${view}`)
        await library.reload()
        await expect(library.locator('.entry-card')).toHaveCount(count)
        const cards = await measureCards(library, '.entry-card', true)
        expect(cards.found, `${view} at ${width}px`).toEqual([])
        if (view === 'all') expect(columns(cards.columns), `${cards.columns} columns at ${width}px`).toBe(true)
        cards.widths.forEach(value => widths.add(value))
      }
      // one card for every view: a screenshot is the same size in All as in its own gallery
      expect([...widths].length, `card widths at ${width}px: ${[...widths].join(', ')}`).toBe(1)
    }
    // only the gallery puts download and delete on a screenshot
    await library.setViewportSize({ width: 1440, height: 900 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.reload()
    await expect(library.locator('.entry-card[data-type="screenshot"]')).toHaveCount(2)
    await expect(library.locator('.entry-card-actions')).toHaveCount(0)
    await library.goto(`chrome-extension://${extensionId}/library.html#/screenshots`)
    await expect(library.locator('.entry-card .entry-card-actions')).toHaveCount(2)
    await library.close()
  })

  test("a clip's card shows its first lines inside the preview and reads as its title and details, the words after", async ({ page, extensionId }) => {
    await seedCards(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1440, height: 900 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/clips`)
    await library.reload()
    const card = library.locator('.entry-card[data-entry-id="ent_card_0"]')
    const clamp = await card.evaluate(element => {
      const preview = element.querySelector('.entry-card-preview')!.getBoundingClientRect()
      const excerpt = element.querySelector<HTMLElement>('.entry-card-excerpt')!
      const style = getComputedStyle(excerpt)
      const shown = (excerpt.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / parseFloat(style.lineHeight)
      return { cut: excerpt.scrollHeight > excerpt.clientHeight + 1, inside: excerpt.getBoundingClientRect().bottom <= preview.bottom + 1, shown }
    })
    expect(clamp.cut, 'the long clip is cut off, not shown whole').toBe(true)
    expect(clamp.inside, 'no line shows below the preview box').toBe(true)
    // a clamp on a box taller than its lines still draws the lines after the ellipsis, half of one at the bottom
    expect(Math.abs(clamp.shown - Math.round(clamp.shown)), `the excerpt shows ${clamp.shown.toFixed(2)} lines`).toBeLessThan(0.05)
    const open = card.locator('.entry-card-open')
    await expect(open).toHaveAccessibleName(/^Retries and backpressure: .* #reliability #retry #distributed-systems 剪藏 engineering\.example\.com · .+ 3 高亮$/)
    await expect(open).toHaveAccessibleDescription(/^Retries amplify the load when every client backs off together/)
    await library.close()
  })

  test('the highlights view flows its clip cards down columns, none overlapping', async ({ page, extensionId }) => {
    await seedCards(page, extensionId)
    const library = await page.context().newPage()
    for (const [width, columns] of [
      [1440, (n: number) => n >= 2],
      [390, (n: number) => n === 1],
    ] as const) {
      await library.setViewportSize({ width, height: 900 })
      await library.goto(`chrome-extension://${extensionId}/library.html#/highlights`)
      await library.reload()
      await expect(library.locator('.hl-group')).toHaveCount(4)
      const groups = await measureCards(library, '.hl-group', false)
      expect(groups.found, `highlights at ${width}px`).toEqual([])
      expect(columns(groups.columns), `${groups.columns} columns at ${width}px`).toBe(true)
    }
    await library.close()
  })
})

test.describe('the expanded nav: mark, groups and an outline export (extension.md §2.2)', () => {
  test('the wordmark carries its mark, the groups are titled, the items are one height and the current one keeps its bar', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      await library.setViewportSize({ width: 1180, height: 800 })
      await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
      await library.reload()
      await expect(library.locator('.nav-item-current')).toBeVisible()
      const nav = await library.evaluate(() => {
        const mark = getComputedStyle(document.querySelector('.brand')!, '::before')
        const probe = document.createElement('span')
        probe.style.color = 'var(--ann-accent)'
        document.body.append(probe)
        const accent = getComputedStyle(probe).color
        probe.remove()
        const heights = new Set([...document.querySelectorAll('.nav-item')].map(item => Math.round(item.getBoundingClientRect().height)))
        const bar = getComputedStyle(document.querySelector('.nav-item-current')!, '::before')
        return {
          mark: { content: mark.content, width: parseFloat(mark.width), height: parseFloat(mark.height) },
          titles: [...document.querySelectorAll('.nav-group-title')].map(title => ({
            text: title.textContent,
            size: parseFloat(getComputedStyle(title).fontSize),
            colour: getComputedStyle(title).color,
          })),
          itemHeights: [...heights],
          barDrawn: bar.content !== 'none' && parseFloat(bar.width) >= 2,
          exportFill: getComputedStyle(document.querySelector('.nav-export')!).backgroundColor,
          accent,
        }
      })
      expect(nav.mark.content, `the brand draws its mark (${scheme})`).not.toBe('none')
      expect(Math.min(nav.mark.width, nav.mark.height), `the mark is 20px or more (${scheme})`).toBeGreaterThanOrEqual(20)
      expect(
        nav.titles.map(title => title.text),
        `the two groups are titled (${scheme})`,
      ).toEqual(['资料库', '管理'])
      for (const title of nav.titles) expect(title.size, `"${title.text}" is at least 11px (${scheme})`).toBeGreaterThanOrEqual(11)
      expect(nav.itemHeights, `every nav item is the same 34px row (${scheme})`).toEqual([34])
      expect(nav.barDrawn, `the current view carries its left bar, not colour alone (${scheme})`).toBe(true)
      expect(nav.exportFill, `export is an outline, not the accent fill (${scheme})`).not.toBe(nav.accent)
      // the group titles read on the nav surface
      for (const ratio of await textContrast(library.locator('.nav-group-title'))) expect(ratio, `a group title (${scheme})`).toBeGreaterThanOrEqual(4.5)
    }
    await library.close()
  })
})

test.describe('the card bottoms, tall captures and the reading note (extension.md §2.3)', () => {
  /** A capture five times as tall as wide: a long page's crop. */
  async function seedTallScreenshot(page: Page, extensionId: string): Promise<void> {
    await clearLibrary(page.context())
    await page.goto(`chrome-extension://${extensionId}/sample.html`)
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 60
      canvas.height = 300
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#2b6cb0'
      ctx.fillRect(0, 0, 60, 300)
      ctx.fillStyle = '#ffffff'
      for (let y = 0; y < 300; y += 30) ctx.fillRect(0, y, 60, 6)
      return canvas.toDataURL('image/png')
    })
    await send(page, {
      type: 'SAVE_SCREENSHOT',
      requestId: 'r-tall',
      data: { id: 'ent_tall', dataUrl, width: 60, height: 300, sourceUrl: 'https://engineering.example.com/tall', title: 'Tall capture', via: 'shortcut' },
    })
  }

  test('a tall capture fills its preview from the top instead of shrinking to a sliver', async ({ page, extensionId }) => {
    await seedTallScreenshot(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1440, height: 900 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/screenshots`)
    await library.reload()
    const card = library.locator('.entry-card[data-entry-id="ent_tall"]')
    await expect(card.locator('img.entry-card-preview')).toBeVisible()
    await expect.poll(() => card.locator('img.entry-card-preview').evaluate(image => image.dataset.tall), { timeout: 10_000 }).toBe('true')
    const preview = await card.locator('img.entry-card-preview').evaluate(image => {
      const style = getComputedStyle(image)
      return {
        fit: style.objectFit,
        position: style.objectPosition,
        height: Math.round(image.getBoundingClientRect().height),
        drawn: Math.round(image.getBoundingClientRect().width),
      }
    })
    expect(preview.fit, 'a tall capture covers its box').toBe('cover')
    expect(preview.position, 'it covers from the top').toBe('50% 0%')
    expect(preview.height, 'the preview box stays 150px').toBe(150)
    expect(preview.drawn, 'the sliver is gone: the image fills the card width').toBeGreaterThan(200)
    await library.close()
  })

  test("the card's bottom block is one line: type, source, time, and the highlight count at its end", async ({ page, extensionId }) => {
    await seedCards(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1440, height: 900 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await library.reload()
    await expect(library.locator('.entry-card')).toHaveCount(8)
    const meta = await library.evaluate(() => {
      const card = document.querySelector('.entry-card[data-entry-id="ent_card_0"]')!
      const meta = card.querySelector('.entry-card-meta')!
      const chip = meta.querySelector('.type-chip')!
      const source = meta.querySelector('.entry-card-source')!
      const highlights = meta.querySelector('.entry-card-highlights')!
      const [metaBox, chipBox, sourceBox, highlightsBox, cardBox] = [meta, chip, source, highlights, card].map(element => element.getBoundingClientRect())
      const mid = (box: DOMRect) => (box.top + box.bottom) / 2
      return {
        oneLine: Math.abs(mid(chipBox) - mid(sourceBox)) <= 1.5 && Math.abs(mid(sourceBox) - mid(highlightsBox)) <= 1.5,
        countAtRowsEnd: highlightsBox.right <= cardBox.right - 8,
        fontSize: parseFloat(getComputedStyle(meta).fontSize),
        bottomAligned: Math.abs(metaBox.bottom - document.querySelector('.entry-card[data-entry-id="ent_card_1"] .entry-card-meta')!.getBoundingClientRect().bottom) <= 1,
        cut: (() => {
          const el = document.querySelector<HTMLElement>('.entry-card-source')!
          return el.scrollWidth > el.clientWidth + 1
        })(),
      }
    })
    expect(meta.oneLine, 'type, source and time share one row, the count at its end').toBe(true)
    expect(meta.countAtRowsEnd, 'the highlight count stays inside the card').toBe(true)
    expect(meta.fontSize, 'the bottom block is 12px').toBeGreaterThanOrEqual(12)
    expect(meta.bottomAligned, 'the bottoms stay level across a row').toBe(true)
    expect(meta.cut, 'the sample hosts fit without the ellipsis').toBe(false)
    await library.close()
  })

  test('the note marker reads on all five highlight colours, light and dark', async ({ page, extensionId }) => {
    await clearLibrary(page.context())
    await page.goto(`chrome-extension://${extensionId}/sample.html`)
    const paragraphs = ['Yellow note.', 'Green note.', 'Blue note.', 'Pink note.', 'Purple note.']
    const content = paragraphs.join('\n\n')
    await send(page, {
      type: 'SAVE_CLIP',
      requestId: 'r-note-colors',
      draft: { id: 'ent_note_colors', content, sourceUrl: 'https://engineering.example.com/colors', properties: { title: 'Five colours' }, via: 'menu' },
    })
    const colors = ['yellow', 'green', 'blue', 'pink', 'purple'] as const
    // one highlight per paragraph, each inside its own block: a range across the blank line is not valid
    let cursor = 0
    for (const [index, color] of colors.entries()) {
      const start = cursor
      const end = start + paragraphs[index]!.length
      cursor = end + 2
      await send(page, {
        type: 'ADD_HIGHLIGHT',
        id: 'ent_note_colors',
        highlight: { id: `hl_note_${color}`, start, end, quote: content.slice(start, end), color, note: 'note', createdAt: Date.now() },
      })
    }
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      await library.goto(`chrome-extension://${extensionId}/library.html#/read/ent_note_colors`)
      await library.reload()
      await expect(library.locator('.md-hl-note').first()).toBeVisible()
      // the marker is a solid dot (design .hln): what must read is its fill against the highlight's tint —
      // a non-text contrast (≥3), measured with the same compositing the text helper uses
      const notes = await library.locator('.md-hl-note').evaluateAll(markers => {
        const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })!
        const rgba = (css: string): [number, number, number, number] => {
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = '#000'
          ctx.fillStyle = css
          ctx.fillRect(0, 0, 1, 1)
          const d = ctx.getImageData(0, 0, 1, 1).data
          return [d[0]!, d[1]!, d[2]!, d[3]! / 255]
        }
        const over = (top: number[], under: number[]): number[] => [0, 1, 2].map(i => top[i]! * top[3]! + under[i]! * (1 - top[3]!))
        const luminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map(channel => {
            const unit = channel / 255
            return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
          }) as [number, number, number]
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        return markers.map(marker => {
          const layers: number[][] = []
          for (let node: Element | null = marker.parentElement; node; node = node.parentElement) {
            const layer = rgba(getComputedStyle(node).backgroundColor)
            if (layer[3] > 0) layers.push(layer)
            if (layer[3] === 1) break
          }
          let ground: number[] = [255, 255, 255]
          for (const layer of layers.reverse()) ground = over(layer, ground)
          const dot = rgba(getComputedStyle(marker).backgroundColor)
          const [a, b] = [luminance(dot), luminance(ground)]
          return {
            width: marker.getBoundingClientRect().width,
            ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100,
            tint: getComputedStyle(marker.parentElement!).backgroundColor,
          }
        })
      })
      expect(notes.length, `five markers, one per paragraph (${scheme})`).toBe(5)
      expect(new Set(notes.map(note => note.tint)).size, 'each on its own colour').toBe(5)
      for (const note of notes) {
        expect(note.width, `the dot is a visible 7px marker (${scheme})`).toBeGreaterThanOrEqual(7)
        expect(note.ratio, `the dot reads on its highlight tint (${scheme})`).toBeGreaterThanOrEqual(3)
      }
    }
    await library.close()
  })
})

test.describe('one shell, one content start, switches that say what they do (visual.md §4)', () => {
  test('every page title starts at the same left edge, whatever the page below it', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    for (const [width, height] of [
      [1280, 800],
      [720, 800],
    ] as const) {
      await library.setViewportSize({ width, height })
      const lefts: Record<string, number> = {}
      for (const view of ['all', 'clips', 'highlights', 'screenshots', 'properties', 'settings']) {
        await library.goto(`chrome-extension://${extensionId}/library.html#/${view}`)
        await library.reload()
        const title = library.locator('h1.page-title').first()
        await expect(title).toBeVisible()
        lefts[view] = Math.round((await title.boundingBox())!.x)
      }
      expect(Math.max(...Object.values(lefts)) - Math.min(...Object.values(lefts)), `one start for every page title at ${width}px: ${JSON.stringify(lefts)}`).toBeLessThanOrEqual(1)
    }
    await library.close()
  })

  test('the settings switches are named for what they do, not for their state, and answer Space', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/settings`)
    await library.reload()
    await expect(library.getByTestId('settings-view')).toBeVisible()
    const readSettings = () => library.evaluate(async () => (await chrome.storage.local.get('annhub.settings'))['annhub.settings'] as Record<string, unknown> | undefined)
    // the accessible name comes from the row's feature name (aria-labelledby), never from the state
    const names = await library
      .getByRole('switch')
      .evaluateAll(switches => switches.map(box => document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent ?? box.getAttribute('aria-label') ?? ''))
    expect(names.filter(Boolean).length, 'switches on the page').toBeGreaterThanOrEqual(4)
    for (const name of names) {
      const bare = name.trim()
      expect(['开', '关', 'on', 'off'], `a switch named for its state: "${bare}"`).not.toContain(bare)
    }
    // Space flips a switch without a pointer, and the change reaches storage; the entry is on by default
    const block = library.getByTestId('block-entry-toggle')
    await expect(block).toBeChecked()
    await block.focus()
    await library.keyboard.press('Space')
    await expect(block).not.toBeChecked()
    await expect.poll(async () => (await readSettings())?.blockEntryEnabled).toBe(false)
    await library.keyboard.press('Space')
    await expect(block).toBeChecked()
    await expect.poll(async () => (await readSettings())?.blockEntryEnabled).toBe(true)
    await library.close()
  })

  test('a segmented control walks its segments with the arrow keys', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1180, height: 800 })
    await library.goto(`chrome-extension://${extensionId}/library.html#/settings`)
    await library.reload()
    const group = library.getByRole('radiogroup', { name: '下载格式' })
    const png = group.getByRole('radio', { name: 'PNG' })
    await expect(png).toBeChecked()
    await png.focus()
    await library.keyboard.press('ArrowRight')
    await expect(group.getByRole('radio', { name: 'JPEG' })).toBeChecked()
    await expect(group.getByRole('radio', { name: 'JPEG' })).toBeFocused()
    await library.keyboard.press('ArrowLeft')
    await expect(png).toBeChecked()
    await library.close()
  })
})

test.describe('the icon rail in a narrow window (extension.md §2.2)', () => {
  test('the brand fits the rail, the counts fold away, and the current item keeps its bar', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      await library.setViewportSize({ width: 390, height: 844 })
      await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
      await library.reload()
      await expect(library.locator('.nav-item-current')).toHaveAccessibleName('全部')

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
        // the rail shows no counts and no group titles; the current view keeps its mark: the bar at the left edge
        const drawn = (element: Element | null) => Boolean(element && (element as HTMLElement).offsetParent !== null)
        if (drawn(document.querySelector('.nav-count'))) found.push('a count is drawn in the rail')
        if (drawn(document.querySelector('.nav-group-title'))) found.push('a group title is drawn in the rail')
        const bar = getComputedStyle(document.querySelector('.nav-item-current')!, '::before')
        if (bar.content === 'none' || parseFloat(bar.width) < 2) found.push("the current item's bar is gone")
        return { found, width: Math.round(side.width) }
      })
      expect(rail.found, `the rail at 390px, ${scheme}`).toEqual([])
      expect(rail.width, `the rail is the 60px rail (${scheme})`).toBe(60)
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

test.describe('entry-type hues and global defaults (visual.md §3)', () => {
  test('clip, screenshot and highlight each read in their own hue, none taking the accent of the current nav item', async ({ page, extensionId }) => {
    await seedCards(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1440, height: 900 })
    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
      await library.reload()
      await expect(library.locator('.type-chip.type-clip').first()).toBeVisible()
      await expect(library.locator('.type-chip.type-screenshot').first()).toBeVisible()
      await expect(library.locator('.entry-card-highlights').first()).toBeVisible()

      const hues = await library.evaluate(() => ({
        clip: getComputedStyle(document.querySelector('.type-chip.type-clip')!).color,
        screenshot: getComputedStyle(document.querySelector('.type-chip.type-screenshot')!).color,
        highlight: getComputedStyle(document.querySelector('.entry-card-highlights')!).color,
        current: getComputedStyle(document.querySelector('.nav-item-current')!).color,
        clipIcon: document.querySelector(".nav-item[data-view='clips'] svg") ? getComputedStyle(document.querySelector(".nav-item[data-view='clips'] svg")!).color : null,
      }))
      expect(new Set([hues.clip, hues.screenshot, hues.highlight]).size, `three type hues (${scheme})`).toBe(3)
      expect(hues.clip, `the clip chip is not the current item's accent (${scheme})`).not.toBe(hues.current)
      expect(hues.clipIcon, `the clips nav icon carries its type hue (${scheme})`).toBeTruthy()
      // each chip's text on its own fill, and the highlight count on the card
      for (const selector of ['.type-chip.type-clip', '.type-chip.type-screenshot', '.entry-card-highlights']) {
        for (const ratio of await textContrast(library.locator(selector).first())) expect(ratio, `${selector} contrast (${scheme})`).toBeGreaterThanOrEqual(4.5)
      }
      // a type icon is a UI indicator: 3:1 on the nav it sits in
      const [iconRatio] = await textContrast(library.locator(".nav-item[data-view='clips'] svg").first())
      expect(iconRatio, `the clip nav icon (${scheme})`).toBeGreaterThanOrEqual(3)
    }
    await library.close()
  })

  test('no link on a card, in the drawer or in the reading view draws in the browser default blue', async ({ page, extensionId }) => {
    await seedCards(page, extensionId)
    const library = await page.context().newPage()
    await library.setViewportSize({ width: 1440, height: 900 })
    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      await library.goto(`chrome-extension://${extensionId}/library.html#/all?e=ent_card_0`)
      await library.reload()
      await expect(library.locator('.drawer[data-entry-id="ent_card_0"]')).toBeVisible()
      const defaults = await library.evaluate(() => {
        const browserBlue = ['rgb(0, 0, 238)', 'rgb(158, 158, 255)']
        return [...document.querySelectorAll('a[href]')]
          .filter(link => browserBlue.includes(getComputedStyle(link).color))
          .map(link => `${link.className || link.tagName}: ${getComputedStyle(link).color}`)
      })
      expect(defaults, `links in the browser default blue (${scheme})`).toEqual([])
    }
    await library.close()
  })

  test('checkboxes everywhere draw in the accent, from one global rule', async ({ page, extensionId }) => {
    await seed(page, extensionId, { watermark: { enabled: true, text: 'AnnHub demo' } })
    const library = await page.context().newPage()
    await library.emulateMedia({ colorScheme: 'light' })
    await library.goto(`chrome-extension://${extensionId}/library.html#/properties`)
    await library.reload()
    await expect(library.locator('.props-table input[type="checkbox"]').first()).toBeVisible()
    const accentOf = (pageToRead: Page) =>
      pageToRead.evaluate(() => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--ann-accent)'
        document.body.append(probe)
        const accent = getComputedStyle(probe).color
        probe.remove()
        return accent
      })
    const presets = await library.evaluate(() => [...document.querySelectorAll('.props-table input[type="checkbox"]')].map(input => getComputedStyle(input).accentColor))
    const accent = await accentOf(library)
    await library.goto(`chrome-extension://${extensionId}/library.html#/settings`)
    await library.reload()
    await expect(library.getByTestId('settings-view')).toBeVisible()
    const settings = await library.evaluate(() => [...document.querySelectorAll('.settings-view input[type="checkbox"]')].map(input => getComputedStyle(input).accentColor))
    const popup = await page.context().newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(popup.locator('.popup-mic input')).toBeVisible()
    const popupMic = await popup.evaluate(() => getComputedStyle(document.querySelector('.popup-mic input')!).accentColor)
    await popup.close()

    expect(presets.length, 'preset checkboxes on the properties page').toBeGreaterThan(0)
    expect(settings.length, 'checkboxes on the settings page').toBeGreaterThan(0)
    for (const [where, accentColor] of [
      ['a properties preset', presets[0]!],
      ['a settings checkbox', settings[0]!],
      ['the popup microphone checkbox', popupMic],
    ] as const)
      expect(accentColor, `${where} takes the accent`).toBe(accent)
    await library.close()
  })

  test('each banner variant carries its own state colour, in both appearances', async ({ page, extensionId }) => {
    await seed(page, extensionId)
    const library = await page.context().newPage()
    for (const scheme of ['light', 'dark'] as const) {
      await library.emulateMedia({ colorScheme: scheme })
      await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
      await library.reload()
      await expect(library.locator('.page-title')).toBeVisible()
      // the four status banners probed in place: each --ann-state is its own root token, and each
      // background is distinct and not the bare banner's neutral ground
      const banners = await library.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        const host = document.createElement('div')
        host.innerHTML = '<p class="banner"></p>' + ['ok', 'warn', 'danger', 'info'].map(kind => `<p class="banner banner-${kind}"></p>`).join('')
        document.body.append(host)
        const read = (selector: string) => {
          const el = host.querySelector(selector)!
          return { state: getComputedStyle(el).getPropertyValue('--ann-state').trim(), bg: getComputedStyle(el).backgroundColor }
        }
        const out = {
          plain: read('.banner:not([class*="banner-"])').bg,
          ok: read('.banner-ok'),
          warn: read('.banner-warn'),
          danger: read('.banner-danger'),
          info: read('.banner-info'),
          tokens: {
            success: root.getPropertyValue('--ann-success').trim(),
            warn: root.getPropertyValue('--ann-warn').trim(),
            danger: root.getPropertyValue('--ann-danger').trim(),
            info: root.getPropertyValue('--ann-info').trim(),
          },
        }
        host.remove()
        return out
      })
      expect(banners.ok.state, `ok reads the success token (${scheme})`).toBe(banners.tokens.success)
      expect(banners.warn.state, `warn reads the warn token (${scheme})`).toBe(banners.tokens.warn)
      expect(banners.danger.state, `danger reads the danger token (${scheme})`).toBe(banners.tokens.danger)
      expect(banners.info.state, `info reads the info token (${scheme})`).toBe(banners.tokens.info)
      const grounds = [banners.ok.bg, banners.warn.bg, banners.danger.bg, banners.info.bg]
      expect(new Set(grounds).size, `four distinct grounds (${scheme})`).toBe(4)
      for (const ground of grounds) expect(ground, `a variant ground differs from the plain banner (${scheme})`).not.toBe(banners.plain)
    }
    await library.close()
  })
})
