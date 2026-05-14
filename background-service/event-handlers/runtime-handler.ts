import { Logger } from '../../utils/logger'
import { ServiceContext } from '../service-context'


export class RuntimeHandler {
  private serviceContext: ServiceContext
  private pingListener?: (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => boolean
  private startupListener?: () => void

  constructor() {
    this.serviceContext = ServiceContext.getInstance()
  }


  registerListeners(): void {
    Logger.info('[RuntimeHandler] Registering runtime listeners...')

    this.pingListener = (message, _sender, sendResponse) => {
      if (message.type === 'PING') {
        Logger.info('[RuntimeHandler] Received PING, service worker is active')
        sendResponse({
          success: true,
          ...this.serviceContext.getDetailedStatus()
        })
        return true
      }

      return false
    }
    browser.runtime.onMessage.addListener(this.pingListener)


    this.startupListener = async () => {
      try {
        Logger.info('[RuntimeHandler] Browser startup detected, checking services...')

        const currentStatus = this.serviceContext.getStatus()
        Logger.info('[RuntimeHandler] Current service status on startup:', currentStatus.status)

        if (!this.serviceContext.isReady()) {
          Logger.info('[RuntimeHandler] Services not ready on startup, will be handled by ServiceManager')
        } else {
          Logger.info('[RuntimeHandler] Services already ready on startup')
        }

        Logger.info('[RuntimeHandler] Browser startup check completed')
      } catch (error) {
        Logger.error('[RuntimeHandler] Browser startup check failed:', error)
      }
    }
    browser.runtime.onStartup.addListener(this.startupListener)

    Logger.info('[RuntimeHandler] Runtime listeners registered successfully')
  }


  removeListeners(): void {
    Logger.info('[RuntimeHandler] Removing runtime listeners...')

    if (this.pingListener) {
      browser.runtime.onMessage.removeListener(this.pingListener)
      this.pingListener = undefined
    }

    if (this.startupListener) {
      browser.runtime.onStartup.removeListener(this.startupListener)
      this.startupListener = undefined
    }

    Logger.info('[RuntimeHandler] Runtime listeners removed successfully')
  }
}
