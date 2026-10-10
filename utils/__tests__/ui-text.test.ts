import { describe, expect, it } from 'vitest'
import { currentUiLanguage, entryErrorText, failureReason, screenshotFailureText, screenshotSaveErrorText, uiLanguageFor, uiText } from '../ui-text'

describe('ui text localization (extension.md §2.7)', () => {
  it('resolves Chinese-family UI languages and treats everything else as English', () => {
    expect(uiLanguageFor('zh')).toBe('zh')
    expect(uiLanguageFor('zh-CN')).toBe('zh')
    expect(uiLanguageFor('zh_TW')).toBe('zh')
    expect(uiLanguageFor('en-US')).toBe('en')
    expect(uiLanguageFor('de')).toBe('en')
    expect(uiLanguageFor(undefined)).toBe('en')
  })

  it('follows the navigator language in test environments', () => {
    // vitest.setup pins navigator.language to zh-CN
    expect(currentUiLanguage()).toBe('zh')
  })

  it('interpolates named parameters', () => {
    expect(uiText('library.count', { count: 3 })).toBe('共 3 条')
    expect(uiText('library.count', { count: 3 }, 'en')).toBe('3 entries')
  })

  it('answers unknown keys with the key itself rather than crashing', () => {
    expect(uiText('nosuch.key' as never)).toBe('nosuch.key')
  })

  it('keeps both languages for every key', () => {
    expect(uiText('menu.clip', {}, 'zh')).toBe('剪藏')
    expect(uiText('menu.clip', {}, 'en')).toBe('Clip')
    expect(uiText('block.mode.hint', {}, 'en')).toContain('Tab')
    expect(uiText('block.mode.hint', {}, 'zh')).toContain('区块模式')
  })

  it('maps backend error codes without exposing code strings', () => {
    expect(entryErrorText('PROPERTY_VALUE_INVALID', 'zh')).toContain('值')
    expect(entryErrorText('STORAGE_QUOTA_EXCEEDED', 'en')).toContain('Storage')
    expect(entryErrorText('UNKNOWN_PRIVATE_EXCEPTION', 'en')).toBe('Save failed')
  })

  it('tells a full disk to export first, in both languages (extension.md §6)', () => {
    expect(failureReason('STORAGE_QUOTA_EXCEEDED', 'zh')).toContain('导出')
    expect(failureReason('STORAGE_QUOTA_EXCEEDED', 'en')).toContain('Export')
    // the same words serve any write, not only screenshots
    expect(failureReason('STORAGE_QUOTA_EXCEEDED', 'en')).not.toMatch(/screenshot/i)
  })

  it('explains only the codes it knows, and says nothing for anything else', () => {
    for (const code of ['CAPTURE_NOT_VISIBLE', 'CAPTURE_FAILED', 'DOWNLOAD_FAILED', 'EMPTY_CONTENT', 'ENTRY_ASSET_TOO_LARGE', 'ENTRY_ASSET_MISSING', 'PROPERTY_IN_USE']) {
      expect(failureReason(code, 'zh'), code).not.toBe('')
      expect(failureReason(code, 'en'), code).not.toMatch(/[\u4e00-\u9fff]/)
    }
    for (const raw of [undefined, '', 'only the visible tab can be captured', 'Forbidden: extension page context required', 'fetch failed: 404']) {
      expect(failureReason(raw, 'en')).toBe('')
    }
  })

  it('the screenshot session turns a worker answer into words, never into the answer itself', () => {
    expect(screenshotFailureText('CAPTURE_NOT_VISIBLE', 'shot.error.capture')).toBe(uiText('shot.error.notVisible'))
    expect(screenshotFailureText('only the visible tab can be captured', 'shot.error.capture')).toBe(uiText('shot.error.capture'))
    expect(screenshotFailureText(undefined, 'shot.error.downloadFailed')).toBe(uiText('shot.error.downloadFailed'))
    expect(screenshotSaveErrorText('STORAGE_QUOTA_EXCEEDED')).toBe(uiText('error.quota'))
    expect(screenshotSaveErrorText('storage quota would be exceeded')).toBe(uiText('shot.error.saveFailed'))
  })
})
