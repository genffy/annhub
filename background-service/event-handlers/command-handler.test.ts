import { afterEach, describe, expect, it, vi } from 'vitest'
import config from '../../wxt.config'
import { ANN_ANNOTATE_COMMAND, ANN_BLOCK_MODE_COMMAND, ANN_DOWNLOAD_COMMAND, ANN_RECORD_COMMAND, ANN_SCREENSHOT_COMMAND } from '../../constants'
import { RecordingService } from '../services/recording'
import { CommandHandler } from './command-handler'

/**
 * The shortcuts (extension.md §7.1) tell the top frame's content script and nothing else: the
 * script also runs in same-origin child frames, and a broadcast would start a screenshot session or
 * block mode in every one of them (capture.md §3). The page-annotation entry is unbound by default
 * (annotate.md §1.1) but travels the same road once the user binds it.
 *
 * A shortcut works only when three things agree: the manifest declares the command (and suggests a
 * key for the two that have one), the code names it, and the worker acts on it. The last describe
 * block holds them to each other, so a command cannot lose one of the three without a test failing.
 */

function setup(tabs: { id?: number }[] = [{ id: 7 }]) {
  let listener: ((command: string) => Promise<void>) | undefined
  const sendMessage = vi.fn(async () => undefined)
  vi.stubGlobal('browser', {
    commands: { onCommand: { addListener: (fn: (command: string) => Promise<void>) => (listener = fn), removeListener: vi.fn() } },
    tabs: { query: vi.fn(async () => tabs), sendMessage },
  })
  new CommandHandler().registerListeners()
  return { fire: (command: string) => listener!(command), sendMessage }
}

afterEach(() => vi.unstubAllGlobals())

describe('browser commands', () => {
  it("send the screenshot trigger to the active tab's top frame only", async () => {
    const { fire, sendMessage } = setup()
    await fire(ANN_SCREENSHOT_COMMAND)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'TRIGGER_SCREENSHOT' }, { frameId: 0 })
  })

  it('send the block-mode trigger to the top frame only', async () => {
    const { fire, sendMessage } = setup()
    await fire(ANN_BLOCK_MODE_COMMAND)
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'TRIGGER_BLOCK_MODE' }, { frameId: 0 })
  })

  it('send the page-annotation trigger to the top frame only', async () => {
    const { fire, sendMessage } = setup()
    await fire(ANN_ANNOTATE_COMMAND)
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'TRIGGER_ANNOTATE' }, { frameId: 0 })
  })

  it('send the page-download trigger, marked as coming from the command, to the top frame only (download.md §2.3)', async () => {
    const { fire, sendMessage } = setup()
    await fire(ANN_DOWNLOAD_COMMAND)
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'command' }, { frameId: 0 })
  })

  it('hands the recording command to the recording service, not to a tab message', async () => {
    const { fire, sendMessage } = setup()
    // chrome is not stubbed here: the service's start probe finds no tab it could record and returns
    await expect(fire(ANN_RECORD_COMMAND)).resolves.toBeUndefined()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('do nothing for an unknown command or a window without a tab', async () => {
    const unknown = setup()
    await unknown.fire('something-else')
    expect(unknown.sendMessage).not.toHaveBeenCalled()
    const noTab = setup([{}])
    await noTab.fire(ANN_SCREENSHOT_COMMAND)
    expect(noTab.sendMessage).not.toHaveBeenCalled()
  })

  it('swallow a page without a receiver instead of failing the shortcut', async () => {
    const { fire, sendMessage } = setup()
    sendMessage.mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
    await expect(fire(ANN_SCREENSHOT_COMMAND)).resolves.toBeUndefined()
  })
})

/**
 * The manifest is where a command exists for the browser: a command the manifest does not declare can
 * never be bound, and a declared one the worker does not act on does nothing when its key is pressed.
 * Both fail silently in a real browser, so they are held here (extension.md §7.1).
 */
describe('the commands the manifest declares', () => {
  type Declared = { suggested_key?: Record<string, string>; global?: boolean; description?: string }

  function declaredCommands(): Record<string, Declared> {
    const manifest = config.manifest
    if (!manifest || typeof manifest === 'function' || 'then' in manifest) throw new Error('wxt.config.ts: the manifest is not a plain object')
    return (manifest.commands ?? {}) as Record<string, Declared>
  }

  const NAMED_IN_CODE = [ANN_SCREENSHOT_COMMAND, ANN_BLOCK_MODE_COMMAND, ANN_ANNOTATE_COMMAND, ANN_RECORD_COMMAND, ANN_DOWNLOAD_COMMAND]

  it('are the five the code names, no more and no fewer', () => {
    expect(Object.keys(declaredCommands()).sort()).toEqual([...NAMED_IN_CODE].sort())
  })

  it('suggest a key for the screenshot and the block mode, and leave the other three for the user to bind', () => {
    const declared = declaredCommands()
    expect(declared[ANN_SCREENSHOT_COMMAND]?.suggested_key).toEqual({ default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' })
    expect(declared[ANN_BLOCK_MODE_COMMAND]?.suggested_key).toEqual({ default: 'Ctrl+Shift+E', mac: 'Command+Shift+E' })
    for (const name of [ANN_ANNOTATE_COMMAND, ANN_RECORD_COMMAND, ANN_DOWNLOAD_COMMAND]) {
      expect(declared[name]?.suggested_key, `${name} is unbound by default`).toBeUndefined()
    }
  })

  it('are all browser-only shortcuts with a description for the shortcut settings page', () => {
    for (const [name, command] of Object.entries(declaredCommands())) {
      expect(command.global, `${name} must not be a system-wide shortcut`).toBe(false)
      expect(command.description, `${name} needs a description`).toMatch(/^__MSG_\w+__$/)
    }
  })

  it('make the worker do exactly one thing each when the browser fires them', async () => {
    const toggle = vi.spyOn(RecordingService.getInstance(), 'toggleFromCommand').mockResolvedValue(undefined)
    for (const name of Object.keys(declaredCommands())) {
      toggle.mockClear()
      const { fire, sendMessage } = setup()
      await fire(name)
      expect(sendMessage.mock.calls.length + toggle.mock.calls.length, `${name} does nothing when the browser fires it`).toBe(1)
    }
    toggle.mockRestore()
  })
})
