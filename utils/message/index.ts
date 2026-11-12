import type { ExtensionMessage, ResponseDataOf, ResponseMessage, BaseMessage } from '../../types/messages'
import { Logger } from '../logger'

/** Connection-level failures a retry can fix; anything else already ran. */
const RETRYABLE_PATTERN = /Receiving end does not exist|message port closed/i

/** An update or reload left this page's content script orphaned: no retry can ever reach the worker. */
const CONTEXT_INVALIDATED_PATTERN = /Extension context invalidated/i

function isConnectionError(message: string): boolean {
  return RETRYABLE_PATTERN.test(message)
}

export default class MessageUtils {
  /**
   * The response's `data` is derived from the message type (types/messages.ts's ResponseDataMap);
   * callers do not spell out a type argument (RV-BG-12). Retries only what never reached a
   * handler; `data` is absent on failure.
   */
  // A generic function property: the declaration itself reads as a call site otherwise.
  static sendMessage = async <K extends ExtensionMessage['type']>(
    message: Extract<ExtensionMessage, { type: K }>,
    retryCount: number = 3,
  ): Promise<ResponseMessage<ResponseDataOf<K> | undefined>> => {
    const messageWithMeta = {
      ...message,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    }

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const response: unknown = await chrome.runtime.sendMessage(messageWithMeta)

        // what crossed the port is unverified: the envelope is checked here, the payload is the
        // caller's contract — a shapeless answer fails the send at once, without a retry
        if (!MessageUtils.isResponseMessage<ResponseDataOf<K> | undefined>(response)) {
          throw new Error('No response received from background script')
        }

        return response
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // The extension was updated or reloaded while this page stayed open:
        // fail once with a stable code the caller puts into words, never retry.
        if (CONTEXT_INVALIDATED_PATTERN.test(errorMessage)) {
          return this.createResponse(false, undefined, 'EXTENSION_CONTEXT_INVALIDATED')
        }

        // Only retry when the message never reached a handler. A handler that
        // ran and failed must not run again; SAVE_* is idempotent by requestId.
        if (attempt === retryCount || !isConnectionError(errorMessage)) {
          Logger.warn(`[MessageUtils] ${message.type} failed on attempt ${attempt}:`, errorMessage)
          return this.createResponse(false, undefined, errorMessage)
        }

        const delay = attempt === 1 ? 50 : 200
        await this.delay(delay)
      }
    }

    return this.createResponse(false, undefined, 'Unexpected error in retry loop')
  }

  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /** Handlers build their answer here; an omitted `data` types as `undefined`, matching the ResponseDataMap (RV-BG-12). */
  static createResponse<T = undefined>(success: boolean, data?: T, error?: string): ResponseMessage<T> {
    return {
      type: 'RESPONSE',
      success,
      ...(data !== undefined ? { data } : {}),
      ...(error !== undefined ? { error } : {}),
      timestamp: Date.now(),
    }
  }

  static generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  static isValidMessage(message: unknown): message is BaseMessage {
    return typeof message === 'object' && message !== null && 'type' in message && typeof message.type === 'string'
  }

  static isResponseMessage<T = unknown>(message: unknown): message is ResponseMessage<T> {
    return this.isValidMessage(message) && 'success' in message && typeof message.success === 'boolean'
  }

  static wrapAsyncHandler<T extends BaseMessage = BaseMessage>(handler: (message: T, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>) {
    return (message: T, sender: chrome.runtime.MessageSender, sendResponse: (response: ResponseMessage) => void) => {
      handler(message, sender)
        .then(response => sendResponse(response))
        .catch(error => {
          Logger.error('Message handler error:', error)
          sendResponse(this.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error'))
        })
      return true
    }
  }

  static createMessageHandler(handlers: Record<string, (message: BaseMessage, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>>) {
    return this.wrapAsyncHandler(async (message: BaseMessage, sender: chrome.runtime.MessageSender) => {
      const handler = handlers[message.type]
      if (!handler) {
        return this.createResponse(false, undefined, `Unknown message type: ${message.type}`)
      }
      return handler(message, sender)
    })
  }
}
