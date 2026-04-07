import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LlmConfig, VocabConfig } from '../../../../types/vocabulary'

// ── Mock chrome.storage.local ──

const mockStorage = new Map<string, any>()

global.chrome = {
    storage: {
        local: {
            get: vi.fn((keys) => {
                const result: Record<string, any> = {}
                const keysArray = Array.isArray(keys) ? keys : [keys]
                for (const key of keysArray) {
                    if (mockStorage.has(key)) {
                        result[key] = mockStorage.get(key)
                    }
                }
                return Promise.resolve(result)
            }),
            set: vi.fn((items) => {
                for (const [key, value] of Object.entries(items)) {
                    mockStorage.set(key, value)
                }
                return Promise.resolve()
            }),
        },
    },
    alarms: {
        onAlarm: { addListener: vi.fn() },
        clear: vi.fn(() => Promise.resolve()),
        create: vi.fn(() => Promise.resolve()),
    },
} as any

vi.mock('../../../../utils/logger', () => ({
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const ENV_DEFAULTS: LlmConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://api.env-default.com/v4',
    apiKey: 'env-secret-key-123',
    model: 'glm-4-flash',
}

const VOCAB_ENV_DEFAULTS: VocabConfig = {
    enabled: false,
    eudicToken: 'NIS env-token-123',
    eudicCategoryIds: ['0', 'env-cat-1'],
    masteryThreshold: 3,
    syncPeriodMinutes: 60,
    maxAnnotationsPerPage: 200,
    domainWhitelist: {
        enabled: false,
        domains: [],
    },
}

vi.mock('../../../../types/vocabulary', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../types/vocabulary')>()
    return {
        ...actual,
        resolveDefaultLlmConfig: () => ({ ...ENV_DEFAULTS }),
        resolveDefaultVocabConfig: () => ({ ...VOCAB_ENV_DEFAULTS }),
    }
})

vi.mock('../../../../utils/eudic-openapi', () => ({ fetchAllWords: vi.fn() }))
vi.mock('../../llm', () => ({ createLlmClient: vi.fn() }))

import { VocabularyService } from '..'

describe('VocabularyService — getLlmConfig', () => {
    beforeEach(() => {
        mockStorage.clear()
        // Reset singleton for each test
        ;(VocabularyService as any).instance = undefined
    })

    it('returns env defaults when storage is empty', async () => {
        const svc = VocabularyService.getInstance()
        const config = await svc.getLlmConfig()

        expect(config.baseUrl).toBe(ENV_DEFAULTS.baseUrl)
        expect(config.apiKey).toBe(ENV_DEFAULTS.apiKey)
        expect(config.model).toBe(ENV_DEFAULTS.model)
    })

    it('returns stored config when all required fields present', async () => {
        mockStorage.set('llmConfig', {
            provider: 'openai-compatible',
            baseUrl: 'https://custom.api.com',
            apiKey: 'custom-key',
            model: 'gpt-4',
        })
        const svc = VocabularyService.getInstance()
        const config = await svc.getLlmConfig()

        expect(config.baseUrl).toBe('https://custom.api.com')
        expect(config.apiKey).toBe('custom-key')
        expect(config.model).toBe('gpt-4')
    })

    it('does NOT let empty-string apiKey in storage override env default', async () => {
        mockStorage.set('llmConfig', {
            provider: 'openai-compatible',
            baseUrl: 'https://custom.api.com',
            apiKey: '',
            model: 'gpt-4',
        })
        const svc = VocabularyService.getInstance()
        const config = await svc.getLlmConfig()

        expect(config.apiKey).toBe(ENV_DEFAULTS.apiKey)
        expect(config.baseUrl).toBe('https://custom.api.com')
        expect(config.model).toBe('gpt-4')
    })

    it('does NOT let empty-string baseUrl in storage override env default', async () => {
        mockStorage.set('llmConfig', {
            provider: 'openai-compatible',
            baseUrl: '',
            apiKey: '',
            model: 'my-model',
        })
        const svc = VocabularyService.getInstance()
        const config = await svc.getLlmConfig()

        expect(config.baseUrl).toBe(ENV_DEFAULTS.baseUrl)
        expect(config.apiKey).toBe(ENV_DEFAULTS.apiKey)
        expect(config.model).toBe('my-model')
    })

    it('does NOT let undefined values in storage override env defaults', async () => {
        mockStorage.set('llmConfig', {
            provider: 'openai-compatible',
            model: 'gpt-4',
        })
        const svc = VocabularyService.getInstance()
        const config = await svc.getLlmConfig()

        expect(config.baseUrl).toBe(ENV_DEFAULTS.baseUrl)
        expect(config.apiKey).toBe(ENV_DEFAULTS.apiKey)
        expect(config.model).toBe('gpt-4')
    })
})

describe('VocabularyService — getVocabConfig', () => {
    beforeEach(() => {
        mockStorage.clear()
        ;(VocabularyService as any).instance = undefined
    })

    it('returns env defaults when storage is empty', async () => {
        const svc = VocabularyService.getInstance()
        const config = await svc.getVocabConfig()

        expect(config.eudicToken).toBe(VOCAB_ENV_DEFAULTS.eudicToken)
        expect(config.eudicCategoryIds).toEqual(VOCAB_ENV_DEFAULTS.eudicCategoryIds)
    })

    it('stored non-empty token overrides env default', async () => {
        mockStorage.set('vocabConfig', {
            eudicToken: 'NIS custom-token',
            eudicCategoryIds: ['cat-x'],
        })
        const svc = VocabularyService.getInstance()
        const config = await svc.getVocabConfig()

        expect(config.eudicToken).toBe('NIS custom-token')
        expect(config.eudicCategoryIds).toEqual(['cat-x'])
    })

    it('stored empty token does not override env default', async () => {
        mockStorage.set('vocabConfig', {
            eudicToken: '',
            eudicCategoryIds: ['cat-x'],
        })
        const svc = VocabularyService.getInstance()
        const config = await svc.getVocabConfig()

        expect(config.eudicToken).toBe(VOCAB_ENV_DEFAULTS.eudicToken)
        expect(config.eudicCategoryIds).toEqual(['cat-x'])
    })

    it('stored empty category IDs do not override env default', async () => {
        mockStorage.set('vocabConfig', {
            eudicToken: 'NIS custom-token',
            eudicCategoryIds: [],
        })
        const svc = VocabularyService.getInstance()
        const config = await svc.getVocabConfig()

        expect(config.eudicToken).toBe('NIS custom-token')
        expect(config.eudicCategoryIds).toEqual(VOCAB_ENV_DEFAULTS.eudicCategoryIds)
    })
})

describe('VocabularyService — setLlmConfig + getLlmConfig round-trip', () => {
    beforeEach(() => {
        mockStorage.clear()
        ;(VocabularyService as any).instance = undefined
    })

    it('save without apiKey then read: env apiKey is preserved', async () => {
        const svc = VocabularyService.getInstance()

        await svc.setLlmConfig({
            provider: 'openai-compatible',
            baseUrl: 'https://custom.api.com',
            model: 'gpt-4',
        })

        const config = await svc.getLlmConfig()
        expect(config.apiKey).toBe(ENV_DEFAULTS.apiKey)
        expect(config.baseUrl).toBe('https://custom.api.com')
        expect(config.model).toBe('gpt-4')

        const rawStored = mockStorage.get('llmConfig')
        expect(rawStored.apiKey).toBeUndefined()
    })

    it('save with empty apiKey then read: env apiKey is preserved', async () => {
        const svc = VocabularyService.getInstance()

        await svc.setLlmConfig({
            provider: 'openai-compatible',
            baseUrl: 'https://custom.api.com',
            apiKey: '',
            model: 'gpt-4',
        })

        const config = await svc.getLlmConfig()
        expect(config.apiKey).toBe(ENV_DEFAULTS.apiKey)
    })

    it('save with explicit apiKey: stored apiKey wins over env', async () => {
        const svc = VocabularyService.getInstance()

        await svc.setLlmConfig({
            provider: 'openai-compatible',
            baseUrl: 'https://custom.api.com',
            apiKey: 'user-explicit-key',
            model: 'gpt-4',
        })

        const config = await svc.getLlmConfig()
        expect(config.apiKey).toBe('user-explicit-key')
        expect(config.baseUrl).toBe('https://custom.api.com')
    })

    it('multiple saves: later non-empty values win, empty values do not regress', async () => {
        const svc = VocabularyService.getInstance()

        await svc.setLlmConfig({
            provider: 'openai-compatible',
            baseUrl: 'https://first.api.com',
            apiKey: 'first-key',
            model: 'model-a',
        })

        await svc.setLlmConfig({
            baseUrl: 'https://second.api.com',
            model: 'model-b',
        })

        const config = await svc.getLlmConfig()
        expect(config.baseUrl).toBe('https://second.api.com')
        expect(config.model).toBe('model-b')
        expect(config.apiKey).toBe('first-key')
    })
})

describe('VocabularyService — getLlmConfigPublic', () => {
    beforeEach(() => {
        mockStorage.clear()
        ;(VocabularyService as any).instance = undefined
    })

    it('detects env apiKey source when storage has no apiKey', async () => {
        const svc = VocabularyService.getInstance()
        await svc.setLlmConfig({
            provider: 'openai-compatible',
            baseUrl: 'https://custom.api.com',
            model: 'gpt-4',
        })

        const config = await svc.getLlmConfigPublic()
        expect(config.hasApiKey).toBe(true)
        expect(config.apiKeySource).toBe('env')
    })

    it('detects storage apiKey source when user explicitly saved apiKey', async () => {
        const svc = VocabularyService.getInstance()
        await svc.setLlmConfig({
            provider: 'openai-compatible',
            baseUrl: 'https://custom.api.com',
            apiKey: 'user-explicit-key',
            model: 'gpt-4',
        })

        const config = await svc.getLlmConfigPublic()
        expect(config.hasApiKey).toBe(true)
        expect(config.apiKeySource).toBe('storage')
    })
})
