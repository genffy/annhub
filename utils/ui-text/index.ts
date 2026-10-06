/**
 * Localized product wording (docs/v2 D-11, D-14): the interface is Chinese or English, chosen by the
 * browser UI language. Every key carries both languages side by side, so there is no fallback
 * language and a missing translation cannot compile. The Chinese UI says 碎片, the English UI says
 * "Fragment"; field names, entities and identifiers keep the data-contract name `Fragment`, and
 * only user-visible text goes through here.
 *
 * Catalogs are split by surface (`./capture.ts`, `./library.ts`, …). A key is `area.name`;
 * `{name}` marks a parameter, and `.one` / `.other` variants are chosen by `uiCount`.
 */
import { capture } from './capture'
import { common } from './common'
import { detail } from './detail'
import { library } from './library'
import { media } from './media'
import { menu } from './menu'
import { popup } from './popup'
import { screenshot } from './screenshot'
import { settings } from './settings'
import type { Catalog, UiLanguage } from './define'

export type { UiLanguage } from './define'

const CATALOGS = { common, menu, capture, detail, media, library, screenshot, popup, settings } as const

/** Every message, flattened. Keys are unique across catalogs (a test enforces it). */
const MESSAGES = Object.assign({}, ...Object.values(CATALOGS)) as typeof common &
  typeof menu &
  typeof capture &
  typeof detail &
  typeof media &
  typeof library &
  typeof screenshot &
  typeof popup &
  typeof settings

export type UiTextKey = keyof typeof MESSAGES
export type UiTextParams = Record<string, string | number>

/** `zh`, `zh-CN`, `zh_TW` → Chinese; every other tag → English. */
export function resolveUiLanguage(tag: string): UiLanguage {
  return /^zh([-_]|$)/i.test(tag) ? 'zh' : 'en'
}

/** The browser UI language (chrome.i18n), resolved once per call. */
export function currentUiLanguage(): UiLanguage {
  // chrome.i18n is the browser UI language; outside an extension context (unit tests) fall back to the page language.
  const tag = typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage ? chrome.i18n.getUILanguage() : (globalThis.navigator?.language ?? 'en')
  return resolveUiLanguage(tag)
}

/** Sets the page's `lang` to the interface language, so screen readers and hyphenation follow it. */
export function applyDocumentLanguage(doc: Document = document): void {
  doc.documentElement.lang = currentUiLanguage() === 'zh' ? 'zh-CN' : 'en'
}

function fill(template: string, params: UiTextParams): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? String(params[name]) : placeholder))
}

export function uiText(key: UiTextKey, params: UiTextParams = {}, lang: UiLanguage = currentUiLanguage()): string {
  return fill((MESSAGES as Record<string, Record<UiLanguage, string>>)[key]![lang], params)
}

/** Keys that exist as `<base>.one` and `<base>.other`. */
export type UiCountKey = { [K in UiTextKey]: K extends `${infer Base}.one` ? Base : never }[UiTextKey]

/** English counts one thing differently from many; Chinese does not, and both variants say the same. */
export function uiCount(base: UiCountKey, count: number, params: UiTextParams = {}, lang: UiLanguage = currentUiLanguage()): string {
  const form = lang === 'en' && count === 1 ? 'one' : 'other'
  return uiText(`${base}.${form}` as UiTextKey, { ...params, count }, lang)
}

/** Every key, for tests that assert both languages are complete. */
export const UI_TEXT_KEYS = Object.keys(MESSAGES) as UiTextKey[]

/** The catalogs, for tests that check keys are not defined twice. */
export const UI_TEXT_CATALOGS: Record<string, Catalog> = CATALOGS
