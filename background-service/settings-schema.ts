/**
 * Preference layer C (storage.md §2): interface and capture preferences in
 * chrome.storage. Entries and images live in IndexedDB and never here.
 */
import { HIGHLIGHT_COLORS, type HighlightColor } from '../learning-core/types'
import {
  BEAUTIFY_BACKGROUND_IDS,
  BEAUTIFY_RADII,
  DEFAULT_BEAUTIFY,
  DEFAULT_RATIO_PRESETS,
  PADDING_PX,
  RATIO_PRESETS,
  type BeautifyBackground,
  type BeautifyPadding,
} from '../entrypoints/content/screenshot/output'

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
    background: BeautifyBackground
    padding: BeautifyPadding
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
    enabled: DEFAULT_BEAUTIFY.enabled,
    background: DEFAULT_BEAUTIFY.background,
    padding: DEFAULT_BEAUTIFY.padding,
    radius: DEFAULT_BEAUTIFY.radius,
    shadow: DEFAULT_BEAUTIFY.shadow,
  },
}

const STORAGE_KEY = 'annhub.settings'
export type SettingsPatch = Partial<Omit<ExtensionSettings, 'watermark' | 'beautify'>> & {
  watermark?: Partial<Omit<ExtensionSettings['watermark'], 'image'>> & { image?: string | null }
  beautify?: Partial<ExtensionSettings['beautify']>
}

type Check = (value: unknown) => boolean
const boolean: Check = value => typeof value === 'boolean'
const string: Check = value => typeof value === 'string'
const oneOf =
  (choices: readonly unknown[]): Check =>
  value =>
    choices.includes(value)
const between =
  (min: number, max: number): Check =>
  value =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const host = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 253 &&
  /^[a-z0-9.-]+$/.test(value) &&
  value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
const pngWatermark: Check = value => {
  if (value === undefined) return true
  if (typeof value !== 'string') return false
  const base64 = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)?.[1]
  if (!base64 || base64.length > 700_000) return false
  try {
    const binary = atob(base64)
    return binary.length <= 512 * 1024 && binary.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => binary.charCodeAt(index) === byte)
  } catch {
    return false
  }
}

const rootChecks: Record<string, Check> = {
  blockEntryEnabled: boolean,
  blockDisabledSites: value => Array.isArray(value) && value.every(host),
  anonymizeDefault: boolean,
  defaultHighlightColor: oneOf(HIGHLIGHT_COLORS),
  downloadFormat: oneOf(['png', 'jpeg', 'webp']),
  downloadQuality: between(0.5, 1),
  ratioPresets: value => Array.isArray(value) && value.every(item => RATIO_PRESETS.some(preset => preset.id === item)),
}
const watermarkChecks: Record<string, Check> = {
  enabled: boolean,
  text: value => string(value) && (value as string).length <= 40 && !/[\r\n]/.test(value as string),
  image: value => value === null || pngWatermark(value),
  position: oneOf(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
  size: oneOf(['small', 'medium', 'large']),
  opacity: between(0.2, 1),
}
const beautifyChecks: Record<string, Check> = {
  enabled: boolean,
  background: oneOf(BEAUTIFY_BACKGROUND_IDS),
  padding: oneOf(Object.keys(PADDING_PX)),
  radius: oneOf(BEAUTIFY_RADII),
  shadow: boolean,
}

function applyFields<T extends object>(base: T, input: unknown, checks: Record<string, Check>, strict: boolean): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (strict) throw new Error('SETTINGS_INVALID')
    return base
  }
  const next = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(input)) {
    const check = checks[key]
    if (!check) continue
    if (!check(value)) {
      if (strict) throw new Error('SETTINGS_INVALID')
      continue
    }
    next[key] = key === 'image' && value === null ? undefined : value
  }
  return next as T
}

function applySettings(base: ExtensionSettings, input: unknown, strict: boolean): ExtensionSettings {
  const root = applyFields(base, input, rootChecks, strict)
  const patch = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  return {
    ...root,
    watermark: patch.watermark === undefined ? { ...base.watermark } : applyFields(base.watermark, patch.watermark, watermarkChecks, strict),
    beautify: patch.beautify === undefined ? { ...base.beautify } : applyFields(base.beautify, patch.beautify, beautifyChecks, strict),
  }
}

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
  if (!host(site)) return Promise.reject(new Error('SETTINGS_INVALID'))
  return serialized(async () => {
    const current = await readSettings()
    const next = { ...current, blockDisabledSites: [...new Set([...current.blockDisabledSites, site])] }
    await chrome.storage.local.set({ [STORAGE_KEY]: next })
    return next
  })
}
