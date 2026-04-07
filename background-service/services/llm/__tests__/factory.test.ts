import { describe, it, expect } from 'vitest'
import { createLlmClient } from '../factory'
import { OpenAICompatibleLlmService } from '../openai-compatible'
import type { LlmConfig } from '../../../../types/vocabulary'

describe('createLlmClient', () => {
    it('creates OpenAICompatibleLlmService for openai-compatible provider', () => {
        const config: LlmConfig = {
            provider: 'openai-compatible',
            baseUrl: 'https://api.example.com',
            apiKey: 'key',
            model: 'model',
        }
        const client = createLlmClient(config)
        expect(client).toBeInstanceOf(OpenAICompatibleLlmService)
    })

    it('throws for unsupported provider', () => {
        const config = {
            provider: 'unknown' as any,
            baseUrl: '',
            apiKey: '',
            model: '',
        }
        expect(() => createLlmClient(config)).toThrow('Unsupported LLM provider')
    })
})
