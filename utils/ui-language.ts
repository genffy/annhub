/**
 * The interface language, on its own because the service worker needs it without any string
 * table (RV-CAP-17): the language follows the browser UI language — Chinese-family languages
 * get Chinese, everything else English; there is no manual switch (extension.md §2.7).
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
