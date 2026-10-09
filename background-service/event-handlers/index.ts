import { Logger } from '../../utils/logger'
import { CommandHandler } from './command-handler'
import { InstallationHandler } from './installation-handler'

export class EventHandlerManager {
  private static instance: EventHandlerManager
  private commandHandler: CommandHandler
  private installationHandler: InstallationHandler
  private listenersRegistered = false

  private constructor() {
    this.commandHandler = new CommandHandler()
    this.installationHandler = new InstallationHandler()
  }

  static getInstance(): EventHandlerManager {
    if (!EventHandlerManager.instance) {
      EventHandlerManager.instance = new EventHandlerManager()
    }
    return EventHandlerManager.instance
  }

  registerEventListeners(): void {
    if (this.listenersRegistered) {
      Logger.info('[EventHandlerManager] Event listeners already registered, skipping...')
      return
    }

    try {
      Logger.info('[EventHandlerManager] Registering event listeners...')

      this.commandHandler.registerListeners()

      this.installationHandler.registerListeners()

      this.registerGlobalErrorHandlers()

      this.listenersRegistered = true
      Logger.info('[EventHandlerManager] All event listeners registered successfully')
    } catch (error) {
      Logger.error('[EventHandlerManager] Failed to register event listeners:', error)
      throw error
    }
  }

  private registerGlobalErrorHandlers(): void {
    browser.runtime.onConnect.addListener(port => {
      port.onDisconnect.addListener(() => {
        if (browser.runtime.lastError) {
          Logger.error('[EventHandlerManager] Port disconnected with error:', browser.runtime.lastError)
        }
      })
    })

    self.addEventListener('error', event => {
      Logger.error('[EventHandlerManager] Global error:', event.error)
    })

    self.addEventListener('unhandledrejection', event => {
      Logger.error('[EventHandlerManager] Unhandled promise rejection:', event.reason)
    })

    Logger.info('[EventHandlerManager] Global error handlers registered')
  }

  removeEventListeners(): void {
    if (!this.listenersRegistered) {
      return
    }

    try {
      Logger.info('[EventHandlerManager] Removing event listeners...')

      this.commandHandler.removeListeners()
      this.installationHandler.removeListeners()

      this.listenersRegistered = false
      Logger.info('[EventHandlerManager] All event listeners removed successfully')
    } catch (error) {
      Logger.error('[EventHandlerManager] Failed to remove event listeners:', error)
    }
  }
}
