export interface LogseqConfig {
    enabled: boolean
    serverUrl: string
    authToken: string
    autoSync: boolean
    // Journal-based sync settings
    syncMode: 'journal' // Always journal mode now
    customTags: string // Comma-separated custom tags, e.g., "#reading #research"
    autoTagDomain: boolean // Automatically add domain as tag, e.g., "#example.com"
}

export const DEFAULT_LOGSEQ_CONFIG: LogseqConfig = {
    enabled: false,
    serverUrl: 'http://127.0.0.1:12315',
    authToken: '',
    autoSync: false,
    syncMode: 'journal',
    customTags: '',
    autoTagDomain: true,
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
