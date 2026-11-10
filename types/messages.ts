/**
 * The extension message union — one file owns the protocol; handlers,
 * callers and tests change together with it (root AGENTS.md).
 *
 * Writes require a sender check in the background (top frame of a tab, or
 * an extension page); reads that expose user data follow the same rule.
 * Transport note: image bytes never persist as dataUrls — a dataUrl is wire
 * format only, storage keeps Blobs (storage.md §3).
 */
import type { EntryQuery, EntryQueryResult, HighlightQuery, HighlightQueryResult } from '../core/query'
import type { MetricEventName, MetricEventProps, MetricsPanelData } from '../core/metrics'
import type { EntryRecord, Highlight, PropertyDefinition, PropertyValue } from '../core/types'
import type { ExtensionSettings, SettingsPatch } from '../core/settings'
import type { LibraryFacets, OrphanReport } from '../core/store'

export interface BaseMessage {
  type: string
  requestId?: string
  timestamp?: number
}

export interface ResponseMessage<T = unknown> {
  type: string
  success: boolean
  data?: T
  error?: string
  timestamp?: number
}

/** `via` and block attribution for capture.saved / capture.undone (metrics.md §9). */
export interface CaptureAttribution {
  via: 'menu' | 'block' | 'shortcut' | 'ink'
  blockKind?: 'block' | 'post' | 'code' | 'table' | 'figure' | 'quote' | 'section' | 'article'
  levelChanged?: boolean
  truncated?: boolean
  durationMs?: number
  startedAt?: number
  frame?: 'drag' | 'element' | 'reused' | 'stitched'
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
  /** True while the worker holds the finished video for the disk — the offscreen document's stale-state recovery asks for it (RV-REC-05). Not for display. */
  holdsVideo?: boolean
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

/** Worker → the offscreen document: is it there? A false-empty contexts read on a cold-started worker must not orphan a live recording (RV-REC-02). */
export interface OffscreenPingMessage extends BaseMessage {
  type: 'OFFSCREEN_PING'
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
  /** `heartbeat` keeps the suspended-after-30 s worker alive while the recording or its video waits (annotate.md §2.4). */
  event: 'started' | 'mic-unavailable' | 'stopped' | 'failed' | 'heartbeat'
  /** For `stopped`: the blob URL the offscreen document keeps alive until the download lands. */
  blobUrl?: string
  filename?: string
  durationMs?: number
  /** For `stopped`: the cause the recorder knows — a limit it hit, or the one the worker sent along. `user` is its default, which the worker checks against the recorded tab (annotate.md §2.1, RV-REC-02). */
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
  /** The cursor highlight settings to apply while the recording is live (annotate.md §3.1). */
  cursorHighlight?: ExtensionSettings['recording']['cursorHighlight']
}

// ── Downloads (download.md) ─────────────────────────────────────────────

/** The entrances a download came from — the metric's `via` (metrics.md §9). */
export type DownloadVia = 'capsule' | 'block_mode' | 'popup' | 'command' | 'drawer' | 'reading' | 'selection'

/** The product's two shapes: a browser-download folder, or one ZIP (download.md §4.1). */
export type DownloadForm = 'folder' | 'zip'

/** One media address a page itself declared, with the kind its element says it is (download.md §5.1). */
export interface PageDownloadMedia {
  url: string
  /** Other page-declared image addresses, in fallback order. */
  candidates?: string[]
  kind: 'image' | 'video' | 'audio'
}

/** A visibility-filtered, inert page snapshot, extracted only on a main-page download gesture (Q-29). */
export interface ExtractDownloadPageMessage extends BaseMessage {
  type: 'EXTRACT_DOWNLOAD_PAGE'
  html: string
  url: string
  /** A known article is marked in the snapshot; otherwise the extractor finds the body. */
  hasArticle: boolean
}

/** Worker → offscreen: the only context that loads the extraction library. */
export interface DownloadExtractMessage extends Omit<ExtractDownloadPageMessage, 'type'> {
  type: 'DOWNLOAD_EXTRACT'
}

/** The page download the content script hands over (download.md §2): the converted Markdown, the media manifest, the page meta. */
export interface StartPageDownloadMessage extends BaseMessage {
  type: 'START_PAGE_DOWNLOAD'
  meta: {
    title: string
    sourceUrl: string
    site?: string
    language?: string
    image?: string
    author?: string[]
    published?: string
    description?: string
  }
  markdown: string
  media: PageDownloadMedia[]
  via: Extract<DownloadVia, 'capsule' | 'block_mode' | 'popup' | 'command'>
  blockKind?: CaptureAttribution['blockKind']
  /** Overrides the settings' form for this download; the settings' value when absent. */
  form?: DownloadForm
  /** The page's UI language, so the README is worded like the page the user reads (download.md §4.2). */
  lang?: 'zh' | 'en'
}

/** The library download (download.md §3): one entry straight from the drawer or reading view, or the selection's many. */
export interface StartLibraryDownloadMessage extends BaseMessage {
  type: 'START_LIBRARY_DOWNLOAD'
  /** Correlates broadcast notices before the start response reaches this page. */
  clientRunId?: string
  entryIds: string[]
  via: Extract<DownloadVia, 'drawer' | 'reading' | 'selection'>
  form?: DownloadForm
  withMedia?: boolean
  /** The library page's UI language, so the README is worded like the library around it. */
  lang?: 'zh' | 'en'
}

/** Answers `EstimateDownloadResult`: what a download of these entries would hold, for the dialog's prepare state (download.md §3.3). */
export interface EstimateDownloadMessage extends BaseMessage {
  type: 'ESTIMATE_DOWNLOAD'
  entryIds: string[]
}

/** The prepare state's numbers: how many entries of each kind, the expected files, and where the tree lands (download.md §3.3, §4.2). */
export interface EstimateDownloadResult {
  entryCount: number
  clips: number
  screenshots: number
  /** The media items the run would handle, stored screenshot bytes included. */
  media: number
  files: number
  /** `AnnHub/<folder>` — a ZIP adds the extension to the last segment. */
  basePath: string
}

/** Stops the one running download: fetches stop, in-flight files are cancelled, written files are removed (download.md §2.5). */
export interface CancelDownloadMessage extends BaseMessage {
  type: 'CANCEL_DOWNLOAD'
}

/** Shows a landed download in the system's file manager — the 「已下载 · 显示文件」 action (download.md §2.5). */
export interface ShowDownloadFileMessage extends BaseMessage {
  type: 'SHOW_DOWNLOAD_FILE'
  downloadId: number
}

/** Why one medium kept its address (download.md §5.4); the README and the library's dialogs word it locally. */
export type DownloadMissingReason = 'unreachable' | 'too-large' | 'wrong-type' | 'offline' | 'write-failed' | 'limit'

/** One medium the run could not save: the address the Markdown keeps, and why (download.md §3.3, §5.4). */
export interface DownloadMissingItem {
  url: string
  reason: DownloadMissingReason
}

/** Worker → the download's origin: progress and the outcome (download.md §2.5, §3.3). Sent to the tab for page downloads, broadcast to the pages for library ones. */
export interface DownloadNoticeMessage extends BaseMessage {
  type: 'DOWNLOAD_NOTICE'
  clientRunId?: string
  phase: 'progress' | 'done' | 'partial' | 'failed' | 'cancelled'
  processed: number
  total: number
  missingCount: number
  /** `done`/`partial`: the Markdown file (or the ZIP) that landed, for 显示文件. */
  downloadId?: number
  /** DOWNLOAD_ZIP_FAILED offers a folder retry; other failures keep their original form. */
  errorCode?: string
  /** `progress`: which half of the run is working (download.md §3.3). */
  stage?: 'fetch' | 'write'
  /** `done`/`partial`: the media that kept their addresses, for the dialog's list (the README carries all of them). */
  missing?: DownloadMissingItem[]
}

/** One planned medium: its address (or stored asset), its kind, its slot number and the folder it belongs to — the file name comes from the slot and the response type (download.md §4.2). */
export interface DownloadPlanItem {
  url?: string
  candidates?: string[]
  assetId?: string
  kind: 'image' | 'video' | 'audio'
  /** The assets' folder, relative to the run's base path (an entry's folder in a multi-download; empty at the root). */
  dir: string
  slot: number
}

/** What became of one planned medium: the body the offscreen document holds (a blob URL alive until the run's cleanup), or why it kept its address. */
export interface DownloadItemOutcome {
  /** `<dir>|<address>`, or `<dir>|asset:<id>` for stored bytes — one outcome per planned item. */
  ref: string
  status: 'saved' | 'missing'
  /** `saved` only: the body, as a blob URL of the offscreen document. */
  blobUrl?: string
  /** `saved` only: the response type that names the file. */
  mime?: string
  reason?: DownloadMissingReason
}

/** Worker → the offscreen document: fetch the media (and read the stored assets); the Markdown arrives with DOWNLOAD_FINISH once the outcomes are known. */
export interface DownloadRunMessage extends BaseMessage {
  type: 'DOWNLOAD_RUN'
  requestId: string
  form: DownloadForm
  /** Where the tree lands, relative to the download directory and without a trailing slash (download.md §4.2). */
  basePath: string
  withMedia: boolean
  media: DownloadPlanItem[]
}

/** Worker → the offscreen document (ZIP form only): the composed Markdown and README files; the offscreen document packs them with the fetched bodies into the one archive. */
export interface DownloadFinishMessage extends BaseMessage {
  type: 'DOWNLOAD_FINISH'
  requestId: string
  /** Paths relative to the run's base path. */
  files: { path: string; text: string }[]
}

/** Worker → the offscreen document: stop the run's fetches and let the held bodies go (the worker cancels and removes the files itself, download.md §2.5). The answer comes when the cleanup is done. */
export interface DownloadCancelMessage extends BaseMessage {
  type: 'DOWNLOAD_CANCEL'
  requestId: string
}

/** Offscreen → the worker: the fetched bodies (`media`) or the packed ZIP (`zip`); the worker does the writing. */
export interface DownloadRunEventMessage extends BaseMessage {
  type: 'DOWNLOAD_RUN_EVENT'
  requestId: string
  event: 'progress' | 'media' | 'zip' | 'failed' | 'heartbeat'
  processed?: number
  total?: number
  outcomes?: DownloadItemOutcome[]
  /** True when the run saw the browser offline (download.md §8): the README explains it. */
  offline?: boolean
  /** `zip` only: the packed archive, as a blob URL of the offscreen document. */
  blobUrl?: string
  errorCode?: 'DOWNLOAD_FAILED' | 'DOWNLOAD_ZIP_FAILED'
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
  | OffscreenPingMessage
  | StopRecordingMessage
  | RetryRecordingDownloadMessage
  | DiscardRecordingMessage
  | RecordingEventMessage
  | RecordingCommandMessage
  | RecordingStatusMessage
  | StartPageDownloadMessage
  | ExtractDownloadPageMessage
  | DownloadExtractMessage
  | StartLibraryDownloadMessage
  | CancelDownloadMessage
  | EstimateDownloadMessage
  | ShowDownloadFileMessage
  | DownloadRunMessage
  | DownloadFinishMessage
  | DownloadCancelMessage
  | DownloadRunEventMessage
  | GetSettingsMessage
  | SetSettingsMessage
  | DisableBlockEntryMessage
  | RecordEventMessage
  | GetMetricsMessage
  | UsageEstimateMessage
  | OrphanReportMessage
  | OpenExtensionPageMessage

// ── Messages to a tab's content script (RV-BG-12) ───────────────────────

export interface TriggerScreenshotMessage extends BaseMessage {
  type: 'TRIGGER_SCREENSHOT'
}

export interface TriggerBlockModeMessage extends BaseMessage {
  type: 'TRIGGER_BLOCK_MODE'
}

export interface TriggerAnnotateMessage extends BaseMessage {
  type: 'TRIGGER_ANNOTATE'
}

export interface TriggerDownloadMainMessage extends BaseMessage {
  type: 'TRIGGER_DOWNLOAD_MAIN'
  /** Which entrance asked — the page's metric and wording (download.md §2.3). */
  via: 'command' | 'popup'
}

/**
 * The messages the worker or the popup sends to a tab's top-frame content script. They carry no
 * response data; everything the page answers travels as its own ExtensionMessage.
 */
export type TabMessage =
  TriggerScreenshotMessage | TriggerBlockModeMessage | TriggerAnnotateMessage | TriggerDownloadMainMessage | RecordingLifecycleMessage | DownloadNoticeMessage

// ── Response data: what each message's handler answers (RV-BG-12) ───────

/**
 * The `data` of every response, read from the handlers themselves — not from what a caller hoped
 * for. `undefined` means success carries no data. Worker→offscreen commands (RECORDING_*,
 * DOWNLOAD_RUN/FINISH/CANCEL, OFFSCREEN_PING) are answered with success only.
 */
export interface ResponseDataMap {
  SAVE_CLIP: { entry: EntryRecord }
  SAVE_SCREENSHOT: { entry: EntryRecord }
  DELETE_ENTRY: { id: string }
  UPDATE_ENTRY: { entry: EntryRecord }
  ADD_HIGHLIGHT: { entry: EntryRecord }
  UPDATE_HIGHLIGHT: { entry: EntryRecord }
  REMOVE_HIGHLIGHT: { entry: EntryRecord }
  RESTORE_HIGHLIGHT: { entry: EntryRecord }
  QUERY_ENTRIES: { result: EntryQueryResult & { total?: number } }
  QUERY_HIGHLIGHTS: { result: HighlightQueryResult }
  QUERY_FACETS: { facets: LibraryFacets }
  GET_ENTRY: { entry: EntryRecord | undefined }
  GET_ASSET_DATA_URL: { dataUrl: string }
  LIST_PROPERTIES: { definitions: PropertyDefinition[]; usage?: Record<string, number> }
  UPSERT_PROPERTY: { definitions: PropertyDefinition[] }
  DELETE_PROPERTY: { definitions: PropertyDefinition[] }
  DELETE_UNUSED_PROPERTIES: { removed: string[]; definitions: PropertyDefinition[] }
  USAGE_ESTIMATE: { usage: number; quota: number }
  ORPHAN_REPORT: OrphanReport
  CAPTURE_VISIBLE_TAB: { dataUrl: string }
  FETCH_IMAGE: { dataUrl: string }
  DOWNLOAD_IMAGE: { downloadId: number }
  REMEMBER_FRAME: undefined
  READ_FRAME: { record: FrameRecord | null }
  START_RECORDING: RecordingState
  GET_RECORDING_STATE: RecordingState & { holdsVideo: boolean }
  STOP_RECORDING: RecordingState
  RETRY_RECORDING_DOWNLOAD: RecordingState
  DISCARD_RECORDING: RecordingState
  RECORDING_STATUS: { recording: boolean; cursorHighlight: ExtensionSettings['recording']['cursorHighlight'] }
  RECORDING_EVENT: undefined
  EXTRACT_DOWNLOAD_PAGE: { html: string }
  START_PAGE_DOWNLOAD: { accepted: boolean; total: number }
  START_LIBRARY_DOWNLOAD: { accepted: boolean; total: number }
  ESTIMATE_DOWNLOAD: EstimateDownloadResult
  CANCEL_DOWNLOAD: undefined
  SHOW_DOWNLOAD_FILE: undefined
  DOWNLOAD_RUN_EVENT: undefined
  GET_SETTINGS: ExtensionSettings
  SET_SETTINGS: ExtensionSettings
  DISABLE_BLOCK_ENTRY: ExtensionSettings
  RECORD_EVENT: Record<string, never>
  GET_METRICS: MetricsPanelData
  OPEN_EXTENSION_PAGE: { page: 'library' | 'settings' }
  OFFSCREEN_PING: undefined
  DOWNLOAD_EXTRACT: { html: string }
  RECORDING_START: undefined
  RECORDING_STOP: undefined
  RECORDING_CLEANUP: undefined
  DOWNLOAD_RUN: undefined
  DOWNLOAD_FINISH: undefined
  DOWNLOAD_CANCEL: undefined
}

/** A message type without an entry here fails the Pick below at compile time. */
export type ResponseDataForEveryMessage = Pick<ResponseDataMap, ExtensionMessage['type']>

/** The response `data` of a message type; callers never spell it out (RV-BG-12). */
export type ResponseDataOf<K extends ExtensionMessage['type']> = K extends keyof ResponseDataMap ? ResponseDataMap[K] : never

// ── Coordination: what a message does beyond its own response (RV-BG-13) ─

/** How a message participates in cross-context coordination; false is the answer for every read. */
export interface MessageCoordination {
  /** A write whose success tells the open library pages their lists are stale (the `annhub.entries` broadcast). */
  broadcastsEntryChange: boolean
  /** A creation whose response the worker caches by requestId, so a retry after a lost response cannot create twice (RV-BG-01). */
  cachesResponseByRequestId: boolean
}

const COORDINATION_NONE: MessageCoordination = { broadcastsEntryChange: false, cachesResponseByRequestId: false }
const COORDINATION_BROADCAST: MessageCoordination = { broadcastsEntryChange: true, cachesResponseByRequestId: false }
const COORDINATION_BOTH: MessageCoordination = { broadcastsEntryChange: true, cachesResponseByRequestId: true }

/**
 * One exhaustive row per message type — the single place the broadcast and the idempotency lists
 * come from (RV-BG-13); a message missing here or given a wrong row is a compile error, not a
 * silently stale list. The property registry writes do not broadcast: no product doc says they do.
 */
export const MESSAGE_COORDINATION = {
  SAVE_CLIP: COORDINATION_BOTH,
  SAVE_SCREENSHOT: COORDINATION_BOTH,
  DELETE_ENTRY: COORDINATION_BROADCAST,
  UPDATE_ENTRY: COORDINATION_BROADCAST,
  ADD_HIGHLIGHT: COORDINATION_BROADCAST,
  UPDATE_HIGHLIGHT: COORDINATION_BROADCAST,
  REMOVE_HIGHLIGHT: COORDINATION_BROADCAST,
  RESTORE_HIGHLIGHT: COORDINATION_BROADCAST,
  QUERY_ENTRIES: COORDINATION_NONE,
  QUERY_HIGHLIGHTS: COORDINATION_NONE,
  QUERY_FACETS: COORDINATION_NONE,
  GET_ENTRY: COORDINATION_NONE,
  GET_ASSET_DATA_URL: COORDINATION_NONE,
  LIST_PROPERTIES: COORDINATION_NONE,
  UPSERT_PROPERTY: COORDINATION_NONE,
  DELETE_PROPERTY: COORDINATION_NONE,
  DELETE_UNUSED_PROPERTIES: COORDINATION_NONE,
  CAPTURE_VISIBLE_TAB: COORDINATION_NONE,
  FETCH_IMAGE: COORDINATION_NONE,
  DOWNLOAD_IMAGE: COORDINATION_NONE,
  REMEMBER_FRAME: COORDINATION_NONE,
  READ_FRAME: COORDINATION_NONE,
  START_RECORDING: COORDINATION_NONE,
  GET_RECORDING_STATE: COORDINATION_NONE,
  OFFSCREEN_PING: COORDINATION_NONE,
  STOP_RECORDING: COORDINATION_NONE,
  RETRY_RECORDING_DOWNLOAD: COORDINATION_NONE,
  DISCARD_RECORDING: COORDINATION_NONE,
  RECORDING_EVENT: COORDINATION_NONE,
  RECORDING_STATUS: COORDINATION_NONE,
  RECORDING_START: COORDINATION_NONE,
  RECORDING_STOP: COORDINATION_NONE,
  RECORDING_CLEANUP: COORDINATION_NONE,
  START_PAGE_DOWNLOAD: COORDINATION_NONE,
  EXTRACT_DOWNLOAD_PAGE: COORDINATION_NONE,
  DOWNLOAD_EXTRACT: COORDINATION_NONE,
  START_LIBRARY_DOWNLOAD: COORDINATION_NONE,
  CANCEL_DOWNLOAD: COORDINATION_NONE,
  ESTIMATE_DOWNLOAD: COORDINATION_NONE,
  SHOW_DOWNLOAD_FILE: COORDINATION_NONE,
  DOWNLOAD_RUN: COORDINATION_NONE,
  DOWNLOAD_FINISH: COORDINATION_NONE,
  DOWNLOAD_CANCEL: COORDINATION_NONE,
  DOWNLOAD_RUN_EVENT: COORDINATION_NONE,
  GET_SETTINGS: COORDINATION_NONE,
  SET_SETTINGS: COORDINATION_NONE,
  DISABLE_BLOCK_ENTRY: COORDINATION_NONE,
  RECORD_EVENT: COORDINATION_NONE,
  GET_METRICS: COORDINATION_NONE,
  USAGE_ESTIMATE: COORDINATION_NONE,
  ORPHAN_REPORT: COORDINATION_NONE,
  OPEN_EXTENSION_PAGE: COORDINATION_NONE,
} satisfies Record<ExtensionMessage['type'], MessageCoordination>

export type MessageCoordinationTable = typeof MESSAGE_COORDINATION

/** The writes that broadcast `entries-changed` to the open library pages (RV-BG-13). */
export const ENTRY_CHANGE_BROADCAST_TYPES: ReadonlySet<string> = new Set(
  (Object.keys(MESSAGE_COORDINATION) as ExtensionMessage['type'][]).filter(type => MESSAGE_COORDINATION[type].broadcastsEntryChange),
)

/** The creations whose response is cached by requestId (RV-BG-01, RV-BG-13). */
export const REQUEST_ID_CACHED_TYPES: ReadonlySet<string> = new Set(
  (Object.keys(MESSAGE_COORDINATION) as ExtensionMessage['type'][]).filter(type => MESSAGE_COORDINATION[type].cachesResponseByRequestId),
)
