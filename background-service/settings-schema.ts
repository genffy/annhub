/**
 * Preference layer C (storage.md §2): interface and capture preferences in
 * chrome.storage. Entries and images live in IndexedDB and never here.
 */
import type { HighlightColor } from '../learning-core/types'
import { DEFAULT_RATIO_PRESETS } from '../entrypoints/content/screenshot/output'

export interface ExtensionSettings {
  /** Block-clip hover entry: default on, globally switchable (capture.md §6.2). */
  blockEntryEnabled: boolean
  /** Hosts where the hover entry is disabled from the capsule's "更多" menu. */
  blockDisabledSites: string[]
  /** DOM anonymization at the start of a screenshot session (screenshot.md §3). */
  anonymizeDefault: boolean
  /** Default highlight color for new marks in the reading view (entry.md §4.3). */
  defaultHighlightColor: HighlightColor
  /** Screenshot download format + quality (screenshot.md §4.2; R2). */
  downloadFormat: 'png' | 'jpeg' | 'webp'
  downloadQuality: number
  /** Brand watermark on copy/download only (screenshot.md §4.3; R2). */
  watermark: {
    enabled: boolean
    text: string
    image?: string
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    size: 'small' | 'medium' | 'large'
    opacity: number
  }
  /** Ratio presets shown on the selection bar (screenshot.md §1.3; R2). */
  ratioPresets: string[]
  /** Beautify defaults for copy/download (screenshot.md §4.4; R2). */
  beautify: {
    enabled: boolean
    background: 'none' | 'solid-white' | 'solid-ivory' | 'grad-purple' | 'grad-blue' | 'grad-green' | 'grad-sunset' | 'grad-slate'
    padding: 'small' | 'medium' | 'large'
    radius: number
    shadow: boolean
  }
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  blockEntryEnabled: true,
  blockDisabledSites: [],
  anonymizeDefault: true,
  defaultHighlightColor: 'yellow',
  downloadFormat: 'png',
  downloadQuality: 0.9,
  watermark: {
    enabled: false,
    text: '',
    position: 'bottom-right',
    size: 'medium',
    opacity: 0.7,
  },
  ratioPresets: [...DEFAULT_RATIO_PRESETS],
  beautify: {
    enabled: false,
    background: 'solid-white',
    padding: 'medium',
    radius: 12,
    shadow: true,
  },
}

const STORAGE_KEY = 'annhub.settings'

export async function readSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const partial = (stored[STORAGE_KEY] ?? {}) as Partial<ExtensionSettings>
  // nested groups merge over their defaults so an older partial never drops keys
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    watermark: { ...DEFAULT_SETTINGS.watermark, ...(partial.watermark ?? {}) },
    beautify: { ...DEFAULT_SETTINGS.beautify, ...(partial.beautify ?? {}) },
  }
}

export async function writeSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await readSettings()), ...patch }
  await chrome.storage.local.set({ [STORAGE_KEY]: next })
  return next
}
