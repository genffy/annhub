import type { ExtensionMessage, ResponseMessage, BaseMessage } from '../../types/messages'
import { Logger } from '../logger'

/** Connection-level failures a retry can fix; anything else already ran. */
const CONNECTION_ERROR_PATTERN = /Receiving end does not exist|message port closed|Extension context invalidated/i

function isConnectionError(message: string): boolean {
  return CONNECTION_ERROR_PATTERN.test(message)
}

export default class MessageUtils {
  static async sendMessage<T = any>(message: ExtensionMessage, retryCount: number = 3): Promise<ResponseMessage<T>> {
    const messageWithMeta = {
      ...message,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    }

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const response = await chrome.runtime.sendMessage(messageWithMeta)

        if (!response) {
          throw new Error('No response received from background script')
        }

        return response
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Only retry when the message never reached a handler. A handler that
        // ran and failed must not run again; SAVE_* is idempotent by requestId.
        if (attempt === retryCount || !isConnectionError(errorMessage)) {
          Logger.warn(`[MessageUtils] ${message.type} failed on attempt ${attempt}:`, errorMessage)
          return this.createResponse<T>(false, undefined, errorMessage)
        }

        const delay = attempt === 1 ? 50 : 200
        await this.delay(delay)
      }
    }

    return this.createResponse<T>(false, undefined, 'Unexpected error in retry loop')
  }

  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  static createResponse<T = any>(success: boolean, data?: T, error?: string): ResponseMessage<T> {
    return {
      type: 'RESPONSE',
      success,
      data,
      error,
      timestamp: Date.now(),
    }
  }

  static generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  static isValidMessage(message: any): message is BaseMessage {
    return message && typeof message === 'object' && typeof message.type === 'string'
  }

  static isResponseMessage(message: any): message is ResponseMessage {
    return message && typeof message === 'object' && typeof message.type === 'string' && typeof message.success === 'boolean'
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

  static createMessageHandler(handlers: Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>>) {
    return this.wrapAsyncHandler(async (message: BaseMessage, sender: chrome.runtime.MessageSender) => {
      const handler = handlers[message.type]
      if (!handler) {
        return this.createResponse(false, undefined, `Unknown message type: ${message.type}`)
      }
      return handler(message, sender)
    })
  }
}
