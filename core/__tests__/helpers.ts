import type { EntryRecord, Highlight, PropertyDefinition } from '../types'

/** Test-builder overrides: `key: undefined` removes the field, the way the field would vanish in transport (RV-TEST-17). */
type Overrides<T> = { [K in keyof T]?: T[K] | undefined }

function withOverrides<T extends object>(base: T, overrides: Overrides<T>): T {
  const merged = { ...base, ...overrides }
  for (const key of Object.keys(overrides) as (keyof T)[]) if (overrides[key] === undefined) delete merged[key]
  return merged
}

export const TEST_REGISTRY: PropertyDefinition[] = [
  { name: 'title', type: 'text', builtin: true, presets: ['clip', 'screenshot'] },
  { name: 'tags', type: 'list', builtin: true, presets: ['clip', 'screenshot'] },
  { name: 'author', type: 'list', builtin: true, presets: ['clip'] },
  { name: 'published', type: 'date', builtin: true, presets: ['clip'] },
  { name: 'description', type: 'text', builtin: true, presets: ['clip'] },
  { name: 'project', type: 'text', builtin: false, presets: [] },
  { name: 'reviewed', type: 'checkbox', builtin: false, presets: [] },
  { name: 'rating', type: 'number', builtin: false, presets: [] },
]

let counter = 0
export const nextId = (prefix: string): string => `${prefix}_test_${++counter}`

export function makeClip(overrides: Overrides<EntryRecord> = {}): EntryRecord {
  const content = overrides.content ?? 'Exponential backoff with jitter prevents retry storms.'
  return withOverrides(
    {
      id: nextId('ent'),
      type: 'clip',
      content,
      context: `Before the incident, ${content} The team applied it the next week.`,
      sourceUrl: 'https://engineering.example.com/retries',
      sourceHost: 'engineering.example.com',
      properties: { title: 'Retries and backpressure', tags: ['reliability'] },
      createdAt: Date.parse('2026-10-01T10:00:00Z'),
      updatedAt: Date.parse('2026-10-01T10:00:00Z'),
    },
    overrides,
  )
}

export function makeScreenshot(overrides: Overrides<EntryRecord> = {}): EntryRecord {
  return withOverrides(
    {
      id: nextId('ent'),
      type: 'screenshot',
      content: '',
      assetId: nextId('asset'),
      sourceUrl: 'https://sre.example.org/dashboard',
      sourceHost: 'sre.example.org',
      properties: { title: 'p99 latency curve' },
      createdAt: Date.parse('2026-10-02T10:00:00Z'),
      updatedAt: Date.parse('2026-10-02T10:00:00Z'),
    },
    overrides,
  )
}

export function makeHighlight(overrides: Overrides<Highlight> = {}): Highlight {
  return withOverrides(
    {
      id: nextId('hl'),
      start: 0,
      end: 10,
      quote: 'Exponential',
      color: 'yellow',
      createdAt: Date.parse('2026-10-03T10:00:00Z'),
    },
    overrides,
  )
}

export function pngBlob(bytes = 8): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' })
}
