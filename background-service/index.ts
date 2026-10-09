import { Logger } from '../utils/logger'
import { ServiceManager, type IService } from './service-manager'
import { EventHandlerManager } from './event-handlers'
import { EntryService } from './services/entries'
import { ScreenshotService } from './services/screenshot'
import { SystemService } from './services/system'
import type { BaseMessage, ResponseMessage } from '../types/messages'

export class BackgroundServiceManager {
  private static instance: BackgroundServiceManager
  private serviceManager = ServiceManager.getInstance()
  private eventHandlerManager = EventHandlerManager.getInstance()
  private servicesRegistered = false
  private initialized = false
  private readyPromise: Promise<void> | null = null

  static getInstance(): BackgroundServiceManager {
    BackgroundServiceManager.instance ??= new BackgroundServiceManager()
    return BackgroundServiceManager.instance
  }

  /**
   * Resolves once the services are ready. A failed initialization clears the
   * cached promise so the next incoming message retries initialization.
   */
  whenReady(): Promise<void> {
    this.readyPromise ??= this.initialize().catch(error => {
      this.readyPromise = null
      throw error
    })
    return this.readyPromise
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    if (!this.servicesRegistered) {
      const services: IService[] = [EntryService.getInstance(), ScreenshotService.getInstance(), SystemService.getInstance()]
      this.serviceManager.registerServices(services)
      this.servicesRegistered = true
    }
    this.eventHandlerManager.registerEventListeners()
    await this.serviceManager.initializeServices()
    this.initialized = true
    Logger.info('[BackgroundServiceManager] Initialized')
  }

  dispatchMessage(message: BaseMessage, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> {
    return this.serviceManager.dispatchMessage(message, sender)
  }
}

export default BackgroundServiceManager.getInstance()
