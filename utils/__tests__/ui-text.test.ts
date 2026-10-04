import { describe, expect, it } from 'vitest'
import { resolveUiLanguage, uiText, UI_TEXT_KEYS } from '../ui-text'

describe('ui text localization (D-11)', () => {
  it('resolves Chinese UI languages and treats everything else as English', () => {
    expect(resolveUiLanguage('zh')).toBe('zh')
    expect(resolveUiLanguage('zh-CN')).toBe('zh')
    expect(resolveUiLanguage('zh_TW')).toBe('zh')
    expect(resolveUiLanguage('en-US')).toBe('en')
    expect(resolveUiLanguage('de')).toBe('en')
  })

  it('names the entity 碎片 in Chinese and Fragment in English on every listed surface', () => {
    for (const key of [
      'menu.fragment',
      'library.searchPlaceholder',
      'library.upgrade',
      'library.convert',
      'library.convertVisual',
      'library.onboarding.title',
      'library.empty.title',
    ] as const) {
      expect(uiText(key, 'zh')).toContain('碎片')
      expect(uiText(key, 'zh')).not.toMatch(/Fragment/i)
      expect(uiText(key, 'en')).toMatch(/Fragment/)
    }
    expect(uiText('menu.fragment', 'zh')).toBe('碎片')
    expect(uiText('menu.fragment', 'en')).toBe('Fragment')
  })

  it('no Chinese UI string leaks the English entity name, and every string is filled in both languages', () => {
    for (const key of UI_TEXT_KEYS) {
      expect(uiText(key, 'zh').trim()).not.toBe('')
      expect(uiText(key, 'en').trim()).not.toBe('')
      // media-clip is the contract name of a kind, quoted verbatim in the hint.
      expect(uiText(key, 'zh').replace('media-clip', '')).not.toMatch(/Fragment/i)
    }
  })

  it('keeps the four-item menu hints in the documented “time · output · review” shape', () => {
    for (const key of ['menu.fragment.hint', 'menu.highlight.hint', 'menu.clip.hint', 'menu.screenshot.hint', 'menu.mediaClip.hint'] as const) {
      expect(uiText(key, 'zh').split(' · ').length).toBeGreaterThanOrEqual(2)
    }
    expect(uiText('menu.fragment.hint', 'zh')).toBe('理解并应用 · 约 30–90 秒 · 进入复习')
  })
})
