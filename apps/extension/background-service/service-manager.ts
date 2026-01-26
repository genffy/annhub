import { Logger } from '../utils/logger'
import { ServiceContext, SupportedServices } from './service-context'
import MessageUtils from '../utils/message'
import { ResponseMessage } from '../types/messages'


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
    Logger.info(`[ServiceManager] Service ${service.name} registered`)
  }


  registerServices(services: IService[]): void {
    services.forEach(service => this.registerService(service))
  }


  getService<T extends IService>(name: string): T | undefined {
    return this.services.get(name) as T
  }


  async initializeServices(): Promise<void> {
    if (this.services.size === 0) {
      Logger.warn('[ServiceManager] No services registered for initialization')
      return
    }

    try {
      this.serviceContext.startInitialization()
      Logger.info(`[ServiceManager] Starting initialization of ${this.services.size} services`)


      const initOrder = ['config', 'translation', 'highlight']

      for (const serviceName of initOrder) {
        const service = this.services.get(serviceName)
        if (service) {
          await this.initializeService(service)
        }
      }


      for (const [name, service] of this.services) {
        if (!initOrder.includes(name)) {
          await this.initializeService(service)
        }
      }


      this.registerMessageHandlers()

      Logger.info('[ServiceManager] All services initialized successfully')
    } catch (error) {
      Logger.error('[ServiceManager] Service initialization failed:', error)
      this.serviceContext.markInitializationFailed(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }


  private async initializeService(service: IService): Promise<void> {
    try {
      Logger.info(`[ServiceManager] Initializing service: ${service.name}`)

      if (service.isInitialized()) {
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


      browser.runtime.onMessage.addListener(
        MessageUtils.createMessageHandler(allHandlers)
      )

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

      await this.initializeServices()

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
    return this.serviceContext.isReady() &&
      Array.from(this.services.values()).every(service => service.isInitialized())
  }
} 