import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../utils/logger', () => ({
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../utils/message', () => ({
    default: {
        createMessageHandler: vi.fn(() => vi.fn()),
    },
}))

const addListenerMock = vi.fn()
;(globalThis as any).browser = {
    runtime: { onMessage: { addListener: addListenerMock } },
}
;(globalThis as any).chrome = {
    runtime: { onMessage: { addListener: addListenerMock } },
}

import { ServiceManager, type IService } from '../service-manager'
import { ServiceContext, type SupportedServices } from '../service-context'

function createMockService(
    name: SupportedServices,
    opts?: { initSideEffect?: () => void },
): IService {
    let initialized = false
    return {
        name,
        initialize: vi.fn(async () => {
            opts?.initSideEffect?.()
            initialized = true
        }),
        getMessageHandlers: vi.fn(() => ({})),
        isInitialized: vi.fn(() => initialized),
        cleanup: vi.fn(async () => {
            initialized = false
        }),
    }
}

describe('ServiceManager — restartServices', () => {
    beforeEach(() => {
        ;(ServiceManager as any).instance = undefined
        ;(ServiceContext as any).instance = undefined
        addListenerMock.mockClear()
    })

    it('calls cleanup on each service before re-initializing', async () => {
        const sm = ServiceManager.getInstance()
        const svcA = createMockService('config')
        const svcB = createMockService('highlight')

        sm.registerServices([svcA, svcB])
        await sm.initializeServices()

        expect(svcA.initialize).toHaveBeenCalledTimes(1)
        expect(svcB.initialize).toHaveBeenCalledTimes(1)

        await sm.restartServices()

        expect(svcA.cleanup).toHaveBeenCalledTimes(1)
        expect(svcB.cleanup).toHaveBeenCalledTimes(1)
        expect(svcA.initialize).toHaveBeenCalledTimes(2)
        expect(svcB.initialize).toHaveBeenCalledTimes(2)
    })

    it('re-initializes services even if isInitialized returns true', async () => {
        const sm = ServiceManager.getInstance()
        const stubborn = createMockService('config')
        // Override cleanup so initialized stays true after cleanup
        stubborn.cleanup = vi.fn(async () => {
            // intentionally NOT resetting initialized
        })
        // Make isInitialized always return true after first init
        let inited = false
        stubborn.initialize = vi.fn(async () => { inited = true })
        stubborn.isInitialized = vi.fn(() => inited)

        sm.registerService(stubborn)
        await sm.initializeServices()

        expect(stubborn.initialize).toHaveBeenCalledTimes(1)

        await sm.restartServices()

        // Must have been called again despite isInitialized() === true
        expect(stubborn.initialize).toHaveBeenCalledTimes(2)
    })

    it('normal initializeServices skips already-initialized services', async () => {
        const sm = ServiceManager.getInstance()
        const svc = createMockService('config')

        sm.registerService(svc)
        await sm.initializeServices()

        expect(svc.initialize).toHaveBeenCalledTimes(1)

        // Second call should skip since already initialized
        await sm.initializeServices()

        expect(svc.initialize).toHaveBeenCalledTimes(1)
    })

    it('continues restart even if one service cleanup throws', async () => {
        const sm = ServiceManager.getInstance()
        const failing = createMockService('config')
        failing.cleanup = vi.fn(async () => { throw new Error('cleanup boom') })
        const healthy = createMockService('highlight')

        sm.registerServices([failing, healthy])
        await sm.initializeServices()

        await sm.restartServices()

        // Both should still get re-initialized
        expect(failing.initialize).toHaveBeenCalledTimes(2)
        expect(healthy.initialize).toHaveBeenCalledTimes(2)
        expect(healthy.cleanup).toHaveBeenCalledTimes(1)
    })

    it('respects initOrder during restart', async () => {
        const sm = ServiceManager.getInstance()
        const order: string[] = []

        const svcConfig = createMockService('config', { initSideEffect: () => order.push('config') })
        const svcHighlight = createMockService('highlight', { initSideEffect: () => order.push('highlight') })
        const svcVocab = createMockService('vocabulary', { initSideEffect: () => order.push('vocabulary') })
        const svcClip = createMockService('clip', { initSideEffect: () => order.push('clip') })

        sm.registerServices([svcClip, svcVocab, svcHighlight, svcConfig])
        await sm.initializeServices()

        // config, highlight, vocabulary are in initOrder; clip comes after
        expect(order).toEqual(['config', 'highlight', 'vocabulary', 'clip'])

        order.length = 0
        await sm.restartServices()

        expect(order).toEqual(['config', 'highlight', 'vocabulary', 'clip'])
    })
})
