import { test, expect } from './fixtures'
import { ensureServiceWorker } from './helpers'

/**
 * The shortcuts as the browser holds them (extension.md §7.1). No spec can press the real key: the browser
 * binds it to the extension's command, and a key event injected into a page never reaches `chrome.commands`
 * (real-chrome-scenarios.md §1.2). What a spec can check is the binding the browser makes when the extension
 * is installed into a fresh profile: the screenshot and the block mode get their suggested keys, the three
 * entries the popup leads stay unbound. The browser hands a key out only at install and only when no other
 * record holds it, so a binding that is missing here is a shortcut that does nothing on a real machine.
 */

const MAC = process.platform === 'darwin'

test('a fresh install binds the screenshot and block-mode shortcuts and leaves the other entries unbound', async ({ context }) => {
  const worker = await ensureServiceWorker(context)
  const commands = await worker.evaluate(() => chrome.commands.getAll())
  // an unbound command may be left out of the list altogether
  const shortcut = (name: string): string => commands.find(command => command.name === name)?.shortcut ?? ''

  expect(shortcut('capture-selection'), 'the screenshot shortcut').toBe(MAC ? '⇧⌘S' : 'Ctrl+Shift+S')
  expect(shortcut('toggle-block-mode'), 'the block-mode shortcut').toBe(MAC ? '⇧⌘E' : 'Ctrl+Shift+E')
  for (const name of ['toggle-page-annotation', 'record-tab', 'download-page-main']) {
    expect(shortcut(name), `${name} is unbound by default`).toBe('')
  }
})
