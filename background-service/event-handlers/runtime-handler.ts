import { Logger } from '../../utils/logger'
import { ServiceContext } from '../service-context'


export class RuntimeHandler {
  private serviceContext: ServiceContext
  private pingListener?: (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => boolean
  private actionClickListener?: (tab: chrome.tabs.Tab) => void
  private startupListener?: () => void

  constructor() {
    this.serviceContext = ServiceContext.getInstance()
  }


  registerListeners(): void {
    Logger.info('[RuntimeHandler] Registering runtime listeners...')

    this.pingListener = (message, sender, sendResponse) => {
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


    this.actionClickListener = async (tab) => {
      try {
        Logger.info('[RuntimeHandler] Extension icon clicked, opening sidebar')
        if (tab.id) {

          if (browser.sidePanel && browser.sidePanel.open) {
            await browser.sidePanel.open({ tabId: tab.id })
            Logger.info('[RuntimeHandler] Sidebar opened successfully')
          } else {

            Logger.warn('[RuntimeHandler] SidePanel API not supported, falling back to popup')
            throw new Error('SidePanel not supported')
          }
        }
      } catch (error) {
        Logger.error('[RuntimeHandler] Failed to open sidebar:', error)


        try {
          await browser.action.setPopup({ popup: 'popup/index.html' })
          Logger.info('[RuntimeHandler] Fallback to popup mode')
        } catch (popupError) {
          Logger.error('[RuntimeHandler] Failed to fallback to popup:', popupError)
        }
      }
    }
    // if configured default_popup, this will be ignored
    browser.action.onClicked.addListener(this.actionClickListener)


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

    if (this.actionClickListener) {
      browser.action.onClicked.removeListener(this.actionClickListener)
      this.actionClickListener = undefined
    }

    if (this.startupListener) {
      browser.runtime.onStartup.removeListener(this.startupListener)
      this.startupListener = undefined
    }

    Logger.info('[RuntimeHandler] Runtime listeners removed successfully')
  }
} 