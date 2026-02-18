import { LogseqClient } from './logseq-client'
import { LogseqFormatter } from './logseq-formatter'
import { LogseqConfig, DEFAULT_LOGSEQ_CONFIG, LogseqSyncResult } from '../../../types/logseq'
import { HighlightRecord } from '../../../types/highlight'
import { ClipRecord } from '../../../types/clip'
import { Logger } from '../../../utils/logger'
import { HighlightStorage } from '../highlight/highlight-storage'

const LOGSEQ_CONFIG_KEY = 'annhub-logseq-config'

export class LogseqSyncService {
    private static instance: LogseqSyncService | null = null
    private client: LogseqClient
    private config: LogseqConfig = { ...DEFAULT_LOGSEQ_CONFIG }

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
        return this.config.enabled && !!this.config.authToken
    }

    isAutoSyncEnabled(): boolean {
        return this.isEnabled() && this.config.autoSync
    }

    async testConnection(): Promise<boolean> {
        return this.client.testConnection()
    }

    /**
     * Check if a block with the given annhub-id already exists on the page.
     */
    private async isDuplicate(pageName: string, annhubId: string): Promise<boolean> {
        try {
            const blocks = await this.client.getPageBlocksTree(pageName)
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

    async syncHighlight(record: HighlightRecord): Promise<LogseqSyncResult> {
        if (!this.isEnabled()) {
            return { success: false, pageCreated: false, blockAppended: false, skippedDuplicate: false, error: 'Logseq sync is not enabled' }
        }

        try {
            const pageName = LogseqFormatter.highlightPageName(this.config.pagePrefix, record)
            const pageProps = LogseqFormatter.buildPageProperties(record.url, record.domain)

            const { created: pageCreated } = await this.client.ensurePage(pageName, pageProps)

            if (await this.isDuplicate(pageName, record.id)) {
                Logger.info(`[LogseqSync] Highlight ${record.id} already exists on page "${pageName}", skipping`)
                return { success: true, pageCreated: false, blockAppended: false, skippedDuplicate: true }
            }

            const formatted = LogseqFormatter.formatHighlight(record)
            const block = await this.client.appendBlockInPage(pageName, formatted.content, {
                properties: formatted.properties,
            })

            if (block && formatted.childContent) {
                await this.client.insertBlock(block.uuid, formatted.childContent, { sibling: false })
            }

            Logger.info(`[LogseqSync] Highlight ${record.id} synced to "${pageName}"`)
            return { success: true, pageCreated, blockAppended: true, skippedDuplicate: false }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error'
            Logger.error(`[LogseqSync] Failed to sync highlight ${record.id}:`, error)
            return { success: false, pageCreated: false, blockAppended: false, skippedDuplicate: false, error: msg }
        }
    }

    async syncClip(record: ClipRecord): Promise<LogseqSyncResult> {
        if (!this.isEnabled()) {
            return { success: false, pageCreated: false, blockAppended: false, skippedDuplicate: false, error: 'Logseq sync is not enabled' }
        }

        try {
            const pageName = LogseqFormatter.clipPageName(this.config.pagePrefix, record)
            const url = record.source_detail_url || record.source_url
            const domain = new URL(url).hostname
            const pageProps = LogseqFormatter.buildPageProperties(url, domain)

            const { created: pageCreated } = await this.client.ensurePage(pageName, pageProps)

            if (await this.isDuplicate(pageName, record.id)) {
                Logger.info(`[LogseqSync] Clip ${record.id} already exists on page "${pageName}", skipping`)
                return { success: true, pageCreated: false, blockAppended: false, skippedDuplicate: true }
            }

            const formatted = LogseqFormatter.formatClip(record)
            const block = await this.client.appendBlockInPage(pageName, formatted.content, {
                properties: formatted.properties,
            })

            if (block && formatted.childContent) {
                await this.client.insertBlock(block.uuid, formatted.childContent, { sibling: false })
            }

            Logger.info(`[LogseqSync] Clip ${record.id} synced to "${pageName}"`)
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
