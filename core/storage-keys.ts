/**
 * The names the extension's scripts share in chrome.storage.local (storage.md §2). Pure strings:
 * core/ depends on no chrome.* (core/AGENTS.md), so the reads live in utils/local-storage.ts and
 * the writes in the recording service and settings-storage.
 */

/** The extension's preferences (layer C): one validated object, defaults in core/settings.ts. */
export const SETTINGS_STORAGE_KEY = 'annhub.settings'

/** True while a recording runs; the worker writes it, and clears it when the browser restarts. */
export const RECORDING_FLAG_KEY = 'annhub.recordingActive'
