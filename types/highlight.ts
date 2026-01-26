export interface HighlightRecord {
    id: string
    url: string
    domain: string
    selector: string
    originalText: string
    textHash: string
    color: string
    timestamp: number
    lastModified: number
    position: {
        x: number
        y: number
        width: number
        height: number
    }
    context: {
        before: string
        after: string
    }
    status: 'active' | 'archived' | 'deleted'
    metadata: {
        pageTitle: string
        pageUrl: string
        userId?: string
    }
}

export interface HighlightColor {
    name: string
    value: string
    textColor: string
}

export interface HighlightConfig {
    enabled: boolean
    colors: HighlightColor[]
    defaultColor: string
    maxHighlights: number
    autoSync: boolean
}

export interface HighlightResult {
    success: boolean
    data?: HighlightRecord
    error?: string
}

export interface HighlightQuery {
    url?: string
    domain?: string
    status?: 'active' | 'archived' | 'deleted'
    limit?: number
    offset?: number
    id?: string
} 