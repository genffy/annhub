import { Logger } from '../../utils/logger'
import { ANN_SELECTION_KEY } from '../../constants'

export class CommandHandler {
  private commandListener?: (command: string) => void

  constructor() { }

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
          command: ANN_SELECTION_KEY
        })
        Logger.info('[CommandHandler] Screenshot command sent to content script')
      } catch (error) {
        Logger.error('[CommandHandler] Failed to send message to content script:', error)

        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              window.dispatchEvent(new CustomEvent('ann-screenshot-trigger', {
                detail: { command: 'capture-screenshot' }
              }))
            }
          })
          Logger.info('[CommandHandler] Screenshot event dispatched via script injection')
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