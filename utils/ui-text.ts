/**
 * Localized product wording (docs/v2 D-11): the Chinese UI says 碎片, the
 * English UI says "Fragment". Every key must carry both languages, so there is
 * no fallback language. Field names, entities and code identifiers keep the
 * data-contract name `Fragment`; only user-visible text goes through here.
 */
export type UiLanguage = 'zh' | 'en'

const MESSAGES = {
  // Selection menu (extension.md §2.1)
  'menu.fragment': { zh: '碎片', en: 'Fragment' },
  'menu.highlight': { zh: '高亮', en: 'Highlight' },
  'menu.clip': { zh: '剪藏', en: 'Clip' },
  'menu.screenshot': { zh: '截图', en: 'Screenshot' },
  'menu.mediaClip': { zh: '媒体片段', en: 'Media clip' },
  // Consequence hint shown after hovering / focusing an action: time · output · enters review?
  'menu.fragment.hint': { zh: '理解并应用 · 约 30–90 秒 · 进入复习', en: 'Understand and apply · about 30–90 s · enters review' },
  'menu.highlight.hint': { zh: '只在页面留痕，可加备注 · 不进入复习', en: 'Marks the page, optional note · not reviewed' },
  'menu.clip.hint': { zh: '保存原文和语境，之后查阅 · 不进入复习', en: 'Saves text and context for later · not reviewed' },
  'menu.screenshot.hint': { zh: '框选区域或单击元素 · 先进入截图集', en: 'Select an area or click an element · goes to the screenshot library first' },
  'menu.mediaClip.hint': { zh: '标记起止时间，手工转写 · 保存为 media-clip', en: 'Mark start and end, transcribe by hand · saved as a media-clip' },
  'menu.notePlaceholder': { zh: '备注...', en: 'Note...' },
  // Clip toast (extension.md §3.3)
  'clip.saved': { zh: '已剪藏 · 不进入复习', en: 'Clipped · not reviewed' },
  'clip.undo': { zh: '撤销', en: 'Undo' },
  'clip.undone': { zh: '已撤销，这条剪藏已删除', en: 'Undone — the clip was deleted' },
  'clip.undoFailed': { zh: '撤销失败，可在碎片库的剪藏列表中删除', en: 'Undo failed — delete it from the clip list in the library' },
  'clip.failed': { zh: '剪藏失败，请重试', en: 'Clip failed, please try again' },
  // Library (extension.md §5)
  'library.searchPlaceholder': { zh: '搜索碎片…', en: 'Search Fragments…' },
  'library.onboarding.title': { zh: '高亮 ≠ 碎片', en: 'Highlight ≠ Fragment' },
  'library.onboarding.body': {
    zh: '高亮只标记页面位置；剪藏保存原文备查；只有完成「核验 + 应用」的碎片才进入复习。不想内化的内容，用高亮或剪藏就够了。',
    en: 'A highlight only marks the page; a clip saves the text for reference; only a Fragment that completes “verify + apply” enters review. For anything you do not want to internalize, a highlight or clip is enough.',
  },
  'library.empty.title': { zh: '选中网页中的一段内容，保存你的第一个知识碎片。', en: 'Select some text on a web page and save your first Fragment.' },
  'library.empty.hint': { zh: '在页面上选中文本后选择「碎片」，或', en: 'Select text on a page and choose “Fragment”, or' },
  'library.noMatch': { zh: '没有匹配的碎片。', en: 'No matching Fragments.' },
  'library.upgrade': { zh: '升级为碎片', en: 'Upgrade to Fragment' },
  'library.convert': { zh: '转为碎片', en: 'Convert to Fragment' },
  'library.convertVisual': { zh: '转为视觉碎片', en: 'Convert to a visual Fragment' },
} as const satisfies Record<string, Record<UiLanguage, string>>

export type UiTextKey = keyof typeof MESSAGES

/** `zh`, `zh-CN`, `zh_TW` → Chinese; every other tag → English. */
export function resolveUiLanguage(tag: string): UiLanguage {
  return /^zh([-_]|$)/i.test(tag) ? 'zh' : 'en'
}

/** The browser UI language (chrome.i18n), resolved once per call. */
export function currentUiLanguage(): UiLanguage {
  return resolveUiLanguage(chrome.i18n.getUILanguage())
}

export function uiText(key: UiTextKey, lang: UiLanguage = currentUiLanguage()): string {
  return MESSAGES[key][lang]
}

/** Every key, for tests that assert both languages are complete. */
export const UI_TEXT_KEYS = Object.keys(MESSAGES) as UiTextKey[]
