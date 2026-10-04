/**
 * Fragment message handlers — capture + query + per-item delivery + ZIP export.
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
      FragmentService.getInstance().nudgeDelivery()
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
      if (outcome.success) FragmentService.getInstance().nudgeDelivery()
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

  CHECK_FRAGMENT_DUPLICATE: async (message): Promise<ResponseMessage> => {
    try {
      const duplicateOf = await FragmentService.getInstance().findDuplicate(message.content, message.excerpt, message.sourceUrl)
      return MessageUtils.createResponse(true, { duplicateOf })
    } catch (error) {
      return fail(error)
    }
  },

  // The pairing code authorizes writes to the Desktop library, so it is never returned: pages see
  // `hasToken`, and only extension pages may ask at all.
  GET_DESKTOP_DIRECT_CONNECT: async (_message, sender): Promise<ResponseMessage> => {
    if (!isExtensionPageSender(sender)) return forbiddenResponse()
    try {
      const [config, status, pending, state] = await Promise.all([
        FragmentService.getInstance().getPublicDirectConnectConfig(),
        FragmentService.getInstance().pingDirectConnect(),
        FragmentService.getInstance().getDeliveryStats(),
        FragmentService.getInstance().getDeliveryState(),
      ])
      return MessageUtils.createResponse(true, { config, status, pending, state })
    } catch (error) {
      return fail(error)
    }
  },

  SET_DESKTOP_DIRECT_CONNECT: async (message, sender): Promise<ResponseMessage> => {
    if (!isExtensionPageSender(sender)) return forbiddenResponse()
    try {
      const config = await FragmentService.getInstance().setDirectConnectConfig(message.config)
      return MessageUtils.createResponse(true, config)
    } catch (error) {
      return fail(error)
    }
  },

  FLUSH_DESKTOP_DIRECT_CONNECT: async (_message, sender): Promise<ResponseMessage> => {
    if (!isExtensionPageSender(sender)) return forbiddenResponse()
    try {
      const result = await FragmentService.getInstance().flushDeliveries()
      return MessageUtils.createResponse(true, result)
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

  GET_SYNC_REPORTS: async (): Promise<ResponseMessage> => {
    try {
      const reports = await FragmentService.getInstance().getSyncReports()
      return MessageUtils.createResponse(true, reports)
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
