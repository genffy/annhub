/**
 * chrome.storage.local reads for the scripts outside the worker (annotate.md §3.2, RV-CAP-19):
 * a page answers its own questions — is a recording running, what do the block preferences say —
 * without waking the service worker. The names come from core/storage-keys.ts and the
 * preferences' validation from core/settings.ts; the reads themselves live here because
 * core/ calls no chrome.* (core/AGENTS.md).
 */
import { applySettings, DEFAULT_SETTINGS, type ExtensionSettings } from '../core/settings'
import { RECORDING_FLAG_KEY, SETTINGS_STORAGE_KEY } from '../core/storage-keys'

/** True while a recording runs: a page that finds it false never asks the worker. */
export async function readRecordingFlag(): Promise<boolean> {
  const stored = await chrome.storage.local.get(RECORDING_FLAG_KEY)
  return stored[RECORDING_FLAG_KEY] === true
}

/** The preferences as they are stored — validated, defaults filled: the same read the worker does. */
export async function readLocalSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
  return applySettings(DEFAULT_SETTINGS, stored[SETTINGS_STORAGE_KEY] ?? {}, false)
}
