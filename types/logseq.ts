export interface LogseqConfig {
    enabled: boolean
    serverUrl: string
    authToken: string
    autoSync: boolean
    pagePrefix: string
}

export const DEFAULT_LOGSEQ_CONFIG: LogseqConfig = {
    enabled: false,
    serverUrl: 'http://127.0.0.1:12315',
    authToken: '',
    autoSync: false,
    pagePrefix: 'AnnHub',
}

export interface LogseqApiRequest {
    method: string
    args: any[]
}

export interface LogseqPage {
    id: number
    uuid: string
    name: string
    originalName: string
    properties?: Record<string, any>
}

export interface LogseqBlock {
    id: number
    uuid: string
    content: string
    properties?: Record<string, any>
    children?: LogseqBlock[]
    left?: { id: number }
    parent?: { id: number }
}

export interface LogseqSyncResult {
    success: boolean
    pageCreated: boolean
    blockAppended: boolean
    skippedDuplicate: boolean
    error?: string
}
