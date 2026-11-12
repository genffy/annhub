import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECORDING_FLAG_KEY } from '../../core/storage-keys'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { readLocalSettings, readRecordingFlag } from '../local-storage'

/**
 * The storage reads that let a page answer its own questions without waking the worker
 * (annotate.md §3.2, RV-CAP-19). The flag is true only when the worker wrote true.
 */

afterEach(() => vi.unstubAllGlobals())

describe('local storage reads outside the worker (RV-CAP-19)', () => {
  it('the flag is true only when the worker wrote true, and false when the key is gone', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ [RECORDING_FLAG_KEY]: true }) } } })
    expect(await readRecordingFlag()).toBe(true)
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}) } } })
    expect(await readRecordingFlag()).toBe(false)
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ [RECORDING_FLAG_KEY]: 'yes' }) } } })
    expect(await readRecordingFlag()).toBe(false)
  })

  it('the preferences come back validated with their defaults filled', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}) } } })
    const settings = await readLocalSettings()
    expect(settings.blockEntryEnabled).toBe(DEFAULT_SETTINGS.blockEntryEnabled)
    expect(Array.isArray(settings.blockDisabledSites)).toBe(true)
  })
})
