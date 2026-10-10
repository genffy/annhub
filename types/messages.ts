/**
 * The extension message union — one file owns the protocol; handlers,
 * callers and tests change together with it (root AGENTS.md).
 *
 * Writes require a sender check in the background (top frame of a tab, or
 * an extension page); reads that expose user data follow the same rule.
 * Transport note: image bytes never persist as dataUrls — a dataUrl is wire
 * format only, storage keeps Blobs (storage.md §3).
 */
import type { EntryQuery, HighlightQuery } from '../learning-core/query'
import type { MetricEventName, MetricEventProps } from '../learning-core/metrics'
import type { Highlight, PropertyDefinition, PropertyValue } from '../learning-core/types'
import type { SettingsPatch } from '../background-service/settings-schema'

export interface BaseMessage {
  type: string
  requestId?: string
  timestamp?: number
}

export interface ResponseMessage<T = any> {
  type: string
  success: boolean
  data?: T
  error?: string
  timestamp?: number
}

/** `via` and block attribution for capture.saved / capture.undone (metrics.md §9). */
export interface CaptureAttribution {
  via: 'menu' | 'block' | 'shortcut'
  blockKind?: 'post' | 'code' | 'table' | 'figure' | 'quote' | 'section' | 'article'
  levelChanged?: boolean
  truncated?: boolean
  durationMs?: number
  startedAt?: number
  frame?: 'drag' | 'element' | 'reused'
}

export type CaptureVia = CaptureAttribution['via']

// ── Content → background: one-click saves (capture.md §3) ───────────────

export interface SaveClipMessage extends BaseMessage {
  type: 'SAVE_CLIP'
  draft: {
    id?: string
    content: string
    context?: string
    sourceUrl: string
    note?: string
    properties: Record<string, PropertyValue>
    newDefinitions?: PropertyDefinition[]
  } & CaptureAttribution
}

export interface SaveScreenshotMessage extends BaseMessage {
  type: 'SAVE_SCREENSHOT'
  data: {
    id?: string
    /** Wire format only; the store persists the decoded Blob (storage.md §3). */
    dataUrl: string
    width: number
    height: number
    sourceUrl: string
    title: string
  } & CaptureAttribution
}

export interface DeleteEntryMessage extends BaseMessage {
  type: 'DELETE_ENTRY'
  id: string
  attribution?: CaptureAttribution
}

// ── Library / options / popup pages ─────────────────────────────────────

/** Field-level entry patch: `null` clears a field (undefined keys cannot survive JSON transport). */
export interface UpdateEntryPatch {
  content?: string
  context?: string | null
  note?: string | null
  properties?: {
    set?: Record<string, PropertyValue>
    unset?: string[]
    newDefinitions?: PropertyDefinition[]
  }
}

export interface UpdateEntryMessage extends BaseMessage {
  type: 'UPDATE_ENTRY'
  id: string
  patch: UpdateEntryPatch
}

export interface AddHighlightMessage extends BaseMessage {
  type: 'ADD_HIGHLIGHT'
  id: string
  highlight: Highlight
}

export interface UpdateHighlightMessage extends BaseMessage {
  type: 'UPDATE_HIGHLIGHT'
  id: string
  highlightId: string
  patch: { color?: Highlight['color']; note?: string | null }
}

export interface RemoveHighlightMessage extends BaseMessage {
  type: 'REMOVE_HIGHLIGHT'
  id: string
  highlightId: string
}

export interface RestoreHighlightMessage extends BaseMessage {
  type: 'RESTORE_HIGHLIGHT'
  id: string
  highlight: Highlight
}

export interface QueryEntriesMessage extends BaseMessage {
  type: 'QUERY_ENTRIES'
  query: EntryQuery
}

export interface QueryHighlightsMessage extends BaseMessage {
  type: 'QUERY_HIGHLIGHTS'
  query: HighlightQuery
}

export interface QueryFacetsMessage extends BaseMessage {
  type: 'QUERY_FACETS'
}

export interface GetEntryMessage extends BaseMessage {
  type: 'GET_ENTRY'
  id: string
}

export interface GetAssetDataUrlMessage extends BaseMessage {
  type: 'GET_ASSET_DATA_URL'
  assetId: string
}

export interface ListPropertiesMessage extends BaseMessage {
  type: 'LIST_PROPERTIES'
  includeUsage?: boolean
}

export interface UpsertPropertyMessage extends BaseMessage {
  type: 'UPSERT_PROPERTY'
  def: PropertyDefinition
}

export interface DeletePropertyMessage extends BaseMessage {
  type: 'DELETE_PROPERTY'
  name: string
}

export interface DeleteUnusedPropertiesMessage extends BaseMessage {
  type: 'DELETE_UNUSED_PROPERTIES'
}

// ── Screenshot support (screenshot.md §2) ───────────────────────────────

export interface CaptureVisibleTabMessage extends BaseMessage {
  type: 'CAPTURE_VISIBLE_TAB'
}

export interface FetchImageMessage extends BaseMessage {
  type: 'FETCH_IMAGE'
  url: string
}

export interface DownloadImageMessage extends BaseMessage {
  type: 'DOWNLOAD_IMAGE'
  dataUrl: string
  /** File extension for the chosen format (png/jpg/webp); defaults to png. */
  extension?: string
  watermark?: boolean
  beautify?: boolean
}

// ── Settings, metrics, housekeeping ─────────────────────────────────────

export interface GetSettingsMessage extends BaseMessage {
  type: 'GET_SETTINGS'
}

export interface SetSettingsMessage extends BaseMessage {
  type: 'SET_SETTINGS'
  patch?: SettingsPatch
  appendDisabledSite?: string
}

export interface DisableBlockEntryMessage extends BaseMessage {
  type: 'DISABLE_BLOCK_ENTRY'
}

export interface RecordEventMessage extends BaseMessage {
  type: 'RECORD_EVENT'
  name: MetricEventName
  props: MetricEventProps
}

export interface GetMetricsMessage extends BaseMessage {
  type: 'GET_METRICS'
}

export interface UsageEstimateMessage extends BaseMessage {
  type: 'USAGE_ESTIMATE'
}

export interface OrphanReportMessage extends BaseMessage {
  type: 'ORPHAN_REPORT'
}

export interface OpenExtensionPageMessage extends BaseMessage {
  type: 'OPEN_EXTENSION_PAGE'
  page: 'library' | 'settings'
  params?: { entryId?: string }
}

export type ExtensionMessage =
  | SaveClipMessage
  | SaveScreenshotMessage
  | DeleteEntryMessage
  | UpdateEntryMessage
  | AddHighlightMessage
  | UpdateHighlightMessage
  | RemoveHighlightMessage
  | RestoreHighlightMessage
  | QueryEntriesMessage
  | QueryHighlightsMessage
  | QueryFacetsMessage
  | GetEntryMessage
  | GetAssetDataUrlMessage
  | ListPropertiesMessage
  | UpsertPropertyMessage
  | DeletePropertyMessage
  | DeleteUnusedPropertiesMessage
  | CaptureVisibleTabMessage
  | FetchImageMessage
  | DownloadImageMessage
  | GetSettingsMessage
  | SetSettingsMessage
  | DisableBlockEntryMessage
  | RecordEventMessage
  | GetMetricsMessage
  | UsageEstimateMessage
  | OrphanReportMessage
  | OpenExtensionPageMessage
