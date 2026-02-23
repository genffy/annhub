import { IService } from '../../service-manager'
import { ResponseMessage } from '../../../types/messages'
import { Logger } from '../../../utils/logger'
import { LogseqSyncService } from './logseq-sync'
import { logseqMessageHandlers } from './message-handles'

export class LogseqService implements IService {
    readonly name = 'logseq' as const
    private static instance: LogseqService | null = null
    private initialized = false

    private constructor() {}

    static getInstance(): LogseqService {
        if (!LogseqService.instance) {
            LogseqService.instance = new LogseqService()
        }
        return LogseqService.instance
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            Logger.info('[LogseqService] Already initialized, skipping...')
            return
        }

        try {
            Logger.info('[LogseqService] Initializing...')
            await LogseqSyncService.getInstance().loadConfig()
            this.initialized = true
            Logger.info('[LogseqService] Initialized successfully')
        } catch (error) {
            Logger.error('[LogseqService] Failed to initialize:', error)
            this.initialized = true
            Logger.warn('[LogseqService] Continuing despite init error (non-critical service)')
        }
    }

    getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
        return logseqMessageHandlers
    }

    isInitialized(): boolean {
        return this.initialized
    }

    async cleanup(): Promise<void> {
        this.initialized = false
        Logger.info('[LogseqService] Cleaned up successfully')
    }
}
