import { HighlightRecord, HighlightQuery } from './highlight'
import { NoteRecord } from './note'
import { TranslationConfig, TranslationRules } from './translate'

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


export interface GetConfigMessage extends BaseMessage {
    type: 'GET_CONFIG'
    configType: 'translation' | 'rules'
}

export interface SetConfigMessage extends BaseMessage {
    type: 'SET_CONFIG'
    configType: 'translation' | 'rules'
    config: TranslationConfig | TranslationRules
}

export interface InitializeConfigMessage extends BaseMessage {
    type: 'INITIALIZE_CONFIG'
}

export interface ResetConfigMessage extends BaseMessage {
    type: 'RESET_CONFIG'
}


export interface TranslateTextMessage extends BaseMessage {
    type: 'TRANSLATE_TEXT'
    text: string
    targetLanguage?: string
    sourceLanguage?: string
}

export interface TranslateResponse {
    translatedText: string
    sourceLanguage: string
    targetLanguage: string
    provider: string
}


export interface GetHighlightsMessage extends BaseMessage {
    type: 'GET_HIGHLIGHTS'
    query?: HighlightQuery
}

export interface SaveHighlightMessage extends BaseMessage {
    type: 'SAVE_HIGHLIGHT'
    data: HighlightRecord
    // text: string
    // range: {
    //     startOffset: number
    //     endOffset: number
    //     startContainerPath: string
    //     endContainerPath: string
    // }
    // color?: string
    // pageInfo: {
    //     url: string
    //     title: string
    //     domain: string
    // }
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


export interface GetNotesMessage extends BaseMessage {
    type: 'GET_NOTES'
    query?: {
        url?: string
        domain?: string
        status?: 'active' | 'archived' | 'deleted'
        limit?: number
        offset?: number
    }
}

export interface SaveNoteMessage extends BaseMessage {
    type: 'SAVE_NOTE'
    text: string
    range: {
        startOffset: number
        endOffset: number
        startContainerPath: string
        endContainerPath: string
    }
    comment?: string
    pageInfo: {
        url: string
        title: string
        domain: string
    }
}

export interface UpdateNoteMessage extends BaseMessage {
    type: 'UPDATE_NOTE'
    noteId: string
    updates: Partial<Pick<NoteRecord, 'userComment' | 'status' | 'tags'>>
}

export interface DeleteNoteMessage extends BaseMessage {
    type: 'DELETE_NOTE'
    noteId: string
}

export interface GetNoteStatsMessage extends BaseMessage {
    type: 'GET_NOTE_STATS'
    url?: string
}

export interface NoteStatsResponse {
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
        translation: boolean
        highlight: boolean
        config: boolean
    }
    version: string
}


export type UIToBackgroundMessage =
    | GetConfigMessage
    | SetConfigMessage
    | InitializeConfigMessage
    | ResetConfigMessage
    | TranslateTextMessage
    | GetHighlightsMessage
    | SaveHighlightMessage
    | UpdateHighlightMessage
    | DeleteHighlightMessage
    | GetCurrentPageHighlightsMessage
    | LocateHighlightMessage
    | GetHighlightStatsMessage
    | GetNotesMessage
    | SaveNoteMessage
    | UpdateNoteMessage
    | DeleteNoteMessage
    | GetNoteStatsMessage
    | GetStorageMessage
    | SetStorageMessage
    | ClearStorageMessage
    | CaptureTabMessage
    | InitializeMessage
    | GetVersionMessage
    | GetStatusMessage
    | ClearAllHighlightsMessage

export type BackgroundToUIMessage =
    | ResponseMessage<TranslationConfig | TranslationRules>
    | ResponseMessage<TranslateResponse>
    | ResponseMessage<HighlightRecord[]>
    | ResponseMessage<HighlightRecord>
    | ResponseMessage<HighlightStatsResponse>
    | ResponseMessage<NoteRecord[]>
    | ResponseMessage<NoteRecord>
    | ResponseMessage<NoteStatsResponse>
    | ResponseMessage<SystemStatus>
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