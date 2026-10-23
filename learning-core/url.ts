/**
 * Source URL cleaning — the only place token-shaped query/hash parameters
 * are stripped before a URL is recorded (docs/product/capture.md §5).
 *
 * Everything else in the URL is preserved, including section anchors used
 * by block clips. After cleaning the URL must still be an absolute http(s)
 * link (that check belongs to validation, not here).
 */

/** Parameter names (case-insensitive, trimmed) that never survive a save. */
export const TOKEN_PARAM_NAMES: readonly string[] = [
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'code',
  'session',
  'session_id',
  'sessionid',
  'auth',
  'auth_token',
  'api_key',
  'apikey',
  'secret',
  'sig',
  'signature',
  'jwt',
]

const TOKEN_NAMES = new Set(TOKEN_PARAM_NAMES.map(name => name.toLowerCase()))

function isTokenParam(rawName: string): boolean {
  return TOKEN_NAMES.has(rawName.trim().toLowerCase())
}

/**
 * Strip token-shaped segments from a raw `k=v&k2=v2` string by splicing, not
 * re-encoding: the parameters that survive keep their original spelling
 * exactly (capture.md §5 “其余保留” — `%7E` stays `%7E`, `%20` stays `%20`).
 * Returns null when nothing matched.
 */
function stripParams(query: string): string | null {
  if (!query) return null
  let removed = false
  const kept: string[] = []
  for (const segment of query.split('&')) {
    const eq = segment.indexOf('=')
    const name = eq >= 0 ? segment.slice(0, eq) : segment
    if (isTokenParam(decodeSegment(name))) {
      removed = true
      continue
    }
    kept.push(segment)
  }
  if (!removed) return null
  return kept.join('&')
}

/** Best-effort percent-decode of a segment name, only for the token-name comparison. */
function decodeSegment(name: string): string {
  try {
    return decodeURIComponent(name.replace(/\+/g, ' '))
  } catch {
    return name
  }
}

/**
 * Clean a source URL:
 * - token-shaped query parameters are removed from both the query and any
 *   query-shaped part inside the hash;
 * - hash path/anchor segments are preserved as-is;
 * - a query or hash that becomes empty loses its `?` / `#`;
 * - anything else is returned unchanged.
 */
export function cleanSourceUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }

  // the raw search, not `searchParams.toString()`: re-serializing would rewrite
  // `%20` as `+` and the like before the splice even runs
  const cleanedQuery = stripParams(url.search.startsWith('?') ? url.search.slice(1) : url.search)
  if (cleanedQuery !== null) {
    url.search = cleanedQuery
  }

  if (url.hash) {
    // '#/path?k=v' → clean the part after '?'; '#k=v&k2=v2' (no '?') is
    // treated as a query only when a token name actually matches, so plain
    // anchors like '#section' are never touched.
    const qIndex = url.hash.indexOf('?')
    if (qIndex >= 0) {
      const cleaned = stripParams(url.hash.slice(qIndex + 1))
      if (cleaned !== null) url.hash = url.hash.slice(0, qIndex + 1) + cleaned
    } else {
      const cleaned = stripParams(url.hash.slice(1))
      if (cleaned !== null) url.hash = cleaned
    }
    if (url.hash.endsWith('?')) url.hash = url.hash.slice(0, -1)
    if (url.hash === '#' || url.hash === '?') url.hash = ''
  }

  return url.href
}

/** Absolute http(s) link check used by entry validation (entry.md §6). */
export function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
