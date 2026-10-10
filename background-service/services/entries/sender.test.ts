import { describe, expect, it, vi } from 'vitest'
import { EntryService } from './index'
import { rememberCapture } from '../../sender'
import { ScreenshotService } from '../screenshot'
import { SystemService } from '../system'
import { ServiceManager } from '../../service-manager'

vi.stubGlobal('chrome', { runtime: { id: 'annhub-test', getURL: (path: string) => `chrome-extension://annhub-test/${path}` } })

const contentSender = { id: 'annhub-test', url: 'https://page.example/a', tab: { id: 941 }, frameId: 0 } as chrome.runtime.MessageSender
const outsideSender = { id: 'other', url: 'https://page.example/a' } as chrome.runtime.MessageSender
const sameOriginFrame = { ...contentSender, frameId: 2, tab: { id: 941, url: 'https://page.example/top' }, url: 'https://page.example/child' } as chrome.runtime.MessageSender
const crossOriginFrame = { ...sameOriginFrame, url: 'https://outside.example/child' } as chrome.runtime.MessageSender

describe('entry service sender permissions (RV-BG-02)', () => {
  const handlers = EntryService.getInstance().getMessageHandlers()

  it('rejects content scripts for library reads, export, registry and highlight changes', async () => {
    for (const type of [
      'QUERY_ENTRIES',
      'QUERY_HIGHLIGHTS',
      'QUERY_FACETS',
      'GET_ENTRY',
      'GET_ASSET_DATA_URL',
      'LIST_PROPERTIES',
      'UPSERT_PROPERTY',
      'DELETE_PROPERTY',
      'DELETE_UNUSED_PROPERTIES',
      'USAGE_ESTIMATE',
      'ORPHAN_REPORT',
      'ADD_HIGHLIGHT',
      'UPDATE_HIGHLIGHT',
      'REMOVE_HIGHLIGHT',
      'RESTORE_HIGHLIGHT',
    ]) {
      const response = await handlers[type]!({ type }, contentSender)
      expect(response.success, type).toBe(false)
      expect(response.error, type).toContain('Forbidden')
    }
  })

  it('rejects outside senders and limits content edits to the capture they just saved', async () => {
    expect((await handlers.SAVE_CLIP!({ type: 'SAVE_CLIP' }, outsideSender)).error).toContain('Forbidden')
    expect((await handlers.DELETE_ENTRY!({ type: 'DELETE_ENTRY', id: 'other-entry' }, contentSender)).error).toContain('Forbidden')
    await rememberCapture(contentSender, 'recent-entry')
    expect((await handlers.UPDATE_ENTRY!({ type: 'UPDATE_ENTRY', id: 'other-entry', patch: { note: 'x' } }, contentSender)).error).toContain('Forbidden')
    expect((await handlers.UPDATE_ENTRY!({ type: 'UPDATE_ENTRY', id: 'recent-entry', patch: { properties: { set: { secret: 'x' } } } }, contentSender)).error).toContain(
      'Forbidden',
    )
    expect((await handlers.UPDATE_ENTRY!({ type: 'UPDATE_ENTRY', id: 'recent-entry', patch: { content: 'replacement' } }, contentSender)).error).toContain('Forbidden')
  })

  it('accepts same-origin child frames only for their own recent capture', async () => {
    await rememberCapture(sameOriginFrame, 'child-entry')
    expect((await handlers.UPDATE_ENTRY!({ type: 'UPDATE_ENTRY', id: 'child-entry', patch: { content: 'wrong' } }, sameOriginFrame)).error).toContain('Forbidden')
    expect((await handlers.UPDATE_ENTRY!({ type: 'UPDATE_ENTRY', id: 'child-entry', patch: { note: 'x' } }, crossOriginFrame)).error).toContain('Forbidden')
    expect((await handlers.DELETE_ENTRY!({ type: 'DELETE_ENTRY', id: 'child-entry' }, contentSender)).error).toContain('Forbidden')
  })

  it('rejects every service handler and navigation for an outside sender', async () => {
    for (const service of [EntryService.getInstance(), ScreenshotService.getInstance(), SystemService.getInstance()]) {
      for (const [type, handler] of Object.entries(service.getMessageHandlers())) {
        const response = await handler({ type }, outsideSender)
        expect(response.success, type).toBe(false)
      }
    }
    const navigation = await ServiceManager.getInstance().dispatchMessage({ type: 'OPEN_EXTENSION_PAGE', page: 'library' } as never, outsideSender)
    expect(navigation.error).toContain('Forbidden')
  })
})
