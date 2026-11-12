import { describe, expect, it } from 'vitest'
import { RECORDING_FLAG_KEY, SETTINGS_STORAGE_KEY } from '../storage-keys'

/**
 * The two names every context reads storage.local under (storage.md §2). They are constants so
 * the reader (utils/local-storage.ts), the writer (the recording service) and the change filter
 * cannot drift apart; the reads themselves live in utils, since core/ calls no chrome.*.
 */
describe('the shared storage keys', () => {
  it('keeps the names the recording flag and the preferences travel under', () => {
    expect(SETTINGS_STORAGE_KEY).toBe('annhub.settings')
    expect(RECORDING_FLAG_KEY).toBe('annhub.recordingActive')
  })
})
