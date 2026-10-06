/**
 * Fragment message handlers — capture + query + capture config and metrics.
 * Write-class config/edit/delete/export messages require an extension-page
 * sender; SAVE_FRAGMENT legitimately arrives from content scripts (captures).
 */
import MessageUtils from '../../../utils/message'
import type { ResponseMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender } from '../../sender'
import { FragmentService } from './index'

const fail = (error: unknown): ResponseMessage => MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')

export const fragmentMessageHandlers: Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> = {
  SAVE_FRAGMENT: async (message): Promise<ResponseMessage> => {
    try {
      const outcome = await FragmentService.getInstance().saveFragment(message.input, message.force)
      if (!outcome.success && outcome.duplicateOf) {
        return MessageUtils.createResponse(true, { duplicateOf: outcome.duplicateOf })
      }
      if (!outcome.success) {
        return MessageUtils.createResponse(false, undefined, outcome.error ?? 'SAVE_FAILED')
      }
      return MessageUtils.createResponse(true, { fragment: outcome.fragment })
    } catch (error) {
      return fail(error)
    }
  },

  GET_FRAGMENTS: async (message): Promise<ResponseMessage> => {
    try {
      const result = await FragmentService.getInstance().queryFragments(message.query)
      return MessageUtils.createResponse(true, result)
    } catch (error) {
      return fail(error)
    }
  },

  UPDATE_FRAGMENT: async (message, sender): Promise<ResponseMessage> => {
    if (!isExtensionPageSender(sender)) return forbiddenResponse()
    try {
      const outcome = await FragmentService.getInstance().editFragment(message.id, message.patch)
      return MessageUtils.createResponse(outcome.success, outcome.fragment ?? outcome.duplicateOf, outcome.error)
    } catch (error) {
      return fail(error)
    }
  },

  DELETE_FRAGMENT: async (message, sender): Promise<ResponseMessage> => {
    if (!isExtensionPageSender(sender)) return forbiddenResponse()
    try {
      await FragmentService.getInstance().deleteFragment(message.id)
      return MessageUtils.createResponse(true, { id: message.id })
    } catch (error) {
      return fail(error)
    }
  },

  GET_FRAGMENT_STATS: async (): Promise<ResponseMessage> => {
    try {
      const stats = await FragmentService.getInstance().getStats()
      return MessageUtils.createResponse(true, stats)
    } catch (error) {
      return fail(error)
    }
  },

  GET_TAB_ID: async (_message, sender): Promise<ResponseMessage> => {
    return MessageUtils.createResponse(true, { tabId: sender.tab?.id ?? 0 })
  },

  GET_ORPHAN_ASSETS: async (): Promise<ResponseMessage> => {
    try {
      const assets = await FragmentService.getInstance().findOrphanAssets()
      return MessageUtils.createResponse(true, assets)
    } catch (error) {
      return fail(error)
    }
  },

  CLEANUP_ORPHAN_ASSETS: async (_message, sender): Promise<ResponseMessage> => {
    if (!isExtensionPageSender(sender)) return forbiddenResponse()
    try {
      const removed = await FragmentService.getInstance().cleanupOrphanAssets()
      return MessageUtils.createResponse(true, { removed })
    } catch (error) {
      return fail(error)
    }
  },

  GET_CAPTURE_METRICS: async (): Promise<ResponseMessage> => {
    try {
      const metrics = await FragmentService.getInstance().getCaptureMetrics()
      return MessageUtils.createResponse(true, metrics)
    } catch (error) {
      return fail(error)
    }
  },

  RECORD_CAPTURE_METRIC: async (message): Promise<ResponseMessage> => {
    try {
      const metrics = await FragmentService.getInstance().recordCaptureMetric(message.event, message.step, { hadInput: message.hadInput, fallback: message.fallback })
      return MessageUtils.createResponse(true, metrics)
    } catch (error) {
      return fail(error)
    }
  },

  GET_CAPTURE_CONFIG: async (): Promise<ResponseMessage> => {
    try {
      const config = await FragmentService.getInstance().getCaptureConfig()
      return MessageUtils.createResponse(true, config)
    } catch (error) {
      return fail(error)
    }
  },

  SET_CAPTURE_CONFIG: async (message, sender): Promise<ResponseMessage> => {
    if (!isExtensionPageSender(sender)) return forbiddenResponse()
    try {
      const config = await FragmentService.getInstance().setCaptureConfig(message.config)
      return MessageUtils.createResponse(true, config)
    } catch (error) {
      return fail(error)
    }
  },
}
