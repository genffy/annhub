/**
 * System service — preferences (chrome.storage layer C), local metrics and
 * storage housekeeping behind the message facade.
 */
import type { IService, MessageHandlers } from '../../service-manager'

import { forbiddenResponse, isExtensionPageSender, isSameOriginTabSender } from '../../sender'
import { addDisabledSite, readSettings, writeSettings } from '../../settings-storage'
import { metricsPanel, recordEvent } from '../metrics/record'
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

  // nothing to await today: the resolved promise keeps the IService shape and a future await fits
  initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve()
    this.initialized = true
    Logger.info('[SystemService] Initialized')
    return Promise.resolve()
  }

  getMessageHandlers(): MessageHandlers {
    return {
      GET_SETTINGS: async (_message, sender) => {
        if (!trustedSender(sender)) return forbiddenResponse()
        return MessageUtils.createResponse(true, await readSettings())
      },

      SET_SETTINGS: async (message, sender) => {
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

      DISABLE_BLOCK_ENTRY: async (_message, sender) => {
        if (!trustedSender(sender)) return forbiddenResponse()
        try {
          return MessageUtils.createResponse(true, await writeSettings({ blockEntryEnabled: false }))
        } catch {
          return MessageUtils.createResponse(false, undefined, 'SETTINGS_INVALID')
        }
      },

      RECORD_EVENT: async (message, sender) => {
        if (!trustedSender(sender)) return forbiddenResponse()
        await recordEvent(message.name, message.props)
        return MessageUtils.createResponse(true, {})
      },

      GET_METRICS: async (_message, sender) => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        return MessageUtils.createResponse(true, await metricsPanel())
      },
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }
}
