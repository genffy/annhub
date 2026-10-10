import { describe, expect, it } from 'vitest'
import { formatBytes } from '../format-bytes'

describe('formatBytes', () => {
  it('picks the unit by size', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1_023)).toBe('1023 B')
    expect(formatBytes(2_048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB')
  })
})
