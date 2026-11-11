import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECORDING_FLAG_KEY, readRecordingFlag } from '../storage-keys'

/**
 * The recording flag is the one boolean pages read instead of waking the worker (annotate.md §3.2,
 * RV-CAP-19): reading it is a plain chrome.storage.local read, true only when the key says so.
 */

afterEach(() => vi.unstubAllGlobals())

describe('the recording flag (RV-CAP-19)', () => {
  it('is true only when the worker wrote true, and false when the key is gone', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ [RECORDING_FLAG_KEY]: true }) } } })
    expect(await readRecordingFlag()).toBe(true)
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}) } } })
    expect(await readRecordingFlag()).toBe(false)
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ [RECORDING_FLAG_KEY]: 'yes' }) } } })
    expect(await readRecordingFlag()).toBe(false)
  })
})
