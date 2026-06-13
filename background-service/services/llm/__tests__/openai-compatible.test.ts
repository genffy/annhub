import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAICompatibleLlmService } from '../openai-compatible'
import type { LlmConfig } from '../../../../types/vocabulary'

const mockConfig: LlmConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.example.com',
  apiKey: 'test-key',
  model: 'gpt-4o-mini',
}

describe('OpenAICompatibleLlmService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('completeChat', () => {
    it('sends correct request format', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test response' } }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const service = new OpenAICompatibleLlmService(mockConfig)
      const result = await service.completeChat({
        system: 'You are helpful',
        user: 'Hello',
        temperature: 0.5,
        maxTokens: 100,
      })

      expect(result).toBe('test response')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
            'Content-Type': 'application/json',
          }),
        }),
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('gpt-4o-mini')
      expect(body.messages).toHaveLength(2)
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[1].role).toBe('user')
      expect(body.temperature).toBe(0.5)
      expect(body.max_tokens).toBe(100)
    })

    it('omits system message when not provided', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'reply' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      await service.completeChat({ user: 'Hi' })

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].role).toBe('user')
    })

    it('throws on non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          text: async () => 'Unauthorized',
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      await expect(service.completeChat({ user: 'test' })).rejects.toThrow('LLM request failed: 401')
    })

    it('throws on missing content in response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ choices: [] }),
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      await expect(service.completeChat({ user: 'test' })).rejects.toThrow('LLM response missing content')
    })

    it('reports truncation distinctly when a reasoning model returns empty content with finish_reason=length', async () => {
      // GLM-5/Z1, DeepSeek-R1, o-series etc. spend the budget on hidden reasoning first; too
      // small a max_tokens yields finish_reason="length" + empty content. Must not be confused
      // with a genuinely empty response.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '', reasoning_content: 'lots of thinking…' }, finish_reason: 'length' }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      await expect(service.completeChat({ user: 'test' })).rejects.toThrow('max_tokens too low')
    })

    it('throws when config is incomplete', async () => {
      const incompleteConfig: LlmConfig = { ...mockConfig, apiKey: '' }
      const service = new OpenAICompatibleLlmService(incompleteConfig)
      await expect(service.completeChat({ user: 'test' })).rejects.toThrow('LLM config incomplete')
    })

    it('strips trailing slash from baseUrl', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService({ ...mockConfig, baseUrl: 'https://api.example.com/' })
      await service.completeChat({ user: 'test' })

      expect((fetch as any).mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions')
    })

    it('uses /chat/completions directly when baseUrl already has version path', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService({
        ...mockConfig,
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      })
      await service.completeChat({ user: 'test' })

      expect((fetch as any).mock.calls[0][0]).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    })

    it('handles versioned URL with trailing slash', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService({
        ...mockConfig,
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/',
      })
      await service.completeChat({ user: 'test' })

      expect((fetch as any).mock.calls[0][0]).toBe('https://open.bigmodel.cn/api/coding/paas/v4/chat/completions')
    })

    it('does not append paths when baseUrl is already chat completions endpoint', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService({
        ...mockConfig,
        baseUrl: 'https://api.example.com/v1/chat/completions',
      })
      await service.completeChat({ user: 'test' })

      expect((fetch as any).mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions')
    })

    it('supports provider-specific OpenAI compatibility paths', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService({
        ...mockConfig,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      })
      await service.completeChat({ user: 'test' })

      expect((fetch as any).mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    })

    it('does not duplicate /v1 when baseUrl already ends with /v1', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService({
        ...mockConfig,
        baseUrl: 'https://api.openai.com/v1',
      })
      await service.completeChat({ user: 'test' })

      expect((fetch as any).mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions')
    })

    it('omits temperature when provider requires it', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'ok' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService({
        ...mockConfig,
        omitTemperature: true,
      })
      await service.completeChat({ user: 'test', temperature: 0.3 })

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.temperature).toBeUndefined()
    })

    it('times out stalled requests', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'))
              })
            }),
        ),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      await expect(service.completeChat({ user: 'test', timeoutMs: 1 })).rejects.toThrow('LLM request timed out')
    })
  })

  describe('listModels', () => {
    it('loads OpenAI-compatible model list', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: [
              { id: 'gpt-4o-mini', owned_by: 'openai' },
              { id: 'gpt-4o', name: 'GPT-4o' },
            ],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      const models = await service.listModels()

      expect((fetch as any).mock.calls[0][0]).toBe('https://api.example.com/v1/models')
      expect(models).toEqual([
        { id: 'gpt-4o-mini', name: 'gpt-4o-mini', description: 'openai' },
        { id: 'gpt-4o', name: 'GPT-4o', description: undefined },
      ])
    })

    it('uses explicit modelsEndpoint when provided', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ data: [{ id: 'model-a' }] }),
        }),
      )

      const service = new OpenAICompatibleLlmService({
        ...mockConfig,
        modelsEndpoint: 'https://models.example.com/list',
      })
      await service.listModels()

      expect((fetch as any).mock.calls[0][0]).toBe('https://models.example.com/list')
    })
  })

  describe('glossBatch', () => {
    it('parses JSON from LLM response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"hello": "你好", "world": "世界"}' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      const result = await service.glossBatch({
        sentence: 'Hello world',
        words: ['hello', 'world'],
        targetLanguage: 'zh-CN',
      })

      expect(result).toEqual({ hello: '你好', world: '世界' })
    })

    it('budgets reasoning-token headroom so reasoning models are not truncated', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{}' } }] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const service = new OpenAICompatibleLlmService(mockConfig)
      await service.glossBatch({ sentence: 'A short sentence.', words: ['alpha', 'beta'], targetLanguage: 'zh-CN' })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.max_tokens).toBeGreaterThanOrEqual(1024)
    })

    it('returns empty strings when JSON parsing fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Not valid JSON at all' } }],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      const result = await service.glossBatch({
        sentence: 'Test sentence',
        words: ['test'],
        targetLanguage: 'zh-CN',
      })

      expect(result).toEqual({ test: '' })
    })
  })

  describe('selectAndGloss', () => {
    it('parses per-word unfamiliar verdicts and glosses', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: '{"perfunctory": {"unfamiliar": true, "gloss": "敷衍的"}, "table": {"unfamiliar": false, "gloss": ""}}',
                },
              },
            ],
          }),
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      const result = await service.selectAndGloss({
        candidates: [
          { word: 'perfunctory', sentence: 'He gave a perfunctory nod.' },
          { word: 'table', sentence: 'Put it on the table.' },
        ],
        targetLanguage: 'zh-CN',
        cefrLevel: 'B1',
      })

      expect(result.perfunctory).toEqual({ unfamiliar: true, gloss: '敷衍的' })
      expect(result.table).toEqual({ unfamiliar: false, gloss: '' })
    })

    it('injects the CEFR level into the prompt', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{}' } }] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const service = new OpenAICompatibleLlmService(mockConfig)
      await service.selectAndGloss({
        candidates: [{ word: 'epistemic', sentence: 'An epistemic claim.' }],
        targetLanguage: 'zh-CN',
        cefrLevel: 'C1',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const userContent = body.messages.find((m: any) => m.role === 'user').content
      expect(userContent).toContain('C1')
      expect(userContent).toContain('epistemic')
    })

    it('budgets reasoning-token headroom so reasoning models emit content, not just reasoning', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{}' } }] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const service = new OpenAICompatibleLlmService(mockConfig)
      await service.selectAndGloss({
        candidates: [{ word: 'epistemic', sentence: 'An epistemic claim.' }],
        targetLanguage: 'zh-CN',
        cefrLevel: 'C2',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      // A single candidate previously budgeted only max(64, 40)=64 tokens — exhausted by
      // reasoning before any JSON content. Now it carries reasoning headroom.
      expect(body.max_tokens).toBeGreaterThanOrEqual(1024)
    })

    it('keeps the local selection (unfamiliar:true) on parse failure so the page is not blanked', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'garbage not json' } }] }),
        }),
      )

      const service = new OpenAICompatibleLlmService(mockConfig)
      const result = await service.selectAndGloss({
        candidates: [{ word: 'foo', sentence: 'A foo.' }],
        targetLanguage: 'zh-CN',
      })

      // Malformed response → degrade to the local gate's selection (annotate), not drop.
      expect(result.foo).toEqual({ unfamiliar: true, gloss: '' })
    })
  })
})
