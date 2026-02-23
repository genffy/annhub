import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LogseqClient } from '../logseq-client'
import type { LogseqConfig, LogseqBlock, LogseqPage } from '../../../../types/logseq'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('LogseqClient', () => {
    let client: LogseqClient
    let testConfig: Pick<LogseqConfig, 'serverUrl' | 'authToken'>

    beforeEach(() => {
        vi.clearAllMocks()
        testConfig = {
            serverUrl: 'http://127.0.0.1:12315',
            authToken: 'test-token',
        }
        client = new LogseqClient(testConfig)
    })

    describe('constructor and config', () => {
        it('should initialize with server URL and auth token', () => {
            expect(client).toBeDefined()
        })

        it('should remove trailing slashes from server URL', () => {
            const config = { serverUrl: 'http://127.0.0.1:12315///', authToken: '' }
            const c = new LogseqClient(config)
            // Client should work correctly despite trailing slashes
        })

        it('should handle empty auth token', () => {
            const config = { serverUrl: 'http://127.0.0.1:12315', authToken: '' }
            const c = new LogseqClient(config)
            expect(c).toBeDefined()
        })

        it('should update config', () => {
            const newConfig = { serverUrl: 'http://localhost:8080', authToken: 'new-token' }
            client.updateConfig(newConfig)
            // Should update without errors
        })
    })

    describe('auth headers', () => {
        it('should include Authorization header when token is provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: 'success' }),
            })

            await (client as any).call('logseq.App.getCurrentGraph')

            expect(mockFetch).toHaveBeenCalledTimes(1)
            const callArgs = mockFetch.mock.calls[0]
            expect(callArgs[1]?.headers).toHaveProperty('Authorization', 'Bearer test-token')
        })

        it('should NOT include Authorization header when token is empty', async () => {
            const config = { serverUrl: 'http://127.0.0.1:12315', authToken: '' }
            const noAuthClient = new LogseqClient(config)

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: 'success' }),
            })

            await (noAuthClient as any).call('logseq.App.getCurrentGraph')

            expect(mockFetch).toHaveBeenCalledTimes(1)
            const callArgs = mockFetch.mock.calls[0]
            expect(callArgs[1]?.headers).not.toHaveProperty('Authorization')
        })

        it('should include Content-Type header in all requests', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: 'success' }),
            })

            await (client as any).call('logseq.App.getCurrentGraph')

            const callArgs = mockFetch.mock.calls[0]
            expect(callArgs[1]?.headers).toHaveProperty('Content-Type', 'application/json')
        })
    })

    describe('testConnection', () => {
        it('should return true when connection succeeds', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: 'success' }),
            })

            const result = await client.testConnection()
            expect(result).toBe(true)
        })

        it('should return false when connection fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'))

            const result = await client.testConnection()
            expect(result).toBe(false)
        })

        it('should call getCurrentGraph API', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: 'success' }),
            })

            await client.testConnection()

            expect(mockFetch).toHaveBeenCalledTimes(1)
            const url = mockFetch.mock.calls[0][0]
            expect(url).toContain('/api')

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
            expect(body.method).toBe('logseq.App.getCurrentGraph')
        })
    })

    describe('getPage', () => {
        it('should return page data when page exists', async () => {
            const mockPage: LogseqPage = {
                id: 123,
                uuid: 'page-uuid',
                name: '2024-01-15',
                originalName: '2024-01-15',
                properties: {},
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockPage,
            })

            const result = await client.getPage('2024-01-15')

            expect(result).toEqual(mockPage)
        })

        it('should return null when page does not exist', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Page not found'))

            const result = await client.getPage('nonexistent-page')

            expect(result).toBeNull()
        })

        it('should call logseq.Editor.getPage API', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 123 }),
            })

            await client.getPage('test-page')

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
            expect(body.method).toBe('logseq.Editor.getPage')
            expect(body.args).toEqual(['test-page'])
        })
    })

    describe('createPage', () => {
        it('should create page with properties', async () => {
            const mockPage: LogseqPage = {
                id: 124,
                uuid: 'new-page-uuid',
                name: 'new-page',
                originalName: 'new-page',
                properties: { title: 'Test Page' },
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockPage,
            })

            const result = await client.createPage('new-page', { title: 'Test Page' })

            expect(result).toEqual(mockPage)
        })

        it('should call logseq.Editor.createPage API', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 124 }),
            })

            await client.createPage('test-page', { key: 'value' })

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
            expect(body.method).toBe('logseq.Editor.createPage')
            expect(body.args[0]).toBe('test-page')
            expect(body.args[1]).toEqual({ key: 'value' })
        })

        it('should use default options when none provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 124 }),
            })

            await client.createPage('test-page')

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
            expect(body.args[2]).toEqual({ createFirstBlock: false, redirect: false })
        })
    })

    describe('appendBlockInPage', () => {
        it('should append block to page', async () => {
            const mockBlock: LogseqBlock = {
                id: 456,
                uuid: 'block-uuid',
                content: 'Test block content',
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockBlock,
            })

            const result = await client.appendBlockInPage('2024-01-15', 'Test block content')

            expect(result).toEqual(mockBlock)
        })

        it('should include properties in request', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 456 }),
            })

            await client.appendBlockInPage('test-page', 'content', { properties: { key: 'value' } })

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
            expect(body.method).toBe('logseq.Editor.appendBlockInPage')
            expect(body.args[0]).toBe('test-page')
            expect(body.args[1]).toBe('content')
            expect(body.args[2]).toEqual({ properties: { key: 'value' } })
        })
    })

    describe('insertBlock', () => {
        it('should insert block as child', async () => {
            const mockBlock: LogseqBlock = {
                id: 457,
                uuid: 'child-block-uuid',
                content: 'Child block',
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockBlock,
            })

            const result = await client.insertBlock('parent-uuid', 'Child block', { sibling: false })

            expect(result).toEqual(mockBlock)
        })

        it('should call logseq.Editor.insertBlock API', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 457 }),
            })

            await client.insertBlock('parent-uuid', 'content', { before: false, sibling: false })

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
            expect(body.method).toBe('logseq.Editor.insertBlock')
            expect(body.args[0]).toBe('parent-uuid')
            expect(body.args[1]).toBe('content')
            expect(body.args[2]).toEqual({ before: false, sibling: false })
        })
    })

    describe('getPageBlocksTree', () => {
        it('should return blocks tree for page', async () => {
            const mockBlocks: LogseqBlock[] = [
                {
                    id: 1,
                    uuid: 'block-1',
                    content: 'Block 1',
                    children: [
                        { id: 2, uuid: 'block-2', content: 'Child block' },
                    ],
                },
            ]

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockBlocks,
            })

            const result = await client.getPageBlocksTree('2024-01-15')

            expect(result).toEqual(mockBlocks)
        })

        it('should return empty array on error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Error fetching blocks'))

            const result = await client.getPageBlocksTree('nonexistent-page')

            expect(result).toEqual([])
        })

        it('should call logseq.Editor.getPageBlocksTree API', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [],
            })

            await client.getPageBlocksTree('test-page')

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
            expect(body.method).toBe('logseq.Editor.getPageBlocksTree')
            expect(body.args).toEqual(['test-page'])
        })
    })

    describe('ensurePage', () => {
        it('should return existing page without creating', async () => {
            const mockPage: LogseqPage = {
                id: 1,
                uuid: 'existing-uuid',
                name: '2024-01-15',
                originalName: '2024-01-15',
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockPage,
            })

            const result = await client.ensurePage('2024-01-15')

            expect(result.page).toEqual(mockPage)
            expect(result.created).toBe(false)
        })

        it('should create new page when it does not exist', async () => {
            // First call (getPage) fails
            mockFetch.mockRejectedValueOnce(new Error('Not found'))

            // Second call (createPage) succeeds
            const mockPage: LogseqPage = {
                id: 2,
                uuid: 'new-uuid',
                name: 'new-page',
                originalName: 'new-page',
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockPage,
            })

            const result = await client.ensurePage('new-page', { title: 'New Page' })

            expect(result.page).toEqual(mockPage)
            expect(result.created).toBe(true)
        })

        it('should pass properties to createPage', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Not found'))
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 2 }),
            })

            await client.ensurePage('new-page', { key: 'value' })

            // Second call should be createPage
            const secondBody = JSON.parse(mockFetch.mock.calls[1][1]?.body as string)
            expect(secondBody.method).toBe('logseq.Editor.createPage')
            expect(secondBody.args[1]).toEqual({ key: 'value' })
        })
    })

    describe('error handling', () => {
        it('should throw error with status and text on non-OK response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => 'Unauthorized',
            })

            await expect((client as any).call('test.method')).rejects.toThrow('Logseq API test.method failed: 401 Unauthorized')
        })

        it('should handle JSON parse errors gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => {
                    throw new Error('Invalid JSON')
                },
            })

            await expect((client as any).call('test.method')).rejects.toThrow()
        })

        it('should throw error when API returns null', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => null,
            })

            await expect((client as any).call('test.method')).rejects.toThrow('Logseq API test.method failed: operation returned null or success=false')
        })

        it('should throw error when API returns success: false', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: false, result: null }),
            })

            await expect((client as any).call('test.method')).rejects.toThrow('Logseq API test.method failed: operation returned null or success=false')
        })

        it('should throw error when API returns {error: "..."} response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ error: 'MethodNotExist: create_journal_page' }),
            })

            await expect((client as any).call('test.method')).rejects.toThrow('Logseq API test.method failed: MethodNotExist: create_journal_page')
        })

        it('should throw error when appendBlockInPage returns null', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => null,
            })

            await expect(client.appendBlockInPage('2024-01-01', 'test content')).rejects.toThrow('logseq.Editor.appendBlockInPage failed')
        })
    })

    describe('request body format', () => {
        it('should format request body correctly', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            })

            await (client as any).call('logseq.Editor.appendBlockInPage', 'test-page', 'content')

            const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
            expect(body).toEqual({
                method: 'logseq.Editor.appendBlockInPage',
                args: ['test-page', 'content'],
            })
        })
    })
})
