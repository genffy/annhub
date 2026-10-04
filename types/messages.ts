import type { HighlightRecord, HighlightQuery } from './highlight'
import type { ClipRecord } from './clip'
import type { VocabConfig, LlmConfig, VocabLearningEvent, VocabSyncState } from './vocabulary'
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

export interface ScreenshotCapturedMessage extends BaseMessage {
  type: 'SCREENSHOT_CAPTURED'
  dataUrl: string
  requestId: string
}

export interface ScreenshotErrorMessage extends BaseMessage {
  type: 'SCREENSHOT_ERROR'
  error: string
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

/** Content → background: fetch a cross-origin resource as a dataUrl (host permissions bypass page CORS). Used to inline images for element capture. */
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

export interface InitializeMessage extends BaseMessage {
  type: 'INITIALIZE'
}

export interface GetVersionMessage extends BaseMessage {
  type: 'GET_VERSION'
}

export interface GetStatusMessage extends BaseMessage {
  type: 'GET_STATUS'
}

export interface SystemStatus {
  isInitialized: boolean
  /** Per-service readiness, keyed by service name (config/highlight/clip/logseq/vocabulary/fragment). */
  services: Record<string, boolean>
  version: string
}

// ── Vocabulary & LLM messages ──

export interface GetVocabConfigMessage extends BaseMessage {
  type: 'GET_VOCAB_CONFIG'
}

export interface SetVocabConfigMessage extends BaseMessage {
  type: 'SET_VOCAB_CONFIG'
  config: Partial<VocabConfig>
}

export interface GetLlmConfigMessage extends BaseMessage {
  type: 'GET_LLM_CONFIG'
}

export interface SetLlmConfigMessage extends BaseMessage {
  type: 'SET_LLM_CONFIG'
  config: Partial<LlmConfig>
}

export interface GetVocabSnapshotMessage extends BaseMessage {
  type: 'GET_VOCAB_SNAPSHOT'
  words?: string[]
}

export interface RefreshVocabMessage extends BaseMessage {
  type: 'REFRESH_VOCAB'
  force?: boolean
}

export interface GetEudicCategoriesMessage extends BaseMessage {
  type: 'GET_EUDIC_CATEGORIES'
  language?: string
}

export interface CreateEudicCategoryMessage extends BaseMessage {
  type: 'CREATE_EUDIC_CATEGORY'
  name: string
  language?: string
}

export interface RenameEudicCategoryMessage extends BaseMessage {
  type: 'RENAME_EUDIC_CATEGORY'
  id: string
  name: string
  language?: string
}

export interface DeleteEudicCategoryMessage extends BaseMessage {
  type: 'DELETE_EUDIC_CATEGORY'
  id: string
  name: string
  language?: string
}

export interface GetEudicWordsMessage extends BaseMessage {
  type: 'GET_EUDIC_WORDS'
  categoryId: string
  language?: string
  page?: number
  pageSize?: number
}

export interface AddEudicWordMessage extends BaseMessage {
  type: 'ADD_EUDIC_WORD'
  word: string
  language?: string
  star?: number
  contextLine?: string
  categoryIds?: string[]
}

export interface DeleteEudicWordsMessage extends BaseMessage {
  type: 'DELETE_EUDIC_WORDS'
  categoryId: string
  words: string[]
  language?: string
}

export interface GetEudicWordMessage extends BaseMessage {
  type: 'GET_EUDIC_WORD'
  word: string
  language?: string
}

export interface ContextGlossMessage extends BaseMessage {
  type: 'CONTEXT_GLOSS'
  word: string
  sentence: string
  targetLanguage?: string
}

export interface SelectAndGlossMessage extends BaseMessage {
  type: 'SELECT_AND_GLOSS'
  candidates: Array<{ word: string; sentence: string }>
  targetLanguage?: string
}

export interface FetchLlmModelsMessage extends BaseMessage {
  type: 'FETCH_LLM_MODELS'
  config?: Partial<LlmConfig>
}

export interface TestLlmConnectionMessage extends BaseMessage {
  type: 'TEST_LLM_CONNECTION'
  config?: Partial<LlmConfig>
}

export interface EnsureVocabLearningCategoryMessage extends BaseMessage {
  type: 'ENSURE_VOCAB_LEARNING_CATEGORY'
  language?: string
  name?: string
}

export interface SelectVocabLearningCategoryMessage extends BaseMessage {
  type: 'SELECT_VOCAB_LEARNING_CATEGORY'
  categoryId: string
}

export interface EnsureVocabMasteredCategoryMessage extends BaseMessage {
  type: 'ENSURE_VOCAB_MASTERED_CATEGORY'
  language?: string
  name?: string
}

export interface SelectVocabMasteredCategoryMessage extends BaseMessage {
  type: 'SELECT_VOCAB_MASTERED_CATEGORY'
  categoryId: string
}

export interface SyncVocabLearningProfileMessage extends BaseMessage {
  type: 'SYNC_VOCAB_LEARNING_PROFILE'
  force?: boolean
}

export interface RecordVocabLearningEventMessage extends BaseMessage {
  type: 'RECORD_VOCAB_LEARNING_EVENT'
  event: VocabLearningEvent
}

export interface FlushVocabLearningPendingMessage extends BaseMessage {
  type: 'FLUSH_VOCAB_LEARNING_PENDING'
}

export interface GetVocabLearningSyncStateMessage extends BaseMessage {
  type: 'GET_VOCAB_LEARNING_SYNC_STATE'
}

export interface GetVocabLearningProfileMessage extends BaseMessage {
  type: 'GET_VOCAB_LEARNING_PROFILE'
  words?: string[]
}

export interface ResetVocabWordLearningMessage extends BaseMessage {
  type: 'RESET_VOCAB_WORD_LEARNING'
  word: string
  language?: string
}

export interface RecordVocabExposuresMessage extends BaseMessage {
  type: 'RECORD_VOCAB_EXPOSURES'
  words: string[]
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

export interface CheckFragmentDuplicateMessage extends BaseMessage {
  type: 'CHECK_FRAGMENT_DUPLICATE'
  content: string
  excerpt: string
  sourceUrl: string
}

/** Desktop direct connection (storage §6): read/write config, ping, one-shot sync. */
export interface GetDirectConnectConfigMessage extends BaseMessage {
  type: 'GET_DESKTOP_DIRECT_CONNECT'
}

export interface SetDirectConnectConfigMessage extends BaseMessage {
  type: 'SET_DESKTOP_DIRECT_CONNECT'
  config: { endpoint?: string; token?: string; autoSync?: boolean }
}

export interface FlushDesktopDirectConnectMessage extends BaseMessage {
  type: 'FLUSH_DESKTOP_DIRECT_CONNECT'
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
  | InitializeMessage
  | GetVersionMessage
  | GetStatusMessage
  | ClearAllHighlightsMessage
  | SaveClipMessage
  | GetClipsMessage
  | DeleteClipMessage
  | OpenExtensionPageMessage
  | GetVocabConfigMessage
  | SetVocabConfigMessage
  | GetLlmConfigMessage
  | SetLlmConfigMessage
  | FetchLlmModelsMessage
  | TestLlmConnectionMessage
  | GetVocabSnapshotMessage
  | RefreshVocabMessage
  | GetEudicCategoriesMessage
  | CreateEudicCategoryMessage
  | RenameEudicCategoryMessage
  | DeleteEudicCategoryMessage
  | GetEudicWordsMessage
  | AddEudicWordMessage
  | DeleteEudicWordsMessage
  | GetEudicWordMessage
  | ContextGlossMessage
  | SelectAndGlossMessage
  | EnsureVocabLearningCategoryMessage
  | SelectVocabLearningCategoryMessage
  | EnsureVocabMasteredCategoryMessage
  | SelectVocabMasteredCategoryMessage
  | SyncVocabLearningProfileMessage
  | RecordVocabLearningEventMessage
  | FlushVocabLearningPendingMessage
  | GetVocabLearningSyncStateMessage
  | GetVocabLearningProfileMessage
  | ResetVocabWordLearningMessage
  | RecordVocabExposuresMessage
  | SaveFragmentMessage
  | GetFragmentsMessage
  | UpdateFragmentMessage
  | DeleteFragmentMessage
  | GetFragmentStatsMessage
  | CheckFragmentDuplicateMessage
  | GetDirectConnectConfigMessage
  | SetDirectConnectConfigMessage
  | FlushDesktopDirectConnectMessage
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
  | ResponseMessage<SystemStatus>
  | ResponseMessage<VocabSyncState>
  | ResponseMessage<FragmentSaveResponse>
  | ResponseMessage<FragmentQueryResult>
  | ResponseMessage<FragmentStatsResponse>
  | ResponseMessage<ScreenshotLibraryItem[]>
  | ResponseMessage<CaptureConfig>
  | ResponseMessage<any>
  | ScreenshotCapturedMessage
  | ScreenshotErrorMessage
  | TriggerScreenshotMessage
  | ToggleHighlighterModeMessage

export type MessageHandler<T extends BaseMessage = BaseMessage> = (
  message: T,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ResponseMessage) => void,
) => void | Promise<void>

export interface MessageUtils {
  sendMessage: <T = any>(message: UIToBackgroundMessage) => Promise<ResponseMessage<T>>
  createResponse: <T = any>(success: boolean, data?: T, error?: string) => ResponseMessage<T>
  generateRequestId: () => string
}
