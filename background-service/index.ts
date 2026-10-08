import { Logger } from '../utils/logger'
import { ServiceManager, type IService } from './service-manager'
import { EventHandlerManager } from './event-handlers'
import { ServiceContext } from './service-context'
import { EntryService } from './services/entries'
import { ScreenshotService } from './services/screenshot'
import { SystemService } from './services/system'

export class BackgroundServiceManager {
  private static instance: BackgroundServiceManager
  private serviceManager: ServiceManager
  private eventHandlerManager: EventHandlerManager
  private serviceContext: ServiceContext
  private isInitialized = false

  private constructor() {
    this.serviceManager = ServiceManager.getInstance()
    this.eventHandlerManager = EventHandlerManager.getInstance()
    this.serviceContext = ServiceContext.getInstance()
  }

  static getInstance(): BackgroundServiceManager {
    BackgroundServiceManager.instance ??= new BackgroundServiceManager()
    return BackgroundServiceManager.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    this.registerServices()
    this.eventHandlerManager.registerEventListeners()
    await this.serviceManager.initializeServices()
    this.isInitialized = true
    Logger.info('[BackgroundServiceManager] Initialized')
  }

  private registerServices(): void {
    const services: IService[] = [EntryService.getInstance(), ScreenshotService.getInstance(), SystemService.getInstance()]
    this.serviceManager.registerServices(services)
  }

  async restart(): Promise<void> {
    await this.serviceManager.restartServices()
  }

  getServiceManager(): ServiceManager {
    return this.serviceManager
  }

  getEventHandlerManager(): EventHandlerManager {
    return this.eventHandlerManager
  }

  getServiceContext(): ServiceContext {
    return this.serviceContext
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      serviceContext: this.serviceContext.getDetailedStatus(),
      serviceManager: this.serviceManager.getServiceStatus(),
      allReady: this.serviceManager.isAllServicesReady(),
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.serviceManager.isAllServicesReady()
  }

  async cleanup(): Promise<void> {
    this.eventHandlerManager.removeEventListeners()
    await this.serviceManager.cleanup()
    this.isInitialized = false
  }
}

export default BackgroundServiceManager.getInstance()
