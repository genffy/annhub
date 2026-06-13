import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStorage = new Map<string, any>()

global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getURL: vi.fn(() => 'chrome-extension://test-extension-id/'),
  },
  storage: {
    local: {
      get: vi.fn(keys => {
        const result: Record<string, any> = {}
        const keysArray = Array.isArray(keys) ? keys : [keys]
        for (const key of keysArray) {
          if (mockStorage.has(key)) {
            result[key] = mockStorage.get(key)
          }
        }
        return Promise.resolve(result)
      }),
      set: vi.fn(items => {
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

const { fetchCategoriesMock, createCategoryMock, addWordMock, fetchAllWordsMock, deleteWordsFromCategoryMock } = vi.hoisted(() => ({
  fetchCategoriesMock: vi.fn(),
  createCategoryMock: vi.fn(),
  addWordMock: vi.fn(),
  fetchAllWordsMock: vi.fn(),
  deleteWordsFromCategoryMock: vi.fn(),
}))

vi.mock('../../../../utils/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../../../utils/eudic-openapi', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../utils/eudic-openapi')>()
  return {
    ...actual,
    fetchCategories: fetchCategoriesMock,
    createCategory: createCategoryMock,
    addWord: addWordMock,
    fetchAllWords: fetchAllWordsMock,
    deleteWordsFromCategory: deleteWordsFromCategoryMock,
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
    deleteWordsFromCategoryMock.mockReset()
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
    mockStorage.set('vocabMasteredCategoryId', 'mastered-cat')
    const svc = VocabularyService.getInstance()

    const state = await svc.getLearningSyncState()

    expect(state.learningCategoryId).toBe('seed-cat')
    expect(state.masteredCategoryId).toBe('mastered-cat')
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

    expect(result.star).toBe(5)
    expect(result.queued).toBe(1)
    const snapshot = mockStorage.get('vocabSnapshot')
    expect(snapshot.entries.ephemeral.star).toBe(5)
    const pending = mockStorage.get('vocabLearningPendingEvents')
    expect(pending).toHaveLength(1)
    expect(pending[0].word).toBe('ephemeral')
  })

  it('recordLearningEvent flushes addToVocab as star 1 when Eudic accepts the word', async () => {
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
    expect(addWordMock).toHaveBeenCalledWith(
      'NIS token-123',
      expect.objectContaining({
        word: 'resilient',
        star: 1,
        categoryIds: ['seed-cat'],
      }),
    )
    expect(mockStorage.get('vocabLearningPendingEvents')).toEqual([])
  })

  it('recordLearningEvent flushes known as star 5 to the learning category', async () => {
    mockStorage.set('vocabSnapshot', {
      version: '1.0',
      updatedAt: Date.now(),
      entries: {
        ephemeral: { proficiency: 2, star: 2, exp: '短暂的' },
      },
    })
    addWordMock.mockResolvedValue(undefined)
    const svc = VocabularyService.getInstance()

    const result = await svc.recordLearningEvent({
      word: 'Ephemeral',
      eventType: 'known',
      sentence: 'An ephemeral trend disappears quickly.',
    })

    expect(result.star).toBe(5)
    expect(result.queued).toBe(0)
    expect(addWordMock).toHaveBeenCalledWith(
      'NIS token-123',
      expect.objectContaining({
        word: 'ephemeral',
        star: 5,
        categoryIds: ['seed-cat'],
      }),
    )
    expect(deleteWordsFromCategoryMock).not.toHaveBeenCalled()
    expect(mockStorage.get('vocabLearningPendingEvents')).toEqual([])
  })

  it('recordLearningEvent syncs skip to mastered category and removes from learning category', async () => {
    mockStorage.set('vocabSnapshot', {
      version: '1.0',
      updatedAt: Date.now(),
      entries: {
        ephemeral: { proficiency: 4, star: 4, exp: '短暂的' },
      },
    })
    fetchCategoriesMock.mockResolvedValue([{ id: 'mastered-cat', language: 'en', name: 'AnnHub Mastered' }])
    deleteWordsFromCategoryMock.mockResolvedValue(undefined)
    addWordMock.mockResolvedValue(undefined)
    const svc = VocabularyService.getInstance()

    const result = await svc.recordLearningEvent({
      word: 'Ephemeral',
      eventType: 'skip',
    })

    expect(result.star).toBe(5)
    expect(addWordMock).toHaveBeenCalledWith(
      'NIS token-123',
      expect.objectContaining({
        word: 'ephemeral',
        star: 5,
        categoryIds: ['mastered-cat'],
      }),
    )
    expect(deleteWordsFromCategoryMock).toHaveBeenCalledWith(
      'NIS token-123',
      expect.objectContaining({
        categoryId: 'seed-cat',
        words: ['ephemeral'],
        language: 'en',
      }),
    )
    expect(mockStorage.get('vocabLearningPendingEvents')).toEqual([])
  })

  it('recordLearningEvent does not retry skip when removing from learning category fails', async () => {
    fetchCategoriesMock.mockResolvedValue([{ id: 'mastered-cat', language: 'en', name: 'AnnHub Mastered' }])
    addWordMock.mockResolvedValue(undefined)
    deleteWordsFromCategoryMock.mockRejectedValue(new Error('not found'))
    const svc = VocabularyService.getInstance()

    const result = await svc.recordLearningEvent({
      word: 'Ephemeral',
      eventType: 'skip',
    })

    expect(result.star).toBe(5)
    expect(result.queued).toBe(0)
    expect(addWordMock).toHaveBeenCalledWith(
      'NIS token-123',
      expect.objectContaining({
        word: 'ephemeral',
        star: 5,
        categoryIds: ['mastered-cat'],
      }),
    )
    expect(deleteWordsFromCategoryMock).toHaveBeenCalled()
    expect(mockStorage.get('vocabLearningPendingEvents')).toEqual([])
  })

  it('recordLearningEvent treats legacy suppress as skip', async () => {
    mockStorage.set('vocabMasteredCategoryId', 'mastered-cat')
    addWordMock.mockResolvedValue(undefined)
    deleteWordsFromCategoryMock.mockResolvedValue(undefined)
    const svc = VocabularyService.getInstance()

    await svc.recordLearningEvent({
      word: 'Legacy',
      eventType: 'suppress',
    })

    expect(addWordMock).toHaveBeenCalledWith(
      'NIS token-123',
      expect.objectContaining({
        word: 'legacy',
        star: 5,
        categoryIds: ['mastered-cat'],
      }),
    )
    expect(deleteWordsFromCategoryMock).toHaveBeenCalled()
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

  it('syncFromEudic includes selected learning and mastered books and overlays pending feedback', async () => {
    mockStorage.set('vocabLearningCategoryId', 'learn-cat-1')
    mockStorage.set('vocabMasteredCategoryId', 'mastered-cat')
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
    fetchAllWordsMock
      .mockResolvedValueOnce([
        { word: 'seeded', exp: '已有的', star: 2 },
        { word: 'adaptive', exp: '自适应的', star: 3 },
      ])
      .mockResolvedValueOnce([{ word: 'mastered', exp: '掌握的', star: 1 }])
    const svc = VocabularyService.getInstance()

    await svc.syncFromEudic()

    expect(fetchAllWordsMock).toHaveBeenCalledWith('NIS token-123', ['seed-cat', 'learn-cat-1', 'mastered-cat'])
    expect(fetchAllWordsMock).toHaveBeenCalledWith('NIS token-123', ['mastered-cat'])
    const snapshot = mockStorage.get('vocabSnapshot')
    expect(snapshot.entries.adaptive.star).toBe(3)
    expect(snapshot.entries.mastered.star).toBe(5)
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
    fetchAllWordsMock.mockResolvedValue([{ word: 'universal', exp: '通用的', star: 2 }])
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

  describe('word memory (recall-probability model)', () => {
    it('recordWordExposures accrues exposures and persists memory store', async () => {
      const svc = VocabularyService.getInstance()

      const result = await svc.recordWordExposures(['Robust', 'robust', 'phenomenon'])

      // "Robust"/"robust" normalize to the same key → 2 unique words.
      expect(result.updated).toBe(2)
      const store = mockStorage.get('vocabWordMemory')
      expect(store.robust.seenCount).toBe(1)
      expect(store.phenomenon.seenCount).toBe(1)
    })

    it('repeated exposures grow a word toward known and raise its learning-profile star', async () => {
      const svc = VocabularyService.getInstance()

      for (let i = 0; i < 14; i++) {
        await svc.recordWordExposures(['ubiquitous'])
      }

      const profile = await svc.getLearningProfile(['ubiquitous'])
      // No Eudic snapshot entry, but passive exposure has raised the recall-derived star.
      expect(profile.stars.ubiquitous).toBeGreaterThanOrEqual(4)
    })

    it('getLearningProfile takes the max of Eudic star and recall star', async () => {
      mockStorage.set('vocabSnapshot', {
        version: '1.0',
        updatedAt: Date.now(),
        entries: {
          robust: { proficiency: 2, star: 2, exp: '强健的' },
        },
      })
      const svc = VocabularyService.getInstance()

      // A single fresh exposure → recall ~1 → recall star 5, which should win over star 2.
      await svc.recordWordExposures(['robust'])

      const profile = await svc.getLearningProfile(['robust'])
      expect(profile.stars.robust).toBe(5)
    })

    it('explicit "known" feedback writes long-term memory alongside the Eudic star', async () => {
      fetchCategoriesMock.mockResolvedValue([{ id: 'learn-cat-1', language: 'en', name: 'AnnHub Learning' }])
      addWordMock.mockResolvedValue(undefined)
      const svc = VocabularyService.getInstance()

      await svc.recordLearningEvent({ word: 'robust', eventType: 'known' })

      const store = mockStorage.get('vocabWordMemory')
      expect(store.robust).toBeDefined()
      expect(store.robust.stability).toBeGreaterThanOrEqual(180)
    })
  })

  describe('memory sync (T1-B event queue + client stub)', () => {
    function enableMemorySync(endpoint = '') {
      mockStorage.set('vocabConfig', {
        ...mockStorage.get('vocabConfig'),
        memorySyncEnabled: true,
        memorySyncEndpoint: endpoint,
      })
    }

    it('does not queue events when memory sync is disabled (default)', async () => {
      const svc = VocabularyService.getInstance()

      await svc.recordWordExposures(['robust', 'phenomenon'])

      expect(mockStorage.get('vocabMemoryEventQueue')).toBeUndefined()
    })

    it('queues anonymized "seen" events on exposure when opted in', async () => {
      enableMemorySync()
      const svc = VocabularyService.getInstance()

      await svc.recordWordExposures(['Robust', 'phenomenon'])

      const queue = mockStorage.get('vocabMemoryEventQueue')
      expect(queue).toHaveLength(2)
      expect(queue.every((e: any) => e.type === 'seen')).toBe(true)
      expect(queue.map((e: any) => e.lemma).sort()).toEqual(['phenomenon', 'robust'])
      // deviceId stamped, no sentence/url fields present (privacy).
      expect(queue[0].deviceId).toMatch(/^anon-/)
      expect(queue[0]).not.toHaveProperty('sentence')
      const state = await svc.getMemorySyncState()
      expect(state.pendingCount).toBe(2)
    })

    it('queues explicit feedback but never the local-only "reset"', async () => {
      fetchCategoriesMock.mockResolvedValue([{ id: 'learn-cat-1', language: 'en', name: 'AnnHub Learning' }])
      addWordMock.mockResolvedValue(undefined)
      enableMemorySync()
      const svc = VocabularyService.getInstance()

      await svc.recordLearningEvent({ word: 'robust', eventType: 'known' })
      await svc.resetWordLearning('robust')

      const queue = mockStorage.get('vocabMemoryEventQueue')
      // Only the "known" event is uploaded; the reset stays local.
      expect(queue).toHaveLength(1)
      expect(queue[0]).toMatchObject({ lemma: 'robust', type: 'known' })
    })

    it('flushMemoryEvents is skipped (queue retained) when no endpoint is set', async () => {
      enableMemorySync('')
      const svc = VocabularyService.getInstance()
      await svc.recordWordExposures(['robust'])

      const result = await svc.flushMemoryEvents()

      expect(result.skipped).toBe(true)
      expect(result.pendingCount).toBe(1)
      expect(mockStorage.get('vocabMemoryEventQueue')).toHaveLength(1)
    })

    it('flushMemoryEvents uploads and prunes the queue on success', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ accepted: 1, duplicates: 0 }) })
      global.fetch = fetchMock as any
      enableMemorySync('https://api.example.com')
      const svc = VocabularyService.getInstance()
      await svc.recordWordExposures(['robust'])

      const result = await svc.flushMemoryEvents()

      expect(fetchMock).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ accepted: 1, pendingCount: 0 })
      expect(mockStorage.get('vocabMemoryEventQueue')).toEqual([])
      const state = await svc.getMemorySyncState()
      expect(state.lastStatus).toBe('ok')
    })

    it('flushMemoryEvents keeps the queue and records the error on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }) as any
      enableMemorySync('https://api.example.com')
      const svc = VocabularyService.getInstance()
      await svc.recordWordExposures(['robust'])

      const result = await svc.flushMemoryEvents()

      expect(result.pendingCount).toBe(1)
      expect(mockStorage.get('vocabMemoryEventQueue')).toHaveLength(1)
      const state = await svc.getMemorySyncState()
      expect(state.lastStatus).toBe('error')
      expect(state.lastError).toMatch(/HTTP 500/)
    })

    it('getLearningProfile folds cached server recall (preferred, never weakening)', async () => {
      mockStorage.set('vocabRecallCache', {
        robust: { lemma: 'robust', recall: 0.98, computedAt: Date.now(), modelVersion: 'hlr-test' },
      })
      const svc = VocabularyService.getInstance()

      const profile = await svc.getLearningProfile(['robust'])

      // recall 0.98 → star 5 via recallToStar, with no Eudic entry.
      expect(profile.stars.robust).toBe(5)
    })

    it('ignores stale recall-cache entries (past TTL)', async () => {
      mockStorage.set('vocabRecallCache', {
        robust: { lemma: 'robust', recall: 0.98, computedAt: Date.now() - 48 * 60 * 60 * 1000, modelVersion: 'hlr-test' },
      })
      const svc = VocabularyService.getInstance()

      const profile = await svc.getLearningProfile(['robust'])

      // Stale → server recall ignored, falls back to default star 1.
      expect(profile.stars.robust ?? 1).toBe(1)
    })

    it('clearMemoryQueue empties the offline queue', async () => {
      enableMemorySync()
      const svc = VocabularyService.getInstance()
      await svc.recordWordExposures(['robust', 'phenomenon'])
      expect(mockStorage.get('vocabMemoryEventQueue')).toHaveLength(2)

      const result = await svc.clearMemoryQueue()

      expect(result.pendingCount).toBe(0)
      expect(mockStorage.get('vocabMemoryEventQueue')).toEqual([])
    })
  })

  describe('selectAndGloss (S4 LLM word selection)', () => {
    it('resolves Eudic-known words locally as unfamiliar with their exp, no LLM call', async () => {
      mockStorage.set('vocabSnapshot', {
        version: '1.0',
        updatedAt: Date.now(),
        entries: { robust: { proficiency: 2, star: 2, exp: '强健的' } },
      })
      const svc = VocabularyService.getInstance()

      const result = await svc.selectAndGloss([{ word: 'robust', sentence: 'A robust system.' }])

      expect(result.robust).toEqual({ unfamiliar: true, gloss: '强健的' })
    })

    it('keeps local selection (unfamiliar) when LLM is not configured', async () => {
      // No llmConfig in storage → not ready. Selection enabled or not, undecided words
      // default to unfamiliar so the local gate still annotates them.
      mockStorage.set('vocabConfig', {
        enabled: true,
        adaptiveLearningEnabled: true,
        annotationAggressiveness: 'balanced',
        llmWordSelectionEnabled: true,
        eudicToken: 'NIS token-123',
        eudicCategoryIds: ['seed-cat'],
        masteryThreshold: 3,
        syncPeriodMinutes: 60,
        maxAnnotationsPerPage: 200,
        cefrLevel: 'B1',
        domainWhitelist: { enabled: false, domains: [] },
      })
      const svc = VocabularyService.getInstance()

      const result = await svc.selectAndGloss([{ word: 'epistemic', sentence: 'An epistemic claim.' }])

      expect(result.epistemic).toEqual({ unfamiliar: true, gloss: '' })
    })
  })
})
