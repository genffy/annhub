import { describe, expect, it, vi } from 'vitest'
import { ServiceManager, type MessageHandlers, type IService } from './service-manager'
import type { EntryRecord } from '../core/types'

describe('save request idempotency (RV-BG-10)', () => {
  it('shares one in-flight save for concurrent retries from the same sender', async () => {
    const save = vi.fn<NonNullable<MessageHandlers['SAVE_CLIP']>>(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return { type: 'RESPONSE', success: true, data: { entry: { id: 'ent_once' } as EntryRecord } }
    })
    const service: IService = {
      name: 'entries',
      initialize: async () => undefined,
      isInitialized: () => true,
      getMessageHandlers: () => ({ SAVE_CLIP: save }),
    }
    const manager = ServiceManager.getInstance()
    manager.registerService(service)
    const sender = { id: 'annhub-test', tab: { id: 18 }, frameId: 0, url: 'https://page.example/a' } as chrome.runtime.MessageSender
    const message = { type: 'SAVE_CLIP', requestId: 'retry-once' }
    const [first, second] = await Promise.all([manager.dispatchMessage(message, sender), manager.dispatchMessage(message, sender)])
    expect(save).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })
})
