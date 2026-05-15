import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStorage = new Map<string, any>()

global.chrome = {
    runtime: {
        id: 'test-extension-id',
        getURL: vi.fn(() => 'chrome-extension://test-extension-id/'),
    },
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
        onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
        clear: vi.fn(() => Promise.resolve()),
        create: vi.fn(() => Promise.resolve()),
    },
} as any

const {
    fetchCategoriesMock,
    createCategoryMock,
    addWordMock,
    fetchAllWordsMock,
} = vi.hoisted(() => ({
    fetchCategoriesMock: vi.fn(),
    createCategoryMock: vi.fn(),
    addWordMock: vi.fn(),
    fetchAllWordsMock: vi.fn(),
}))

vi.mock('../../../../utils/logger', () => ({
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../../../utils/eudic-openapi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../utils/eudic-openapi')>()
    return {
        ...actual,
        fetchCategories: fetchCategoriesMock,
        createCategory: createCategoryMock,
        addWord: addWordMock,
        fetchAllWords: fetchAllWordsMock,
    }
})

vi.mock('../../llm', () => ({ createLlmClient: vi.fn() }))

import { VocabularyService } from '..'

describe('VocabularyService learning sync and queue', () => {
    beforeEach(() => {
        mockStorage.clear()
        fetchCategoriesMock.mockReset()
        createCategoryMock.mockReset()
        addWordMock.mockReset()
        fetchAllWordsMock.mockReset()
        ;(VocabularyService as any).instance = undefined

        mockStorage.set('vocabConfig', {
            enabled: true,
            adaptiveLearningEnabled: true,
            annotationAggressiveness: 'balanced',
            eudicToken: 'NIS token-123',
            eudicCategoryIds: ['seed-cat'],
            masteryThreshold: 3,
            syncPeriodMinutes: 60,
            maxAnnotationsPerPage: 200,
            cefrLevel: 'B1',
            domainWhitelist: { enabled: false, domains: [] },
        })
    })

    it('ensureLearningCategory reuses existing category', async () => {
        fetchCategoriesMock.mockResolvedValue([{ id: 'learn-cat-1', language: 'en', name: 'AnnHub Learning' }])
        mockStorage.set('vocabConfig', {
            enabled: true,
            adaptiveLearningEnabled: true,
            annotationAggressiveness: 'balanced',
            eudicToken: 'NIS token-123',
            eudicCategoryIds: [],
            masteryThreshold: 3,
            syncPeriodMinutes: 60,
            maxAnnotationsPerPage: 200,
            cefrLevel: 'B1',
            domainWhitelist: { enabled: false, domains: [] },
        })
        const svc = VocabularyService.getInstance()

        const result = await svc.ensureLearningCategory()

        expect(result).toEqual({ categoryId: 'learn-cat-1', created: false })
        expect(createCategoryMock).not.toHaveBeenCalled()
        expect(mockStorage.get('vocabLearningCategoryId')).toBe('learn-cat-1')
    })

    it('ensureLearningCategory defaults to first configured vocab category', async () => {
        const svc = VocabularyService.getInstance()

        const result = await svc.ensureLearningCategory()

        expect(result).toEqual({ categoryId: 'seed-cat', created: false })
        expect(fetchCategoriesMock).not.toHaveBeenCalled()
        expect(createCategoryMock).not.toHaveBeenCalled()
        expect(mockStorage.get('vocabLearningCategoryId')).toBe('seed-cat')
    })

    it('getLearningSyncState exposes first configured vocab category as feedback target', async () => {
        const svc = VocabularyService.getInstance()

        const state = await svc.getLearningSyncState()

        expect(state.learningCategoryId).toBe('seed-cat')
        expect(state.learningPendingCount).toBe(0)
    })

    it('recordLearningEvent queues mapped star and updates snapshot', async () => {
        fetchCategoriesMock.mockResolvedValue([{ id: 'learn-cat-1', language: 'en', name: 'AnnHub Learning' }])
        addWordMock.mockRejectedValue(new Error('network offline'))
        const svc = VocabularyService.getInstance()

        const result = await svc.recordLearningEvent({
            word: 'Ephemeral',
            eventType: 'known',
            sentence: 'An ephemeral trend disappears quickly.',
        })

        expect(result.star).toBe(2)
        expect(result.queued).toBe(1)
        const snapshot = mockStorage.get('vocabSnapshot')
        expect(snapshot.entries.ephemeral.star).toBe(2)
        const pending = mockStorage.get('vocabLearningPendingEvents')
        expect(pending).toHaveLength(1)
        expect(pending[0].word).toBe('ephemeral')
    })

    it('recordLearningEvent flushes immediately when Eudic accepts the word', async () => {
        fetchCategoriesMock.mockResolvedValue([{ id: 'learn-cat-1', language: 'en', name: 'AnnHub Learning' }])
        addWordMock.mockResolvedValue(undefined)
        const svc = VocabularyService.getInstance()

        const result = await svc.recordLearningEvent({
            word: 'Resilient',
            eventType: 'addToVocab',
            sentence: 'The system stayed resilient under pressure.',
        })

        expect(result.queued).toBe(0)
        expect(result.flush).toEqual({ successCount: 1, failedCount: 0, pendingCount: 0 })
        expect(addWordMock).toHaveBeenCalledWith('NIS token-123', expect.objectContaining({
            word: 'resilient',
            star: 1,
            categoryIds: ['seed-cat'],
        }))
        expect(mockStorage.get('vocabLearningPendingEvents')).toEqual([])
    })

    it('flushLearningPendingEvents retries failed and clears succeeded', async () => {
        mockStorage.set('vocabLearningCategoryId', 'learn-cat-1')
        mockStorage.set('vocabLearningPendingEvents', [
            {
                id: 'evt-1',
                word: 'alpha',
                star: 2,
                language: 'en',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                attempts: 0,
            },
            {
                id: 'evt-2',
                word: 'beta',
                star: 4,
                language: 'en',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                attempts: 0,
            },
        ])
        addWordMock.mockImplementation(async (_token: string, payload: { word: string }) => {
            if (payload.word === 'beta') {
                throw new Error('rate limited')
            }
        })
        const svc = VocabularyService.getInstance()

        const result = await svc.flushLearningPendingEvents()

        expect(result.successCount).toBe(1)
        expect(result.failedCount).toBe(1)
        const pending = mockStorage.get('vocabLearningPendingEvents')
        expect(pending).toHaveLength(1)
        expect(pending[0].word).toBe('beta')
        expect(pending[0].attempts).toBe(1)
    })

    it('syncLearningProfileFromEudic updates snapshot by learning book', async () => {
        mockStorage.set('vocabLearningCategoryId', 'learn-cat-1')
        fetchAllWordsMock.mockResolvedValue([
            { word: 'volatile', exp: '不稳定的', star: 3 },
            { word: 'robust', exp: '强健的', star: 4 },
        ])
        const svc = VocabularyService.getInstance()

        const result = await svc.syncLearningProfileFromEudic()

        expect(result.count).toBe(2)
        const snapshot = mockStorage.get('vocabSnapshot')
        expect(snapshot.entries.volatile.star).toBe(3)
        expect(snapshot.entries.volatile.proficiency).toBe(3)
        expect(snapshot.entries.robust.exp).toBe('强健的')
    })

    it('syncFromEudic includes selected learning book and overlays pending feedback', async () => {
        mockStorage.set('vocabLearningCategoryId', 'learn-cat-1')
        mockStorage.set('vocabLearningPendingEvents', [
            {
                id: 'evt-overlay-sync',
                word: 'resilient',
                star: 4,
                language: 'en',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                attempts: 0,
            },
        ])
        fetchAllWordsMock.mockResolvedValue([
            { word: 'seeded', exp: '已有的', star: 2 },
            { word: 'adaptive', exp: '自适应的', star: 3 },
        ])
        const svc = VocabularyService.getInstance()

        await svc.syncFromEudic()

        expect(fetchAllWordsMock).toHaveBeenCalledWith('NIS token-123', ['seed-cat', 'learn-cat-1'])
        const snapshot = mockStorage.get('vocabSnapshot')
        expect(snapshot.entries.adaptive.star).toBe(3)
        expect(snapshot.entries.resilient.star).toBe(4)
    })

    it('syncFromEudic syncs all categories when configured category IDs are empty', async () => {
        mockStorage.set('vocabConfig', {
            enabled: true,
            adaptiveLearningEnabled: true,
            annotationAggressiveness: 'balanced',
            eudicToken: 'NIS token-123',
            eudicCategoryIds: [],
            masteryThreshold: 3,
            syncPeriodMinutes: 60,
            maxAnnotationsPerPage: 200,
            cefrLevel: 'B1',
            domainWhitelist: { enabled: false, domains: [] },
        })
        fetchCategoriesMock.mockResolvedValue([
            { id: 'cat-a', language: 'en', name: 'Book A' },
            { id: 'cat-b', language: 'en', name: 'Book B' },
        ])
        fetchAllWordsMock.mockResolvedValue([
            { word: 'universal', exp: '通用的', star: 2 },
        ])
        const svc = VocabularyService.getInstance()

        const result = await svc.syncFromEudic()

        expect(result.count).toBe(1)
        expect(fetchCategoriesMock).toHaveBeenCalledWith('NIS token-123', 'en')
        expect(fetchAllWordsMock).toHaveBeenCalledWith('NIS token-123', ['cat-a', 'cat-b'])
        const snapshot = mockStorage.get('vocabSnapshot')
        expect(snapshot.entries.universal.exp).toBe('通用的')
    })

    it('getLearningProfile overlays pending star over snapshot', async () => {
        mockStorage.set('vocabSnapshot', {
            version: '1.0',
            updatedAt: Date.now(),
            entries: {
                robust: { proficiency: 2, star: 2, exp: '强健的' },
            },
        })
        mockStorage.set('vocabLearningPendingEvents', [
            {
                id: 'evt-overlay',
                word: 'robust',
                star: 5,
                language: 'en',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                attempts: 0,
            },
        ])
        const svc = VocabularyService.getInstance()

        const profile = await svc.getLearningProfile(['robust'])

        expect(profile.pendingCount).toBe(1)
        expect(profile.stars.robust).toBe(5)
    })

    it('resetWordLearning enqueues reset event to star 1', async () => {
        fetchCategoriesMock.mockResolvedValue([{ id: 'learn-cat-1', language: 'en', name: 'AnnHub Learning' }])
        addWordMock.mockRejectedValue(new Error('network offline'))
        const svc = VocabularyService.getInstance()

        const result = await svc.resetWordLearning('robust')

        expect(result.star).toBe(1)
        const pending = mockStorage.get('vocabLearningPendingEvents')
        expect(pending).toHaveLength(1)
        expect(pending[0].word).toBe('robust')
        expect(pending[0].star).toBe(1)
    })
})
