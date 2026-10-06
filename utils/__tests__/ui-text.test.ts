import { describe, expect, it } from 'vitest'
import { resolveUiLanguage, uiCount, uiText, UI_TEXT_CATALOGS, UI_TEXT_KEYS, type UiLanguage } from '../ui-text'

const LANGUAGES: UiLanguage[] = ['zh', 'en']
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort()
const raw = (key: (typeof UI_TEXT_KEYS)[number], lang: UiLanguage) => (UI_TEXT_CATALOGS as Record<string, Record<string, Record<UiLanguage, string>>>)[catalogOf(key)]![key]![lang]

function catalogOf(key: string): string {
  const name = Object.keys(UI_TEXT_CATALOGS).find(name => key in UI_TEXT_CATALOGS[name]!)
  if (!name) throw new Error(`no catalog defines ${key}`)
  return name
}

describe('ui text localization (D-11, D-14)', () => {
  it('resolves Chinese UI languages and treats everything else as English', () => {
    expect(resolveUiLanguage('zh')).toBe('zh')
    expect(resolveUiLanguage('zh-CN')).toBe('zh')
    expect(resolveUiLanguage('zh_TW')).toBe('zh')
    expect(resolveUiLanguage('en-US')).toBe('en')
    expect(resolveUiLanguage('de')).toBe('en')
  })

  it('defines every key in exactly one catalog', () => {
    const seen = new Map<string, string>()
    for (const [name, catalog] of Object.entries(UI_TEXT_CATALOGS)) {
      for (const key of Object.keys(catalog)) {
        expect(seen.get(key), `${key} is defined in both ${seen.get(key)} and ${name}`).toBeUndefined()
        seen.set(key, name)
      }
    }
    expect(seen.size).toBe(UI_TEXT_KEYS.length)
  })

  it('fills every string in both languages, with the same placeholders in each', () => {
    for (const key of UI_TEXT_KEYS) {
      for (const lang of LANGUAGES) expect(raw(key, lang).trim(), `${key} (${lang})`).not.toBe('')
      expect(placeholders(raw(key, 'en')), `placeholders of ${key}`).toEqual(placeholders(raw(key, 'zh')))
    }
  })

  it('keeps the languages apart: no Chinese in English text, no English entity name in Chinese text', () => {
    for (const key of UI_TEXT_KEYS) {
      // Full-width separators and arrows are punctuation; Han characters are the leak.
      expect(raw(key, 'en'), `${key} (en)`).not.toMatch(/\p{Script=Han}/u)
      // media-clip is the contract name of a kind; "Fragment" in zh would be the English entity name (D-11).
      expect(
        raw(key, 'zh')
          .replace(/\{\w+\}/g, '')
          .replace('media-clip', ''),
        `${key} (zh)`,
      ).not.toMatch(/Fragment/i)
    }
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
      'capture.saveToLibrary',
    ] as const) {
      expect(uiText(key, {}, 'zh')).toContain('碎片')
      expect(uiText(key, {}, 'en')).toMatch(/Fragment/)
    }
    expect(uiText('menu.fragment', {}, 'zh')).toBe('碎片')
    expect(uiText('menu.fragment', {}, 'en')).toBe('Fragment')
  })

  it('shows the documented consequence hint on every menu action (extension.md §2.1)', () => {
    const documented = [
      ['menu.fragment.hint', '理解并应用 · 约 30–90 秒'],
      ['menu.highlight.hint', '只在页面留痕，可加备注'],
      ['menu.clip.hint', '保存原文和语境，之后查阅'],
      ['menu.screenshot.hint', '框选区域或单击元素 · 先进入截图集'],
      ['menu.mediaClip.hint', '标记起止时间，手工转写 · 保存为 media-clip'],
    ] as const
    for (const [key, zh] of documented) expect(uiText(key, {}, 'zh'), key).toBe(zh)
    expect(uiText('menu.fragment.hint', {}, 'en')).toBe('Understand and apply · about 30–90 s')
  })

  it('fills parameters and leaves an unknown placeholder visible rather than guessing', () => {
    expect(uiText('capture.saved', { kind: '概念' }, 'zh')).toBe('已保存为「概念」')
    expect(uiText('capture.saved', { kind: 'Concept' }, 'en')).toBe('Saved as “Concept”')
    expect(uiText('capture.saved', {}, 'en')).toBe('Saved as “{kind}”')
  })

  it('picks the singular only for one in English, and never in Chinese', () => {
    expect(uiCount('popup.libraryCount', 1, {}, 'en')).toBe('1 Fragment')
    expect(uiCount('popup.libraryCount', 0, {}, 'en')).toBe('0 Fragments')
    expect(uiCount('popup.libraryCount', 2, {}, 'en')).toBe('2 Fragments')
    expect(uiCount('popup.libraryCount', 1, {}, 'zh')).toBe('1 条')
  })

  it('has a plural variant for every singular one', () => {
    const keys = new Set<string>(UI_TEXT_KEYS)
    for (const key of UI_TEXT_KEYS) {
      if (key.endsWith('.one')) expect(keys.has(key.replace(/\.one$/, '.other')), `${key} has no .other`).toBe(true)
      if (key.endsWith('.other')) expect(keys.has(key.replace(/\.other$/, '.one')), `${key} has no .one`).toBe(true)
    }
  })

  it('follows the browser UI language when none is passed', () => {
    const language = Object.getOwnPropertyDescriptor(globalThis.navigator, 'language')!
    try {
      Object.defineProperty(globalThis.navigator, 'language', { value: 'en-GB', configurable: true })
      expect(uiText('menu.fragment')).toBe('Fragment')
      Object.defineProperty(globalThis.navigator, 'language', { value: 'zh-TW', configurable: true })
      expect(uiText('menu.fragment')).toBe('碎片')
    } finally {
      Object.defineProperty(globalThis.navigator, 'language', language)
    }
  })
})
