import { Logger } from '../logger'

export interface ServiceWorkerStatus {
    isAlive: boolean
    lastActiveTime: number
    isInitialized: boolean
}


export class ServiceWorkerManager {
    private static instance: ServiceWorkerManager
    private lastPingTime: number = Date.now()
    private checkInterval: number | null = null

    static getInstance(): ServiceWorkerManager {
        if (!ServiceWorkerManager.instance) {
            ServiceWorkerManager.instance = new ServiceWorkerManager()
        }
        return ServiceWorkerManager.instance
    }


    async isServiceWorkerAlive(): Promise<boolean> {
        try {

            const response = await chrome.runtime.sendMessage({
                type: 'PING',
                timestamp: Date.now()
            })

            this.lastPingTime = Date.now()
            return !!response
        } catch (error) {
            Logger.warn('Service worker ping failed:', error)
            return false
        }
    }


    async waitForServiceWorker(maxWaitTime: number = 10000, checkInterval: number = 500): Promise<boolean> {
        const startTime = Date.now()

        while (Date.now() - startTime < maxWaitTime) {
            if (await this.isServiceWorkerAlive()) {
                Logger.info('Service worker is now active')
                return true
            }

            Logger.info('Waiting for service worker to become active...')
            await this.delay(checkInterval)
        }

        Logger.error('Service worker failed to become active within timeout')
        return false
    }


    async sendMessageWithRetry<T = any>(
        message: any,
        options: {
            maxRetries?: number
            retryDelay?: number
            timeout?: number
            waitForServiceWorker?: boolean
        } = {}
    ): Promise<T | null> {
        const {
            maxRetries = 3,
            retryDelay = 1000,
            timeout = 10000,
            waitForServiceWorker = true
        } = options

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                Logger.info(`Sending message attempt ${attempt}/${maxRetries}:`, message.type)


                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Message send timeout after ${timeout}ms`))
                    }, timeout)
                })


                const sendPromise = chrome.runtime.sendMessage(message)


                const response = await Promise.race([sendPromise, timeoutPromise])

                if (response) {
                    Logger.info(`Message sent successfully on attempt ${attempt}`)
                    return response
                }

                throw new Error('No response received')

            } catch (error) {
                Logger.warn(`Message send failed on attempt ${attempt}:`, error)

                if (attempt === maxRetries) {
                    Logger.error(`All ${maxRetries} attempts failed`)
                    return null
                }


                if (waitForServiceWorker) {
                    Logger.info('Waiting for service worker to wake up...')
                    await this.waitForServiceWorker(5000, 200)
                }


                await this.delay(retryDelay * attempt)
            }
        }

        return null
    }


    async getStatus(): Promise<ServiceWorkerStatus> {
        const isAlive = await this.isServiceWorkerAlive()

        return {
            isAlive,
            lastActiveTime: this.lastPingTime,
            isInitialized: isAlive
        }
    }


    startHealthCheck(interval: number = 30000): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
        }

        this.checkInterval = setInterval(async () => {
            const status = await this.getStatus()
            Logger.info('Service worker health check:', status)
        }, interval) as any
    }


    stopHealthCheck(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
        }
    }


    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
} 