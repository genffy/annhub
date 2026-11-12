/**
 * Where the preferences live: chrome.storage.local, one key (storage.md §2, layer C). The schema, the
 * defaults and the validation are core/settings.ts; this file reads leniently, writes strictly and
 * serializes the writes.
 */
import { applySettings, isSettingsHost, type ExtensionSettings, type SettingsPatch } from '../core/settings'
import { SETTINGS_STORAGE_KEY } from '../core/storage-keys'
import { readLocalSettings } from '../utils/local-storage'

let pendingWrite: Promise<unknown> = Promise.resolve()
function serialized<T>(write: () => Promise<T>): Promise<T> {
  const next = pendingWrite.catch(() => undefined).then(write)
  pendingWrite = next
  return next
}

export async function readSettings(): Promise<ExtensionSettings> {
  // the one read, shared with the pages: the same validated view of layer C (RV-CAP-19 rework)
  return readLocalSettings()
}

export function writeSettings(patch: SettingsPatch): Promise<ExtensionSettings> {
  return serialized(async () => {
    const next = applySettings(await readSettings(), patch, true)
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: next })
    return next
  })
}

export function addDisabledSite(site: string): Promise<ExtensionSettings> {
  if (!isSettingsHost(site)) return Promise.reject(new Error('SETTINGS_INVALID'))
  return serialized(async () => {
    const current = await readSettings()
    const next = { ...current, blockDisabledSites: [...new Set([...current.blockDisabledSites, site])] }
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: next })
    return next
  })
}
