import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clearLibrary, getCapturePageUrl, getEntries, selectUntilMenu, textContrast, textOverlaps, waitForClipToast } from './helpers'

test('a popup entry opens that entry in the library (RV-LIB-12)', async ({ page, extensionId }) => {
  await clearLibrary(page.context())
  await page.goto(getCapturePageUrl())
  const menu = await selectUntilMenu(page, '#intro-p')
  await menu.locator('.ann-menu-action').first().click()
  await waitForClipToast(page)
  const id = (await getEntries(page.context()))[0]!.id
  const popup = await page.context().newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const opened = page.context().waitForEvent('page')
  await popup.locator('.popup-list button').first().click()
  const library = await opened
  await expect(library).toHaveURL(new RegExp(`#/entry/${id}$`))
  await expect(library.locator(`.drawer[data-entry-id="${id}"]`)).toBeVisible()
  await library.close()
  await popup.close()
})

/** Opens the popup page with two saved clips, saved through the same message the page menu uses. */
async function openPopupWithClips(page: Page, extensionId: string): Promise<Page> {
  await clearLibrary(page.context())
  const popup = await page.context().newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  for (const [index, title] of ['Retries and backpressure', 'Exponential backoff with jitter'].entries()) {
    const saved = await popup.evaluate(
      payload =>
        chrome.runtime.sendMessage({
          type: 'SAVE_CLIP',
          requestId: `r-pop-${payload.index}`,
          draft: {
            id: `ent_pop_${payload.index}`,
            content: `Body of ${payload.title}`,
            sourceUrl: `https://example.com/${payload.index}`,
            properties: { title: payload.title },
            via: 'menu',
          },
        }),
      { index, title },
    )
    expect(saved.success).toBe(true)
  }
  await popup.reload()
  await expect(popup.locator('.popup-list button')).toHaveCount(2)
  return popup
}

test('the popup list keeps the room the rail leaves, and the hint sits under it (extension.md §2.6)', async ({ page, extensionId }) => {
  const popup = await openPopupWithClips(page, extensionId)
  const geometry = await popup.evaluate(() => {
    const box = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect()
    return { shell: box('.popup-shell'), rail: box('.popup-rail'), body: box('.popup-body'), list: box('.popup-list'), foot: box('.popup-foot'), title: box('.popup-title') }
  })
  expect(geometry.body.left).toBeGreaterThanOrEqual(geometry.rail.right - 1)
  expect(geometry.body.width).toBeGreaterThan(geometry.shell.width - geometry.rail.width - 8)
  expect(geometry.title.width, 'a row title has room to read').toBeGreaterThan(80)
  // the hint is the last thing in the body, below the list rather than a column beside it
  expect(geometry.foot.top).toBeGreaterThanOrEqual(geometry.list.bottom - 1)
  expect(geometry.foot.bottom).toBeLessThanOrEqual(geometry.shell.bottom + 1)
  // the "open in library" action is a link, not a browser-default button
  expect(await popup.locator('.popup-head .link').evaluate(element => getComputedStyle(element).borderTopStyle)).toBe('none')
  await popup.close()
})

test('in dark mode the popup text stays readable on the popup background (extension.md §2.6)', async ({ page, extensionId }) => {
  const popup = await openPopupWithClips(page, extensionId)
  await popup.emulateMedia({ colorScheme: 'dark' })
  const ratios = await popup.evaluate(() => {
    const channels = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).map(Number)
    const luminance = ([r, g, b]: number[]): number => {
      const linear = [r, g, b].map(channel => {
        const unit = (channel ?? 0) / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
    }
    // the first ancestor that paints a background; the canvas itself is white
    const backdrop = (element: Element): number[] => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const [r, g, b, a = 1] = channels(getComputedStyle(node).backgroundColor)
        if (a > 0) return [r!, g!, b!]
      }
      return [255, 255, 255]
    }
    const contrast = (selector: string): number => {
      const element = document.querySelector(selector)!
      const [text, ground] = [luminance(channels(getComputedStyle(element).color)), luminance(backdrop(element))]
      return (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)
    }
    return {
      text: {
        title: contrast('.popup-title'),
        head: contrast('.popup-head'),
        // accent text on the dark surface and on the accent tint (真机走查 P2-8)
        link: contrast('.popup-head .link'),
        chip: contrast('.type-chip.type-clip'),
        hint: contrast('.popup-foot'),
      },
      // the current view's icon is a UI indicator: 3:1
      rail: contrast('.popup-rail-current'),
    }
  })
  for (const [part, ratio] of Object.entries(ratios.text)) expect(ratio, `${part} contrast in dark mode`).toBeGreaterThanOrEqual(4.5)
  expect(ratios.rail, 'the current view in the rail, dark mode').toBeGreaterThanOrEqual(3)
  await popup.close()
})

test('the popup draws the library icons: lucide in the rail, icon and name in every row (visual.md §3)', async ({ page, extensionId }) => {
  const popup = await openPopupWithClips(page, extensionId)
  const rail = await popup.locator('.popup-rail-item').evaluateAll(items =>
    items.map(item => {
      const svg = item.querySelector('svg')
      const [button, icon] = [item.getBoundingClientRect(), svg?.getBoundingClientRect()]
      return {
        icons: [...item.querySelectorAll('svg')].map(element => [...element.classList].find(name => name.startsWith('lucide-'))?.replace('lucide-', '')),
        // nothing is typed into the button apart from the count badge: a glyph character would be a font's guess at an icon
        typed: [...item.childNodes]
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent)
          .join(''),
        offCentre: icon
          ? Math.max(Math.abs(icon.left + icon.width / 2 - (button.left + button.width / 2)), Math.abs(icon.top + icon.height / 2 - (button.top + button.height / 2)))
          : null,
      }
    }),
  )
  expect(rail.map(item => ({ icons: item.icons, typed: item.typed }))).toEqual([
    { icons: ['library'], typed: '' },
    { icons: ['bookmark'], typed: '' },
    { icons: ['highlighter'], typed: '' },
    { icons: ['scan'], typed: '' },
    { icons: ['settings'], typed: '' },
  ])
  for (const item of rail) expect(item.offCentre, 'the icon sits in the middle of its button').toBeLessThanOrEqual(2)

  const rows = await popup.locator('.popup-list li').evaluateAll(items =>
    items.map(item => {
      const chip = item.querySelector('.type-chip')!
      const svg = chip.querySelector('svg')
      return { type: chip.getAttribute('data-type'), icon: svg ? [...svg.classList].find(name => name.startsWith('lucide-')) : null, text: chip.textContent!.trim() }
    }),
  )
  expect(rows).toEqual([
    { type: 'clip', icon: 'lucide-bookmark', text: '剪藏' },
    { type: 'clip', icon: 'lucide-bookmark', text: '剪藏' },
  ])
  await popup.close()
})

test('the popup buttons draw in the popup font, not the browser one (visual.md §2)', async ({ page, extensionId }) => {
  const popup = await openPopupWithClips(page, extensionId)
  const strangers = await popup.evaluate(() => {
    const family = getComputedStyle(document.body).fontFamily
    const controls = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea')]
    return {
      checked: controls.length,
      strangers: controls.filter(control => getComputedStyle(control).fontFamily !== family).map(control => `<${control.tagName.toLowerCase()} class="${control.className}">`),
    }
  })
  expect(strangers.checked, 'the rail, the link and the rows are buttons').toBeGreaterThanOrEqual(8)
  expect(strangers.strangers, 'controls in a font of their own').toEqual([])
  await popup.close()
})

test('the popup annotation entry opens the layer on the page and stays off on restricted pages (annotate.md §1.1)', async ({ page, extensionId }) => {
  await page.goto(getCapturePageUrl())
  const popup = await page.context().newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  // an http page: the button is live, and clicking it opens the layer there.
  // the popup runs as a tab here, so the fixture page has to be the active tab
  // for the popup's tab query to see it
  const button = popup.locator('[data-ann-ui="popup-annotate"]')
  await page.bringToFront()
  // the entry's availability is read once on mount; remount now that the
  // fixture page is the window's active tab
  await popup.reload()
  await expect(button).toBeEnabled()
  await button.click()
  await expect(page.locator('[data-ann-ui="annotation-layer"]')).toBeVisible()

  // the annotate click closed the popup (it dismisses itself); a fresh one shows the recording
  // entry in the same row — enabled on the page, with its microphone choice
  const popup2 = await page.context().newPage()
  await popup2.goto(`chrome-extension://${extensionId}/popup.html`)
  // opening the popup tab made it the active tab; hand the role back to the
  // fixture page and remount, so the entries read the right tab
  await page.bringToFront()
  await popup2.reload()
  const record = popup2.locator('[data-ann-ui="popup-record"]')
  await expect(record).toBeEnabled()
  const mic = popup2.locator('[data-ann-ui="popup-mic"] input[type="checkbox"]')
  await expect(mic).toBeVisible()
  await mic.check()
  // the restricted page has both entries off, each naming its reason
  const restricted = await page.context().newPage()
  await restricted.goto(`chrome-extension://${extensionId}/library.html#/settings`)
  await restricted.bringToFront()
  const popup3 = await page.context().newPage()
  await popup3.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup3.locator('[data-ann-ui="popup-record"]')).toBeDisabled()
  await expect(popup3.locator('[data-ann-ui="popup-record"]')).toHaveAttribute('title', /不能录制/)
  await expect(popup3.locator('[data-ann-ui="popup-annotate"]')).toBeDisabled()
  await expect(popup3.locator('[data-ann-ui="popup-annotate"]')).toHaveAttribute('title', /不能批注/)
  await popup3.close()
  await popup2.close()
  await restricted.close()
})

/** Makes the popup believe the active tab is an http page and the worker answers with this recording state. */
async function popupIn(page: Page, extensionId: string, recording?: Record<string, unknown>): Promise<Page> {
  const popup = await page.context().newPage()
  await popup.setViewportSize({ width: 340, height: 360 })
  await popup.addInitScript(
    ({ recording }) => {
      const query = chrome.tabs.query.bind(chrome.tabs)
      chrome.tabs.query = ((info: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
        if (!info?.active) return query(info, callback as never)
        const tabs = [{ id: 4242, url: 'https://engineering.example.com/posts/retries', title: 'Retries' } as chrome.tabs.Tab]
        if (callback) return void callback(tabs)
        return Promise.resolve(tabs)
      }) as typeof chrome.tabs.query
      const send = chrome.runtime.sendMessage.bind(chrome.runtime)
      chrome.runtime.sendMessage = ((...rest: unknown[]) => {
        const type = (rest[0] as { type?: string } | undefined)?.type
        if (type === 'GET_RECORDING_STATE' && recording) return Promise.resolve({ success: true, data: recording })
        return (send as (...args: unknown[]) => unknown)(...rest)
      }) as typeof chrome.runtime.sendMessage
    },
    { recording },
  )
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.locator('.popup-shell').waitFor()
  return popup
}

/** The block under the list, in every state: no text drawn on text, nothing past the shell's right edge. */
async function expectPopupWellFormed(popup: Page): Promise<void> {
  expect(await textOverlaps(popup, '.popup-shell'), 'text drawn on text').toEqual([])
  const geometry = await popup.evaluate(() => {
    const shell = document.querySelector('.popup-shell')!
    const shellBox = shell.getBoundingClientRect()
    const beyond = [...shell.querySelectorAll<HTMLElement>('*')]
      .filter(element => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.right > shellBox.right + 1
      })
      .map(element => `${element.className || element.tagName} at ${Math.round(element.getBoundingClientRect().right)}`)
    return { beyond, scrolls: shell.scrollWidth > shell.clientWidth + 1, list: document.querySelector('.popup-list')!.getClientRects().length }
  })
  expect(geometry.beyond, 'elements past the shell edge').toEqual([])
  expect(geometry.scrolls, 'the shell scrolls sideways').toBe(false)
  expect(geometry.list, 'the list keeps its place above the block').toBeGreaterThan(0)
}

for (const uiLocale of ['zh-CN', 'en-US'] as const) {
  test.describe(`the popup's block under the list in ${uiLocale} (extension.md §2.6)`, () => {
    test.use({ uiLocale })

    test('idle, recording, download-failed: one line per piece of information, nothing overlapping', async ({ page, extensionId }) => {
      await clearLibrary(page.context())
      const idle = await popupIn(page, extensionId)
      await expectPopupWellFormed(idle)
      await idle.close()

      const recording = await popupIn(page, extensionId, {
        status: 'recording',
        withMic: true,
        tabId: 4242,
        tabTitle: 'Retries and backpressure — engineering.example.com',
        startedAt: Date.now() - 192_000,
        micNotice: 'denied',
      })
      await expect(recording.locator('.popup-recording-mic')).toBeVisible()
      await expectPopupWellFormed(recording)
      await recording.close()

      const failed = await popupIn(page, extensionId, {
        status: 'download-failed',
        withMic: false,
        failedDownload: { filename: 'annhub-recording.webm' },
      })
      await expectPopupWellFormed(failed)
      await failed.close()
    })

    test('idle: the two entries share one row, each on a single line and equally wide', async ({ page, extensionId }) => {
      await clearLibrary(page.context())
      const idle = await popupIn(page, extensionId)
      const row = await idle.evaluate(() => {
        const shell = document.querySelector('.popup-shell')!
        const lines = (selector: string) => {
          const button = document.querySelector<HTMLElement>(selector)!
          const label2 = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE)!
          const range = document.createRange()
          range.selectNodeContents(label2)
          return range.getClientRects().length
        }
        const annotateButton = document.querySelector<HTMLElement>('[data-ann-ui="popup-annotate"]')!
        const recordButton = document.querySelector<HTMLElement>('[data-ann-ui="popup-record"]')!
        return {
          annotateLines: lines('[data-ann-ui="popup-annotate"]'),
          recordLines: lines('[data-ann-ui="popup-record"]'),
          annotateWidth: annotateButton.getBoundingClientRect().width,
          recordWidth: recordButton.getBoundingClientRect().width,
          sameRow: Math.abs(annotateButton.getBoundingClientRect().top - recordButton.getBoundingClientRect().top) < 1,
          micBelowRecord: document.querySelector<HTMLElement>('.popup-mic')!.getBoundingClientRect().top > recordButton.getBoundingClientRect().bottom - 1,
          micWidth: document.querySelector<HTMLElement>('.popup-mic')!.getBoundingClientRect().height,
          shellWidth: shell.getBoundingClientRect().width,
        }
      })
      expect(row.annotateLines, 'the annotate entry is one line').toBe(1)
      expect(row.recordLines, 'the record entry is one line').toBe(1)
      expect(Math.abs(row.annotateWidth - row.recordWidth), 'the two entries are equally wide').toBeLessThanOrEqual(1)
      expect(row.sameRow, 'the two entries share one row').toBe(true)
      expect(row.micBelowRecord, 'the microphone choice sits under recording').toBe(true)
      expect(row.micWidth, 'the microphone label is a 24px target').toBeGreaterThanOrEqual(24)
      await idle.close()
    })

    test('restricted: the reason is on the page above the entries, and the footer speaks of what is possible', async ({ page, extensionId }) => {
      await clearLibrary(page.context())
      // the popup opened as its own tab is the active tab, and an extension page is one content scripts cannot enter
      const popup = await page.context().newPage()
      await popup.setViewportSize({ width: 340, height: 360 })
      await popup.goto(`chrome-extension://${extensionId}/popup.html`)
      await popup.locator('.popup-shell').waitFor()
      const reason = popup.locator('.popup-restricted')
      await expect(reason).toBeVisible()
      const layout = await popup.evaluate(() => {
        const reasonBox = document.querySelector('.popup-restricted')!.getBoundingClientRect()
        const annotateBox = document.querySelector<HTMLElement>('[data-ann-ui="popup-annotate"]')!.getBoundingClientRect()
        return { above: reasonBox.bottom <= annotateBox.top + 1 }
      })
      expect(layout.above, 'the reason sits above the entries').toBe(true)
      const [ratio] = await textContrast(reason)
      expect(ratio, 'the reason is readable text').toBeGreaterThanOrEqual(4.5)
      await expect(popup.locator('[data-ann-ui="popup-annotate"]')).toBeDisabled()
      await expect(popup.locator('[data-ann-ui="popup-record"]')).toBeDisabled()
      await expect(popup.locator('.popup-foot')).not.toContainText('选中网页文字')
      await expectPopupWellFormed(popup)
      await popup.close()
    })

    test('recording: the annotate entry and the keys are there, the title on its own line', async ({ page, extensionId }) => {
      await clearLibrary(page.context())
      const recording = await popupIn(page, extensionId, {
        status: 'recording',
        withMic: true,
        tabId: 4242,
        tabTitle: 'Retries and backpressure — engineering.example.com',
        startedAt: Date.now() - 192_000,
      })
      await expect(recording.locator('[data-ann-ui="popup-annotate"]')).toBeVisible()
      const lines = await recording.evaluate(() => {
        const status = document.querySelector('.popup-recording-line')!.getBoundingClientRect()
        const title = document.querySelector('.popup-recording-title')!
        const titleBox = title.getBoundingClientRect()
        const style = getComputedStyle(title)
        return {
          ownLine: titleBox.top >= status.bottom - 1,
          oneLine: titleBox.height < parseFloat(style.fontSize) * 2,
          keysSize: parseFloat(getComputedStyle(document.querySelector('.popup-recording-keys')!).fontSize),
        }
      })
      expect(lines.ownLine, 'the recorded tab title has its own line').toBe(true)
      expect(lines.oneLine, 'the title is a single ellipsised line').toBe(true)
      expect(lines.keysSize, 'the keys hint is at least 12px').toBeGreaterThanOrEqual(12)
      await recording.close()
    })

    test('every text under the list is at least 12px', async ({ page, extensionId }) => {
      await clearLibrary(page.context())
      const idle = await popupIn(page, extensionId)
      const recording = await popupIn(page, extensionId, {
        status: 'recording',
        withMic: true,
        tabId: 4242,
        tabTitle: 'Retries',
        startedAt: Date.now() - 60_000,
        micNotice: 'denied',
      })
      await expect(recording.locator('.popup-recording-mic')).toBeVisible()
      for (const popup of [idle, recording]) {
        const small = await popup.evaluate(() => {
          const found: string[] = []
          for (const block of document.querySelectorAll('.popup-actions, .popup-recording-outcome, .popup-foot')) {
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const text = (node.textContent ?? '').trim()
              const parent = node.parentElement
              if (!text || !parent) continue
              const size = parseFloat(getComputedStyle(parent).fontSize)
              if (size < 12) found.push(`${parent.className}: ${text.slice(0, 20)} at ${size}px`)
            }
          }
          return found
        })
        expect(small, 'text under 12px below the list').toEqual([])
        await popup.close()
      }
    })
  })
}
