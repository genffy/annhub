/**
 * The list views as card grids (extension.md §2.3): columns that fill the content area, equal heights,
 * previews of one height, the tall capture cropped from the top, and the reading note under the card —
 * asserted from geometry, never from screenshots. Moved verbatim from library-layout.spec.ts when the
 * file went over its byte budget.
 */
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary } from './helpers'
import { seedCards, send } from './library-layout-helpers'

// a cold service worker now and then holds `clearLibrary` for ~20s; that is not what these tests measure
test.describe.configure({ timeout: 90_000 })

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
