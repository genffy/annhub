/**
 * Shared normalization — implemented exactly once and used by validation,
 * search matching and context comparison (docs/v2/entry.md §6).
 *
 * Order matters and must not be changed: NFKC first, surrounding
 * punctuation trim last.
 */

/**
 * NFKC → lowercase → unified quotes and dashes → collapsed whitespace →
 * surrounding whitespace/punctuation trimmed.
 */
export function normalizeText(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
    .trim()
}

/** True when the string holds nothing but whitespace (any Unicode). */
export function isBlankText(raw: string): boolean {
  return raw.trim().length === 0
}

/** Source host: lowercase, `www.` stripped — nothing else (mobile.twitter.com ≠ twitter.com). */
export function normalizeHost(url: string): string {
  const host = new URL(url).hostname.toLowerCase()
  return host.startsWith('www.') ? host.slice(4) : host
}

/**
 * Normalized containment check used to guarantee `context` really contains
 * the clip's plain text (entry.md §6).
 */
export function normalizedContains(haystack: string, needle: string): boolean {
  const h = normalizeText(haystack)
  const n = normalizeText(needle)
  if (!n) return true
  return h.includes(n)
}
