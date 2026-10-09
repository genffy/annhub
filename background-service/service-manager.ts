import { Logger } from '../utils/logger'
import MessageUtils from '../utils/message'
import type { BaseMessage, ResponseMessage } from '../types/messages'
import { EXTENSION_PAGES, openExtensionPage } from '../utils/extension-pages'

export type SupportedServices = 'entries' | 'screenshot' | 'system'

export type MessageHandler = (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>

export interface IService {
  readonly name: SupportedServices

  initialize(): Promise<void>

  getMessageHandlers(): Record<string, MessageHandler>

  isInitialized(): boolean

  cleanup?(): Promise<void>
}

/** Creation messages a lost response must never duplicate on retry. */
const IDEMPOTENT_TYPES = new Set(['SAVE_CLIP', 'SAVE_SCREENSHOT'])
const RESPONSE_CACHE_LIMIT = 64

export class ServiceManager {
  private static instance: ServiceManager
  private services: Map<string, IService> = new Map()
  private handlers: Record<string, MessageHandler> | null = null
  private responseCache = new Map<string, ResponseMessage>()

  private constructor() {}

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
    this.handlers = null
    Logger.info(`[ServiceManager] Service ${service.name} registered`)
  }

  registerServices(services: IService[]): void {
    services.forEach(service => this.registerService(service))
  }

  getService<T extends IService>(name: string): T | undefined {
    return this.services.get(name) as T | undefined
  }

  async initializeServices(): Promise<void> {
    if (this.services.size === 0) {
      Logger.warn('[ServiceManager] No services registered for initialization')
      return
    }

    // Registration order is initialization order.
    for (const service of this.services.values()) {
      if (service.isInitialized()) continue
      Logger.info(`[ServiceManager] Initializing service: ${service.name}`)
      await service.initialize()
    }

    Logger.info('[ServiceManager] All services initialized successfully')
  }

  /**
   * Dispatches to the service handlers. SAVE_* responses are cached by
   * requestId so a retry after a lost response cannot save twice (RV-BG-01).
   */
  async dispatchMessage(message: BaseMessage, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> {
    const handler = this.ensureHandlers()[message.type]
    if (!handler) {
      return MessageUtils.createResponse(false, undefined, `Unknown message type: ${message.type}`)
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : ''
    const cacheKey = requestId && IDEMPOTENT_TYPES.has(message.type) ? `${message.type}:${requestId}` : ''
    if (cacheKey && this.responseCache.has(cacheKey)) {
      return this.responseCache.get(cacheKey)!
    }

    const response = await handler(message, sender)

    if (cacheKey) {
      this.responseCache.set(cacheKey, response)
      if (this.responseCache.size > RESPONSE_CACHE_LIMIT) {
        const oldest = this.responseCache.keys().next().value
        if (oldest !== undefined) this.responseCache.delete(oldest)
      }
    }
    return response
  }

  private ensureHandlers(): Record<string, MessageHandler> {
    if (!this.handlers) {
      const allHandlers: Record<string, MessageHandler> = {}
      for (const [serviceName, service] of this.services) {
        const handlers = service.getMessageHandlers()
        Object.assign(allHandlers, handlers)
        Logger.info(`[ServiceManager] Collected ${Object.keys(handlers).length} message handlers from service ${serviceName}`)
      }
      Object.assign(allHandlers, this.getNavigationHandlers())
      this.handlers = allHandlers
      Logger.info(`[ServiceManager] Collected ${Object.keys(allHandlers).length} total message handlers`)
    }
    return this.handlers
  }

  /**
   * Messages the manager itself answers. Content scripts cannot navigate to chrome-extension://
   * pages; only our own page set is openable.
   */
  private getNavigationHandlers(): Record<string, MessageHandler> {
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
