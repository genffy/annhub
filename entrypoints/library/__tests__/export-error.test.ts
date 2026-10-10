import { describe, expect, it } from 'vitest'
import { exportFailureKey } from '../export-error'
import { uiText } from '../../../utils/ui-text'

describe('why an export made no file (extension.md §6)', () => {
  it('names the ZIP format limit the writer reports', () => {
    expect(exportFailureKey(new Error('ZIP32 limit exceeded: entry count'), 'build')).toBe('library.exportError.limit')
  })

  it('names a full disk, whichever stage hit it', () => {
    const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    expect(exportFailureKey(quota, 'build')).toBe('library.exportError.quota')
    expect(exportFailureKey(new Error('There is not enough disk space: insufficient'), 'download')).toBe('library.exportError.quota')
  })

  it('tells a refused download apart from a failed build', () => {
    expect(exportFailureKey(new Error('Invalid filename'), 'download')).toBe('library.exportError.download')
    expect(exportFailureKey(new Error('something broke'), 'build')).toBe('library.exportError.general')
    expect(exportFailureKey('not even an Error', 'build')).toBe('library.exportError.general')
  })

  it('every message says that no file was made, and none repeats the raw message', () => {
    for (const key of ['library.exportError.limit', 'library.exportError.quota', 'library.exportError.download', 'library.exportError.general'] as const) {
      expect(uiText(key, {}, 'zh')).toMatch(/没有(生成|保存)/)
      expect(uiText(key, {}, 'en')).toMatch(/no file|not saved|no file was/i)
      expect(uiText(key, {}, 'en')).not.toMatch(/[一-鿿]/)
    }
  })
})
