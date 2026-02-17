import { ClipRecord } from '../../types/clip'
import { IService } from '../service-manager'
import { ResponseMessage } from '../../types/messages'
import { Logger } from '../../utils/logger'
import MessageUtils from '../../utils/message'

const CLIPS_STORAGE_KEY = 'ann-clips'

/**
 * Background service for persisting clip records to chrome.storage.local.
 */
export class ClipService implements IService {
    readonly name = 'clip' as const
    private static instance: ClipService | null = null
    private initialized = false

    private constructor() { }

    static getInstance(): ClipService {
        if (!ClipService.instance) {
            ClipService.instance = new ClipService()
        }
        return ClipService.instance
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            Logger.info('[ClipService] Already initialized, skipping...')
            return
        }
        this.initialized = true
        Logger.info('[ClipService] Initialized successfully')
    }

    getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
        return {
            SAVE_CLIP: async (message) => {
                try {
                    const clip = message.data as ClipRecord
                    await this.saveClip(clip)
                    Logger.info(`[ClipService] Saved clip: ${clip.id}`)
                    return MessageUtils.createResponse(true, clip)
                } catch (error) {
                    Logger.error('[ClipService] Failed to save clip:', error)
                    return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
                }
            }
        }
    }

    isInitialized(): boolean {
        return this.initialized
    }

    private async saveClip(clip: ClipRecord): Promise<void> {
        const result = await chrome.storage.local.get(CLIPS_STORAGE_KEY) as Record<string, ClipRecord[]>
        const clips: ClipRecord[] = result[CLIPS_STORAGE_KEY] || []
        clips.push(clip)
        await chrome.storage.local.set({ [CLIPS_STORAGE_KEY]: clips })
    }

    async getClips(): Promise<ClipRecord[]> {
        const result = await chrome.storage.local.get(CLIPS_STORAGE_KEY) as Record<string, ClipRecord[]>
        return result[CLIPS_STORAGE_KEY] || []
    }

    async cleanup(): Promise<void> {
        this.initialized = false
        Logger.info('[ClipService] Cleaned up successfully')
    }
}
