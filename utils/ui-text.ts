/**
 * Interface strings, Chinese and English (extension.md §2.7). The language
 * follows the browser UI language: Chinese-family languages get Chinese,
 * everything else English; there is no manual switch. Saved user content is
 * never translated.
 */

export type UiLanguage = 'zh' | 'en'

/** Chinese-family browser languages read Chinese; everyone else reads English. */
export function uiLanguageFor(browserLanguage: string | undefined): UiLanguage {
  return (browserLanguage ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function currentUiLanguage(): UiLanguage {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
    try {
      return uiLanguageFor(chrome.i18n.getUILanguage())
    } catch {
      /* fall through to navigator */
    }
  }
  return uiLanguageFor(typeof navigator !== 'undefined' ? navigator.language : undefined)
}

import { captureStrings } from './ui-text/strings-capture'
import { popupStrings } from './ui-text/strings-popup'
import { libraryStrings } from './ui-text/strings-library'
import { settingsStrings } from './ui-text/strings-settings'
import { propertyStrings } from './ui-text/strings-property'

const STRINGS = {
  ...captureStrings,
  ...popupStrings,
  ...libraryStrings,
  ...settingsStrings,
  ...propertyStrings,
} as const

export type UiTextKey = keyof typeof STRINGS

/** The reasons the user can be told, by the stable code the worker answered with (entry.md §6, screenshot.md §5). */
const ERROR_TEXT: Record<string, UiTextKey> = {
  PROPERTY_NAME_INVALID: 'property.error.name',
  PROPERTY_TYPE_MISMATCH: 'property.error.type',
  PROPERTY_VALUE_INVALID: 'property.error.value',
  PROPERTY_LIMIT_EXCEEDED: 'property.error.limit',
  PROPERTY_IN_USE: 'property.error.inUse',
  EMPTY_CONTENT: 'error.emptyContent',
  STORAGE_QUOTA_EXCEEDED: 'error.quota',
  ENTRY_ASSET_TOO_LARGE: 'error.imageTooLarge',
  ENTRY_ASSET_MISSING: 'error.imageInvalid',
  CAPTURE_NOT_VISIBLE: 'shot.error.notVisible',
  // still refused after the session waited the browser's second out
  CAPTURE_RATE_LIMITED: 'shot.error.capture',
  CAPTURE_FAILED: 'shot.error.capture',
  DOWNLOAD_FAILED: 'shot.error.downloadFailed',
}

/** Why something failed, in words — or '' for a code that has no reason worth telling (never a raw message). */
export function failureReason(code?: string, lang?: UiLanguage): string {
  const key = ERROR_TEXT[code ?? '']
  return key ? uiText(key, {}, lang) : ''
}

/** A failure to show wherever an edit or save did not go through: the reason if there is one, else "Save failed". */
export function entryErrorText(code?: string, lang?: UiLanguage): string {
  return failureReason(code, lang) || uiText('toast.saveFailed', {}, lang)
}

/** The screenshot flow's own phrasing for a failed save (it keeps the preview and says "try again"). */
export function screenshotSaveErrorText(code: string | undefined): string {
  return failureReason(code) || uiText('shot.error.saveFailed')
}

/** A failed capture, copy or download in the screenshot session. */
export function screenshotFailureText(code: string | undefined, fallback: UiTextKey): string {
  return failureReason(code) || uiText(fallback)
}

/** English plural forms that follow a count in the string table; the singular is used after “1”. */
const EN_SINGULARS: Record<string, string> = {
  entries: 'entry',
  highlights: 'highlight',
  screenshots: 'screenshot',
  clips: 'clip',
  images: 'image',
  assets: 'asset',
  saves: 'save',
  edits: 'edit',
  reopens: 'reopen',
  exports: 'export',
  properties: 'property',
}

export function uiText(key: UiTextKey, params: Record<string, string | number> = {}, lang?: UiLanguage): string {
  const entry = STRINGS[key]
  if (!entry) return key
  const language = lang ?? currentUiLanguage()
  let text: string = entry[language]
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value))
  }
  if (language === 'en') {
    // “1 entry”, “1 missing image”, “1 unreferenced asset” — the plural word
    // may sit right after the 1 or behind one modifier word
    for (const [plural, singular] of Object.entries(EN_SINGULARS)) {
      text = text.replace(new RegExp(`\\b1 ((?:[a-z\\u2019'-]+ )?)${plural}\\b`, 'g'), `1 $1${singular}`)
    }
  }
  return text
}

/** Marks the extension page's document language for the UI language in effect. */
export function applyDocumentLanguage(): void {
  document.documentElement.lang = currentUiLanguage() === 'zh' ? 'zh-CN' : 'en'
}
