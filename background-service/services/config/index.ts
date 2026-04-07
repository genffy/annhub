import { IService } from '../../service-manager'
import { ResponseMessage } from '../../../types/messages'
import { messageHandlers } from './message-handles'
import { Logger } from '../../../utils/logger'

export class ConfigService implements IService {
    readonly name = 'config' as const
    private static instance: ConfigService
    private initialized = false

    private constructor() { }

    static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService()
        }
        return ConfigService.instance
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            Logger.info('[ConfigService] Already initialized, skipping...')
            return
        }

        try {
            Logger.info('[ConfigService] Initializing configuration service...')
            this.initialized = true
            Logger.info('[ConfigService] Configuration service initialized successfully')
        } catch (error) {
            Logger.error('[ConfigService] Failed to initialize:', error)
            throw error
        }
    }

    getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
        return messageHandlers
    }

    isInitialized(): boolean {
        return this.initialized
    }

    async cleanup(): Promise<void> {
        this.initialized = false
        Logger.info('[ConfigService] Cleaned up successfully')
    }
}
