import { ILlmClient } from './types'
import { LlmConfig } from '../../../types/vocabulary'
import { OpenAICompatibleLlmService } from './openai-compatible'

export function createLlmClient(config: LlmConfig): ILlmClient {
    switch (config.provider) {
        case 'openai-compatible':
            return new OpenAICompatibleLlmService(config)
        default:
            throw new Error(`Unsupported LLM provider: ${config.provider}`)
    }
}
