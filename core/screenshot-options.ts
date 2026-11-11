/**
 * The option tables of the screenshot session (docs/product/screenshot.md §1.1, §1.3, §4.4): the
 * annotation colours, the ratio presets and the beautify style. They are plain data, so the settings
 * schema (settings.ts) validates against them in the service worker, where the session's canvas code
 * cannot load; the session, the settings page and the schema read these same tables.
 */

// ── Annotation colours (screenshot.md §1.1) ──────────────────────────────

/** The five annotation colours (screenshot.md §1.1); every tool, the step badges included, draws in one of them. */
export const ANNOTATION_COLORS: ReadonlyArray<{ value: string; name: string }> = [
  { value: '#e5484d', name: 'red' },
  { value: '#f6c453', name: 'yellow' },
  { value: '#147d72', name: 'teal' },
  { value: '#ffffff', name: 'white' },
  { value: '#20252b', name: 'black' },
]

// ── Ratio presets (screenshot.md §1.3) ───────────────────────────────────

export interface RatioPreset {
  id: string
  w: number
  h: number
}

export const RATIO_PRESETS: readonly RatioPreset[] = [
  { id: '1:1', w: 1, h: 1 },
  { id: '4:5', w: 4, h: 5 },
  { id: '3:4', w: 3, h: 4 },
  { id: '4:3', w: 4, h: 3 },
  { id: '16:9', w: 16, h: 9 },
  { id: '9:16', w: 9, h: 16 },
]

export const DEFAULT_RATIO_PRESETS = ['1:1', '4:5', '3:4', '16:9']

// ── Beautify style (screenshot.md §4.4) ──────────────────────────────────

export type BeautifyBackground = 'none' | 'solid-white' | 'solid-ivory' | 'grad-purple' | 'grad-blue' | 'grad-green' | 'grad-sunset' | 'grad-slate'
export type BeautifyPadding = 'small' | 'medium' | 'large'

export interface BeautifySettings {
  enabled: boolean
  background: BeautifyBackground
  padding: BeautifyPadding
  /** CSS px: 0 / 12 / 24 */
  radius: number
  shadow: boolean
  /** output canvas ratio: free keeps content + padding */
  ratio?: string
}

export const PADDING_PX: Record<BeautifyPadding, number> = { small: 24, medium: 40, large: 64 }

/** The corner radii the panel and the settings offer, in CSS px. */
export const BEAUTIFY_RADII: readonly number[] = [0, 12, 24]

/** The style a session starts from when the settings say nothing else (extension.md §2.5: beautify off; the rest is the initial style). */
export const DEFAULT_BEAUTIFY: BeautifySettings = { enabled: false, background: 'solid-white', padding: 'medium', radius: 12, shadow: true }

/** The eight backgrounds in the order the panel and the settings page list them (screenshot.md §4.4: none, two solids, five gradients). */
export const BEAUTIFY_BACKGROUND_IDS: readonly BeautifyBackground[] = ['none', 'solid-white', 'solid-ivory', 'grad-purple', 'grad-blue', 'grad-green', 'grad-sunset', 'grad-slate']
