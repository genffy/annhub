import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * The words that name the screenshot key — the popup's footer, the library nav's footer and the empty views —
 * name the key the browser has bound to the command, and none when it has none (extension.md §7.1). A hint that
 * falls back to the default key sends the reader to a shortcut that does nothing.
 *
 * The bound case reads the browser's real binding. The unbound case answers `chrome.commands.getAll` the way the
 * browser does for a command nobody bound (listed, with an empty key): a spec cannot clear a binding.
 */

const A_KEY = /Cmd|Ctrl|Shift|⌘|⇧/
const HINT_WITHOUT_KEY = '选中网页文字即可保存'

/** The browser's answer for a command nobody bound. */
async function bindNothing(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (location.protocol !== 'chrome-extension:') return
    chrome.commands.getAll = ((callback?: (commands: chrome.commands.Command[]) => void) => {
      const commands = [{ name: 'capture-selection', description: '', shortcut: '' }]
      if (callback) return void callback(commands)
      return Promise.resolve(commands)
    }) as typeof chrome.commands.getAll
  })
}

/** The popup runs as a tab here: the active tab is an http page, so its footer shows the hint rather than the reason it cannot work. */
async function openPopup(page: Page, extensionId: string): Promise<void> {
  await page.addInitScript(() => {
    if (location.protocol !== 'chrome-extension:') return
    const query = chrome.tabs.query.bind(chrome.tabs)
    chrome.tabs.query = ((info: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      if (!info?.active) return query(info, callback as never)
      const tabs = [{ id: 4242, url: 'https://engineering.example.com/posts/retries', title: 'Retries' } as chrome.tabs.Tab]
      if (callback) return void callback(tabs)
      return Promise.resolve(tabs)
    }) as typeof chrome.tabs.query
  })
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.locator('.popup-shell').waitFor()
}

test('the popup footer, the nav footer and the empty view draw the key the browser binds', async ({ context, extensionId }) => {
  const popup = await context.newPage()
  await openPopup(popup, extensionId)
  const binding = await popup.evaluate(async () => (await chrome.commands.getAll()).find(command => command.name === 'capture-selection')?.shortcut ?? '')
  expect(binding, 'a fresh install binds the screenshot (command-bindings.spec.ts)').not.toBe('')
  const caps = binding.includes('+') ? binding.split('+') : [...binding]
  await expect(popup.locator('.popup-foot kbd')).toHaveText(caps)

  const library = await context.newPage()
  await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
  await expect(library.locator('.nav-shortcut kbd')).toHaveText(caps)
  await expect(library.locator('.empty')).toContainText(binding)
})

test('with no key bound, none of them names one and the empty views point at the selection menu', async ({ context, extensionId }) => {
  const popup = await context.newPage()
  await bindNothing(popup)
  await openPopup(popup, extensionId)
  await expect(popup.locator('.popup-foot')).toHaveText(HINT_WITHOUT_KEY)
  await expect(popup.locator('.popup-foot kbd')).toHaveCount(0)

  const library = await context.newPage()
  await bindNothing(library)
  await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
  await expect(library.locator('.nav-shortcut')).toHaveText(HINT_WITHOUT_KEY)
  await expect(library.locator('.nav-shortcut kbd')).toHaveCount(0)
  const empty = library.locator('.empty')
  await expect(empty).toContainText('或在同一个菜单里点「截图」')
  await expect(empty).not.toContainText(A_KEY)

  await library.goto(`chrome-extension://${extensionId}/library.html#/screenshots`)
  await expect(empty).toContainText('菜单里点「截图」，再框选区域或点选元素')
  await expect(empty).not.toContainText(A_KEY)
})
