
export interface NoteRecord {
    id: string
    url: string
    domain: string
    selector: string
    originalText: string
    textHash: string
    summary: string
    userComment: string
    timestamp: number
    lastModified: number
    position: { x: number; y: number }
    context: {
        before: string
        after: string
    }
    status: 'active' | 'archived' | 'deleted'
    type: 'manual' | 'auto'
    tags: string[]
    metadata: {
        pageTitle: string
        pageUrl: string
        userId?: string
    }
}

export interface NoteSearchOptions {
    url?: string
    domain?: string
    text?: string
    tags?: string[]
    status?: 'active' | 'archived' | 'deleted'
    limit?: number
    offset?: number
    sortBy?: 'timestamp' | 'lastModified' | 'relevance'
    sortOrder?: 'asc' | 'desc'
}

export interface NoteMatchResult {
    note: NoteRecord
    confidence: number
    matchType: 'exact' | 'fuzzy' | 'context'
    element: Element | null
    position: DOMRect | null
}