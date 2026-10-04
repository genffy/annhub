/**
 * Unified fragment search / filter / sort / pagination (docs/v2/search.md).
 *
 * Shared by the Extension library page and mirrored by the Swift Query —
 * pages never copy these matching rules. Candidates are filtered in memory
 * after the store narrows by index; results must pass through this rule set
 * regardless of any cached search index.
 */
import type { FragmentKind, FragmentRecord } from './types'
import { normalizeContent } from './normalize'

export interface FragmentQueryFilters {
  search?: string
  kinds?: FragmentKind[]
  hosts?: string[]
  tags?: string[]
  /** [start, end) UTC epoch ms (search.md §2). */
  capturedFrom?: number
  capturedTo?: number
}

export interface FragmentQuery extends FragmentQueryFilters {
  limit?: number
  /** Opaque stable-sort cursor from a previous page. */
  cursor?: string
}

export interface FragmentQueryResult {
  items: FragmentRecord[]
  nextCursor?: string
  /** Count after filters + search, before pagination. */
  total: number
}

const PAGE_DEFAULT = 50
const PAGE_MAX = 200

// Field weights per search.md §3: content=5, 理解/核验/应用=4, tags=3,
// sourceTitle=2, excerpt/sourceHost/sourceUrl=1.
type WeightedField = { weight: number; text: string }

function haystack(fragment: FragmentRecord): WeightedField[] {
  const fields: WeightedField[] = [
    { weight: 5, text: fragment.content },
    { weight: 4, text: fragment.processing.guess ?? '' },
    { weight: 4, text: fragment.processing.verified.summary ?? '' },
    { weight: 4, text: fragment.processing.use },
    { weight: 3, text: fragment.tags.join(' ') },
    { weight: 2, text: fragment.context.sourceTitle ?? '' },
    { weight: 1, text: fragment.context.excerpt },
    { weight: 1, text: fragment.context.sourceHost },
    { weight: 1, text: fragment.context.sourceUrl },
  ]
  return fields.map(f => ({ weight: f.weight, text: normalizeContent(f.text) }))
}

/** Unicode-whitespace word split; each word must substring-hit some field (search.md §2). */
function splitWords(query: string): string[] {
  return normalizeContent(query).split(/\s+/).filter(Boolean)
}

function searchScore(fields: WeightedField[], words: string[]): number | null {
  let score = 0
  for (const word of words) {
    let best = 0
    for (const field of fields) {
      if (field.text.includes(word) && field.weight > best) best = field.weight
    }
    if (best === 0) return null // a word hit nothing — record excluded
    score += best
  }
  return score
}

/** Returns the search score, or null when the fragment is excluded. */
export function passesFilters(fragment: FragmentRecord, filters: FragmentQueryFilters, words: string[]): number | null {
  if (filters.kinds?.length && !filters.kinds.includes(fragment.kind)) return null
  if (filters.hosts?.length && !filters.hosts.includes(fragment.context.sourceHost)) return null
  if (filters.tags?.length && !filters.tags.some(tag => fragment.tags.includes(tag))) return null
  const capturedAt = fragment.context.capturedAt
  if (filters.capturedFrom !== undefined && capturedAt < filters.capturedFrom) return null
  if (filters.capturedTo !== undefined && capturedAt >= filters.capturedTo) return null
  if (words.length === 0) return 0
  return searchScore(haystack(fragment), words)
}

type SortKey = { score: number; createdAt: number; id: string }

const compareKeys = (a: SortKey, b: SortKey): number => b.score - a.score || b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const encodeCursor = (key: SortKey): string => JSON.stringify([key.score, key.createdAt, key.id])

export function runFragmentQuery(fragments: FragmentRecord[], query: FragmentQuery = {}): FragmentQueryResult {
  const words = splitWords(query.search ?? '')
  const limit = Math.min(Math.max(1, query.limit ?? PAGE_DEFAULT), PAGE_MAX)

  const keyed: Array<{ fragment: FragmentRecord; key: SortKey }> = []
  for (const fragment of fragments) {
    const score = passesFilters(fragment, query, words)
    if (score === null) continue
    keyed.push({ fragment, key: { score, createdAt: fragment.createdAt, id: fragment.id } })
  }
  keyed.sort((a, b) => compareKeys(a.key, b.key))

  let cursorKey: SortKey | null = null
  if (query.cursor) {
    try {
      const [score, createdAt, id] = JSON.parse(query.cursor) as [number, number, string]
      cursorKey = { score, createdAt, id }
    } catch {
      cursorKey = null
    }
  }

  const startIndex = cursorKey ? keyed.findIndex(entry => compareKeys(entry.key, cursorKey!) > 0) : 0
  const page = keyed.slice(startIndex === -1 ? keyed.length : startIndex)
  const items = page.slice(0, limit).map(entry => entry.fragment)
  const result: FragmentQueryResult = { items, total: keyed.length }
  if (items.length > 0 && page.length > items.length) {
    result.nextCursor = encodeCursor(keyed[(startIndex === -1 ? keyed.length : startIndex) + items.length - 1]!.key)
  }
  return result
}

/** Distinct filter-chip sources, frequency desc then alpha. */
export function collectHosts(fragments: FragmentRecord[]): string[] {
  return collectCounts(fragments.map(f => f.context.sourceHost))
}

export function collectTags(fragments: FragmentRecord[]): string[] {
  return collectCounts(fragments.flatMap(f => f.tags))
}

export function collectKinds(fragments: FragmentRecord[]): FragmentKind[] {
  const seen = new Set<FragmentKind>()
  for (const f of fragments) seen.add(f.kind)
  return [...seen]
}

function collectCounts(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([value]) => value)
}

export function countNewThisWeek(fragments: FragmentRecord[], now: number): number {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  return fragments.filter(f => f.createdAt >= weekAgo).length
}
