/**
 * Where the preferences live: chrome.storage.local, one key (storage.md §2, layer C). The schema, the
 * defaults and the validation are core/settings.ts; this file reads leniently, writes strictly and
 * serializes the writes.
 */
import { DEFAULT_SETTINGS, applySettings, isSettingsHost, type ExtensionSettings, type SettingsPatch } from '../core/settings'

const STORAGE_KEY = 'annhub.settings'

let pendingWrite: Promise<unknown> = Promise.resolve()
function serialized<T>(write: () => Promise<T>): Promise<T> {
  const next = pendingWrite.catch(() => undefined).then(write)
  pendingWrite = next
  return next
}

export async function readSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  return applySettings(DEFAULT_SETTINGS, stored[STORAGE_KEY] ?? {}, false)
}

export function writeSettings(patch: SettingsPatch): Promise<ExtensionSettings> {
  return serialized(async () => {
    const next = applySettings(await readSettings(), patch, true)
    await chrome.storage.local.set({ [STORAGE_KEY]: next })
    return next
  })
}

export function addDisabledSite(site: string): Promise<ExtensionSettings> {
  if (!isSettingsHost(site)) return Promise.reject(new Error('SETTINGS_INVALID'))
  return serialized(async () => {
    const current = await readSettings()
    const next = { ...current, blockDisabledSites: [...new Set([...current.blockDisabledSites, site])] }
    await chrome.storage.local.set({ [STORAGE_KEY]: next })
    return next
  })
}
