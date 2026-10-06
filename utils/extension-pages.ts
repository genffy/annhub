/**
 * The extension's own pages (extension.md §2.2): three first-level pages —
 * Fragment library, Screenshots, Settings. The highlight and clip lists are views inside the
 * Fragment library. One place owns the paths so callers never hand-write built file names.
 */
import { currentUiLanguage } from './ui-text'

export type ExtensionPage = 'library' | 'screenshots' | 'highlights' | 'clips' | 'settings'

/**
 * Params understood by the library page: `new=inspiration` opens the new-inspiration form,
 * and `export=1` starts the content export.
 */
export type ExtensionPageParams = { new?: 'inspiration'; export?: '1' }

export const EXTENSION_PAGES: readonly ExtensionPage[] = ['library', 'screenshots', 'highlights', 'clips', 'settings']

function extensionPagePath(page: ExtensionPage, params: ExtensionPageParams = {}): string {
  if (page === 'settings') return '/options.html#/settings'
  const query = new URLSearchParams(params as Record<string, string>).toString()
  const view = page === 'library' ? 'fragments' : page
  return `/library.html#${view}${query ? `?${query}` : ''}`
}

export function extensionPageUrl(page: ExtensionPage, params: ExtensionPageParams = {}): string {
  return chrome.runtime.getURL(extensionPagePath(page, params))
}

/** Opens an extension page in a new tab; usable from extension pages and the service worker. */
export function openExtensionPage(page: ExtensionPage, params: ExtensionPageParams = {}): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({ url: extensionPageUrl(page, params) })
}

/** The sample page the onboarding offers, in the interface language. */
export function samplePageUrl(): string {
  return chrome.runtime.getURL(currentUiLanguage() === 'zh' ? '/sample.html' : '/sample.en.html')
}
