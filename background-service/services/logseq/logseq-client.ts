import { LogseqApiRequest, LogseqBlock, LogseqConfig, LogseqPage } from '../../../types/logseq'
import { Logger } from '../../../utils/logger'

/**
 * HTTP client for Logseq's local server API.
 * Wraps all calls to POST /api with proper auth headers.
 *
 * Note: Authorization token is optional in Logseq's local HTTP server.
 * If configured, the server will require Bearer token authentication.
 * If not configured, requests can be made without auth headers.
 */
export class LogseqClient {
    private serverUrl: string
    private authToken: string

    constructor(config: Pick<LogseqConfig, 'serverUrl' | 'authToken'>) {
        this.serverUrl = config.serverUrl.replace(/\/+$/, '')
        this.authToken = config.authToken || ''
    }

    updateConfig(config: Pick<LogseqConfig, 'serverUrl' | 'authToken'>): void {
        this.serverUrl = config.serverUrl.replace(/\/+$/, '')
        this.authToken = config.authToken || ''
    }

    /**
     * Get auth headers for the request.
     * Returns empty object if no authToken is configured.
     */
    private getAuthHeaders(): Record<string, string> {
        if (!this.authToken) {
            return {}
        }
        return { 'Authorization': `Bearer ${this.authToken}` }
    }

    private async call<T = any>(method: string, ...args: any[]): Promise<T> {
        const body: LogseqApiRequest = { method, args }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
        }

        // Debug: Log API request details
        Logger.info(`[LogseqClient] API Request: ${method}`, {
            url: `${this.serverUrl}/api`,
            args: JSON.stringify(args).slice(0, 500), // Truncate for readability
        })

        const resp = await fetch(`${this.serverUrl}/api`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        })

        // Debug: Log response status
        Logger.info(`[LogseqClient] API Response: ${method} status=${resp.status}`)

        if (!resp.ok) {
            const text = await resp.text().catch(() => '')
            Logger.error(`[LogseqClient] API Error:`, { status: resp.status, body: text })
            throw new Error(`Logseq API ${method} failed: ${resp.status} ${text}`)
        }

        const data = await resp.json()

        // Debug: Log response data for key operations
        if (method.includes('appendBlock') || method.includes('insertBlock') || method.includes('createPage') || method.includes('createJournalPage')) {
            Logger.info(`[LogseqClient] API Result: ${method}`, {
                success: !!data,
                result: JSON.stringify(data).slice(0, 1000),
            })
        }

        // Check for explicit failure in response for all API calls
        // Some Logseq API calls return null or { success: false } on failure
        // Logseq HTTP API may also return { error: "..." } for method-not-found etc.
        if (!data || data === null
            || (typeof data === 'object' && 'success' in data && data.success === false)
            || (typeof data === 'object' && data !== null && 'error' in data && typeof (data as any).error === 'string')) {
            const errorDetail = (data && typeof data === 'object' && 'error' in data)
                ? (data as any).error
                : 'operation returned null or success=false'
            throw new Error(`Logseq API ${method} failed: ${errorDetail}`)
        }

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

    /**
     * Get user configuration from Logseq, including preferred date format.
     */
    async getUserConfigs(): Promise<{ preferredDateFormat: string;[key: string]: any }> {
        try {
            const result = await this.call<any>('logseq.App.getUserConfigs')
            return {
                ...result,
                preferredDateFormat: result?.preferredDateFormat || 'MMM do, yyyy',
            }
        } catch {
            return { preferredDateFormat: 'MMM do, yyyy' }
        }
    }

    /**
     * Format an ISO date string (e.g., "2026-02-18") to a Logseq journal page name
     * using the given date format pattern.
     *
     * Supported format tokens (matches Logseq's Clojure date-time-util/format):
     * - yyyy / yy: year
     * - MMMM: full month (February), MMM: abbreviated (Feb), MM: zero-padded (02), M: numeric (2)
     * - do: ordinal day (18th), dd: zero-padded (18), d: numeric day (18)
     * - EEEE: full weekday (Tuesday), EEE/EE/E: abbreviated (Tue)
     */
    static formatJournalPageName(isoDate: string, format: string): string {
        const date = new Date(isoDate + 'T00:00:00') // parse as local time
        if (isNaN(date.getTime())) return isoDate

        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December']
        const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

        const y = date.getFullYear()
        const m = date.getMonth() // 0-11
        const d = date.getDate()
        const dow = date.getDay()

        const ordinal = (n: number): string => {
            const s = ['th', 'st', 'nd', 'rd']
            const v = n % 100
            return n + (s[(v - 20) % 10] || s[v] || s[0])
        }

        // Use placeholder-based replacement to prevent token collision.
        // E.g., replacing 'do' → '2nd' then 'd' → '2' would corrupt '2nd' → '2n2'.
        const replacements: [RegExp, string][] = [
            [/yyyy/g, String(y)],
            [/yy/g, String(y).slice(-2)],
            [/MMMM/g, months[m]],
            [/MMM/g, monthsShort[m]],
            [/MM/g, String(m + 1).padStart(2, '0')],
            [/do/g, ordinal(d)],
            [/dd/g, String(d).padStart(2, '0')],
            [/d/g, String(d)],
            [/EEEE/g, weekdays[dow]],
            [/EEE/g, weekdaysShort[dow]],
            [/EE/g, weekdaysShort[dow]],
            [/E/g, weekdaysShort[dow]],
            // Standalone M must come after MM and MMM
            [/(?<![A-Za-z])M(?![A-Za-z])/g, String(m + 1)],
        ]

        let result = format
        for (let i = 0; i < replacements.length; i++) {
            result = result.replace(replacements[i][0], `\x00${i}\x00`)
        }
        for (let i = 0; i < replacements.length; i++) {
            result = result.replace(new RegExp(`\x00${i}\x00`, 'g'), replacements[i][1])
        }
        return result
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
        options?: { createFirstBlock?: boolean; redirect?: boolean; journal?: boolean }
    ): Promise<LogseqPage | null> {
        const opts = { createFirstBlock: false, redirect: false, ...options }
        return this.call<LogseqPage | null>(
            'logseq.Editor.createPage',
            pageName,
            properties ?? {},
            opts
        )
    }

    async createJournalPage(date: string): Promise<LogseqPage | null> {
        // Use createPage with journal: true — universally supported across Logseq versions.
        // The dedicated createJournalPage API may not exist in all versions.
        // Logseq internally converts the date string to the correct journal page name
        // based on the user's date format settings.
        return this.createPage(date, {}, { journal: true, redirect: false, createFirstBlock: false })
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

    /**
     * Get a block by its UUID.
     * Used to verify that a block was actually created.
     */
    async getBlock(blockUuid: string): Promise<LogseqBlock | null> {
        try {
            const result = await this.call<LogseqBlock | null>('logseq.Editor.getBlock', blockUuid)
            return result
        } catch {
            return null
        }
    }
}
