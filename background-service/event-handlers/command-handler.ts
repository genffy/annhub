import { Logger } from '../../utils/logger'
import { ANN_SELECTION_KEY, SCREENSHOT_TRIGGER_GLOBAL } from '../../constants'

export class CommandHandler {
  private commandListener?: (command: string) => void

  constructor() {}

  registerListeners(): void {
    Logger.info('[CommandHandler] Registering command listeners...')

    this.commandListener = async (command: string) => {
      Logger.info('[CommandHandler] Command received:', command)

      try {
        if (command === ANN_SELECTION_KEY) {
          await this.handleScreenshotCommand()
        } else {
          Logger.warn('[CommandHandler] Unknown command:', command)
        }
      } catch (error) {
        Logger.error('[CommandHandler] Command handling failed:', error)
      }
    }

    browser.commands.onCommand.addListener(this.commandListener)
    Logger.info('[CommandHandler] Command listeners registered successfully')
  }

  private async handleScreenshotCommand(): Promise<void> {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })

      if (!tab?.id) {
        Logger.error('[CommandHandler] No active tab found')
        return
      }

      Logger.info('[CommandHandler] Triggering screenshot for tab:', tab.id)

      try {
        await browser.tabs.sendMessage(tab.id, {
          type: 'TRIGGER_SCREENSHOT',
          command: ANN_SELECTION_KEY,
        })
        Logger.info('[CommandHandler] Screenshot command sent to content script')
      } catch (error) {
        Logger.error('[CommandHandler] Failed to send message to content script:', error)

        try {
          // Runs in the content script's own isolated world and calls what it registered there. A DOM event
          // would do the same job, but the page could dispatch it too and start a capture by itself.
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'ISOLATED',
            func: (name: string) => {
              const enter = (globalThis as Record<string, unknown>)[name]
              if (typeof enter === 'function') enter()
            },
            args: [SCREENSHOT_TRIGGER_GLOBAL],
          })
          Logger.info('[CommandHandler] Screenshot triggered via script injection')
        } catch (injectionError) {
          Logger.error('[CommandHandler] Failed to inject script:', injectionError)
        }
      }
    } catch (error) {
      Logger.error('[CommandHandler] Screenshot command handling failed:', error)
      throw error
    }
  }

  removeListeners(): void {
    Logger.info('[CommandHandler] Removing command listeners...')

    if (this.commandListener) {
      browser.commands.onCommand.removeListener(this.commandListener)
      this.commandListener = undefined
    }

    Logger.info('[CommandHandler] Command listeners removed successfully')
  }
}
