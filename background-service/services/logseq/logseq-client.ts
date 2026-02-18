import { LogseqApiRequest, LogseqBlock, LogseqConfig, LogseqPage } from '../../../types/logseq'
import { Logger } from '../../../utils/logger'

/**
 * HTTP client for Logseq's local server API.
 * Wraps all calls to POST /api with proper auth headers.
 */
export class LogseqClient {
    private serverUrl: string
    private authToken: string

    constructor(config: Pick<LogseqConfig, 'serverUrl' | 'authToken'>) {
        this.serverUrl = config.serverUrl.replace(/\/+$/, '')
        this.authToken = config.authToken
    }

    updateConfig(config: Pick<LogseqConfig, 'serverUrl' | 'authToken'>): void {
        this.serverUrl = config.serverUrl.replace(/\/+$/, '')
        this.authToken = config.authToken
    }

    private async call<T = any>(method: string, ...args: any[]): Promise<T> {
        const body: LogseqApiRequest = { method, args }

        const resp = await fetch(`${this.serverUrl}/api`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`,
            },
            body: JSON.stringify(body),
        })

        if (!resp.ok) {
            const text = await resp.text().catch(() => '')
            throw new Error(`Logseq API ${method} failed: ${resp.status} ${text}`)
        }

        const data = await resp.json()
        return data as T
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.call('logseq.App.getCurrentGraph')
            return true
        } catch (err) {
            Logger.warn('[LogseqClient] Connection test failed:', err)
            return false
        }
    }

    async getPage(pageName: string): Promise<LogseqPage | null> {
        try {
            const result = await this.call<LogseqPage | null>('logseq.Editor.getPage', pageName)
            return result
        } catch {
            return null
        }
    }

    async createPage(
        pageName: string,
        properties?: Record<string, any>,
        options?: { createFirstBlock?: boolean; redirect?: boolean }
    ): Promise<LogseqPage | null> {
        const opts = { createFirstBlock: false, redirect: false, ...options }
        return this.call<LogseqPage | null>(
            'logseq.Editor.createPage',
            pageName,
            properties ?? {},
            opts
        )
    }

    async appendBlockInPage(
        pageName: string,
        content: string,
        options?: { properties?: Record<string, any> }
    ): Promise<LogseqBlock | null> {
        return this.call<LogseqBlock | null>(
            'logseq.Editor.appendBlockInPage',
            pageName,
            content,
            options ?? {}
        )
    }

    async insertBlock(
        srcBlockUUID: string,
        content: string,
        options?: { before?: boolean; sibling?: boolean; properties?: Record<string, any> }
    ): Promise<LogseqBlock | null> {
        return this.call<LogseqBlock | null>(
            'logseq.Editor.insertBlock',
            srcBlockUUID,
            content,
            options ?? {}
        )
    }

    async getPageBlocksTree(pageName: string): Promise<LogseqBlock[]> {
        try {
            const result = await this.call<LogseqBlock[]>('logseq.Editor.getPageBlocksTree', pageName)
            return result ?? []
        } catch {
            return []
        }
    }

    /**
     * Ensure a page exists, creating it with properties if needed.
     * Returns true if the page was newly created.
     */
    async ensurePage(
        pageName: string,
        properties?: Record<string, any>
    ): Promise<{ page: LogseqPage | null; created: boolean }> {
        const existing = await this.getPage(pageName)
        if (existing) {
            return { page: existing, created: false }
        }
        const page = await this.createPage(pageName, properties, {
            createFirstBlock: false,
            redirect: false,
        })
        return { page, created: true }
    }
}
