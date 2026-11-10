/**
 * Interface strings, Chinese and English (extension.md §2.7). This module owns the machinery
 * only — every table lives in `utils/ui-text/`, and each entry point bundles exactly the tables
 * its own words come from (RV-CAP-17): `createTextKit` types a kit's keys as the union of the
 * tables it was given, so a key from a table the entry does not carry is a compile error, not a
 * string shown to the user. Saved user content is never translated.
 */
import { currentUiLanguage, type UiLanguage } from './ui-language'

/** One string table: every key has a Chinese and an English line. */
export type StringTable = Readonly<Record<string, { zh: string; en: string }>>

export type UiText<T extends StringTable> = (key: keyof T & string, params?: Record<string, string | number>, lang?: UiLanguage) => string

/** The reasons the user can be told, by the stable code the worker answered with (entry.md §6, screenshot.md §5). */
export const FAILURE_TEXT_KEYS = {
  PROPERTY_NAME_INVALID: 'property.error.name',
  PROPERTY_TYPE_MISMATCH: 'property.error.type',
  PROPERTY_VALUE_INVALID: 'property.error.value',
  PROPERTY_LIMIT_EXCEEDED: 'property.error.limit',
  PROPERTY_IN_USE: 'property.error.inUse',
  EMPTY_CONTENT: 'error.emptyContent',
  STORAGE_QUOTA_EXCEEDED: 'error.quota',
  ENTRY_ASSET_TOO_LARGE: 'error.imageTooLarge',
  ENTRY_ASSET_MISSING: 'error.imageInvalid',
  CAPTURE_NOT_VISIBLE: 'shot.error.notVisible',
  // still refused after the session waited the browser's second out
  CAPTURE_RATE_LIMITED: 'shot.error.capture',
  CAPTURE_FAILED: 'shot.error.capture',
  DOWNLOAD_FAILED: 'shot.error.downloadFailed',
  EXTENSION_CONTEXT_INVALIDATED: 'toast.extensionReloaded',
} as const

/** The tables a kit must cover: every mapped reason plus the two fallback lines. */
export type FailureTextKey = (typeof FAILURE_TEXT_KEYS)[keyof typeof FAILURE_TEXT_KEYS] | 'toast.saveFailed' | 'shot.error.saveFailed'

/** English plural forms that follow a count in the string table; the singular is used after “1”. */
const EN_SINGULARS: Record<string, string> = {
  entries: 'entry',
  highlights: 'highlight',
  screenshots: 'screenshot',
  clips: 'clip',
  images: 'image',
  assets: 'asset',
  saves: 'save',
  edits: 'edit',
  reopens: 'reopen',
  exports: 'export',
  properties: 'property',
}

function render<T extends StringTable>(table: T, key: keyof T & string, params: Record<string, string | number>, language: UiLanguage): string {
  const entry = table[key]
  if (!entry) return key
  let text: string = entry[language]
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value))
  }
  if (language === 'en') {
    // “1 entry”, “1 missing image”, “1 unreferenced asset” — the plural word
    // may sit right after the 1 or behind one modifier word
    for (const [plural, singular] of Object.entries(EN_SINGULARS)) {
      text = text.replace(new RegExp(`\\b1 ((?:[a-z\\u2019'-]+ )?)${plural}\\b`, 'g'), `1 $1${singular}`)
    }
  }
  return text
}

/** An entry's `uiText`: its own tables' keys, nothing else's. */
export function createUiText<T extends StringTable>(table: T): UiText<T> {
  return (key, params = {}, lang?) => render(table, key, params, lang ?? currentUiLanguage())
}

/** The failure helpers an entry that shows save errors works with. */
export interface FailureHelpers<T extends StringTable> {
  /** Why something failed, in words — or '' for a code that has no reason worth telling (never a raw message). */
  failureReason: (code?: string, lang?: UiLanguage) => string
  /** A failure to show wherever an edit or save did not go through: the reason if there is one, else "Save failed". */
  entryErrorText: (code?: string, lang?: UiLanguage) => string
  /** The screenshot flow's own phrasing for a failed save (it keeps the preview and says "try again"). */
  screenshotSaveErrorText: (code: string | undefined) => string
  /** A failed capture, copy or download in the screenshot session. */
  screenshotFailureText: (code: string | undefined, fallback: keyof T & string) => string
}

/**
 * Builds the failure helpers on a table that carries every mapped reason and fallback. The
 * constraint is the compile-time half of RV-CAP-17: whoever calls this with tables that miss a
 * failure reason or a fallback line does not build. Entries that never word a failure (the
 * popup) simply stay with their plain `createUiText`.
 */
export function createFailureHelpers<T extends StringTable & Record<FailureTextKey, { zh: string; en: string }>>(table: T): FailureHelpers<T> {
  const uiText = createUiText(table)
  const failureReason = (code?: string, lang?: UiLanguage): string => {
    const key = (FAILURE_TEXT_KEYS as Record<string, (keyof T & string) | undefined>)[code ?? '']
    return key !== undefined && key in table ? render(table, key, {}, lang ?? currentUiLanguage()) : ''
  }
  return {
    failureReason,
    entryErrorText: (code, lang) => failureReason(code, lang) || uiText('toast.saveFailed', {}, lang),
    screenshotSaveErrorText: code => failureReason(code) || uiText('shot.error.saveFailed'),
    screenshotFailureText: (code, fallback) => failureReason(code) || uiText(fallback),
  }
}
