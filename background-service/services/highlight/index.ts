import { HighlightStorage } from './highlight-storage'
import { HighlightRecord, HighlightQuery } from '../../../types/highlight'
import { IService } from '../../service-manager'
import { ResponseMessage } from '../../../types/messages'
import { messageHandlers } from './message-handles'
import { Logger } from '../../../utils/logger'


export class HighlightService implements IService {
    readonly name = 'highlight' as const
    private static instance: HighlightService | null = null
    private storage: HighlightStorage
    private initialized = false

    private constructor() {
        this.storage = HighlightStorage.getInstance()
    }

    static getInstance(): HighlightService {
        if (!HighlightService.instance) {
            HighlightService.instance = new HighlightService()
        }
        return HighlightService.instance
    }


    async initialize(): Promise<void> {
        if (this.initialized) {
            Logger.info('[HighlightService] Already initialized, skipping...')
            return
        }

        try {
            Logger.info('[HighlightService] Initializing highlight service...')


            await this.storage.initialize()

            this.initialized = true
            Logger.info('[HighlightService] Highlight service initialized successfully')
        } catch (error) {
            Logger.error('[HighlightService] Failed to initialize:', error)
            throw error
        }
    }


    getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
        return messageHandlers
    }


    isInitialized(): boolean {
        return this.initialized
    }


    async getCurrentPageHighlights(url: string): Promise<HighlightRecord[]> {
        return this.storage.getCurrentPageHighlights(url)
    }


    async getHighlights(query?: HighlightQuery): Promise<HighlightRecord[]> {
        return this.storage.getHighlights(query)
    }


    async getHighlightsCount(query?: Omit<HighlightQuery, 'limit' | 'offset'>): Promise<number> {
        const highlights = await this.storage.getHighlights(query)
        return highlights.length
    }


    async cleanup(): Promise<void> {
        this.initialized = false
        Logger.info('[HighlightService] Cleaned up successfully')
    }
}
