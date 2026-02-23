import { LogseqClient } from './logseq-client'
import { LogseqFormatter } from './logseq-formatter'
import { LogseqConfig, DEFAULT_LOGSEQ_CONFIG, LogseqSyncResult } from '../../../types/logseq'
import { HighlightRecord } from '../../../types/highlight'
import { ClipRecord } from '../../../types/clip'
import { Logger } from '../../../utils/logger'
import { HighlightStorage } from '../highlight/highlight-storage'

const LOGSEQ_CONFIG_KEY = 'annhub-logseq-config'

/**
 * LogseqSyncService - Journal-based sync to Logseq.
 *
 * Strategy:
 * - All highlights/clips are added to journal pages (e.g., [[2025-01-15]])
 * - Uses #tags for categorization (#annhub + custom tags + optional domain tags)
 * - Each entry includes page link, properties for metadata, and optional user note
 */
export class LogseqSyncService {
    private static instance: LogseqSyncService | null = null
    private client: LogseqClient
    private config: LogseqConfig = { ...DEFAULT_LOGSEQ_CONFIG }
    private cachedDateFormat: string | null = null

    private constructor() {
        this.client = new LogseqClient({
            serverUrl: this.config.serverUrl,
            authToken: this.config.authToken,
        })
    }

    static getInstance(): LogseqSyncService {
        if (!LogseqSyncService.instance) {
            LogseqSyncService.instance = new LogseqSyncService()
        }
        return LogseqSyncService.instance
    }

    async loadConfig(): Promise<LogseqConfig> {
        try {
            const stored = await chrome.storage.local.get(LOGSEQ_CONFIG_KEY)
            if (stored[LOGSEQ_CONFIG_KEY]) {
                this.config = { ...DEFAULT_LOGSEQ_CONFIG, ...stored[LOGSEQ_CONFIG_KEY] }
            }
        } catch (err) {
            Logger.warn('[LogseqSync] Failed to load config, using defaults:', err)
        }
        this.client.updateConfig(this.config)
        return this.config
    }

    async getConfig(): Promise<LogseqConfig> {
        return { ...this.config }
    }

    async setConfig(partial: Partial<LogseqConfig>): Promise<LogseqConfig> {
        this.config = { ...this.config, ...partial }
        await chrome.storage.local.set({ [LOGSEQ_CONFIG_KEY]: this.config })
        this.client.updateConfig(this.config)
        Logger.info('[LogseqSync] Config updated:', this.config)
        return { ...this.config }
    }

    isEnabled(): boolean {
        // Token is optional - Logseq HTTP server can be configured without auth
        return this.config.enabled
    }

    isAutoSyncEnabled(): boolean {
        return this.isEnabled() && this.config.autoSync
    }

    async testConnection(): Promise<boolean> {
        return this.client.testConnection()
    }

    /**
     * Helper to convert property keys to Logseq-compatible format.
     * Logseq API expects camelCase property names when passed via options.properties.
     */
    private formatPropertiesForApi(properties: Record<string, string>): Record<string, string> {
        const result: Record<string, string> = {}
        for (const [key, value] of Object.entries(properties)) {
            if (value) {
                // Keep camelCase format for API - Logseq handles the conversion internally
                result[key] = value
            }
        }
        return result
    }

    /**
     * Check if a block with the given annhub-id already exists on the journal page.
     */
    private async isDuplicate(journalPage: string, annhubId: string): Promise<boolean> {
        try {
            const blocks = await this.client.getPageBlocksTree(journalPage)
            return this.findBlockByAnnhubId(blocks, annhubId)
        } catch {
            return false
        }
    }

    private findBlockByAnnhubId(blocks: any[], id: string): boolean {
        for (const block of blocks) {
            if (block.properties?.['annhub-id'] === id || block.properties?.['annhubId'] === id) {
                return true
            }
            if (block.children?.length && this.findBlockByAnnhubId(block.children, id)) {
                return true
            }
        }
        return false
    }

    /**
     * Check if a page name is a journal page (date format like "2026-02-16")
     */
    private isJournalPage(pageName: string): boolean {
        return /^\d{4}-\d{2}-\d{2}$/.test(pageName)
    }

    /**
     * Get the preferred date format from Logseq, with caching.
     */
    private async getDateFormat(): Promise<string> {
        if (this.cachedDateFormat) return this.cachedDateFormat
        try {
            const configs = await this.client.getUserConfigs()
            this.cachedDateFormat = configs.preferredDateFormat
            Logger.info(`[LogseqSync] Date format from Logseq: "${this.cachedDateFormat}"`)
            return this.cachedDateFormat
        } catch {
            return 'MMM do, yyyy' // Logseq default
        }
    }

    /**
     * Ensure a journal page exists and return a reliable page identifier (UUID preferred).
     *
     * Strategy:
     * 1. Get Logseq's date format and convert ISO date to formatted page name
     * 2. Try getPage(formattedName) to find existing page
     * 3. If not found, create the journal page
     * 4. Re-fetch with getPage to reliably obtain the UUID
     * 5. Return UUID if available, otherwise fall back to formatted name
     */
    private async ensureJournalPage(journalPage: string): Promise<{ pageIdentity: string; pageCreated: boolean }> {
        // Step 1: Format the journal page name to match Logseq's internal naming
        let lookupName = journalPage
        if (this.isJournalPage(journalPage)) {
            const dateFormat = await this.getDateFormat()
            lookupName = LogseqClient.formatJournalPageName(journalPage, dateFormat)
            Logger.info(`[LogseqSync] Formatted journal page name: "${journalPage}" → "${lookupName}" (format: ${dateFormat})`)
        }

        // Step 2: Try to find existing page
        let page = await this.client.getPage(lookupName)
        if (page?.uuid) {
            Logger.info(`[LogseqSync] Journal page "${lookupName}" exists`, { uuid: page.uuid })
            return { pageIdentity: page.uuid, pageCreated: false }
        }

        // Step 3: Page doesn't exist — create it
        let pageCreated = false
        if (this.isJournalPage(journalPage)) {
            try {
                await this.client.createJournalPage(journalPage)
                pageCreated = true
                Logger.info(`[LogseqSync] Created journal page "${journalPage}"`)
            } catch (err) {
                Logger.warn(`[LogseqSync] Failed to create journal page "${journalPage}"`, err)
            }
        } else {
            try {
                await this.client.ensurePage(lookupName, {})
                pageCreated = true
            } catch (err) {
                Logger.warn(`[LogseqSync] Failed to ensure page "${lookupName}"`, err)
            }
        }

        // Step 4: Re-fetch to get reliable UUID (use formatted name for lookup)
        page = await this.client.getPage(lookupName)
        if (page?.uuid) {
            Logger.info(`[LogseqSync] Using page UUID: "${page.uuid}" for "${lookupName}"`)
            return { pageIdentity: page.uuid, pageCreated }
        }

        // Step 5: Fallback — use formatted page name string (last resort)
        Logger.warn(`[LogseqSync] Could not obtain UUID for "${lookupName}", using name as fallback`)
        return { pageIdentity: lookupName, pageCreated }
    }

    /**
     * Sync a highlight to the journal page.
     *
     * The block will be added to the journal page for the highlight's date.
     * Format:
     *   #annhub #custom_tags [[Page Title]] 🔗
     *   > highlighted text
     *     annhub-id:: hl_xxx
     *     source-url:: https://...
     *     color:: #ffeb3b
     *   - 💭 user note
     */
    async syncHighlight(record: HighlightRecord): Promise<LogseqSyncResult> {
        if (!this.isEnabled()) {
            return { success: false, pageCreated: false, blockAppended: false, skippedDuplicate: false, error: 'Logseq sync is not enabled' }
        }

        try {
            const formatted = LogseqFormatter.formatHighlight(record, this.config)
            const journalPage = formatted.journalPage

            Logger.info(`[LogseqSync] Syncing highlight ${record.id} to journal "${journalPage}"`, {
                content: formatted.content,
                properties: formatted.properties,
                children: formatted.children,
            })

            // Ensure journal page exists and get reliable page identifier (UUID)
            const { pageIdentity, pageCreated } = await this.ensureJournalPage(journalPage)

            Logger.info(`[LogseqSync] Using pageIdentity: "${pageIdentity}" (type: ${typeof pageIdentity})`)

            // Check for duplicates within this journal page
            if (await this.isDuplicate(journalPage, record.id)) {
                Logger.info(`[LogseqSync] Highlight ${record.id} already exists on journal page "${journalPage}", skipping`)
                return { success: true, pageCreated: false, blockAppended: false, skippedDuplicate: true }
            }

            // Append the main block with properties passed via options
            const properties = this.formatPropertiesForApi(formatted.properties)
            const block = await this.client.appendBlockInPage(pageIdentity, formatted.content, { properties })

            Logger.info(`[LogseqSync] Main block ${block ? 'created' : 'failed'}`, {
                uuid: block?.uuid,
                content: block?.content?.slice(0, 100),
            })

            if (!block || !block.uuid) {
                throw new Error(`Failed to create main block in journal page "${journalPage}" (identity: ${pageIdentity}) - block or uuid is null`)
            }

            // Add child blocks (highlight quote and optional user note)
            if (formatted.children?.length) {
                for (let i = 0; i < formatted.children.length; i++) {
                    const childContent = formatted.children[i]
                    const childBlock = await this.client.insertBlock(block.uuid, childContent, { sibling: false })
                    Logger.info(`[LogseqSync] Child block ${i + 1}/${formatted.children.length} ${childBlock ? 'created' : 'failed'}`, {
                        content: childContent.slice(0, 50),
                        uuid: childBlock?.uuid,
                    })
                }
            }

            Logger.info(`[LogseqSync] Highlight ${record.id} synced to journal "${journalPage}"`)
            return { success: true, pageCreated, blockAppended: true, skippedDuplicate: false }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error'
            Logger.error(`[LogseqSync] Failed to sync highlight ${record.id}:`, error)
            return { success: false, pageCreated: false, blockAppended: false, skippedDuplicate: false, error: msg }
        }
    }

    /**
     * Sync a clip to the journal page.
     *
     * Similar format to highlights, with mode information included.
     */
    async syncClip(record: ClipRecord): Promise<LogseqSyncResult> {
        if (!this.isEnabled()) {
            return { success: false, pageCreated: false, blockAppended: false, skippedDuplicate: false, error: 'Logseq sync is not enabled' }
        }

        try {
            const formatted = LogseqFormatter.formatClip(record, this.config)
            const journalPage = formatted.journalPage

            // Ensure journal page exists and get reliable page identifier (UUID)
            const { pageIdentity, pageCreated } = await this.ensureJournalPage(journalPage)

            Logger.info(`[LogseqSync] Using pageIdentity for clip: "${pageIdentity}" (type: ${typeof pageIdentity})`)

            if (await this.isDuplicate(journalPage, record.id)) {
                Logger.info(`[LogseqSync] Clip ${record.id} already exists on journal page "${journalPage}", skipping`)
                return { success: true, pageCreated: false, blockAppended: false, skippedDuplicate: true }
            }

            const properties = this.formatPropertiesForApi(formatted.properties)
            const block = await this.client.appendBlockInPage(pageIdentity, formatted.content, { properties })

            if (!block || !block.uuid) {
                throw new Error(`Failed to create main block in journal page "${journalPage}" (identity: ${pageIdentity}) - block or uuid is null`)
            }

            // Add child blocks (clip content and optional user note)
            if (formatted.children?.length) {
                for (const childContent of formatted.children) {
                    await this.client.insertBlock(block.uuid, childContent, { sibling: false })
                }
            }

            Logger.info(`[LogseqSync] Clip ${record.id} synced to journal "${journalPage}"`)
            return { success: true, pageCreated, blockAppended: true, skippedDuplicate: false }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error'
            Logger.error(`[LogseqSync] Failed to sync clip ${record.id}:`, error)
            return { success: false, pageCreated: false, blockAppended: false, skippedDuplicate: false, error: msg }
        }
    }

    /**
     * Sync all existing highlights from IndexedDB to Logseq.
     */
    async syncAll(): Promise<{ synced: number; failed: number }> {
        if (!this.isEnabled()) {
            throw new Error('Logseq sync is not enabled')
        }

        const storage = HighlightStorage.getInstance()
        const highlights = await storage.getHighlights({ status: 'active', limit: 10000 })

        let synced = 0
        let failed = 0

        for (const hl of highlights) {
            const result = await this.syncHighlight(hl)
            if (result.success) {
                synced++
            } else {
                failed++
            }
        }

        Logger.info(`[LogseqSync] Sync all completed: ${synced} synced, ${failed} failed`)
        return { synced, failed }
    }
}
