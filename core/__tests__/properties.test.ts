import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { DOWNLOAD_LIMITS, sanitizeTitle } from '../download'
import { normalizeText } from '../normalize'

/** Characters a downloaded file name cannot carry (download.md §4.4). */
const FORBIDDEN = '\\/:*?"<>|'

function hasForbiddenCharacter(value: string): boolean {
  return [...value].some(char => FORBIDDEN.includes(char) || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)
}

describe('file names and text normalization (property-based)', () => {
  it('sanitizeTitle always yields a usable file name', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (title, host) => {
        const name = sanitizeTitle(title, host)
        expect(name.length).toBeGreaterThan(0)
        expect([...name].length).toBeLessThanOrEqual(DOWNLOAD_LIMITS.nameMaxChars)
        expect(hasForbiddenCharacter(name)).toBe(false)
        expect(name).toBe(name.trim())
        expect(name.startsWith('.')).toBe(false)
        expect(name.endsWith('.')).toBe(false)
      }),
    )
  })

  it('normalizeText is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), value => {
        const once = normalizeText(value)
        expect(normalizeText(once)).toBe(once)
      }),
    )
  })
})
