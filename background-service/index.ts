import { Logger } from '../utils/logger'
import { ServiceManager, type IService } from './service-manager'
import { EventHandlerManager } from './event-handlers'
import { ServiceContext } from './service-context'
import { HighlightService } from './services/highlight'
import { ClipService } from './services/clip'
import { LlmService } from './services/llm'
import { FragmentService } from './services/fragment'
import { ScreenshotService } from './services/screenshot'

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
    if (!BackgroundServiceManager.instance) {
      BackgroundServiceManager.instance = new BackgroundServiceManager()
    }
    return BackgroundServiceManager.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      Logger.info('[BackgroundServiceManager] Already initialized, skipping...')
      return
    }

    try {
      Logger.info('[BackgroundServiceManager] Starting background service initialization...')

      this.registerServices()

      this.eventHandlerManager.registerEventListeners()

      await this.serviceManager.initializeServices()

      this.isInitialized = true
      Logger.info('[BackgroundServiceManager] Background service initialization completed successfully')
    } catch (error) {
      Logger.error('[BackgroundServiceManager] Background service initialization failed:', error)
      throw error
    }
  }

  private registerServices(): void {
    Logger.info('[BackgroundServiceManager] Registering services...')

    const services: IService[] = [
      HighlightService.getInstance(),
      ClipService.getInstance(),
      LlmService.getInstance(),
      FragmentService.getInstance(),
      ScreenshotService.getInstance(),
    ]

    this.serviceManager.registerServices(services)
    Logger.info(`[BackgroundServiceManager] Registered ${services.length} services`)
  }

  async restart(): Promise<void> {
    try {
      Logger.info('[BackgroundServiceManager] Restarting all services...')

      await this.serviceManager.restartServices()

      Logger.info('[BackgroundServiceManager] All services restarted successfully')
    } catch (error) {
      Logger.error('[BackgroundServiceManager] Service restart failed:', error)
      throw error
    }
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
    try {
      Logger.info('[BackgroundServiceManager] Cleaning up all resources...')

      this.eventHandlerManager.removeEventListeners()

      await this.serviceManager.cleanup()

      this.isInitialized = false
      Logger.info('[BackgroundServiceManager] All resources cleaned up successfully')
    } catch (error) {
      Logger.error('[BackgroundServiceManager] Cleanup failed:', error)
    }
  }
}

export { FragmentService } from './services/fragment'

export default BackgroundServiceManager.getInstance()
