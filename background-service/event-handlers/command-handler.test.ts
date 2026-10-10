import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANN_BLOCK_MODE_COMMAND, ANN_SCREENSHOT_COMMAND } from '../../constants'
import { CommandHandler } from './command-handler'

/**
 * The two shortcuts (extension.md §7.1) tell the top frame's content script and nothing else: the
 * script also runs in same-origin child frames, and a broadcast would start a screenshot session or
 * block mode in every one of them (D-29).
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
