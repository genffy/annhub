import { UIToBackgroundMessage, ResponseMessage, BaseMessage } from '../../types/messages'
import { ServiceWorkerManager } from './service-worker-manager'


export default class MessageUtils {
    private static serviceWorkerManager = ServiceWorkerManager.getInstance()

    static async sendMessage<T = any>(message: UIToBackgroundMessage, retryCount: number = 3): Promise<ResponseMessage<T>> {
        const messageWithMeta = {
            ...message,
            requestId: this.generateRequestId(),
            timestamp: Date.now()
        }

        for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
                console.log(`[MessageUtils] Sending message (attempt ${attempt}/${retryCount}):`, message.type)

                const response = await chrome.runtime.sendMessage(messageWithMeta)

                if (!response) {
                    throw new Error('No response received from background script')
                }

                console.log(`[MessageUtils] Message sent successfully on attempt ${attempt}`)
                return response

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                console.warn(`[MessageUtils] Message send failed on attempt ${attempt}:`, errorMessage)


                if (attempt === retryCount) {
                    console.error(`[MessageUtils] All ${retryCount} attempts failed for message:`, message.type)
                    return this.createResponse<T>(false, undefined, `Failed after ${retryCount} attempts: ${errorMessage}`)
                }


                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
                console.log(`[MessageUtils] Retrying in ${delay}ms...`)
                await this.delay(delay)
            }
        }


        return this.createResponse<T>(false, undefined, 'Unexpected error in retry loop')
    }


    static async sendMessageWithServiceWorkerSupport<T = any>(
        message: UIToBackgroundMessage,
        options: {
            maxRetries?: number
            retryDelay?: number
            timeout?: number
            waitForServiceWorker?: boolean
        } = {}
    ): Promise<ResponseMessage<T>> {
        try {
            const messageWithMeta = {
                ...message,
                requestId: this.generateRequestId(),
                timestamp: Date.now()
            }

            console.log('[MessageUtils] Sending message with service worker support:', message.type)


            const sendPromise = this.serviceWorkerManager.sendMessageWithRetry<ResponseMessage<T>>(
                messageWithMeta,
                {
                    maxRetries: options.maxRetries || 3,
                    retryDelay: options.retryDelay || 1000,
                    waitForServiceWorker: options.waitForServiceWorker !== false
                }
            )

            let response: ResponseMessage<T> | null

            if (options.timeout && options.timeout > 0) {

                const timeoutPromise = new Promise<null>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Message timeout after ${options.timeout}ms`))
                    }, options.timeout)
                })

                response = await Promise.race([sendPromise, timeoutPromise])
            } else {

                response = await sendPromise
            }

            if (!response) {
                return this.createResponse<T>(false, undefined, 'Failed to get response from background script')
            }

            return response

        } catch (error) {
            console.error('[MessageUtils] Failed to send message with service worker support:', error)


            if (error instanceof Error && error.message.includes('timeout')) {
                return this.createResponse<T>(false, undefined, `Request timeout: ${error.message}`)
            }

            return this.createResponse<T>(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    }


    static async checkServiceWorkerStatus() {
        return await this.serviceWorkerManager.getStatus()
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
            timestamp: Date.now()
        }
    }


    static generateRequestId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }


    static isValidMessage(message: any): message is BaseMessage {
        return message && typeof message === 'object' && typeof message.type === 'string'
    }


    static isResponseMessage(message: any): message is ResponseMessage {
        return message && typeof message === 'object' &&
            typeof message.type === 'string' &&
            typeof message.success === 'boolean'
    }


    static wrapAsyncHandler<T extends BaseMessage = BaseMessage>(
        handler: (message: T, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>
    ) {
        return (message: T, sender: chrome.runtime.MessageSender, sendResponse: (response: ResponseMessage) => void) => {
            handler(message, sender)
                .then(response => sendResponse(response))
                .catch(error => {
                    console.error('Message handler error:', error)
                    sendResponse(this.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error'))
                })
            return true
        }
    }


    static createMessageHandler(handlers: Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>>) {
        console.log('createMessageHandler', handlers)
        return this.wrapAsyncHandler(async (message: BaseMessage, sender: chrome.runtime.MessageSender) => {
            const handler = handlers[message.type]
            console.log(message, handlers)
            if (!handler) {
                return this.createResponse(false, undefined, `Unknown message type: ${message.type}`)
            }
            return handler(message, sender)
        })
    }
}
