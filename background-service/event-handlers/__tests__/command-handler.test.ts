import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const browserMock = {
  commands: { onCommand: { addListener: vi.fn(), removeListener: vi.fn() } },
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
  scripting: { executeScript: vi.fn() },
}
;(globalThis as any).browser = browserMock

import { ANN_SELECTION_KEY, SCREENSHOT_TRIGGER_GLOBAL } from '../../../constants'
import { CommandHandler } from '../command-handler'

async function press(): Promise<void> {
  const handler = new CommandHandler()
  handler.registerListeners()
  const registrations = browserMock.commands.onCommand.addListener.mock.calls
  const listener = registrations[registrations.length - 1]![0] as (command: string) => Promise<void>
  await listener(ANN_SELECTION_KEY)
}

describe('the screenshot shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browserMock.tabs.query.mockResolvedValue([{ id: 5 }])
  })

  it('asks the content script of the active tab', async () => {
    browserMock.tabs.sendMessage.mockResolvedValue(undefined)
    await press()
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(5, { type: 'TRIGGER_SCREENSHOT', command: ANN_SELECTION_KEY })
    expect(browserMock.scripting.executeScript).not.toHaveBeenCalled()
  })

  describe('when no content script answers', () => {
    beforeEach(() => {
      browserMock.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'))
    })

    it("calls into the content script's own world, and sends the page nothing it could also send", async () => {
      const dispatched = vi.spyOn(window, 'dispatchEvent')
      await press()
      expect(browserMock.scripting.executeScript).toHaveBeenCalledTimes(1)
      const injection = browserMock.scripting.executeScript.mock.calls[0]![0]
      expect(injection).toMatchObject({ target: { tabId: 5 }, world: 'ISOLATED', args: [SCREENSHOT_TRIGGER_GLOBAL] })

      // What the browser would run in that world, with and without a content script that registered itself.
      const enter = vi.fn()
      ;(globalThis as Record<string, unknown>)[SCREENSHOT_TRIGGER_GLOBAL] = enter
      injection.func(...injection.args)
      expect(enter).toHaveBeenCalledTimes(1)
      delete (globalThis as Record<string, unknown>)[SCREENSHOT_TRIGGER_GLOBAL]
      expect(() => injection.func(...injection.args)).not.toThrow()

      // A DOM event on window is something any script in the page can dispatch as well.
      expect(dispatched).not.toHaveBeenCalled()
      dispatched.mockRestore()
    })

    it('only logs when the injection fails too', async () => {
      browserMock.scripting.executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'))
      await expect(press()).resolves.toBeUndefined()
    })
  })
})
