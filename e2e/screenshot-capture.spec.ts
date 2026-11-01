import { test, expect } from './fixtures'
import {
  clearLibrary,
  ensureServiceWorker,
  getAssetMetadata,
  getCapturePageUrl,
  getEntries,
  getScreenshotPageUrl,
  hoverForCapsule,
  setSettings,
  triggerScreenshot,
} from './helpers'

test.describe('screenshot capture (screenshot.md §1, §2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('a dragged region saves a screenshot entry and its PNG asset together', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()

    const post = page.getByTestId('screenshot-post')
    const box = (await post.boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 400, box.y + 150, { steps: 6 })
    await page.mouse.up()
    // a released drag waits for confirmation (screenshot.md §1.2)
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'screenshot', content: '', sourceHost: 'localhost', sourceUrl: page.url() })
    expect(String(entries[0]!.properties['title'])).toContain('Screenshot Capture Fixture')

    const assets = await getAssetMetadata(page.context())
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({ mimeType: 'image/png' })
    expect(assets[0]!.width).toBeGreaterThan(100)
    // the entry references exactly the saved asset
    expect(entries[0]!.assetId).toBe(assets[0]!.id)
  })

  test('the selection stage is one always-dark pill set in both appearances, and its words read on it (visual.md §2)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    // WCAG contrast of one colour over another; a translucent coat (the keycap, a chip's
    // background) is first laid over the pill it sits on
    const read = () =>
      page.evaluate(() => {
        type Rgba = [number, number, number, number]
        type Rgb = [number, number, number]
        const parse = (value: string): Rgba | null => {
          const modern = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(value.trim())
          if (modern)
            return [Math.round(Number(modern[1]) * 255), Math.round(Number(modern[2]) * 255), Math.round(Number(modern[3]) * 255), modern[4] === undefined ? 1 : Number(modern[4])]
          const m = /^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[,/ ]+(\d+(?:\.\d+)?))?\)$/.exec(value.trim())
          return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null
        }
        const solid = (c: Rgba): Rgb => [c[0], c[1], c[2]]
        const luminance = (c: Rgb) => {
          const f = (v: number) => {
            const s = v / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
        }
        const flatten = (top: Rgba, base: Rgb): Rgb => [
          top[0] * top[3] + base[0] * (1 - top[3]),
          top[1] * top[3] + base[1] * (1 - top[3]),
          top[2] * top[3] + base[2] * (1 - top[3]),
        ]
        const contrast = (front: Rgba, back: Rgb): number => {
          const first = luminance(solid(front))
          const second = luminance(back)
          const [hi, lo] = first > second ? [first, second] : [second, first]
          return (hi + 0.05) / (lo + 0.05)
        }
        const need = (value: string): Rgba => {
          const parsed = parse(value)
          if (!parsed) throw new Error(`unreadable colour: ${value}`)
          return parsed
        }
        const hint = document.querySelector('.ann-shot-hint') as HTMLElement
        const kbd = hint.querySelector('kbd') as HTMLElement
        const bar = document.querySelector('[data-ann-ui="screenshot-ratio-bar"]') as HTMLElement
        const chip = bar.querySelector('button') as HTMLElement
        const pill = need(getComputedStyle(hint).backgroundColor)
        return {
          hint: getComputedStyle(hint).backgroundColor,
          ratio: getComputedStyle(bar).backgroundColor,
          hintText: getComputedStyle(hint).color,
          hintContrast: contrast(need(getComputedStyle(hint).color), solid(pill)),
          kbdContrast: contrast(need(getComputedStyle(kbd).color), flatten(need(getComputedStyle(kbd).backgroundColor), solid(pill))),
          chipContrast: contrast(need(getComputedStyle(chip).color), flatten(need(getComputedStyle(chip).backgroundColor), solid(need(getComputedStyle(bar).backgroundColor)))),
        }
      })
    const seen: Record<string, Awaited<ReturnType<typeof read>>> = {}
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await triggerScreenshot(page)
      await expect(page.locator('.ann-shot-hint kbd').first()).toBeVisible()
      await expect(page.locator('[data-ann-ui="screenshot-ratio-bar"]')).toBeVisible()
      seen[scheme] = await read()
      expect(seen[scheme]!.hintContrast, `the hint's words read on its pill (${scheme})`).toBeGreaterThanOrEqual(4.5)
      expect(seen[scheme]!.kbdContrast, `the keycap's letters read on the keycap (${scheme})`).toBeGreaterThanOrEqual(4.5)
      expect(seen[scheme]!.chipContrast, `the ratio chip's words read on the pill (${scheme})`).toBeGreaterThanOrEqual(4.5)

      // a dragged region adds the size label: the same dark pill
      const post = page.getByTestId('screenshot-post')
      const box = (await post.boundingBox())!
      await page.mouse.move(box.x + 5, box.y + 5)
      await page.mouse.down()
      await page.mouse.move(box.x + 260, box.y + 120, { steps: 4 })
      await page.mouse.up()
      await expect(page.locator('.ann-shot-size')).toBeVisible()
      const size = await page.evaluate(() => getComputedStyle(document.querySelector('.ann-shot-size')!).backgroundColor)
      expect(size, `the size label is the same pill (${scheme})`).toBe(seen[scheme]!.hint)
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    }
    expect(seen.dark!.hint, 'the hint does not follow the system appearance').toBe(seen.light!.hint)
    expect(seen.dark!.ratio, 'the ratio bar does not follow the system appearance').toBe(seen.light!.ratio)
    expect(seen.dark!.hintText).toBe(seen.light!.hintText)
  })

  // the toolbar is drawn by React, whose first commit could come after the frame that moves the focus: the keyboard
  // then stayed on the masked page. Shots in a row make a lost focus show up.
  test('the keyboard starts on the toolbar every time the preview opens', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    const post = page.getByTestId('screenshot-post')
    for (let shot = 1; shot <= 6; shot++) {
      await triggerScreenshot(page)
      await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()
      const box = (await post.boundingBox())!
      await page.mouse.move(box.x + 5, box.y + 5)
      await page.mouse.down()
      await page.mouse.move(box.x + 300, box.y + 120, { steps: 4 })
      await page.mouse.up()
      await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.closest('[data-ann-ui="screenshot-toolbar"]') != null), { message: `shot ${shot}`, timeout: 1500 })
        .toBe(true)
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    }
  })

  // The editor's own bars are the same always-dark pill set (visual.md §2): the tools pill, the
  // status strip under it and the success bubble never follow the system appearance, and
  // the icons (≥ 3:1) and the keyboard focus ring (≥ 3:1) read on the dark ground.
  test('the editor toolbar, its status strip and the bubble are the same dark pill in both appearances, and their icons and focus ring read on it', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    const contrastOf = () =>
      page.evaluate(() => {
        const parse = (value: string): [number, number, number] | null => {
          const m = /^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[,/ ]+[\d.]+)?\)$/.exec(value.trim())
          return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
        }
        const luminance = (c: [number, number, number]) => {
          const f = (v: number) => {
            const s = v / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
        }
        const between = (front: string, back: string): number => {
          const a = parse(front)
          const b = parse(back)
          if (!a || !b) throw new Error(`unreadable colour: ${front} over ${back}`)
          const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)]
          return (hi + 0.05) / (lo + 0.05)
        }
        const tools = document.querySelector('.ann-shot-tools') as HTMLElement
        const icon = document.querySelector('[data-ann-ui="screenshot-tool-rectangle"]') as HTMLElement
        const ring = document.createElement('span')
        ring.style.backgroundColor = 'var(--annov-pill-focus)'
        ;(document.querySelector('[data-ann-ui="screenshot-session"]') as HTMLElement).append(ring)
        const focus = getComputedStyle(ring).backgroundColor
        ring.remove()
        return {
          tools: getComputedStyle(tools).backgroundColor,
          status: getComputedStyle(document.querySelector('.ann-shot-status') as HTMLElement).backgroundColor,
          icon: getComputedStyle(icon).color,
          iconContrast: between(getComputedStyle(icon).color, getComputedStyle(tools).backgroundColor),
          focusContrast: between(focus, getComputedStyle(tools).backgroundColor),
        }
      })
    const seen: Record<string, Awaited<ReturnType<typeof contrastOf>>> = {}
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await triggerScreenshot(page)
      const post = page.getByTestId('screenshot-post')
      const box = (await post.boundingBox())!
      await page.mouse.move(box.x + 5, box.y + 5)
      await page.mouse.down()
      await page.mouse.move(box.x + 300, box.y + 120, { steps: 4 })
      await page.mouse.up()
      await page.keyboard.press('Enter')
      await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
      // the status strip under the tools pill carries the shot's anonymity (screenshot.md §3)
      await expect(page.locator('.ann-shot-status')).toContainText('匿名：开')
      seen[scheme] = await contrastOf()
      expect(seen[scheme]!.tools, `the tools pill does not follow the system (${scheme})`).toBe(seen.light?.tools ?? seen[scheme]!.tools)
      expect(seen[scheme]!.status, `the status strip is the same pill (${scheme})`).toBe(seen[scheme]!.tools)
      expect(seen[scheme]!.iconContrast, `the icons read on the pill (${scheme})`).toBeGreaterThanOrEqual(3)
      expect(seen[scheme]!.focusContrast, `the focus ring reads on the pill (${scheme})`).toBeGreaterThanOrEqual(3)
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    }
  })

  // A narrow window puts the widths row, the status strip and the toolbar in one column under the
  // picture: none of them may leave the window or ride over another (screenshot.md §1.1).
  test('in a narrow window the stacked pills stay in the viewport and off each other', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 640 })
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    const post = page.getByTestId('screenshot-post')
    const box = (await post.boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 260, box.y + 90, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    // the pen brings the widths row; the shot's anonymity brings the status strip
    await page.locator('[data-ann-ui="screenshot-tool-pen"]').click()
    await expect(page.locator('.ann-shot-widths')).toBeVisible()
    await expect(page.locator('.ann-shot-status')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-copy"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-bubble"]')).toBeVisible()
    const view = page.viewportSize()!
    const boxes = await page.evaluate(() =>
      ['.ann-shot-tools', '.ann-shot-status', '.ann-shot-widths', '[data-ann-ui="screenshot-bubble"]'].map(selector => {
        const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
        return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }),
    )
    for (const bar of boxes) {
      expect(bar.x, `${bar.selector} stays inside the window`).toBeGreaterThanOrEqual(0)
      expect(bar.y, `${bar.selector} stays inside the window`).toBeGreaterThanOrEqual(0)
      expect(bar.x + bar.width, `${bar.selector} stays inside the window`).toBeLessThanOrEqual(view.width)
      expect(bar.y + bar.height, `${bar.selector} stays inside the window`).toBeLessThanOrEqual(view.height)
    }
    for (const [first, second] of boxes.flatMap((a, i) => boxes.slice(i + 1).map(b => [a, b] as const))) {
      const overlaps = first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y
      expect(overlaps, `${first.selector} and ${second.selector} do not overlap`).toBe(false)
    }
  })

  test('a click without a drag captures the clicked element instead', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)

    const body = page.getByTestId('capture-body')
    const box = (await body.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]!.type).toBe('screenshot')
    const assets = await getAssetMetadata(page.context())
    expect(assets).toHaveLength(1)
  })

  test('copy puts the PNG on the clipboard and keeps the session open', async ({ page }) => {
    await setSettings(page.context(), {
      watermark: { enabled: true, text: 'AnnHub', position: 'bottom-right', size: 'medium', opacity: 0.7 },
      beautify: { enabled: true, background: 'solid-white', padding: 'medium', radius: 12, shadow: true },
    })
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    const post = page.getByTestId('screenshot-post')
    const box = (await post.boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 380, box.y + 130, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()

    await page.locator('[data-ann-ui="screenshot-copy"]').click()
    // the confirmation rides above the toolbar as a bubble, never a toolbar
    // row, and leaves on its own (screenshot.md §4.2)
    await expect(page.locator('[data-ann-ui="screenshot-bubble"]')).toContainText('已复制')
    await expect(page.locator('.ann-shot-notice')).toHaveCount(0)
    await expect(page.locator('[data-ann-ui="screenshot-bubble"]')).toHaveCount(0, { timeout: 5000 })
    // the session stays for more editing or a save (screenshot.md §4)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()

    const clipboard = await page.evaluate(() => navigator.clipboard.read().then(items => items[0]!.types))
    expect(clipboard).toContain('image/png')

    await page.locator('[data-ann-ui="screenshot-download"]').click()
    const sw = await ensureServiceWorker(page.context())
    await expect
      .poll(() =>
        sw.evaluate(async () => {
          const metrics = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
          return ['screenshot.copied', 'screenshot.downloaded'].map(name =>
            Object.values(metrics?.[name] ?? {})
              .flatMap(day => Object.keys(day.byProps))
              .some(key => key.includes('beautify=true') && key.includes('watermark=true')),
          )
        }),
      )
      .toEqual([true, true])
  })

  test('saving from a remembered frame records frame=reused (RV-CAP-09)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    const box = (await page.getByTestId('screenshot-post').boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 350, box.y + 120, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect.poll(() => getEntries(page.context())).toHaveLength(2)
    const sw = await ensureServiceWorker(page.context())
    await expect
      .poll(() =>
        sw.evaluate(async () => {
          const metrics = (await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] as Record<string, Record<string, { byProps: Record<string, number> }>>
          return Object.values(metrics?.['capture.saved'] ?? {})
            .flatMap(day => Object.keys(day.byProps))
            .some(key => key.includes('frame=reused'))
        }),
      )
      .toBe(true)
  })

  test('library screenshot gallery offers thumbnail, zoom, download and delete (RV-LIB-12)', async ({ page, extensionId }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    const box = (await page.getByTestId('screenshot-post').boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 360, box.y + 120, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    await expect.poll(() => getEntries(page.context())).toHaveLength(1)
    const id = (await getEntries(page.context()))[0]!.id

    const library = await page.context().newPage()
    await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
    await expect(library.locator(`.entry-card[data-entry-id="${id}"] img`)).toBeVisible()
    await library.goto(`chrome-extension://${extensionId}/library.html#/screenshots`)
    const tile = library.locator(`.entry-card[data-entry-id="${id}"]`)
    await expect(tile.locator('img')).toBeVisible()
    await tile.locator('img').click()
    await expect(library.locator('.drawer-image')).toBeVisible()
    await library.locator('.drawer-image').click()
    await expect(library.getByRole('dialog', { name: '图片预览' })).toBeVisible()
    await library.getByRole('dialog', { name: '图片预览' }).getByRole('button', { name: '关闭' }).click()
    await library.locator('.drawer').getByRole('button', { name: '关闭' }).click()
    await tile.getByRole('button', { name: '下载' }).click()
    const sw = await ensureServiceWorker(page.context())
    await expect
      .poll(() =>
        sw.evaluate(() =>
          chrome.downloads.search({ limit: 10 }).then(items => items.some(item => item.state === 'complete' && item.mime === 'image/png' && item.url.startsWith('blob:'))),
        ),
      )
      .toBe(true)
    library.once('dialog', dialog => void dialog.accept())
    await tile.getByRole('button', { name: '删除' }).click()
    await expect(tile).toHaveCount(0)
    await library.close()
  })

  test('Esc cancels the session and leaves nothing behind', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(0)
  })

  test('a synthetic keypress the page dispatched cannot start a session', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true, bubbles: true }))
    })
    await page.waitForTimeout(400)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)
  })

  test('Shot of an X post records that post’s status permalink', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const post = page.locator('[data-testid="tweet"]')
    await post.scrollIntoViewIfNeeded()
    const capsule = await hoverForCapsule(page, '[data-testid="tweet"] p')
    await capsule.getByRole('button', { name: '截图' }).click()
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]!.sourceUrl).toBe('http://localhost:8173/status/1748113923456')
    expect(entries[0]!.properties['title']).toBe('Backoff and retry — capture fixture')
  })

  test('a region screenshot of an X post records that post’s status permalink', async ({ page }) => {
    await page.goto(getCapturePageUrl())
    const post = page.locator('[data-testid="tweet"]')
    await post.scrollIntoViewIfNeeded()
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()

    const box = (await post.boundingBox())!
    await page.mouse.move(box.x + 8, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8, { steps: 6 })
    await page.mouse.up()
    await expect(page.locator('[data-ann-ui="shot-confirm-bar"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()
    await page.locator('[data-ann-ui="screenshot-save"]').click()
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toHaveCount(0)

    const entries = await getEntries(page.context())
    expect(entries).toHaveLength(1)
    expect(entries[0]!.sourceUrl).toBe('http://localhost:8173/status/1748113923456')
  })
})

test.describe('element capture renders content', () => {
  test('the preview of a clicked element shows the element, not one flat colour', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()

    const body = page.getByTestId('capture-body')
    const box = (await body.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()

    // the capture the preview draws must contain real pixels: text, several
    // colours — not the single shade the offscreen-surface bug produced
    const stats = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-ann-ui="screenshot-preview"] canvas')
      if (!canvas) return null
      const ctx = canvas.getContext('2d')!
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const colors = new Set<string>()
      let nonBackground = 0
      const bg = `${data[0]},${data[1]},${data[2]}`
      for (let i = 0; i < data.length; i += 4) {
        const key = `${data[i]!},${data[i + 1]!},${data[i + 2]!}`
        colors.add(key)
        if (key !== bg) nonBackground++
      }
      return { colors: colors.size, nonBackgroundRatio: nonBackground / (data.length / 4) }
    })
    expect(stats).not.toBeNull()
    expect(stats!.colors).toBeGreaterThan(50)
    expect(stats!.nonBackgroundRatio).toBeGreaterThan(0.02)
  })

  test('a translucent page background no longer reads as opaque (X hover case)', async ({ page }) => {
    await page.goto(getScreenshotPageUrl())
    await triggerScreenshot(page)
    await expect(page.locator('[data-ann-ui="screenshot-session"]')).toBeVisible()

    // the same click-path but on an element whose background is rgba(...,0.03):
    // the capture must still come out with visible content
    const translucent = page.getByTestId('capture-translucent')
    await translucent.scrollIntoViewIfNeeded()
    const box = (await translucent.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator('[data-ann-ui="screenshot-preview"]')).toBeVisible()

    const stats = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-ann-ui="screenshot-preview"] canvas')
      if (!canvas) return null
      const ctx = canvas.getContext('2d')!
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const colors = new Set<string>()
      for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]!},${data[i + 1]!},${data[i + 2]!}`)
      return { colors: colors.size }
    })
    expect(stats).not.toBeNull()
    expect(stats!.colors).toBeGreaterThan(10)
  })
})
