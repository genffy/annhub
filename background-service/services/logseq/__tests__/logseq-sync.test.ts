import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { LogseqClient } from '../logseq-client'
import { LogseqSyncService } from '../logseq-sync'
import type { HighlightRecord } from '../../../../types/highlight'
import type { ClipRecord } from '../../../../types/clip'
import type { LogseqBlock, LogseqPage } from '../../../../types/logseq'

// Mock chrome.storage.local
const mockStorage = new Map<string, any>()

// Set up chrome global before tests
global.chrome = {
    storage: {
        local: {
            get: vi.fn((keys, callback) => {
                const result: Record<string, any> = {}
                const keysArray = Array.isArray(keys) ? keys : [keys]
                for (const key of keysArray) {
                    if (mockStorage.has(key)) {
                        result[key] = mockStorage.get(key)
                    }
                }
                if (callback) {
                    callback(result)
                }
                return Promise.resolve(result)
            }),
            set: vi.fn((items, callback) => {
                for (const [key, value] of Object.entries(items)) {
                    mockStorage.set(key, value)
                }
                if (callback) {
                    callback()
                }
                return Promise.resolve()
            }),
        },
    },
} as any

// Mock Logger
vi.mock('../../../../utils/logger', () => ({
    Logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}))

// Mock HighlightStorage
const mockGetHighlights = vi.fn(() => Promise.resolve([]))
vi.mock('../../highlight/highlight-storage', () => ({
    HighlightStorage: {
        getInstance: vi.fn(() => ({
            getHighlights: mockGetHighlights,
        })),
    },
}))

function makeHighlight(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
    return {
        id: 'hl_test123',
        url: 'https://example.com/article',
        domain: 'example.com',
        selector: 'p',
        originalText: 'Test highlight text',
        textHash: 'abc123',
        color: '#ffeb3b',
        timestamp: 1704067200000,
        lastModified: 1704067200000,
        position: { x: 0, y: 0, width: 100, height: 20 },
        context: { before: 'before', after: 'after' },
        status: 'active',
        metadata: {
            pageTitle: 'Test Article',
            pageUrl: 'https://example.com/article',
            sourceUrl: 'https://example.com/article',
        },
        ...overrides,
    }
}

function makeClip(overrides: Partial<ClipRecord> = {}): ClipRecord {
    return {
        id: 'clip_test456',
        source_url: 'https://github.com/user/repo',
        source_title: 'Test Repo',
        capture_time: '2024-01-15T10:30:00Z',
        mode_used: 'Mode A',
        content: 'Test clip content',
        context_before: 'before',
        context_after: 'after',
        ...overrides,
    }
}

describe('LogseqSyncService', () => {
    let service: LogseqSyncService

    beforeEach(() => {
        vi.clearAllMocks()
        mockStorage.clear()

        // Mock config
        mockStorage.set('annhub-logseq-config', {
            enabled: true,
            serverUrl: 'http://127.0.0.1:12315',
            authToken: 'test-token',
            autoSync: false,
            syncMode: 'journal',
            customTags: '',
            autoTagDomain: true,
        })

            // Reset singleton
            ; (LogseqSyncService as any).instance = null
    })

    afterEach(() => {
        // Reset singleton after each test
        ; (LogseqSyncService as any).instance = null
    })

    describe('getInstance', () => {
        it('should return singleton instance', () => {
            const instance1 = LogseqSyncService.getInstance()
            const instance2 = LogseqSyncService.getInstance()

            expect(instance1).toBe(instance2)
        })
    })

    describe('loadConfig', () => {
        it('should load config from storage', async () => {
            service = LogseqSyncService.getInstance()
            const config = await service.loadConfig()

            expect(config.enabled).toBe(true)
            expect(config.serverUrl).toBe('http://127.0.0.1:12315')
            expect(config.authToken).toBe('test-token')
        })

        it('should use default config when storage is empty', async () => {
            mockStorage.clear()
                ; (LogseqSyncService as any).instance = null
            service = LogseqSyncService.getInstance()
            const config = await service.loadConfig()

            expect(config.enabled).toBe(false)
            expect(config.serverUrl).toBe('http://127.0.0.1:12315')
            expect(config.authToken).toBe('')
        })
    })

    describe('getConfig and setConfig', () => {
        beforeEach(async () => {
            service = LogseqSyncService.getInstance()
            await service.loadConfig()
        })

        it('should get current config', async () => {
            const config = await service.getConfig()

            expect(config).toHaveProperty('enabled')
            expect(config).toHaveProperty('serverUrl')
            expect(config).toHaveProperty('authToken')
        })

        it('should update config partially', async () => {
            const updated = await service.setConfig({ customTags: '#test' })

            expect(updated.customTags).toBe('#test')
            expect(updated.enabled).toBe(true) // Other values preserved
        })

        it('should save config to storage', async () => {
            await service.setConfig({ enabled: false })

            const stored = mockStorage.get('annhub-logseq-config')
            expect(stored.enabled).toBe(false)
        })
    })

    describe('isEnabled', () => {
        beforeEach(async () => {
            service = LogseqSyncService.getInstance()
            await service.loadConfig()
        })

        it('should return true when enabled is true', () => {
            // Config has enabled: true from mockStorage
            expect(service.isEnabled()).toBe(true)
        })

        it('should return false when enabled is false', async () => {
            await service.setConfig({ enabled: false })
            expect(service.isEnabled()).toBe(false)
        })

        it('should not require authToken for enabled state', async () => {
            await service.setConfig({ enabled: true, authToken: '' })
            expect(service.isEnabled()).toBe(true)
        })
    })

    describe('isAutoSyncEnabled', () => {
        beforeEach(async () => {
            service = LogseqSyncService.getInstance()
            await service.loadConfig()
        })

        it('should return true when both enabled and autoSync are true', async () => {
            await service.setConfig({ enabled: true, autoSync: true })
            expect(service.isAutoSyncEnabled()).toBe(true)
        })

        it('should return false when enabled is false', async () => {
            await service.setConfig({ enabled: false, autoSync: true })
            expect(service.isAutoSyncEnabled()).toBe(false)
        })

        it('should return false when autoSync is false', async () => {
            await service.setConfig({ enabled: true, autoSync: false })
            expect(service.isAutoSyncEnabled()).toBe(false)
        })
    })

    describe('testConnection', () => {
        beforeEach(async () => {
            service = LogseqSyncService.getInstance()
            await service.loadConfig()
        })

        it('should return true when connection succeeds', async () => {
            // Mock the client's testConnection method
            vi.spyOn((service as any).client, 'testConnection').mockResolvedValue(true)

            const result = await service.testConnection()

            expect(result).toBe(true)
        })

        it('should return false when connection fails', async () => {
            vi.spyOn((service as any).client, 'testConnection').mockResolvedValue(false)

            const result = await service.testConnection()

            expect(result).toBe(false)
        })
    })

    describe('syncHighlight', () => {
        beforeEach(async () => {
            service = LogseqSyncService.getInstance()
            await service.loadConfig()
            // Mock getUserConfigs for date format
            vi.spyOn((service as any).client, 'getUserConfigs').mockResolvedValue({
                preferredDateFormat: 'MMM do, yyyy',
            })
        })

        it('should return error when sync is not enabled', async () => {
            await service.setConfig({ enabled: false })

            const highlight = makeHighlight()
            const result = await service.syncHighlight(highlight)

            expect(result.success).toBe(false)
            expect(result.error).toContain('not enabled')
        })

        it('should sync highlight to journal page', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid',
                name: 'Jan 1st, 2024',
                originalName: 'Jan 1st, 2024',
            }

            const mockBlock: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test content',
            }

            // Mock client methods for ensureJournalPage flow
            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([])
            vi.spyOn(client, 'appendBlockInPage').mockResolvedValue(mockBlock)
            vi.spyOn(client, 'insertBlock').mockResolvedValue(null)

            const highlight = makeHighlight()
            const result = await service.syncHighlight(highlight)

            expect(result.success).toBe(true)
            expect(result.blockAppended).toBe(true)
            expect(result.skippedDuplicate).toBe(false)
        })

        it('should use page UUID for appendBlockInPage', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid-12345',
                name: 'Jan 1st, 2024',
                originalName: 'Jan 1st, 2024',
            }

            const mockBlock: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test content',
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([])
            vi.spyOn(client, 'appendBlockInPage').mockResolvedValue(mockBlock)
            vi.spyOn(client, 'insertBlock').mockResolvedValue(null)

            const highlight = makeHighlight()
            await service.syncHighlight(highlight)

            // Verify appendBlockInPage was called with UUID, not page name
            expect(client.appendBlockInPage).toHaveBeenCalledWith(
                'page-uuid-12345',
                expect.any(String),
                expect.any(Object)
            )
        })

        it('should skip duplicate highlights', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid',
                name: 'Jan 1st, 2024',
                originalName: 'Jan 1st, 2024',
            }

            // Mock duplicate detection
            const mockBlockWithId: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test',
                properties: { 'annhub-id': 'hl_test123' },
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([mockBlockWithId])

            const highlight = makeHighlight()
            const result = await service.syncHighlight(highlight)

            expect(result.success).toBe(true)
            expect(result.skippedDuplicate).toBe(true)
            expect(result.blockAppended).toBe(false)
        })

        it('should add user note as child block', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid',
                name: 'Jan 1st, 2024',
                originalName: 'Jan 1st, 2024',
            }

            const mockBlock: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test content',
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([])
            vi.spyOn(client, 'appendBlockInPage').mockResolvedValue(mockBlock)
            vi.spyOn(client, 'insertBlock').mockResolvedValue(mockBlock)

            const highlight = makeHighlight({ user_note: 'Important note!' })
            const result = await service.syncHighlight(highlight)

            expect(result.success).toBe(true)
            expect(client.insertBlock).toHaveBeenCalledWith(
                'block-uuid',
                '💭 Important note!',
                { sibling: false }
            )
        })

        it('should handle sync errors gracefully', async () => {
            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockRejectedValue(new Error('Network error'))

            const highlight = makeHighlight()
            const result = await service.syncHighlight(highlight)

            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
        })

        it('should return error when appendBlockInPage returns null', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid',
                name: 'Jan 1st, 2024',
                originalName: 'Jan 1st, 2024',
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([])
            // appendBlockInPage throws (because call() detects null)
            vi.spyOn(client, 'appendBlockInPage').mockRejectedValue(
                new Error('Logseq API logseq.Editor.appendBlockInPage failed: operation returned null or success=false')
            )

            const highlight = makeHighlight()
            const result = await service.syncHighlight(highlight)

            expect(result.success).toBe(false)
            expect(result.blockAppended).toBe(false)
        })
    })

    describe('syncClip', () => {
        beforeEach(async () => {
            service = LogseqSyncService.getInstance()
            await service.loadConfig()
            vi.spyOn((service as any).client, 'getUserConfigs').mockResolvedValue({
                preferredDateFormat: 'MMM do, yyyy',
            })
        })

        it('should sync clip to journal page', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid',
                name: 'Jan 15th, 2024',
                originalName: 'Jan 15th, 2024',
            }

            const mockBlock: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test content',
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([])
            vi.spyOn(client, 'appendBlockInPage').mockResolvedValue(mockBlock)
            vi.spyOn(client, 'insertBlock').mockResolvedValue(mockBlock)

            const clip = makeClip()
            const result = await service.syncClip(clip)

            expect(result.success).toBe(true)
            expect(result.blockAppended).toBe(true)
        })

        it('should skip duplicate clips', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid',
                name: 'Jan 15th, 2024',
                originalName: 'Jan 15th, 2024',
            }

            const mockBlockWithId: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test',
                properties: { 'annhub-id': 'clip_test456' },
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([mockBlockWithId])

            const clip = makeClip()
            const result = await service.syncClip(clip)

            expect(result.success).toBe(true)
            expect(result.skippedDuplicate).toBe(true)
        })

        it('should return error when appendBlockInPage returns null for clip', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid',
                name: 'Jan 15th, 2024',
                originalName: 'Jan 15th, 2024',
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([])
            vi.spyOn(client, 'appendBlockInPage').mockRejectedValue(
                new Error('Logseq API logseq.Editor.appendBlockInPage failed: operation returned null or success=false')
            )

            const clip = makeClip()
            const result = await service.syncClip(clip)

            expect(result.success).toBe(false)
            expect(result.blockAppended).toBe(false)
        })
    })

    describe('syncAll', () => {
        beforeEach(async () => {
            service = LogseqSyncService.getInstance()
            await service.loadConfig()
            vi.spyOn((service as any).client, 'getUserConfigs').mockResolvedValue({
                preferredDateFormat: 'MMM do, yyyy',
            })
        })

        it('should sync all active highlights', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'page-uuid',
                name: 'Jan 1st, 2024',
                originalName: 'Jan 1st, 2024',
            }

            const mockBlock: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test',
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue(mockPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([])
            vi.spyOn(client, 'appendBlockInPage').mockResolvedValue(mockBlock)
            vi.spyOn(client, 'insertBlock').mockResolvedValue(mockBlock)

            // Mock getHighlights to return some highlights
            mockGetHighlights.mockResolvedValueOnce([
                makeHighlight({ id: 'hl1' }),
                makeHighlight({ id: 'hl2' }),
                makeHighlight({ id: 'hl3' }),
            ])

            const result = await service.syncAll()

            expect(result.synced).toBe(3)
            expect(result.failed).toBe(0)
        })

        it('should count failed syncs', async () => {
            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockRejectedValue(new Error('Sync failed'))

            mockGetHighlights.mockResolvedValueOnce([
                makeHighlight({ id: 'hl1' }),
                makeHighlight({ id: 'hl2' }),
            ])

            const result = await service.syncAll()

            expect(result.synced).toBe(0)
            expect(result.failed).toBe(2)
        })

        it('should throw when sync is not enabled', async () => {
            await service.setConfig({ enabled: false })

            await expect(service.syncAll()).rejects.toThrow('not enabled')
        })
    })

    describe('duplicate detection', () => {
        beforeEach(async () => {
            service = LogseqSyncService.getInstance()
            await service.loadConfig()
            vi.spyOn((service as any).client, 'getUserConfigs').mockResolvedValue({
                preferredDateFormat: 'MMM do, yyyy',
            })
        })

        it('should find duplicate by annhub-id', async () => {
            const mockBlockWithId: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test',
                properties: { 'annhub-id': 'hl_test123' },
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue({ uuid: 'page-uuid' } as LogseqPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([mockBlockWithId])

            const highlight = makeHighlight()
            const result = await service.syncHighlight(highlight)

            expect(result.skippedDuplicate).toBe(true)
        })

        it('should search nested children for duplicates', async () => {
            const mockChildBlock: LogseqBlock = {
                id: 2,
                uuid: 'child-uuid',
                content: 'Child',
                properties: { 'annhub-id': 'hl_test123' },
            }

            const mockParentBlock: LogseqBlock = {
                id: 1,
                uuid: 'parent-uuid',
                content: 'Parent',
                children: [mockChildBlock],
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue({ uuid: 'page-uuid' } as LogseqPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([mockParentBlock])

            const highlight = makeHighlight()
            const result = await service.syncHighlight(highlight)

            expect(result.skippedDuplicate).toBe(true)
        })

        it('should handle both annhub-id and annhubId property names', async () => {
            const mockBlock: LogseqBlock = {
                id: 1,
                uuid: 'block-uuid',
                content: 'Test',
                properties: { 'annhubId': 'hl_test123' }, // alternative casing
            }

            const client = (service as any).client
            vi.spyOn(client, 'getPage').mockResolvedValue({ uuid: 'page-uuid' } as LogseqPage)
            vi.spyOn(client, 'getPageBlocksTree').mockResolvedValue([mockBlock])

            const highlight = makeHighlight()
            const result = await service.syncHighlight(highlight)

            expect(result.skippedDuplicate).toBe(true)
        })
    })

    describe('formatJournalPageName', () => {
        it('should format with default MMM do, yyyy', () => {
            expect(LogseqClient.formatJournalPageName('2026-02-18', 'MMM do, yyyy')).toBe('Feb 18th, 2026')
        })

        it('should format with yyyy-MM-dd', () => {
            expect(LogseqClient.formatJournalPageName('2026-02-18', 'yyyy-MM-dd')).toBe('2026-02-18')
        })

        it('should format with dd/MM/yyyy', () => {
            expect(LogseqClient.formatJournalPageName('2026-02-18', 'dd/MM/yyyy')).toBe('18/02/2026')
        })

        it('should format ordinal 1st, 2nd, 3rd correctly', () => {
            expect(LogseqClient.formatJournalPageName('2026-02-01', 'MMM do, yyyy')).toBe('Feb 1st, 2026')
            expect(LogseqClient.formatJournalPageName('2026-02-02', 'MMM do, yyyy')).toBe('Feb 2nd, 2026')
            expect(LogseqClient.formatJournalPageName('2026-02-03', 'MMM do, yyyy')).toBe('Feb 3rd, 2026')
            expect(LogseqClient.formatJournalPageName('2026-02-11', 'MMM do, yyyy')).toBe('Feb 11th, 2026')
            expect(LogseqClient.formatJournalPageName('2026-02-21', 'MMM do, yyyy')).toBe('Feb 21st, 2026')
        })

        it('should format full month and weekday names', () => {
            expect(LogseqClient.formatJournalPageName('2026-02-18', 'EEEE, MMMM d, yyyy')).toBe('Wednesday, February 18, 2026')
        })

        it('should return original string for invalid date', () => {
            expect(LogseqClient.formatJournalPageName('not-a-date', 'MMM do, yyyy')).toBe('not-a-date')
        })
    })
})
