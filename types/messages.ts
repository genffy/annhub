import type { HighlightRecord, HighlightQuery } from './highlight'
import type { ClipRecord } from './clip'
import type { LlmConfig } from './llm'
import type { FragmentKind, FragmentRecord, ScreenshotRecord, ImageAsset } from '../learning-core/types'
import type { FragmentPatch } from '../learning-core/fragment-store'
import type { ExtensionPage, ExtensionPageParams } from '../utils/extension-pages'
import type { FragmentQuery, FragmentQueryResult } from '../learning-core/query'

export type RequiredFields<T, K extends keyof T> = Required<Pick<T, K>> & Partial<Omit<T, K>>

export interface BaseMessage {
  type: string
  requestId?: string
  timestamp?: number
}

export interface ResponseMessage<T = any> extends BaseMessage {
  success: boolean
  data?: T
  error?: string
}

export interface GetHighlightsMessage extends BaseMessage {
  type: 'GET_HIGHLIGHTS'
  query?: HighlightQuery
}

export interface SaveHighlightMessage extends BaseMessage {
  type: 'SAVE_HIGHLIGHT'
  data: HighlightRecord
}

export interface UpdateHighlightMessage extends BaseMessage {
  type: 'UPDATE_HIGHLIGHT'
  data: RequiredFields<HighlightRecord, 'id'>
}

export interface DeleteHighlightMessage extends BaseMessage {
  type: 'DELETE_HIGHLIGHT'
  data: {
    id: string
  }
}

export interface ClearAllHighlightsMessage extends BaseMessage {
  type: 'CLEAR_ALL_HIGHLIGHTS'
}

export interface SaveClipMessage extends BaseMessage {
  type: 'SAVE_CLIP'
  data: ClipRecord
}

/** Content script → background: open one of the extension's own pages (a content script cannot navigate to chrome-extension:// itself). */
export interface OpenExtensionPageMessage extends BaseMessage {
  type: 'OPEN_EXTENSION_PAGE'
  page: ExtensionPage
  params?: ExtensionPageParams
}

/** Library → background: every saved clip, oldest first. */
export interface GetClipsMessage extends BaseMessage {
  type: 'GET_CLIPS'
}

/** Removes one saved clip — the undo behind the “已剪藏” toast (extension.md §3.3). */
export interface DeleteClipMessage extends BaseMessage {
  type: 'DELETE_CLIP'
  id: string
}

/** Background → content (keyboard shortcut); content scripts handle it, the service worker does not. */
export interface ToggleHighlighterModeMessage extends BaseMessage {
  type: 'TOGGLE_HIGHLIGHTER_MODE'
}

export interface GetCurrentPageHighlightsMessage extends BaseMessage {
  type: 'GET_CURRENT_PAGE_HIGHLIGHTS'
  url: string
}

export interface LocateHighlightMessage extends BaseMessage {
  type: 'LOCATE_HIGHLIGHT'
  data: {
    id: string
  }
}

export interface GetHighlightStatsMessage extends BaseMessage {
  type: 'GET_HIGHLIGHT_STATS'
  url?: string
}

export interface HighlightStatsResponse {
  total: number
  active: number
  archived: number
  deleted: number
}

export interface CaptureTabMessage extends BaseMessage {
  type: 'CAPTURE_VISIBLE_TAB'
  requestId: string
}

export interface TriggerScreenshotMessage extends BaseMessage {
  type: 'TRIGGER_SCREENSHOT'
  command: string
}

/**
 * Content → background: persist a processed screenshot, download a PNG, or
 * both. See docs/v2/screenshot.md.
 */
export interface SaveScreenshotMessage extends BaseMessage {
  type: 'SAVE_SCREENSHOT'
  data: {
    /** Preferred transport: processed PNG bytes (storage.md §3.5). */
    bytes?: Blob
    /** Legacy transport, still used by the download-only path. */
    dataUrl?: string
    filename: string
    mimeType?: ImageAsset['mimeType']
    persist?: boolean
    download?: boolean
    sourceUrl?: string
    sourceTitle?: string
    capturedAt?: number
  }
}

/** Content → background: fetch a public cross-origin image as a dataUrl (host permissions bypass page CORS; private networks and non-images are refused). Used to inline images for element capture. */
export interface FetchResourceMessage extends BaseMessage {
  type: 'FETCH_RESOURCE'
  data: { url: string }
}

/** Screenshot library entry: record + asset metadata (bytes stay in the asset store). */
export type ScreenshotLibraryItem = ScreenshotRecord & { asset: ImageAsset }

/** UI → background: list / delete screenshot library items. */
export interface GetScreenshotsMessage extends BaseMessage {
  type: 'GET_SCREENSHOTS'
}

export interface DeleteScreenshotMessage extends BaseMessage {
  type: 'DELETE_SCREENSHOT'
  data: { id: string }
}

// ── Optional model Provider (ai.md §8) ──

export interface GetLlmConfigMessage extends BaseMessage {
  type: 'GET_LLM_CONFIG'
}

export interface SetLlmConfigMessage extends BaseMessage {
  type: 'SET_LLM_CONFIG'
  config: Partial<LlmConfig>
}

export interface TestLlmConnectionMessage extends BaseMessage {
  type: 'TEST_LLM_CONNECTION'
  config?: Partial<LlmConfig>
}

// ── Fragment capture (L1 + L2) messages ──

/** Capture-time input for any enabled kind; the shared factory assembles + validates the record (docs/v2/fragments.md). */
export interface SaveFragmentInput {
  kind: FragmentKind
  content: string
  excerpt: string
  sourceUrl: string
  sourceTitle?: string
  locator?: FragmentRecord['context']['locator']
  guess?: string
  verified: FragmentRecord['processing']['verified']
  use: string
  tags?: string[]
  detail: unknown
}

export interface SaveFragmentMessage extends BaseMessage {
  type: 'SAVE_FRAGMENT'
  input: SaveFragmentInput
  /** Set when the user confirmed "save as a new context anyway" on a duplicate. */
  force?: boolean
}

export interface FragmentSaveResponse {
  fragment?: FragmentRecord
  duplicateOf?: FragmentRecord
}

export interface GetFragmentsMessage extends BaseMessage {
  type: 'GET_FRAGMENTS'
  query?: FragmentQuery
}

export interface UpdateFragmentMessage extends BaseMessage {
  type: 'UPDATE_FRAGMENT'
  id: string
  /** Capture-field patch; protected-field edits must carry a fresh verification. */
  patch: FragmentPatch
}

export interface DeleteFragmentMessage extends BaseMessage {
  type: 'DELETE_FRAGMENT'
  id: string
}

export interface GetFragmentStatsMessage extends BaseMessage {
  type: 'GET_FRAGMENT_STATS'
}

export interface FragmentStatsResponse {
  total: number
  newThisWeek: number
  /** Fragments whose `review.nextReviewAt` has passed (Desktop-returned state once R3 data arrived). */
  due: number
}

/** Desktop direct connection (storage §6): read/write config, ping, one-shot sync. */
export interface GetDirectConnectConfigMessage extends BaseMessage {
  type: 'GET_DESKTOP_DIRECT_CONNECT'
}

/** `token` omitted keeps the stored pairing code, `''` unpairs; `endpoint` must be a loopback origin. */
export interface SetDirectConnectConfigMessage extends BaseMessage {
  type: 'SET_DESKTOP_DIRECT_CONNECT'
  config: { endpoint?: string; token?: string; autoSync?: boolean }
}

export interface FlushDesktopDirectConnectMessage extends BaseMessage {
  type: 'FLUSH_DESKTOP_DIRECT_CONNECT'
}

/** Items Desktop refused stay queued but parked: `retry` re-queues and delivers them, `dismiss` drops them. */
export interface ResolveRejectedDeliveriesMessage extends BaseMessage {
  type: 'RESOLVE_REJECTED_DELIVERIES'
  action: 'retry' | 'dismiss'
}

/** The single user export runs page-side (entrypoints/export-content.ts): Blobs cannot cross runtime messaging. */

export interface CaptureConfig {
  /** Deep mode adds the 理解 (guess) step to the capture modal (extension PRD §4.2). */
  deepMode: boolean
}

/** Visible sync conflict/skip reports (storage.md §9). */
export interface GetSyncReportsMessage extends BaseMessage {
  type: 'GET_SYNC_REPORTS'
}

/** Content → background: the sender's tab id (draft keys need tab identity, PRD §9). */
export interface GetTabIdMessage extends BaseMessage {
  type: 'GET_TAB_ID'
}

/** Orphan asset report + cleanup (storage.md §10). */
export interface GetOrphanAssetsMessage extends BaseMessage {
  type: 'GET_ORPHAN_ASSETS'
}

export interface CleanupOrphanAssetsMessage extends BaseMessage {
  type: 'CLEANUP_ORPHAN_ASSETS'
}

/** Capture funnel counters — events only, never content (roadmap R1.4). */
export interface GetCaptureMetricsMessage extends BaseMessage {
  type: 'GET_CAPTURE_METRICS'
}

export interface RecordCaptureMetricMessage extends BaseMessage {
  type: 'RECORD_CAPTURE_METRIC'
  event: 'modal-opened' | 'reached-verify' | 'reached-apply' | 'saved' | 'exited'
  step?: string
  /** `capture.exited` only: whether the user had typed anything (metrics.md `had_input`). */
  hadInput?: boolean
  /** `capture.exited` only: the safe exit used, if any (metrics.md `fallback`). */
  fallback?: 'none' | 'highlight' | 'clip'
}

export interface GetCaptureConfigMessage extends BaseMessage {
  type: 'GET_CAPTURE_CONFIG'
}

export interface SetCaptureConfigMessage extends BaseMessage {
  type: 'SET_CAPTURE_CONFIG'
  config: Partial<CaptureConfig>
}

export type UIToBackgroundMessage =
  | SaveScreenshotMessage
  | FetchResourceMessage
  | GetScreenshotsMessage
  | DeleteScreenshotMessage
  | GetHighlightsMessage
  | SaveHighlightMessage
  | UpdateHighlightMessage
  | DeleteHighlightMessage
  | GetCurrentPageHighlightsMessage
  | LocateHighlightMessage
  | GetHighlightStatsMessage
  | CaptureTabMessage
  | ClearAllHighlightsMessage
  | SaveClipMessage
  | GetClipsMessage
  | DeleteClipMessage
  | OpenExtensionPageMessage
  | GetLlmConfigMessage
  | SetLlmConfigMessage
  | TestLlmConnectionMessage
  | SaveFragmentMessage
  | GetFragmentsMessage
  | UpdateFragmentMessage
  | DeleteFragmentMessage
  | GetFragmentStatsMessage
  | GetDirectConnectConfigMessage
  | SetDirectConnectConfigMessage
  | FlushDesktopDirectConnectMessage
  | ResolveRejectedDeliveriesMessage
  | GetTabIdMessage
  | GetOrphanAssetsMessage
  | CleanupOrphanAssetsMessage
  | GetSyncReportsMessage
  | GetCaptureMetricsMessage
  | RecordCaptureMetricMessage
  | GetCaptureConfigMessage
  | SetCaptureConfigMessage

export type BackgroundToUIMessage =
  | ResponseMessage<HighlightRecord[]>
  | ResponseMessage<HighlightRecord>
  | ResponseMessage<HighlightStatsResponse>
  | ResponseMessage<FragmentSaveResponse>
  | ResponseMessage<FragmentQueryResult>
  | ResponseMessage<FragmentStatsResponse>
  | ResponseMessage<ScreenshotLibraryItem[]>
  | ResponseMessage<CaptureConfig>
  | ResponseMessage<any>
  | TriggerScreenshotMessage
  | ToggleHighlighterModeMessage
