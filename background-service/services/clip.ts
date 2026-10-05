import type { ClipRecord } from '../../types/clip'
import type { IService } from '../service-manager'
import type { ResponseMessage } from '../../types/messages'
import { Logger } from '../../utils/logger'
import MessageUtils from '../../utils/message'
import { forbiddenResponse, isExtensionPageSender } from '../sender'

const CLIPS_STORAGE_KEY = 'ann-clips'

/**
 * Background service for persisting clip records to chrome.storage.local.
 */
export class ClipService implements IService {
  readonly name = 'clip' as const
  private static instance: ClipService | null = null
  private initialized = false
  /** Serializes read-modify-write on the single storage key so a save and an undo never lose each other's update. */
  private writeQueue: Promise<unknown> = Promise.resolve()

  private constructor() {}

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
      SAVE_CLIP: async message => {
        try {
          const clip = message.data as ClipRecord
          await this.saveClip(clip)
          Logger.info(`[ClipService] Saved clip: ${clip.id}`)

          return MessageUtils.createResponse(true, clip)
        } catch (error) {
          Logger.error('[ClipService] Failed to save clip:', error)
          return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
      },
      // The library reads clips through here; the storage key stays private to this service.
      GET_CLIPS: async (_message, sender) => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          return MessageUtils.createResponse(true, await this.getClips())
        } catch (error) {
          Logger.error('[ClipService] Failed to read clips:', error)
          return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
      },
      DELETE_CLIP: async message => {
        try {
          await this.deleteClip(message.id as string)
          return MessageUtils.createResponse(true, { id: message.id })
        } catch (error) {
          Logger.error('[ClipService] Failed to delete clip:', error)
          return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
      },
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }

  private mutate(update: (clips: ClipRecord[]) => ClipRecord[]): Promise<void> {
    const run = async () => {
      const result = (await chrome.storage.local.get(CLIPS_STORAGE_KEY)) as Record<string, ClipRecord[]>
      await chrome.storage.local.set({ [CLIPS_STORAGE_KEY]: update(result[CLIPS_STORAGE_KEY] || []) })
    }
    const next = this.writeQueue.then(run, run)
    this.writeQueue = next.catch(() => undefined)
    return next
  }

  private saveClip(clip: ClipRecord): Promise<void> {
    return this.mutate(clips => [...clips, clip])
  }

  private deleteClip(id: string): Promise<void> {
    return this.mutate(clips => clips.filter(c => c.id !== id))
  }

  async getClips(): Promise<ClipRecord[]> {
    const result = (await chrome.storage.local.get(CLIPS_STORAGE_KEY)) as Record<string, ClipRecord[]>
    return result[CLIPS_STORAGE_KEY] || []
  }

  async cleanup(): Promise<void> {
    this.initialized = false
    Logger.info('[ClipService] Cleaned up successfully')
  }
}
