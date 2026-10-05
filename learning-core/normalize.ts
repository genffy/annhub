/**
 * Normalization rules — implemented exactly once and shared by every capture
 * entry point (target contract: docs/v2/fragments.md).
 *
 * Order matters and must not be changed:
 *   NFKC first, trailing punctuation trim last.
 */
import type { FragmentRecord } from './types'

export function normalizeContent(raw: string): string {
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

export function normalizeHost(url: string): string {
  const host = new URL(url).hostname.toLowerCase()
  // Only 'www.' is stripped — mobile.twitter.com vs twitter.com are
  // intentionally different hosts (site rules may differ).
  return host.startsWith('www.') ? host.slice(4) : host
}

/**
 * Dedupe key for "same fragment captured again in the same context".
 * The separator must be \u0000 (never a space or '|' — both can occur inside
 * content/excerpt and would collide). Write the escape sequence, not a raw byte.
 *
 * File imports do NOT use this key — they dedupe by stable id instead.
 */
export function dedupeKeyOf(content: string, sourceUrl: string, excerpt: string): string {
  return [normalizeContent(content), sourceUrl, normalizeContent(excerpt)].join('\u0000')
}

export function dedupeKey(f: Pick<FragmentRecord, 'normalizedContent' | 'context'>): string {
  return dedupeKeyOf(f.normalizedContent, f.context.sourceUrl, f.context.excerpt)
}

/** Lowercase, trim, drop empties and duplicates, cap at 20 entries. */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
    if (result.length >= 20) break
  }
  return result
}
