/**
 * When the site may load its analytics script (docs/v2/permissions.md §8). Pure functions over the country Cloudflare
 * gives the visitor's IP address, the stored choice and the Global Privacy Control signal, so the rules are tested
 * without a page or a proxy.
 */

export type ConsentChoice = 'granted' | 'denied'

/** What the page does with analytics: load the script, ask first, or leave it off. */
export type AnalyticsState = 'load' | 'ask' | 'off'

/** The localStorage key. Its value is the choice and the day it was made, nothing that identifies the visitor. */
export const CONSENT_KEY = 'annhub:analytics-consent'

/** The window event the footer's "Analytics settings" button sends to open the consent card. */
export const OPEN_CONSENT_EVENT = 'annhub:analytics-settings'

/** "Allow" is asked again after this many days; "Don't allow" stands until the visitor changes it. */
export const GRANT_DAYS = 365

/**
 * The session cookie the proxy sets for a visitor outside the asked countries, so the static page knows it may count
 * without asking. It holds no country. A visitor in an asked country never gets it: no cookie means "ask first".
 */
export const REGION_COOKIE = 'annhub-region'
export const REGION_OUTSIDE = 'outside'

/**
 * Countries whose visitors are asked first, as ISO 3166-1 alpha-2 codes like Cloudflare's CF-IPCountry header: the EU,
 * the rest of the EEA, the United Kingdom and Switzerland; the EU's regions that have a code of their own; and `EU`,
 * which some address ranges are given when only the continent is known.
 */
const ASKED_COUNTRIES = new Set([
  ...['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'],
  ...['IS', 'LI', 'NO', 'GB', 'CH'],
  // Åland, French Guiana, Guadeloupe, Martinique, Mayotte, Réunion, Saint-Martin
  ...['AX', 'GF', 'GP', 'MQ', 'YT', 'RE', 'MF'],
  'EU',
])

/**
 * Whether a visitor is asked before analytics loads, from the country Cloudflare gives their IP address. A country
 * nobody knows is asked too: no header (the site reached without the proxy, or run locally), `XX` (no data), `T1` (Tor).
 */
export function asksFirst(country: string | null | undefined): boolean {
  const code = country?.trim().toUpperCase() ?? ''
  return !/^[A-Z]{2}$/.test(code) || code === 'XX' || ASKED_COUNTRIES.has(code)
}

/** What the proxy does with the region cookie, given the visitor's country and the cookie the request carries. */
export function regionCookie(country: string | null | undefined, current: string | undefined): 'set' | 'delete' | 'keep' {
  if (asksFirst(country)) return current === undefined ? 'keep' : 'delete'
  return current === REGION_OUTSIDE ? 'keep' : 'set'
}

/** Whether the page asks first, from `document.cookie`: only the proxy's mark lets it count without asking. */
export function asksFromCookies(cookies: string): boolean {
  return !cookies.split(';').some(pair => pair.trim() === `${REGION_COOKIE}=${REGION_OUTSIDE}`)
}

/** The stored choice if it still stands on `today` (YYYY-MM-DD); anything unreadable counts as no choice. */
export function readChoice(raw: string | null, today: string): ConsentChoice | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { choice, date } = value as { choice?: unknown; date?: unknown }
  if (choice === 'denied') return 'denied'
  if (choice !== 'granted' || typeof date !== 'string') return null
  const age = daysBetween(date, today)
  return age !== null && age >= 0 && age < GRANT_DAYS ? 'granted' : null
}

/** The value to store for a choice made on `today`. */
export function storedChoice(choice: ConsentChoice, today: string): string {
  return JSON.stringify({ choice, date: today })
}

/**
 * The visitor's own choice wins. Without one, the Global Privacy Control signal means no analytics, a visitor who is
 * asked first gets the card, and anyone else is counted.
 */
export function analyticsState({ choice, asks, gpc }: { choice: ConsentChoice | null; asks: boolean; gpc: boolean }): AnalyticsState {
  if (choice === 'granted') return 'load'
  if (choice === 'denied' || gpc) return 'off'
  return asks ? 'ask' : 'load'
}

function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null
  return Math.round((end - start) / 86_400_000)
}
