import { describe, expect, it, vi } from 'vitest'
import { extensionPageUrl } from '../extension-pages'

describe('extension page deep links', () => {
  it('opens the requested entry in its drawer', () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => `chrome-extension://test${path}` } })
    expect(extensionPageUrl('library', { entryId: 'ent_123' })).toBe('chrome-extension://test/library.html#/entry/ent_123')
    vi.unstubAllGlobals()
  })
})
