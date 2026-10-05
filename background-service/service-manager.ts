import { Logger } from '../utils/logger'
import type { SupportedServices } from './service-context'
import { ServiceContext } from './service-context'
import MessageUtils from '../utils/message'
import type { ResponseMessage } from '../types/messages'
import { EXTENSION_PAGES, openExtensionPage } from '../utils/extension-pages'

export interface IService {
  readonly name: SupportedServices

  initialize(): Promise<void>

  getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>>

  isInitialized(): boolean

  cleanup?(): Promise<void>
}

export class ServiceManager {
  private static instance: ServiceManager
  private services: Map<string, IService> = new Map()
  private serviceContext: ServiceContext
  private messageHandlersRegistered = false

  private constructor() {
    this.serviceContext = ServiceContext.getInstance()
  }

  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager()
    }
    return ServiceManager.instance
  }

  registerService(service: IService): void {
    if (this.services.has(service.name)) {
      Logger.warn(`[ServiceManager] Service ${service.name} is already registered, replacing...`)
    }

    this.services.set(service.name, service)
    this.serviceContext.registerServiceSlot(service.name)
    Logger.info(`[ServiceManager] Service ${service.name} registered`)
  }

  registerServices(services: IService[]): void {
    services.forEach(service => this.registerService(service))
  }

  getService<T extends IService>(name: string): T | undefined {
    return this.services.get(name) as T
  }

  async initializeServices(): Promise<void> {
    return this.initializeServicesInternal(false)
  }

  private async initializeServicesInternal(forceReinitialize: boolean): Promise<void> {
    if (this.services.size === 0) {
      Logger.warn('[ServiceManager] No services registered for initialization')
      return
    }

    try {
      this.serviceContext.startInitialization()
      Logger.info(`[ServiceManager] Starting initialization of ${this.services.size} services`)

      // Registration order is initialization order.
      for (const service of this.services.values()) {
        await this.initializeService(service, forceReinitialize)
      }

      this.registerMessageHandlers()

      Logger.info('[ServiceManager] All services initialized successfully')
    } catch (error) {
      Logger.error('[ServiceManager] Service initialization failed:', error)
      this.serviceContext.markInitializationFailed(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  private async initializeService(service: IService, forceReinitialize = false): Promise<void> {
    try {
      Logger.info(`[ServiceManager] Initializing service: ${service.name}`)

      if (!forceReinitialize && service.isInitialized()) {
        Logger.info(`[ServiceManager] Service ${service.name} is already initialized, skipping...`)
        this.serviceContext.markServiceInitialized(service.name)
        return
      }

      await service.initialize()
      this.serviceContext.markServiceInitialized(service.name)
      Logger.info(`[ServiceManager] Service ${service.name} initialized successfully`)
    } catch (error) {
      Logger.error(`[ServiceManager] Failed to initialize service ${service.name}:`, error)
      throw error
    }
  }

  private registerMessageHandlers(): void {
    if (this.messageHandlersRegistered) {
      Logger.info('[ServiceManager] Message handlers already registered, skipping...')
      return
    }

    try {
      const allHandlers: Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> = {}

      for (const [serviceName, service] of this.services) {
        const handlers = service.getMessageHandlers()
        Object.assign(allHandlers, handlers)
        Logger.info(`[ServiceManager] Collected ${Object.keys(handlers).length} message handlers from service ${serviceName}`)
      }

      Object.assign(allHandlers, this.getNavigationHandlers())

      browser.runtime.onMessage.addListener(MessageUtils.createMessageHandler(allHandlers))

      this.messageHandlersRegistered = true
      Logger.info(`[ServiceManager] Registered ${Object.keys(allHandlers).length} total message handlers`)
    } catch (error) {
      Logger.error('[ServiceManager] Failed to register message handlers:', error)
      throw error
    }
  }

  async restartServices(): Promise<void> {
    try {
      Logger.info('[ServiceManager] Restarting all services...')
      this.serviceContext.startRestart()

      for (const [name, service] of this.services) {
        try {
          if (service.cleanup) {
            await service.cleanup()
            Logger.info(`[ServiceManager] Service ${name} cleaned up before restart`)
          }
        } catch (error) {
          Logger.error(`[ServiceManager] Failed to cleanup service ${name} before restart:`, error)
        }
      }

      await this.initializeServicesInternal(true)

      Logger.info('[ServiceManager] All services restarted successfully')
    } catch (error) {
      Logger.error('[ServiceManager] Service restart failed:', error)
      throw error
    }
  }

  async cleanup(): Promise<void> {
    Logger.info('[ServiceManager] Cleaning up all services...')

    for (const [name, service] of this.services) {
      try {
        if (service.cleanup) {
          await service.cleanup()
          Logger.info(`[ServiceManager] Service ${name} cleaned up successfully`)
        }
      } catch (error) {
        Logger.error(`[ServiceManager] Failed to cleanup service ${name}:`, error)
      }
    }
  }

  getServiceStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {}
    for (const [name, service] of this.services) {
      status[name] = service.isInitialized()
    }
    return status
  }

  isAllServicesReady(): boolean {
    return this.serviceContext.isReady() && Array.from(this.services.values()).every(service => service.isInitialized())
  }

  /**
   * Messages the manager itself answers. Content scripts cannot navigate to chrome-extension://
   * pages; only our own page set is openable.
   */
  private getNavigationHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
    return {
      OPEN_EXTENSION_PAGE: async (message): Promise<ResponseMessage> => {
        if (!EXTENSION_PAGES.includes(message.page)) {
          return MessageUtils.createResponse(false, undefined, `Unknown extension page: ${String(message.page)}`)
        }
        try {
          await openExtensionPage(message.page, message.params)
          return MessageUtils.createResponse(true, { page: message.page })
        } catch (error) {
          return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
      },
    }
  }
}
