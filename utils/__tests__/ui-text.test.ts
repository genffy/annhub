import { describe, expect, it } from 'vitest'
import { currentUiLanguage, uiLanguageFor, uiText } from '../ui-text'

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
})
