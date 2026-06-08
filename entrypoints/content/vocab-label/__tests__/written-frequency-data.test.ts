import { describe, it, expect } from 'vitest'
import { isWrittenHighFrequencyWord, __testing } from '../written-frequency-data'

describe('written-frequency-data — written/academic high-frequency baseline (S3)', () => {
  it('treats academic connectives the subtitle corpus under-counts as known', () => {
    // These rank as "rare" (band 4-6) in OpenSubtitles but are written-register staples.
    expect(isWrittenHighFrequencyWord('furthermore')).toBe(true)
    expect(isWrittenHighFrequencyWord('whereas')).toBe(true)
    expect(isWrittenHighFrequencyWord('nonetheless')).toBe(true)
    expect(isWrittenHighFrequencyWord('thereby')).toBe(true)
    expect(isWrittenHighFrequencyWord('albeit')).toBe(true)
  })

  it('treats academic methodology vocabulary as known', () => {
    expect(isWrittenHighFrequencyWord('paradigm')).toBe(true)
    expect(isWrittenHighFrequencyWord('methodology')).toBe(true)
    expect(isWrittenHighFrequencyWord('empirical')).toBe(true)
    expect(isWrittenHighFrequencyWord('hypothesis')).toBe(true)
    expect(isWrittenHighFrequencyWord('framework')).toBe(true)
  })

  it('does NOT include genuinely hard academic words (so they still get annotated)', () => {
    // Deliberately excluded — these are the kind of real unknowns the gate should surface.
    expect(isWrittenHighFrequencyWord('epistemic')).toBe(false)
    expect(isWrittenHighFrequencyWord('perfunctory')).toBe(false)
    expect(isWrittenHighFrequencyWord('ubiquitous')).toBe(false)
  })

  it('returns false for empty and unrelated words', () => {
    expect(isWrittenHighFrequencyWord('')).toBe(false)
    expect(isWrittenHighFrequencyWord('banana')).toBe(false)
    expect(isWrittenHighFrequencyWord('gonna')).toBe(false)
  })

  it('is a non-trivial, deduplicated set', () => {
    expect(__testing.size).toBeGreaterThan(100)
  })
})
