/**
 * Preference layer C (storage.md §2): interface and capture preferences in
 * chrome.storage. Entries and images live in IndexedDB and never here.
 */
import type { HighlightColor } from '../learning-core/types'

export interface ExtensionSettings {
  /** Block-clip hover entry: default on, globally switchable (capture.md §6.2). */
  blockEntryEnabled: boolean
  /** Hosts where the hover entry is disabled from the capsule's "更多" menu. */
  blockDisabledSites: string[]
  /** DOM anonymization at the start of a screenshot session (screenshot.md §3). */
  anonymizeDefault: boolean
  /** Default highlight color for new marks in the reading view (entry.md §4.3). */
  defaultHighlightColor: HighlightColor
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  blockEntryEnabled: true,
  blockDisabledSites: [],
  anonymizeDefault: true,
  defaultHighlightColor: 'yellow',
}

const STORAGE_KEY = 'annhub.settings'

export async function readSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const partial = (stored[STORAGE_KEY] ?? {}) as Partial<ExtensionSettings>
  return { ...DEFAULT_SETTINGS, ...partial }
}

export async function writeSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await readSettings()), ...patch }
  await chrome.storage.local.set({ [STORAGE_KEY]: next })
  return next
}
