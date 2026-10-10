/**
 * System service — preferences (chrome.storage layer C), local metrics and
 * storage housekeeping behind the message facade.
 */
import type { IService } from '../../service-manager'
import type { ResponseMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isSameOriginTabSender } from '../../sender'
import { addDisabledSite, readSettings, writeSettings } from '../../settings-schema'
import { metricsSnapshot, recordEvent } from '../metrics/record'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'

function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  return isExtensionPageSender(sender) || isSameOriginTabSender(sender)
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
        try {
          if (!isExtensionPageSender(sender)) {
            if (message.patch !== undefined || typeof message.appendDisabledSite !== 'string') return forbiddenResponse()
            return MessageUtils.createResponse(true, await addDisabledSite(message.appendDisabledSite))
          }
          if (message.patch === undefined || message.appendDisabledSite !== undefined) return MessageUtils.createResponse(false, undefined, 'SETTINGS_INVALID')
          return MessageUtils.createResponse(true, await writeSettings(message.patch))
        } catch {
          return MessageUtils.createResponse(false, undefined, 'SETTINGS_INVALID')
        }
      },

      DISABLE_BLOCK_ENTRY: async (_message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        try {
          return MessageUtils.createResponse(true, await writeSettings({ blockEntryEnabled: false }))
        } catch {
          return MessageUtils.createResponse(false, undefined, 'SETTINGS_INVALID')
        }
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
