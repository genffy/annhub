import { currentUiLanguage } from './ui-text'

/** Marks the extension page's document language for the UI language in effect. Pages only: the service worker has no document. */
export function applyDocumentLanguage(): void {
  document.documentElement.lang = currentUiLanguage() === 'zh' ? 'zh-CN' : 'en'
}
