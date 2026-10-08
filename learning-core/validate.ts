/**
 * Entry validation pipeline with stable error codes — docs/v2/entry.md §6.
 *
 * Order: type → base fields → type-required fields → source → highlights →
 * properties. Every throw carries an EntryErrorCode; the UI never shows raw
 * exception objects.
 */
import { markdownToPlainText } from './markdown'
import { normalizedContains, normalizeHost } from './normalize'
import { PROPERTIES_PER_ENTRY_MAX, TAGS_MAX, TAG_LENGTH_MAX, propertyStorageKey, validatePropertyName, validatePropertyValue } from './properties'
import { isHttpUrl } from './url'
import { ENTRY_TYPES, EntryValidationError, HIGHLIGHT_COLORS, type EntryRecord, type EntryType, type Highlight, type PropertyDefinition } from './types'

// ── Limits (entry.md §4, §6) ────────────────────────────────────────────

export const CONTENT_MAX_CHARS = 100_000
export const CONTEXT_MAX_CHARS = 2_000
export const NOTE_MAX_CHARS = 2_000
export const HIGHLIGHT_QUOTE_MAX_CHARS = 2_000
export const HIGHLIGHT_NOTE_MAX_CHARS = 1_000
export const HIGHLIGHTS_PER_CLIP_MAX = 200

export function validateEntryType(type: string): asserts type is EntryType {
  if (!ENTRY_TYPES.includes(type as EntryType)) {
    throw new EntryValidationError('ENTRY_TYPE_UNKNOWN', `unknown entry type: ${String(type)}`)
  }
}

function assertFiniteTime(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new EntryValidationError('ENTRY_CONTENT_INVALID', `${field} must be a finite epoch ms value`)
}

export function validateHighlight(highlight: Highlight, contentLength: number): void {
  if (!Number.isInteger(highlight.start) || !Number.isInteger(highlight.end)) {
    throw new EntryValidationError('HIGHLIGHT_INVALID', 'highlight offsets must be integers')
  }
  if (highlight.start < 0 || highlight.end <= highlight.start || highlight.end > contentLength) {
    throw new EntryValidationError('HIGHLIGHT_INVALID', `highlight range out of bounds: ${highlight.start}..${highlight.end} of ${contentLength}`)
  }
  const quote = highlight.quote?.trim() ?? ''
  if (!quote || quote.length > HIGHLIGHT_QUOTE_MAX_CHARS) {
    throw new EntryValidationError('HIGHLIGHT_INVALID', 'highlight quote empty or too long')
  }
  if (!HIGHLIGHT_COLORS.includes(highlight.color)) {
    throw new EntryValidationError('HIGHLIGHT_INVALID', `highlight color not one of the five: ${String(highlight.color)}`)
  }
  if (highlight.note !== undefined && highlight.note.length > HIGHLIGHT_NOTE_MAX_CHARS) {
    throw new EntryValidationError('HIGHLIGHT_INVALID', 'highlight note too long')
  }
  if (!Number.isFinite(highlight.createdAt)) {
    throw new EntryValidationError('HIGHLIGHT_INVALID', 'highlight createdAt must be finite')
  }
}

function validateHighlights(entry: EntryRecord): void {
  const highlights = entry.highlights ?? []
  if (highlights.length === 0) return
  if (entry.type !== 'clip') {
    throw new EntryValidationError('HIGHLIGHT_INVALID', 'only a clip can carry highlights')
  }
  if (highlights.length > HIGHLIGHTS_PER_CLIP_MAX) {
    throw new EntryValidationError('HIGHLIGHT_LIMIT_EXCEEDED', `clip has ${highlights.length} highlights, limit ${HIGHLIGHTS_PER_CLIP_MAX}`)
  }
  const ids = new Set<string>()
  const sorted = [...highlights].sort((a, b) => a.start - b.start)
  let previousEnd = -1
  for (const highlight of highlights) {
    validateHighlight(highlight, entry.content.length)
    if (ids.has(highlight.id)) throw new EntryValidationError('HIGHLIGHT_INVALID', `duplicate highlight id: ${highlight.id}`)
    ids.add(highlight.id)
  }
  for (const highlight of sorted) {
    if (highlight.start < previousEnd) {
      throw new EntryValidationError('HIGHLIGHT_INVALID', `highlights overlap at ${highlight.start} < ${previousEnd}`)
    }
    previousEnd = highlight.end
  }
}

function validateProperties(entry: EntryRecord, registry: PropertyDefinition[]): void {
  const byKey = new Map(registry.map(def => [propertyStorageKey(def.name), def] as const))
  const keys = Object.keys(entry.properties)
  if (keys.length > PROPERTIES_PER_ENTRY_MAX) {
    throw new EntryValidationError('PROPERTY_LIMIT_EXCEEDED', `entry carries ${keys.length} properties, limit ${PROPERTIES_PER_ENTRY_MAX}`)
  }
  const seenKeys = new Set<string>()
  for (const name of keys) {
    const key = propertyStorageKey(name)
    if (seenKeys.has(key)) throw new EntryValidationError('PROPERTY_NAME_INVALID', `duplicate property name in entry: ${name}`)
    seenKeys.add(key)
    validatePropertyName(name)
    const def = byKey.get(key)
    if (!def) {
      throw new EntryValidationError('PROPERTY_NAME_INVALID', `property not in registry: ${name}`)
    }
    validatePropertyValue(def.type, entry.properties[name]!)
  }
  const tags = entry.properties['tags']
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > TAGS_MAX || tags.some(tag => typeof tag !== 'string' || !tag || tag.length > TAG_LENGTH_MAX)) {
      throw new EntryValidationError('PROPERTY_VALUE_INVALID', 'tags exceed their tighter limits (20 items, 1-32 chars each)')
    }
  }
}

/**
 * Full validation. `registry` is the property registry snapshot the entry is
 * written against; names outside it are rejected — registering happens in the
 * same write transaction, never implicitly here.
 */
export function validateEntry(entry: EntryRecord, registry: PropertyDefinition[]): void {
  validateEntryType(entry.type)

  if (typeof entry.id !== 'string' || !entry.id) throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'entry id missing')

  const content = entry.content ?? ''
  if (entry.type === 'clip') {
    if (!content.trim()) throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'clip content is empty')
    if (content.length > CONTENT_MAX_CHARS) throw new EntryValidationError('ENTRY_CONTENT_INVALID', `clip content over ${CONTENT_MAX_CHARS} chars`)
  } else if (content !== '') {
    throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'screenshot content must be the empty string')
  }

  if (entry.context !== undefined) {
    if (entry.type !== 'clip') throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'context is only allowed on a clip')
    if (entry.context.length > CONTEXT_MAX_CHARS) throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'context over limit')
    // containment compares against the content's plain text: context is plain
    // text and markdown syntax marks must not break the comparison (entry.md §6)
    if (!normalizedContains(entry.context, markdownToPlainText(content))) {
      throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'context does not contain the clip content')
    }
  }

  if (entry.note !== undefined && entry.note.length > NOTE_MAX_CHARS) {
    throw new EntryValidationError('ENTRY_CONTENT_INVALID', 'note over limit')
  }

  if (entry.type === 'screenshot') {
    if (!entry.assetId) throw new EntryValidationError('ENTRY_ASSET_MISSING', 'screenshot has no assetId')
  } else if (entry.assetId !== undefined) {
    throw new EntryValidationError('ENTRY_ASSET_MISSING', 'clip must not carry an assetId')
  }

  if (!isHttpUrl(entry.sourceUrl)) throw new EntryValidationError('ENTRY_SOURCE_INVALID', `sourceUrl is not an absolute http(s) link: ${entry.sourceUrl}`)
  if (entry.sourceHost !== normalizeHost(entry.sourceUrl)) {
    throw new EntryValidationError('ENTRY_SOURCE_INVALID', 'sourceHost does not match sourceUrl')
  }

  assertFiniteTime(entry.createdAt, 'createdAt')
  assertFiniteTime(entry.updatedAt, 'updatedAt')

  validateHighlights(entry)
  validateProperties(entry, registry)
}

/**
 * Overlap merge rule for adding a highlight among existing ones (entry.md
 * §4.6): union range, earliest identity/color, notes joined with a blank
 * line. A new selection crossing several highlights is rejected — the caller
 * merges pairwise.
 */
export function mergeHighlight(existing: Highlight[], addition: Highlight): Highlight[] {
  const merged: Highlight[] = []
  let absorbed = false
  for (const highlight of existing) {
    const overlaps = addition.start < highlight.end && highlight.start < addition.end
    if (!overlaps) {
      merged.push(highlight)
      continue
    }
    if (absorbed) throw new EntryValidationError('HIGHLIGHT_INVALID', 'new selection overlaps several highlights')
    absorbed = true
    const notes = [highlight.note, addition.note].filter((note): note is string => Boolean(note?.trim()))
    merged.push({
      ...highlight,
      start: Math.min(highlight.start, addition.start),
      end: Math.max(highlight.end, addition.end),
      quote: highlight.quote.length >= addition.quote.length ? highlight.quote : addition.quote,
      note: notes.join('\n\n') || undefined,
      createdAt: Math.min(highlight.createdAt, addition.createdAt),
    })
  }
  return absorbed ? merged : [...existing, addition]
}
