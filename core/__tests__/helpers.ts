import type { EntryRecord, Highlight, PropertyDefinition } from '../types'

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

export function makeClip(overrides: Partial<EntryRecord> = {}): EntryRecord {
  const content = overrides.content ?? 'Exponential backoff with jitter prevents retry storms.'
  return {
    id: nextId('ent'),
    type: 'clip',
    content,
    context: `Before the incident, ${content} The team applied it the next week.`,
    sourceUrl: 'https://engineering.example.com/retries',
    sourceHost: 'engineering.example.com',
    properties: { title: 'Retries and backpressure', tags: ['reliability'] },
    createdAt: Date.parse('2026-10-01T10:00:00Z'),
    updatedAt: Date.parse('2026-10-01T10:00:00Z'),
    ...overrides,
  }
}

export function makeScreenshot(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    id: nextId('ent'),
    type: 'screenshot',
    content: '',
    assetId: overrides.assetId ?? nextId('asset'),
    sourceUrl: 'https://sre.example.org/dashboard',
    sourceHost: 'sre.example.org',
    properties: { title: 'p99 latency curve' },
    createdAt: Date.parse('2026-10-02T10:00:00Z'),
    updatedAt: Date.parse('2026-10-02T10:00:00Z'),
    ...overrides,
  }
}

export function makeHighlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    id: nextId('hl'),
    start: 0,
    end: 10,
    quote: 'Exponential',
    color: 'yellow',
    createdAt: Date.parse('2026-10-03T10:00:00Z'),
    ...overrides,
  }
}

export function pngBlob(bytes = 8): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' })
}
