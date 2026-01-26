import { Logger } from '../utils/logger'


export enum ServiceStatus {
    IDLE = 'idle',
    INITIALIZING = 'initializing',
    READY = 'ready',
    ERROR = 'error',
    RESTARTING = 'restarting'
}


export type SupportedServices = 'config' | 'translation' | 'highlight'


export interface IServiceContext {
    status: ServiceStatus
    initialized: boolean
    error: Error | null
    initStartTime: number | null
    initEndTime: number | null
    version: string
    startupTime: number
    services: Record<SupportedServices, boolean>
}


export class ServiceContext {
    private static instance: ServiceContext
    private context: IServiceContext

    private constructor() {
        this.context = {
            status: ServiceStatus.IDLE,
            initialized: false,
            error: null,
            initStartTime: null,
            initEndTime: null,
            version: '0.1.0',
            startupTime: Date.now(),
            services: {
                config: false,
                translation: false,
                highlight: false
            }
        }
    }

    static getInstance(): ServiceContext {
        if (!ServiceContext.instance) {
            ServiceContext.instance = new ServiceContext()
        }
        return ServiceContext.instance
    }


    startInitialization(): void {
        Logger.info('[ServiceContext] Starting service initialization')
        this.context.status = ServiceStatus.INITIALIZING
        this.context.initialized = false
        this.context.error = null
        this.context.initStartTime = Date.now()
        this.context.initEndTime = null


        Object.keys(this.context.services).forEach(key => {
            this.context.services[key as SupportedServices] = false
        })
    }


    markServiceInitialized(serviceName: SupportedServices): void {
        this.context.services[serviceName] = true
        Logger.info(`[ServiceContext] Service ${serviceName} initialized`)


        const allServicesReady = Object.values(this.context.services).every(status => status)
        if (allServicesReady && this.context.status === ServiceStatus.INITIALIZING) {
            this.markInitializationComplete()
        }
    }


    private markInitializationComplete(): void {
        this.context.status = ServiceStatus.READY
        this.context.initialized = true
        this.context.initEndTime = Date.now()
        this.context.error = null

        const initDuration = this.context.initEndTime! - this.context.initStartTime!
        Logger.info(`[ServiceContext] All services initialized successfully in ${initDuration}ms`)
    }


    markInitializationFailed(error: Error): void {
        Logger.error('[ServiceContext] Service initialization failed:', error)
        this.context.status = ServiceStatus.ERROR
        this.context.initialized = false
        this.context.error = error
        this.context.initEndTime = Date.now()
    }


    startRestart(): void {
        Logger.info('[ServiceContext] Starting service restart')
        this.context.status = ServiceStatus.RESTARTING
        this.context.error = null

        Object.keys(this.context.services).forEach(key => {
            this.context.services[key as SupportedServices] = false
        })
    }


    getStatus(): IServiceContext {
        return { ...this.context }
    }


    getDetailedStatus() {
        const now = Date.now()
        const uptime = now - this.context.startupTime
        const initDuration = this.context.initEndTime && this.context.initStartTime
            ? this.context.initEndTime - this.context.initStartTime
            : null

        return {
            status: this.context.status,
            initialized: this.context.initialized,
            version: this.context.version,
            uptime,
            startupTime: this.context.startupTime,
            initDuration,
            services: { ...this.context.services },
            error: this.context.error ? {
                name: this.context.error.name,
                message: this.context.error.message
            } : null,
            timestamp: now
        }
    }


    isReady(): boolean {
        return this.context.status === ServiceStatus.READY && this.context.initialized
    }


    isInitializing(): boolean {
        return this.context.status === ServiceStatus.INITIALIZING
    }


    hasError(): boolean {
        return this.context.status === ServiceStatus.ERROR
    }


    getError(): Error | null {
        return this.context.error
    }
} 