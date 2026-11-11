/**
 * The keys the extension's scripts share in chrome.storage.local (storage.md §2). Both are readable
 * by content scripts, so a page answers its own questions without waking the service worker
 * (RV-CAP-19): the preferences carry no secret, and the recording flag is one boolean without page
 * information.
 */

/** The extension's preferences (layer C): one validated object, defaults in core/settings.ts. */
export const SETTINGS_STORAGE_KEY = 'annhub.settings'

/** True while a recording runs; the worker writes it, and clears it when the browser restarts. */
export const RECORDING_FLAG_KEY = 'annhub.recordingActive'

/** Reading the flag is a plain storage read: a page that finds it false never asks the worker. */
export async function readRecordingFlag(): Promise<boolean> {
  const stored = await chrome.storage.local.get(RECORDING_FLAG_KEY)
  return stored[RECORDING_FLAG_KEY] === true
}
