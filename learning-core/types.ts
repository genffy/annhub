/**
 * Entry data contract — single source of truth shapes for everything the
 * extension captures and stores locally.
 *
 * Contract owners (docs/v2):
 *   - EntryRecord / EntryType / Highlight / properties: docs/v2/entry.md
 *   - ImageAsset and persistence: docs/v2/storage.md
 *
 * This module must stay environment-neutral: no chrome.*, no DOM, no React.
 */

// ── Entry types (entry.md §2) ───────────────────────────────────────────

/** Two kinds only; fixed at creation and never converted afterwards. */
export type EntryType = 'clip' | 'screenshot'

export const ENTRY_TYPES: readonly EntryType[] = ['clip', 'screenshot']

// ── Highlights live inside a clip (entry.md §4) ─────────────────────────

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

export interface Highlight {
  id: string
  /** Character offsets into the clip's `content` (UTF-16 code units). */
  start: number
  end: number
  /** The selected rendered text, plain, non-empty after trim, ≤ 2,000 chars. */
  quote: string
  color: HighlightColor
  note?: string
  createdAt: number
}

// ── Typed properties (entry.md §5) ──────────────────────────────────────

export type PropertyType = 'text' | 'list' | 'number' | 'checkbox' | 'date' | 'datetime'

export const PROPERTY_TYPES: readonly PropertyType[] = ['text', 'list', 'number', 'checkbox', 'date', 'datetime']

export type PropertyValue = string | string[] | number | boolean

export interface PropertyDefinition {
  name: string
  type: PropertyType
  defaultValue?: PropertyValue
  /** Built-ins cannot be deleted and their type is fixed (entry.md §5.3). */
  builtin: boolean
  /** Entry types that auto-attach this property at capture time. */
  presets: EntryType[]
}

// ── The shared record (entry.md §3) ─────────────────────────────────────

export interface EntryRecord {
  id: string
  type: EntryType

  /** Markdown source for a clip; always the empty string for a screenshot. */
  content: string
  /** Sentence/paragraph containing a selection clip; never set on other captures. */
  context?: string
  /** Asset reference for a screenshot; forbidden on a clip. */
  assetId?: string
  /** The user's own words, shown apart from the captured content. */
  note?: string
  /** Marks drawn while reading the clip in the library. Clips only. */
  highlights?: Highlight[]

  sourceUrl: string
  /** Source hostname, lowercased, `www.` stripped. */
  sourceHost: string

  properties: Record<string, PropertyValue>

  createdAt: number
  updatedAt: number
}

// ── Image assets (storage.md §4) ────────────────────────────────────────

export interface ImageAsset {
  id: string
  mimeType: 'image/png'
  byteLength: number
  sha256: string
  width: number
  height: number
  createdAt: number
}

// ── Stable error codes (entry.md §6) ────────────────────────────────────

export type EntryErrorCode =
  | 'ENTRY_TYPE_UNKNOWN'
  | 'ENTRY_CONTENT_INVALID'
  | 'ENTRY_CONTENT_LOCKED'
  | 'ENTRY_SOURCE_INVALID'
  | 'ENTRY_ASSET_MISSING'
  | 'HIGHLIGHT_INVALID'
  | 'HIGHLIGHT_LIMIT_EXCEEDED'
  | 'PROPERTY_NAME_INVALID'
  | 'PROPERTY_TYPE_MISMATCH'
  | 'PROPERTY_VALUE_INVALID'
  | 'PROPERTY_LIMIT_EXCEEDED'
  | 'PROPERTY_IN_USE'

export class EntryValidationError extends Error {
  constructor(
    public readonly code: EntryErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'EntryValidationError'
  }
}
