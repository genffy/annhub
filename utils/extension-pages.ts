/**
 * The extension's own pages (extension.md §2.2). One place owns the paths so
 * callers never hand-write built file names.
 */
export type ExtensionPage = 'library' | 'settings'

export const EXTENSION_PAGES: readonly ExtensionPage[] = ['library', 'settings']

export type ExtensionPageParams = { entryId?: string }

function extensionPagePath(page: ExtensionPage, params: ExtensionPageParams = {}): string {
  if (page === 'settings') return '/options.html'
  return params.entryId ? `/library.html#/entry/${encodeURIComponent(params.entryId)}` : '/library.html#/all'
}

export function extensionPageUrl(page: ExtensionPage, params: ExtensionPageParams = {}): string {
  return chrome.runtime.getURL(extensionPagePath(page, params))
}

/** Opens an extension page in a new tab; usable from extension pages and the service worker. */
export function openExtensionPage(page: ExtensionPage, params: ExtensionPageParams = {}): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({ url: extensionPageUrl(page, params) })
}
