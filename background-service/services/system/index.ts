/**
 * System service — preferences (chrome.storage layer C), local metrics and
 * storage housekeeping behind the message facade.
 */
import type { IService } from '../../service-manager'
import type { ResponseMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isTopFrameTabSender } from '../../sender'
import { readSettings, writeSettings } from '../../settings-schema'
import { metricsSnapshot, recordEvent } from '../metrics/record'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'

function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  return isExtensionPageSender(sender) || isTopFrameTabSender(sender)
}

export class SystemService implements IService {
  readonly name = 'system' as const
  private static instance: SystemService | null = null
  private initialized = false

  static getInstance(): SystemService {
    SystemService.instance ??= new SystemService()
    return SystemService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    Logger.info('[SystemService] Initialized')
  }

  getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
    return {
      GET_SETTINGS: async (_message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        return MessageUtils.createResponse(true, await readSettings())
      },

      SET_SETTINGS: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        // Disabling the hover entry for a site comes from the capsule's menu on that page;
        // the rest of the preferences change on the settings page only, but the write
        // discipline is the same: a top-frame sender or an extension page.
        const settings = await writeSettings(message.patch)
        return MessageUtils.createResponse(true, settings)
      },

      RECORD_EVENT: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        await recordEvent(message.name, message.props)
        return MessageUtils.createResponse(true, {})
      },

      GET_METRICS: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        return MessageUtils.createResponse(true, await metricsSnapshot())
      },
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }
}
