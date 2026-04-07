import { HighlightRecord, HighlightQuery } from './highlight'
import { ClipRecord } from './clip'
import { LogseqConfig, LogseqSyncResult } from './logseq'
import { VocabConfig, LlmConfig } from './vocabulary'

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


export interface GetStorageMessage extends BaseMessage {
    type: 'GET_STORAGE'
    key: string
}

export interface SetStorageMessage extends BaseMessage {
    type: 'SET_STORAGE'
    key: string
    value: any
}

export interface ClearStorageMessage extends BaseMessage {
    type: 'CLEAR_STORAGE'
    key?: string
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


export interface LogseqTestConnectionMessage extends BaseMessage {
    type: 'LOGSEQ_TEST_CONNECTION'
}

export interface LogseqGetConfigMessage extends BaseMessage {
    type: 'LOGSEQ_GET_CONFIG'
}

export interface LogseqSetConfigMessage extends BaseMessage {
    type: 'LOGSEQ_SET_CONFIG'
    config: Partial<LogseqConfig>
}

export interface LogseqSyncHighlightMessage extends BaseMessage {
    type: 'LOGSEQ_SYNC_HIGHLIGHT'
    data: HighlightRecord
}

export interface LogseqSyncClipMessage extends BaseMessage {
    type: 'LOGSEQ_SYNC_CLIP'
    data: ClipRecord
}

export interface LogseqSyncAllMessage extends BaseMessage {
    type: 'LOGSEQ_SYNC_ALL'
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
    services: {
        highlight: boolean
        config: boolean
    }
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


export type UIToBackgroundMessage =
    | GetHighlightsMessage
    | SaveHighlightMessage
    | UpdateHighlightMessage
    | DeleteHighlightMessage
    | GetCurrentPageHighlightsMessage
    | LocateHighlightMessage
    | GetHighlightStatsMessage
    | GetStorageMessage
    | SetStorageMessage
    | ClearStorageMessage
    | CaptureTabMessage
    | InitializeMessage
    | GetVersionMessage
    | GetStatusMessage
    | ClearAllHighlightsMessage
    | SaveClipMessage
    | ToggleHighlighterModeMessage
    | LogseqTestConnectionMessage
    | LogseqGetConfigMessage
    | LogseqSetConfigMessage
    | LogseqSyncHighlightMessage
    | LogseqSyncClipMessage
    | LogseqSyncAllMessage
    | GetVocabConfigMessage
    | SetVocabConfigMessage
    | GetLlmConfigMessage
    | SetLlmConfigMessage
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

export type BackgroundToUIMessage =
    | ResponseMessage<HighlightRecord[]>
    | ResponseMessage<HighlightRecord>
    | ResponseMessage<HighlightStatsResponse>
    | ResponseMessage<SystemStatus>
    | ResponseMessage<LogseqConfig>
    | ResponseMessage<LogseqSyncResult>
    | ResponseMessage<any>
    | ScreenshotCapturedMessage
    | ScreenshotErrorMessage
    | TriggerScreenshotMessage


export type MessageHandler<T extends BaseMessage = BaseMessage> = (
    message: T,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ResponseMessage) => void
) => void | Promise<void>


export interface MessageUtils {
    sendMessage: <T = any>(message: UIToBackgroundMessage) => Promise<ResponseMessage<T>>
    createResponse: <T = any>(success: boolean, data?: T, error?: string) => ResponseMessage<T>
    generateRequestId: () => string
}
