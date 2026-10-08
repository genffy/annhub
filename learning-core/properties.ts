/**
 * Property registry rules — name/type binding, reserved names, built-in
 * definitions and per-type value validation (docs/v2/entry.md §5).
 */
import { EntryValidationError, PROPERTY_TYPES, type EntryType, type PropertyDefinition, type PropertyType, type PropertyValue } from './types'

// ── Limits (entry.md §5.2, §5.3) ────────────────────────────────────────

export const PROPERTY_NAME_MAX = 64
export const PROPERTY_TEXT_MAX = 1_000
export const PROPERTY_LIST_ITEM_MAX = 100
export const PROPERTY_LIST_ITEMS_MAX = 50
export const PROPERTIES_PER_ENTRY_MAX = 50
export const TAGS_MAX = 20
export const TAG_LENGTH_MAX = 32

/** Names that can never be property names (entry.md §5.3.3). */
export const RESERVED_PROPERTY_NAMES: readonly string[] = ['id', 'type', 'source', 'created', 'updated', 'content', 'note']

const RESERVED = new Set(RESERVED_PROPERTY_NAMES)

export function propertyStorageKey(name: string): string {
  return name.trim().toLowerCase()
}

// ── Built-in definitions and type presets (entry.md §5.4) ───────────────

/** `title` and `tags` are attached to both types and cannot be unchecked. */
export const BUILTIN_PROPERTY_DEFINITIONS: readonly PropertyDefinition[] = [
  { name: 'title', type: 'text', builtin: true, presets: ['clip', 'screenshot'] },
  { name: 'author', type: 'list', builtin: true, presets: ['clip'] },
  { name: 'published', type: 'date', builtin: true, presets: ['clip'] },
  { name: 'tags', type: 'list', builtin: true, presets: ['clip', 'screenshot'] },
  { name: 'description', type: 'text', builtin: true, presets: ['clip'] },
]

export function builtinDefinition(name: string): PropertyDefinition | undefined {
  return BUILTIN_PROPERTY_DEFINITIONS.find(def => propertyStorageKey(def.name) === propertyStorageKey(name))
}

// ── Definition validation ───────────────────────────────────────────────

export function validatePropertyName(name: string): void {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > PROPERTY_NAME_MAX || name.includes('\n')) {
    throw new EntryValidationError('PROPERTY_NAME_INVALID', `property name length or shape invalid: ${JSON.stringify(name)}`)
  }
  if (RESERVED.has(trimmed.toLowerCase()) || trimmed.toLowerCase().startsWith('annhub_')) {
    throw new EntryValidationError('PROPERTY_NAME_INVALID', `property name is reserved: ${trimmed}`)
  }
}

export function validatePropertyDefinition(def: PropertyDefinition): void {
  if (!PROPERTY_TYPES.includes(def.type)) {
    throw new EntryValidationError('PROPERTY_VALUE_INVALID', `unknown property type: ${def.type}`)
  }
  // Built-ins are fixed; only their exact definitions pass.
  const builtin = builtinDefinition(def.name)
  if (builtin) {
    if (!def.builtin || def.type !== builtin.type) {
      throw new EntryValidationError('PROPERTY_TYPE_MISMATCH', `built-in property ${def.name} cannot be redefined`)
    }
    return
  }
  validatePropertyName(def.name)
  if (def.defaultValue !== undefined) {
    validatePropertyValue(def.type, def.defaultValue)
  }
  def.presets.forEach(preset => {
    if (preset !== 'clip' && preset !== 'screenshot') {
      throw new EntryValidationError('PROPERTY_VALUE_INVALID', `preset must be an entry type: ${String(preset)}`)
    }
  })
}

// ── Value validation (entry.md §5.2) ────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

function isRealDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return false
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

export function validatePropertyValue(type: PropertyType, value: PropertyValue): void {
  const fail = () => new EntryValidationError('PROPERTY_VALUE_INVALID', `value does not match type ${type}`)
  switch (type) {
    case 'text':
      if (typeof value !== 'string' || value.length > PROPERTY_TEXT_MAX) throw fail()
      return
    case 'list': {
      if (!Array.isArray(value) || value.length > PROPERTY_LIST_ITEMS_MAX) throw fail()
      const seen = new Set<string>()
      for (const item of value) {
        if (typeof item !== 'string' || !item || item.length > PROPERTY_LIST_ITEM_MAX) throw fail()
        const key = item.toLowerCase()
        if (seen.has(key)) throw fail()
        seen.add(key)
      }
      return
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw fail()
      return
    case 'checkbox':
      if (typeof value !== 'boolean') throw fail()
      return
    case 'date':
      if (typeof value !== 'string' || !DATE_RE.test(value) || !isRealDate(value)) throw fail()
      return
    case 'datetime':
      if (typeof value !== 'string' || !DATETIME_RE.test(value)) throw fail()
      return
  }
}

/** Tags are the `tags` list with their own, tighter limits (entry.md §5.4). */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.trim()
    if (!tag || tag.length > TAG_LENGTH_MAX) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= TAGS_MAX) break
  }
  return result
}

/** Attach the type presets with their capture-time values (entry.md §5.4). */
export function presetProperties(
  type: EntryType,
  registry: PropertyDefinition[],
  extracted: Record<string, PropertyValue | undefined>,
): Record<string, PropertyValue> {
  const result: Record<string, PropertyValue> = {}
  for (const def of registry) {
    if (!def.presets.includes(type)) continue
    const extractedValue = extracted[def.name]
    if (extractedValue !== undefined && extractedValue !== '') {
      result[def.name] = extractedValue
    } else if (def.defaultValue !== undefined) {
      result[def.name] = def.defaultValue
    }
  }
  return result
}
