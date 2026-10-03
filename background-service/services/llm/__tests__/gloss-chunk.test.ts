import { describe, it, expect } from 'vitest'
import { OpenAICompatibleLlmService } from '../openai-compatible'
import type { LlmConfig } from '../../../../types/vocabulary'

const config: LlmConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-test',
}

function serviceWithResponse(raw: string): OpenAICompatibleLlmService {
  const service = new OpenAICompatibleLlmService(config)
  ;(service as unknown as { completeChat: () => Promise<string> }).completeChat = async () => raw
  return service
}

describe('OpenAICompatibleLlmService.glossChunk', () => {
  it('parses a structured chunk gloss into ChunkVerified-compatible fields', async () => {
    const service = serviceWithResponse(
      JSON.stringify({
        meaningEn: 'a shift toward tighter monetary policy',
        meaningCn: '转向鹰派',
        examples: ['The Fed made a hawkish pivot.'],
        collocations: ['hawkish tone'],
      }),
    )
    const gloss = await service.glossChunk({ chunk: 'hawkish pivot', sentence: 'The Fed signalled a hawkish pivot.' })
    expect(gloss.meaningEn).toBe('a shift toward tighter monetary policy')
    expect(gloss.meaningCn).toBe('转向鹰派')
    expect(gloss.examples).toEqual(['The Fed made a hawkish pivot.'])
    expect(gloss.collocations).toEqual(['hawkish tone'])
  })

  it('tolerates surrounding prose around the JSON object', async () => {
    const service = serviceWithResponse('Sure! Here is the JSON:\n{"meaningEn":"tightening bias","meaningCn":"偏紧","examples":[],"collocations":[]}')
    const gloss = await service.glossChunk({ chunk: 'x', sentence: 'y' })
    expect(gloss.meaningEn).toBe('tightening bias')
  })

  it('throws on unparseable output (no local fallback gloss exists)', async () => {
    const service = serviceWithResponse('I cannot answer that')
    await expect(service.glossChunk({ chunk: 'x', sentence: 'y' })).rejects.toThrowError(/parsed|usable/)
  })

  it('throws when neither meaning is usable', async () => {
    const service = serviceWithResponse('{"meaningEn":"","meaningCn":"","examples":[],"collocations":[]}')
    await expect(service.glossChunk({ chunk: 'x', sentence: 'y' })).rejects.toThrowError(/usable/)
  })

  it('caps examples and collocations and drops non-strings', async () => {
    const service = serviceWithResponse(
      JSON.stringify({
        meaningEn: 'ok',
        meaningCn: 'ok',
        examples: ['a', 'b', 'c', 'd', 5],
        collocations: Array.from({ length: 8 }, (_, i) => `c${i}`),
      }),
    )
    const gloss = await service.glossChunk({ chunk: 'x', sentence: 'y' })
    expect(gloss.examples).toEqual(['a', 'b', 'c'])
    expect(gloss.collocations).toHaveLength(5)
  })
})
