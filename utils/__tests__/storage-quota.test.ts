import { describe, expect, it } from 'vitest'
import { quotaSatisfied } from '../storage-quota'

describe('quotaSatisfied (roadmap R1.4 — pure helper)', () => {
  it('passes when estimate is unavailable (proceed optimistically)', () => {
    expect(quotaSatisfied(null, 5_000_000)).toBe(true)
    expect(quotaSatisfied(undefined, 5_000_000)).toBe(true)
    expect(quotaSatisfied({}, 5_000_000)).toBe(true)
  })

  it('fails when remaining quota cannot hold the image with headroom', () => {
    expect(quotaSatisfied({ usage: 95, quota: 100 }, 5)).toBe(false) // 5 left < 5*1.2
    expect(quotaSatisfied({ usage: 90, quota: 100 }, 5)).toBe(true) // 10 left > 6
    expect(quotaSatisfied({ usage: 0, quota: 100 }, 80)).toBe(true) // 100 > 96
    expect(quotaSatisfied({ usage: 0, quota: 100 }, 85)).toBe(false) // 100 < 102
  })
})
