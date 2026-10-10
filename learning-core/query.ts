/**
 * Entry search / filter / sort / pagination — docs/v2/search.md.
 *
 * Pure functions over the loaded entries; the store may narrow candidates
 * by index first, but results must always pass through these rules. Pages
 * never copy the matching rules.
 */
import { markdownToPlainText } from './markdown'
import { normalizeText } from './normalize'
import { propertyStorageKey } from './properties'
import type { EntryRecord, Highlight, HighlightColor, PropertyType } from './types'

// ── Query shape ─────────────────────────────────────────────────────────

export type TextOp = 'contains' | 'equals'
export type NumberOp = 'eq' | 'gt' | 'lt' | 'between'
export type ListOp = 'has'
export type BoolOp = 'is'
export type RangeOp = 'between'

export interface PropertyCondition {
  name: string
  op: TextOp | NumberOp | ListOp | BoolOp | RangeOp
  value: unknown
  /** `between` needs a second bound. */
  value2?: unknown
}

export interface EntryQueryFilters {
  /** Only meaningful in the All view (search.md §3). */
  types?: ('clip' | 'screenshot')[]
  hosts?: string[]
  tags?: string[]
  /** [start, end) UTC epoch ms. */
  createdFrom?: number
  createdTo?: number
  conditions?: PropertyCondition[]
}

export interface EntryQuery extends EntryQueryFilters {
  search?: string
  limit?: number
  /** Opaque stable-sort cursor from a previous page. */
  cursor?: string
}

export interface EntryQueryResult {
  items: EntryRecord[]
  nextCursor?: string
  /** After filters + search, before pagination. */
  total: number
}

export const PAGE_DEFAULT = 50

// ── Field extraction with weights (search.md §1, §4) ────────────────────

interface WeightedField {
  weight: number
  text: string
}

/**
 * Bumped when the derived documents change shape, so a library built by an older build rebuilds them
 * instead of trusting them.
 */
export const SEARCH_INDEX_VERSION = 1

export interface NormalizedField {
  weight: number
  normalized: string
}

/** What every list, filter, facet and highlight query reads: the entry without its long text. */
export interface IndexedSummary {
  id: string
  updatedAt: number
  version: number
  summary: EntryRecord
}

/** What a text search matches against: the normalized, weighted fields — about as large as the library's text. */
export interface IndexedText {
  id: string
  fields: NormalizedField[]
}

/** Both halves together, for callers that want the whole derived document. */
export type IndexedSearchDocument = IndexedSummary & IndexedText

export function indexedSummary(entry: EntryRecord): IndexedSummary {
  return {
    id: entry.id,
    updatedAt: entry.updatedAt,
    version: SEARCH_INDEX_VERSION,
    summary: { ...entry, content: '', context: undefined, note: undefined },
  }
}

export function indexedText(entry: EntryRecord, registry: { name: string; type: PropertyType }[]): IndexedText {
  const registryByKey = new Map(registry.map(def => [propertyStorageKey(def.name), def] as const))
  return { id: entry.id, fields: searchableFields(entry, registryByKey).map(field => ({ weight: field.weight, normalized: normalizeText(field.text) })) }
}

export function indexedSearchDocument(entry: EntryRecord, registry: { name: string; type: PropertyType }[]): IndexedSearchDocument {
  return { ...indexedSummary(entry), ...indexedText(entry, registry) }
}

function searchableFields(entry: EntryRecord, registry: Map<string, { name: string; type: PropertyType }>): WeightedField[] {
  const fields: WeightedField[] = []
  fields.push({ weight: 5, text: markdownToPlainText(entry.content) })
  fields.push({ weight: 4, text: String(entry.properties['title'] ?? '') })
  fields.push({ weight: 4, text: entry.note ?? '' })
  for (const highlight of entry.highlights ?? []) {
    fields.push({ weight: 4, text: highlight.quote })
    fields.push({ weight: 3, text: highlight.note ?? '' })
  }
  fields.push({ weight: 3, text: (entry.properties['tags'] as string[] | undefined)?.join(' ') ?? '' })
  for (const [name, value] of Object.entries(entry.properties)) {
    if (name === 'title' || name === 'tags') continue
    const def = registry.get(propertyStorageKey(name))
    if (!def) continue
    if (def.type === 'text') fields.push({ weight: 2, text: String(value) })
    else if (def.type === 'list') fields.push({ weight: 2, text: (value as string[]).join(' ') })
  }
  fields.push({ weight: 2, text: entry.context ?? '' })
  fields.push({ weight: 1, text: entry.sourceHost })
  fields.push({ weight: 1, text: entry.sourceUrl })
  return fields
}

function splitTerms(search: string): string[] {
  return search
    .split(/\s+/u)
    .map(term => term.trim())
    .filter(Boolean)
}

/** A query with search words needs the text documents; one without never does. */
export function hasSearchTerms(query: { search?: string }): boolean {
  return splitTerms(query.search ?? '').length > 0
}

function matchScore(entry: EntryRecord, terms: string[], registry: Map<string, { name: string; type: PropertyType }>, indexed?: Map<string, NormalizedField[]>): number {
  if (terms.length === 0) return 0
  const fields = indexed?.get(entry.id) ?? searchableFields(entry, registry).map(field => ({ weight: field.weight, normalized: normalizeText(field.text) }))
  let total = 0
  for (const term of terms) {
    const normalized = normalizeText(term)
    const best = fields.reduce((max, field) => (field.normalized.includes(normalized) ? Math.max(max, field.weight) : max), 0)
    if (best === 0) return -1 // every term must hit somewhere
    total += best
  }
  return total
}

// ── Property filters (search.md §3) ─────────────────────────────────────

function asComparableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asComparableDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  // entry.md §5.2 formats; compare as UTC-agnostic strings → epoch ms
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (date) return Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]))
  const datetime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (datetime) return Date.UTC(+datetime[1], +datetime[2] - 1, +datetime[3], +datetime[4], +datetime[5], +datetime[6])
  return null
}

function matchesCondition(entry: EntryRecord, condition: PropertyCondition, registry: Map<string, { name: string; type: PropertyType }>): boolean {
  const def = registry.get(propertyStorageKey(condition.name))
  if (!def) return false
  const value = entry.properties[def.name]
  if (value === undefined) return false
  switch (def.type) {
    case 'text': {
      if (typeof value !== 'string') return false
      if (condition.op === 'equals') return normalizeText(value) === normalizeText(String(condition.value))
      return normalizeText(value).includes(normalizeText(String(condition.value)))
    }
    case 'list': {
      if (!Array.isArray(value)) return false
      const needle = normalizeText(String(condition.value))
      return value.some(item => normalizeText(item) === needle)
    }
    case 'number': {
      const left = asComparableNumber(value)
      if (left === null) return false
      if (condition.op === 'between') {
        const lo = asComparableNumber(condition.value)
        const hi = asComparableNumber(condition.value2)
        return lo !== null && hi !== null && left >= lo && left <= hi
      }
      const right = asComparableNumber(condition.value)
      if (right === null) return false
      if (condition.op === 'eq') return left === right
      if (condition.op === 'gt') return left > right
      return left < right
    }
    case 'checkbox':
      return condition.op === 'is' && value === (condition.value === true || condition.value === 'true')
    case 'date':
    case 'datetime': {
      const left = asComparableDate(value)
      if (left === null) return false
      const lo = asComparableDate(String(condition.value))
      const hi = asComparableDate(String(condition.value2 ?? condition.value))
      return lo !== null && hi !== null && left >= lo && left <= hi
    }
  }
}

function matchesFilters(entry: EntryRecord, filters: EntryQueryFilters, registry: Map<string, { name: string; type: PropertyType }>): boolean {
  if (filters.types?.length && !filters.types.includes(entry.type)) return false
  if (filters.hosts?.length) {
    const wanted = filters.hosts.map(host => normalizeText(host))
    if (!wanted.includes(normalizeText(entry.sourceHost))) return false
  }
  if (filters.tags?.length) {
    const own = ((entry.properties['tags'] as string[] | undefined) ?? []).map(tag => normalizeText(tag))
    if (!filters.tags.some(tag => own.includes(normalizeText(tag)))) return false
  }
  if (filters.createdFrom !== undefined && entry.createdAt < filters.createdFrom) return false
  if (filters.createdTo !== undefined && entry.createdAt >= filters.createdTo) return false
  for (const condition of filters.conditions ?? []) {
    if (!matchesCondition(entry, condition, registry)) return false
  }
  return true
}

// ── Entry queries ───────────────────────────────────────────────────────

function keyOf(entry: EntryRecord, score: number): [number, number, string] {
  return [score, entry.createdAt, entry.id]
}

function encodeCursor(key: [number, number, string]): string {
  return `${key[0].toString(36)}:${key[1].toString(36)}:${key[2]}`
}

export function parseEntryCursor(cursor: string): [number, number, string] | null {
  const [score, created, id] = cursor.split(':')
  if (score === undefined || created === undefined || id === undefined) return null
  return [parseInt(score, 36), parseInt(created, 36), id]
}

/** Strictly after the cursor in (score desc, createdAt desc, id asc). */
function keyAfterCursor(cursor: [number, number, string], key: [number, number, string]): boolean {
  if (key[0] !== cursor[0]) return key[0] < cursor[0]
  if (key[1] !== cursor[1]) return key[1] < cursor[1]
  return key[2] > cursor[2]
}

export function queryEntries(
  entries: EntryRecord[],
  registry: { name: string; type: PropertyType }[],
  query: EntryQuery = {},
  indexed?: Map<string, NormalizedField[]>,
): EntryQueryResult {
  const registryByKey = new Map(registry.map(def => [propertyStorageKey(def.name), def] as const))
  const terms = splitTerms(query.search ?? '')
  const limit = Math.max(1, query.limit ?? PAGE_DEFAULT)

  const scored: { entry: EntryRecord; score: number }[] = []
  for (const entry of entries) {
    if (!matchesFilters(entry, query, registryByKey)) continue
    const score = matchScore(entry, terms, registryByKey, indexed)
    if (terms.length > 0 && score < 0) continue
    scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt || (a.entry.id < b.entry.id ? -1 : 1))

  const cursor = query.cursor ? parseEntryCursor(query.cursor) : null
  let startIndex = 0
  if (cursor) {
    // keyset paging: first item strictly after the cursor key, so a deleted
    // previous-page item or shared timestamps never duplicate or skip rows
    while (startIndex < scored.length && !keyAfterCursor(cursor, keyOf(scored[startIndex]!.entry, scored[startIndex]!.score))) startIndex++
  }
  const page = scored.slice(startIndex, startIndex + limit)
  const last = page[page.length - 1]
  return {
    items: page.map(item => item.entry),
    nextCursor: last && startIndex + limit < scored.length ? encodeCursor(keyOf(last.entry, last.score)) : undefined,
    total: scored.length,
  }
}

// ── Highlight view (search.md §5) ───────────────────────────────────────

export interface HighlightRow {
  clipId: string
  clipTitle: string
  clipHost: string
  highlight: Highlight
}

export interface HighlightQueryFilters extends EntryQueryFilters {
  colors?: HighlightColor[]
}

export interface HighlightQueryResult {
  groups: { clip: EntryRecord; rows: HighlightRow[] }[]
  total: number
}

export function queryHighlights(entries: EntryRecord[], registry: { name: string; type: PropertyType }[], query: HighlightQuery = {}): HighlightQueryResult {
  const registryByKey = new Map(registry.map(def => [propertyStorageKey(def.name), def] as const))
  const terms = splitTerms(query.search ?? '')

  const groups: HighlightQueryResult['groups'] = []
  for (const clip of entries) {
    if (clip.type !== 'clip') continue
    // host / tag / property filters follow the owning clip; TIME follows each
    // highlight's own createdAt (search.md §5, RV-CORE-05)
    const clipFilters: EntryQueryFilters = {
      types: undefined,
      hosts: query.hosts,
      tags: query.tags,
      conditions: query.conditions,
    }
    if (!matchesFilters(clip, clipFilters, registryByKey)) continue

    const title = String(clip.properties['title'] ?? '')
    const hay = [title, (clip.properties['tags'] as string[] | undefined)?.join(' ') ?? '', clip.sourceHost]

    const rows: HighlightRow[] = []
    for (const highlight of clip.highlights ?? []) {
      if (query.colors?.length && !query.colors.includes(highlight.color)) continue
      if (query.createdFrom !== undefined && highlight.createdAt < query.createdFrom) continue
      if (query.createdTo !== undefined && highlight.createdAt >= query.createdTo) continue
      if (terms.length > 0) {
        const needleFields = [highlight.quote, highlight.note ?? '', ...hay]
        const hit = terms.every(term => needleFields.some(text => normalizeText(text).includes(normalizeText(term))))
        if (!hit) continue
      }
      rows.push({ clipId: clip.id, clipTitle: title, clipHost: clip.sourceHost, highlight })
    }
    if (rows.length === 0) continue
    rows.sort((a, b) => a.highlight.start - b.highlight.start)
    groups.push({ clip, rows })
  }

  // groups by the clip's newest highlight overall — search only decides which
  // highlights stay, never the group order (search.md §5, D-24)
  const latestOf = (clip: EntryRecord): number => Math.max(0, ...(clip.highlights ?? []).map(item => item.createdAt))
  groups.sort((a, b) => latestOf(b.clip) - latestOf(a.clip) || (a.clip.id < b.clip.id ? -1 : 1))
  return { groups, total: groups.reduce((sum, group) => sum + group.rows.length, 0) }
}

export interface HighlightQuery {
  search?: string
  colors?: HighlightColor[]
  hosts?: string[]
  tags?: string[]
  createdFrom?: number
  createdTo?: number
  conditions?: PropertyCondition[]
}
