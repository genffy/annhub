import { HighlightDOMManager } from './highlight-dom'
import { HighlightRecord, HighlightResult } from '../../../types/highlight'
import MessageUtils from '../../../utils/message'
import { HighlightStatsResponse } from '../../../types/messages'
import { generateId, hash } from '../../../utils/helpers'
import { MixedSelectionContent } from '../../../types/dom'


export class HighlightService {
    private static instance: HighlightService | null = null
    private domManager: HighlightDOMManager
    private isInitialized = false

    private constructor() {
        this.domManager = HighlightDOMManager.getInstance()
        this.initializeEventListeners()
    }

    static getInstance(): HighlightService {
        if (!HighlightService.instance) {
            HighlightService.instance = new HighlightService()
        }
        return HighlightService.instance
    }


    private _normalize(text: string): string {
        return text
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
            .trim()
    }


    async initialize(): Promise<void> {
        if (this.isInitialized) return

        try {

            // await this.storage.initialize()


            await this.restorePageHighlights()

            this.isInitialized = true
            console.log('[HighlightService] Initialized successfully')
        } catch (error) {
            console.error('[HighlightService] Failed to initialize:', error)
            throw error
        }
    }


    private initializeEventListeners(): void {

        window.addEventListener('ann-highlight-color-updated', async (event: Event) => {
            const customEvent = event as CustomEvent
            const { highlightId, newColor } = customEvent.detail
            await this.updateHighlightColor(highlightId, newColor)
        })


        window.addEventListener('ann-highlight-deleted', async (event: Event) => {
            const customEvent = event as CustomEvent
            const { highlightId } = customEvent.detail
            await this.deleteHighlight(highlightId)
        })
    }


    async createHighlight(range: Range, color: string = '#ffeb3b'): Promise<HighlightResult> {
        try {
            const text = range.toString().trim()
            if (!text) {
                return { success: false, error: 'No text selected' }
            }
            const rect = range.getBoundingClientRect()
            const textHash = hash(text)
            const selector = HighlightDOMManager.generateSelector(range)
            const context = HighlightDOMManager.getTextContext(range)

            const highlight: HighlightRecord = {
                id: generateId(),
                url: window.location.href,
                domain: window.location.hostname,
                selector,
                originalText: text,
                textHash,
                color,
                timestamp: Date.now(),
                lastModified: Date.now(),
                position: {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height
                },
                context,
                status: 'active',
                metadata: {
                    pageTitle: document.title,
                    pageUrl: window.location.href
                }
            }


            const saveResult = await MessageUtils.sendMessage({
                type: 'SAVE_HIGHLIGHT',
                data: highlight
            })
            if (!saveResult.success) {
                return saveResult
            }

            const elements = this.domManager.createHighlight(range, color, saveResult.data.id)
            if (elements.length === 0) {

                // await this.storage.deleteHighlight(saveResult.data.id)
                await MessageUtils.sendMessage({
                    type: 'DELETE_HIGHLIGHT',
                    data: {
                        id: saveResult.data.id
                    }
                })
                return { success: false, error: 'Failed to create DOM highlight' }
            }

            console.log(`[HighlightService] Created highlight: ${saveResult.data.id}`)
            return saveResult

        } catch (error) {
            console.error('[HighlightService] Failed to create highlight:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }


    async updateHighlightColor(highlightId: string, newColor: string): Promise<HighlightResult> {
        try {

            const updateResult = await MessageUtils.sendMessage({
                type: 'UPDATE_HIGHLIGHT',
                data: {
                    id: highlightId,
                    color: newColor
                }
            })
            if (!updateResult.success) {
                return updateResult
            }


            this.domManager.updateHighlightColor(highlightId, newColor)

            console.log(`[HighlightService] Updated highlight color: ${highlightId} -> ${newColor}`)
            return updateResult

        } catch (error) {
            console.error('[HighlightService] Failed to update highlight color:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }


    async deleteHighlight(highlightId: string): Promise<HighlightResult> {
        try {

            this.domManager.removeHighlight(highlightId)


            const deleteResult = await MessageUtils.sendMessage({
                type: 'DELETE_HIGHLIGHT',
                data: {
                    id: highlightId
                }
            })

            console.log(`[HighlightService] Deleted highlight: ${highlightId}`)
            return deleteResult

        } catch (error) {
            console.error('[HighlightService] Failed to delete highlight:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }


    async restorePageHighlights(): Promise<void> {
        try {
            const highlights = await MessageUtils.sendMessage<HighlightRecord[]>({
                type: 'GET_CURRENT_PAGE_HIGHLIGHTS',
                url: window.location.href,
            })
            console.log('restorePageHighlights', highlights)
            if (!highlights.success) {
                console.error('[HighlightService] Failed to get current page highlights:', highlights.error)
                return
            }
            console.log(`[HighlightService] Restoring ${highlights.data?.length} highlights`)

            for (const highlight of highlights.data || []) {
                await this.restoreHighlight(highlight)
            }

            console.log('[HighlightService] Page highlights restored')
        } catch (error) {
            console.error('[HighlightService] Failed to restore page highlights:', error)
        }
    }


    private async restoreHighlight(highlight: HighlightRecord): Promise<void> {
        try {

            const range = await this.findTextRange(highlight)
            if (!range) {
                console.warn(`[HighlightService] Could not find text for highlight: ${highlight.id}`)
                return
            }


            this.domManager.createHighlight(range, highlight.color, highlight.id)
            console.log(`[HighlightService] Restored highlight: ${highlight.id}`)

        } catch (error) {
            console.error(`[HighlightService] Failed to restore highlight ${highlight.id}:`, error)
        }
    }


    private async findTextRange(highlight: HighlightRecord): Promise<Range | null> {
        const { originalText, context, selector } = highlight

        try {

            let targetElements: Element[] = []
            if (selector) {
                const elements = document.querySelectorAll(selector)
                targetElements = Array.from(elements)
            }


            if (targetElements.length === 0) {
                targetElements = [document.body]
            }


            for (const element of targetElements) {
                const range = this.findTextInElement(element, originalText, context)
                if (range) {
                    return range
                }
            }

            return null

        } catch (error) {
            console.error('[HighlightService] Error finding text range:', error)
            return null
        }
    }


    private findTextInElement(element: Element, targetText: string, context: { before: string; after: string }): Range | null {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
        )

        const textNodes: Text[] = []
        let node: Text | null
        while (node = walker.nextNode() as Text) {
            textNodes.push(node)
        }


        const fullText = textNodes.map(node => node.textContent || '').join('')


        const targetIndex = this.findBestMatch(fullText, targetText, context)
        if (targetIndex === -1) {
            return null
        }


        return this.createRangeFromIndex(textNodes, targetIndex, targetText.length)
    }


    private findBestMatch(fullText: string, targetText: string, context: { before: string; after: string }): number {

        let index = fullText.indexOf(targetText)
        if (index !== -1) {
            return index
        }


        const normalizedTarget = this._normalize(targetText)
        const normalizedFull = this._normalize(fullText)

        index = normalizedFull.indexOf(normalizedTarget)
        if (index !== -1) {
            return index
        }


        if (context.before || context.after) {
            const contextPattern = `${context.before}.*?${targetText}.*?${context.after}`
            const regex = new RegExp(contextPattern, 'i')
            const match = fullText.match(regex)
            if (match) {
                return fullText.indexOf(match[0]) + context.before.length
            }
        }

        return -1
    }


    private createRangeFromIndex(textNodes: Text[], startIndex: number, length: number): Range | null {
        let currentIndex = 0
        let startNode: Text | null = null
        let startOffset = 0
        let endNode: Text | null = null
        let endOffset = 0


        for (const node of textNodes) {
            const nodeLength = node.textContent?.length || 0
            if (currentIndex + nodeLength > startIndex) {
                startNode = node
                startOffset = startIndex - currentIndex
                break
            }
            currentIndex += nodeLength
        }

        if (!startNode) return null


        const endIndex = startIndex + length
        currentIndex = 0
        for (const node of textNodes) {
            const nodeLength = node.textContent?.length || 0
            if (currentIndex + nodeLength >= endIndex) {
                endNode = node
                endOffset = endIndex - currentIndex
                break
            }
            currentIndex += nodeLength
        }

        if (!endNode) return null


        const range = document.createRange()
        range.setStart(startNode, startOffset)
        range.setEnd(endNode, endOffset)

        return range
    }


    async getCurrentPageHighlights(): Promise<HighlightRecord[]> {
        const response = await MessageUtils.sendMessage<HighlightRecord[]>({
            type: 'GET_CURRENT_PAGE_HIGHLIGHTS',
            url: window.location.href,
        })
        if (!response.success) {
            console.error('[HighlightService] Failed to get current page highlights:', response.error)
            return []
        }
        return response.data || []
    }


    async clearAllHighlights(): Promise<void> {

        this.domManager.clearAllHighlights()


        await MessageUtils.sendMessage({
            type: 'CLEAR_ALL_HIGHLIGHTS',
        })

        console.log('[HighlightService] All highlights cleared')
    }


    async getHighlightStats(): Promise<{
        storage: { total: number; active: number; archived: number; deleted: number }
        dom: { total: number; colors: Record<string, number> }
    }> {
        const storageStats = await MessageUtils.sendMessage<HighlightStatsResponse>({
            type: 'GET_HIGHLIGHT_STATS',
        })
        if (!storageStats.success) {
            console.error('[HighlightService] Failed to get highlight stats:', storageStats.error)
            return { storage: { total: 0, active: 0, archived: 0, deleted: 0 }, dom: { total: 0, colors: {} } }
        }
        const domStats = this.domManager.getHighlightStats()

        return {
            storage: storageStats.data || { total: 0, active: 0, archived: 0, deleted: 0 },
            dom: domStats
        }
    }

    getSelectionInfo(selection: Selection): {
        text: string
        hasText: boolean
        hasImages: boolean
        imageCount: number
        mixedContent: MixedSelectionContent
    } {
        const mixedContent = this.domManager.extractMixedSelectionContent(selection)

        return {
            text: mixedContent.text,
            hasText: mixedContent.hasText,
            hasImages: mixedContent.hasImages,
            imageCount: mixedContent.images.length,
            mixedContent
        }
    }
} 