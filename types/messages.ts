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
  via: 'menu' | 'block' | 'shortcut' | 'ink'
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
    /** Page meta for screenshot-checked presets (entry.md §5.4); absent when the page has none. */
    author?: string[]
    published?: string
    description?: string
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

/**
 * The last frame of a screenshot (screenshot.md §1.4): the element it was anchored to with its margin, or a plain
 * box, and where it was on the page. The worker keeps one per tab, for the page it was taken on.
 */
export type FrameRecord =
  | { kind: 'element'; selector: string; margin: number; width: number; height: number; pageX: number; pageY: number }
  | { kind: 'box'; pageX: number; pageY: number; width: number; height: number }

export interface RememberFrameMessage extends BaseMessage {
  type: 'REMEMBER_FRAME'
  record: FrameRecord
}

/** Answers `{ record }`: this tab's frame when it was taken on the sender's page, otherwise null. */
export interface ReadFrameMessage extends BaseMessage {
  type: 'READ_FRAME'
}

// ── Tab recording (annotate.md §2) ──────────────────────────────────────

/**
 * What the popup and the settings page read. Only the extension's own pages
 * may start or stop a recording; the page itself never sees one (annotate.md
 * §2.1). At most one recording and at most one unsaved video exist at a time.
 */
export interface RecordingState {
  status: 'idle' | 'recording' | 'download-failed'
  withMic: boolean
  /** The tab being recorded, for the popup's 正在录制 line. */
  tabId?: number
  tabTitle?: string
  startedAt?: number
  /** The limit that stopped the recording (annotate.md §2.1): 15 minutes or about 500 MB. */
  limitNotice?: 'time' | 'size'
  /** Why the microphone is not in the video although it was asked for (annotate.md §2.4). */
  micNotice?: 'denied' | 'missing' | 'busy'
  /** A download that failed keeps the video until it is retried or discarded (annotate.md §2.4). */
  failedDownload?: { filename: string }
}

export interface StartRecordingMessage extends BaseMessage {
  type: 'START_RECORDING'
  /** The tab to record (the active one). */
  tabId: number
  /** The tab-capture stream id the popup obtained in its own user gesture. */
  streamId: string
  withMic: boolean
}

export interface GetRecordingStateMessage extends BaseMessage {
  type: 'GET_RECORDING_STATE'
}

export interface StopRecordingMessage extends BaseMessage {
  type: 'STOP_RECORDING'
}

export interface RetryRecordingDownloadMessage extends BaseMessage {
  type: 'RETRY_RECORDING_DOWNLOAD'
}

export interface DiscardRecordingMessage extends BaseMessage {
  type: 'DISCARD_RECORDING'
}

/** Lifecycle reports from the offscreen document; the worker turns them into state, badge and metrics. */
export interface RecordingEventMessage extends BaseMessage {
  type: 'RECORDING_EVENT'
  event: 'started' | 'mic-unavailable' | 'stopped' | 'failed'
  /** For `stopped`: the blob URL the offscreen document keeps alive until the download lands. */
  blobUrl?: string
  filename?: string
  durationMs?: number
  stoppedBy?: 'user' | 'tab_closed' | 'limit'
  /** Which limit was hit, when stopped_by is limit (annotate.md §2.1). */
  limit?: 'time' | 'size'
  withMic?: boolean
  micNotice?: 'denied' | 'missing' | 'busy'
}

/** Worker → offscreen document: what the recorder should do. */
export interface RecordingCommandMessage extends BaseMessage {
  type: 'RECORDING_START' | 'RECORDING_STOP' | 'RECORDING_CLEANUP'
  streamId?: string
  withMic?: boolean
  keepVideo?: boolean
  /** For RECORDING_STOP: why the worker stopped it — user button or the recorded tab closing. */
  stoppedBy?: 'user' | 'tab_closed'
}

/** The recorded tab asks whether a recording is live; read-only, no user data (annotate.md §3.2). */
export interface RecordingStatusMessage extends BaseMessage {
  type: 'RECORDING_STATUS'
}

/** Worker → the recorded tab's content script: a recording started or stopped (annotate.md §3). */
export interface RecordingLifecycleMessage extends BaseMessage {
  type: 'RECORDING_LIFECYCLE'
  active: boolean
  cursorHighlight?: SettingsPatch['recording'] extends { cursorHighlight?: infer C } ? C : never
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

/** Answers `MetricsPanelData`: per-event totals plus the metrics.md §5 summaries for the settings panel. */
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
  params?: { entryId?: string; /** The tab a recording wanted the microphone for (annotate.md §2.1). */ recordTabId?: number }
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
  | RememberFrameMessage
  | ReadFrameMessage
  | StartRecordingMessage
  | GetRecordingStateMessage
  | StopRecordingMessage
  | RetryRecordingDownloadMessage
  | DiscardRecordingMessage
  | RecordingEventMessage
  | RecordingCommandMessage
  | RecordingStatusMessage
  | RecordingLifecycleMessage
  | GetSettingsMessage
  | SetSettingsMessage
  | DisableBlockEntryMessage
  | RecordEventMessage
  | GetMetricsMessage
  | UsageEstimateMessage
  | OrphanReportMessage
  | OpenExtensionPageMessage
