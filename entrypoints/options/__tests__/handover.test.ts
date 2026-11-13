import { describe, expect, it, vi } from 'vitest'
import { extensionPageUrl } from '../../../utils/extension-pages'
import { optionsHandoverPath } from '../handover'

describe('the options entry hand-over (extension.md §2.2)', () => {
  it('lands on the settings view of the application page', () => {
    expect(optionsHandoverPath('')).toBe('/library.html#/settings')
  })

  it('keeps the query string the entry was opened with', () => {
    expect(optionsHandoverPath('?recordTab=7')).toBe('/library.html?recordTab=7#/settings')
    expect(optionsHandoverPath('?recordTab=7&x=1')).toBe('/library.html?recordTab=7&x=1#/settings')
  })

  it('brings the tab the microphone route names to the page that reads it (annotate.md §2.1)', () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => `chrome-extension://test${path}` } })
    const entry = new URL(extensionPageUrl('settings', { recordTabId: 7 }))
    vi.unstubAllGlobals()
    expect(entry.pathname).toBe('/options.html')

    const settings = new URL(optionsHandoverPath(entry.search), entry)
    expect(settings.pathname).toBe('/library.html')
    expect(settings.searchParams.get('recordTab')).toBe('7')
    expect(settings.hash).toBe('#/settings')
  })
})
