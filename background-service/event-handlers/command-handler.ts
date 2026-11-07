import { Logger } from '../../utils/logger'
import { RecordingService } from '../services/recording'
import { ANN_ANNOTATE_COMMAND, ANN_BLOCK_MODE_COMMAND, ANN_DOWNLOAD_COMMAND, ANN_RECORD_COMMAND, ANN_SCREENSHOT_COMMAND } from '../../constants'

/**
 * The browser commands (extension.md §7.1): region screenshot, block mode and
 * the page-annotation, recording and download entries (the latter three
 * unbound by default, annotate.md §1.1, download.md §2.3). Four of them tell
 * the active tab's content script; the recording toggle drives the
 * RecordingService in the worker itself. There is no injection fallback —
 * page scripts are statically registered, and pages without one refresh or
 * use the toolbar popup (permissions.md §4). The message goes to the top
 * frame only: the content script also runs in same-origin child frames, and
 * a broadcast would start a session in every one of them.
 */
export class CommandHandler {
  private commandListener?: (command: string) => void

  registerListeners(): void {
    this.commandListener = async (command: string) => {
      try {
        if (command === ANN_SCREENSHOT_COMMAND) {
          await this.sendToActiveTab({ type: 'TRIGGER_SCREENSHOT' })
        } else if (command === ANN_BLOCK_MODE_COMMAND) {
          await this.sendToActiveTab({ type: 'TRIGGER_BLOCK_MODE' })
        } else if (command === ANN_ANNOTATE_COMMAND) {
          await this.sendToActiveTab({ type: 'TRIGGER_ANNOTATE' })
        } else if (command === ANN_DOWNLOAD_COMMAND) {
          // the download command shares the popup's road (download.md §2.3): the page finds its main article
          await this.sendToActiveTab({ type: 'TRIGGER_DOWNLOAD_MAIN', via: 'command' })
        } else if (command === ANN_RECORD_COMMAND) {
          // the shortcut toggles: start, or stop what is being recorded (annotate.md §2.1);
          // the read waits for the route's recovery, so the first press after a restart stops (RV-REC-02)
          await RecordingService.getInstance().toggleFromCommand()
        } else {
          Logger.warn('[CommandHandler] Unknown command:', command)
        }
      } catch (error) {
        Logger.error('[CommandHandler] Command handling failed:', error)
      }
    }
    browser.commands.onCommand.addListener(this.commandListener)
  }

  private async sendToActiveTab(message: { type: string } & Record<string, unknown>): Promise<void> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    try {
      await browser.tabs.sendMessage(tab.id, message, { frameId: 0 })
    } catch {
      // No receiver: the page predates the install or is restricted. The
      // entry is dead there until refresh; the popup stays as the fallback.
      Logger.info('[CommandHandler] No content script receiver on tab', tab.id)
    }
  }

  removeListeners(): void {
    if (this.commandListener) {
      browser.commands.onCommand.removeListener(this.commandListener)
      this.commandListener = undefined
    }
  }
}
