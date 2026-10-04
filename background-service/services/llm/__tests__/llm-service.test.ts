import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const store = new Map<string, unknown>()
;(globalThis as any).chrome = {
  runtime: { id: 'ext-id', getURL: (path: string) => `chrome-extension://ext-id/${path}` },
  storage: {
    local: {
      get: vi.fn(async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {})),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) store.set(key, value)
      }),
    },
  },
}

const completeChat = vi.fn(async () => 'OK')
const listModels = vi.fn(async () => [{ id: 'remote-model' }])
vi.mock('../factory', () => ({ createLlmClient: vi.fn(() => ({ completeChat, listModels })) }))

import { LlmService } from '../service'
import { messageHandlers } from '../message-handles'

const settingsPage = { id: 'ext-id', url: 'chrome-extension://ext-id/options.html' } as chrome.runtime.MessageSender
const contentScript = { id: 'ext-id', url: 'https://news.example/', tab: { id: 1 } } as chrome.runtime.MessageSender

const service = () => LlmService.getInstance()

describe('LlmService configuration (ai.md §5: off until the user configures it)', () => {
  beforeEach(() => {
    store.clear()
    completeChat.mockClear()
    listModels.mockClear()
  })

  it('has no endpoint, key or model by default', async () => {
    expect(await service().getLlmConfig()).toEqual({ provider: 'openai-compatible', baseUrl: '', apiKey: '', model: '' })
    expect(await service().getLlmConfigPublic()).toMatchObject({ hasApiKey: false })
  })

  it('never returns the key, only whether one is stored', async () => {
    await service().setLlmConfig({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret', model: 'm' })
    const response = await messageHandlers.GET_LLM_CONFIG!({}, settingsPage)
    expect(response.success).toBe(true)
    expect(response.data).toMatchObject({ baseUrl: 'https://api.example.com/v1', model: 'm', hasApiKey: true })
    expect(JSON.stringify(response)).not.toContain('sk-secret')
  })

  it('keeps stored fields when a save leaves them out, and an explicit empty key removes it', async () => {
    await service().setLlmConfig({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret', model: 'm' })
    await service().setLlmConfig({ model: 'm2' })
    expect(await service().getLlmConfig()).toMatchObject({ baseUrl: 'https://api.example.com/v1', model: 'm2', apiKey: 'sk-secret' })

    await service().setLlmConfig({ apiKey: '' })
    expect(await service().getLlmConfigPublic()).toMatchObject({ model: 'm2', hasApiKey: false })
  })

  it.each(['GET_LLM_CONFIG', 'SET_LLM_CONFIG', 'TEST_LLM_CONNECTION'])('%s refuses a content script', async type => {
    const response = await messageHandlers[type]!({ config: { apiKey: 'x' } }, contentScript)
    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
  })

  it('tests a connection with the stored key when the form does not retype it', async () => {
    await service().setLlmConfig({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret', model: 'm' })
    const result = await service().testLlmConnection({ model: 'other' })
    expect(result).toMatchObject({ ok: true, model: 'other', responsePreview: 'OK' })
    expect(completeChat).toHaveBeenCalledTimes(1)
  })

  it('refuses to test an incomplete configuration without calling out', async () => {
    await expect(service().testLlmConnection()).rejects.toThrow('incomplete')
    expect(completeChat).not.toHaveBeenCalled()
  })

  it('reports the models the provider lists, and still passes when it cannot list them', async () => {
    await service().setLlmConfig({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret', model: 'm' })
    expect((await service().testLlmConnection()).availableModels).toEqual([{ id: 'remote-model' }])

    listModels.mockRejectedValueOnce(new Error('no /models here'))
    const result = await service().testLlmConnection()
    expect(result).toMatchObject({ ok: true })
    expect(result.availableModels).toBeUndefined()
  })
})
