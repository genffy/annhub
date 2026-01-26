import { HighlightStorage } from './highlight-storage'
import { HighlightDOMManager } from './highlight-dom'
import { HighlightRecord, HighlightResult } from '../../../types/highlight'
import { textUtils } from '../../../lib/helpers/text'

/**
 * 高亮服务
 * 整合存储和DOM管理功能，提供完整的高亮功能
 */
export class HighlightService {
    private static instance: HighlightService | null = null
    private storage: HighlightStorage
    private domManager: HighlightDOMManager
    private isInitialized = false

    private constructor() {
        this.storage = HighlightStorage.getInstance()
        this.domManager = HighlightDOMManager.getInstance()
        this.initializeEventListeners()
    }

    static getInstance(): HighlightService {
        if (!HighlightService.instance) {
            HighlightService.instance = new HighlightService()
        }
        return HighlightService.instance
    }

    /**
     * 初始化服务
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return

        try {
            // 初始化存储
            await this.storage.initialize()

            // 恢复页面高亮
            await this.restorePageHighlights()

            this.isInitialized = true
            console.log('[HighlightService] Initialized successfully')
        } catch (error) {
            console.error('[HighlightService] Failed to initialize:', error)
            throw error
        }
    }

    /**
     * 初始化事件监听器
     */
    private initializeEventListeners(): void {
        // 监听颜色更新事件
        window.addEventListener('ann-highlight-color-updated', async (event: Event) => {
            const customEvent = event as CustomEvent
            const { highlightId, newColor } = customEvent.detail
            await this.updateHighlightColor(highlightId, newColor)
        })

        // 监听删除事件
        window.addEventListener('ann-highlight-deleted', async (event: Event) => {
            const customEvent = event as CustomEvent
            const { highlightId } = customEvent.detail
            await this.deleteHighlight(highlightId)
        })
    }

    /**
     * 创建高亮
     */
    async createHighlight(range: Range, color: string = '#ffeb3b'): Promise<HighlightResult> {
        try {
            const text = range.toString().trim()
            if (!text) {
                return { success: false, error: 'No text selected' }
            }

            // 保存到存储
            const saveResult = await this.storage.saveHighlight(text, range, color)
            if (!saveResult.success || !saveResult.highlight) {
                return saveResult
            }
            // 创建DOM高亮
            const elements = this.domManager.createHighlight(range, color, saveResult.highlight.id)
            if (elements.length === 0) {
                // 如果DOM创建失败，删除存储的记录
                await this.storage.deleteHighlight(saveResult.highlight.id)
                return { success: false, error: 'Failed to create DOM highlight' }
            }

            console.log(`[HighlightService] Created highlight: ${saveResult.highlight.id}`)
            return saveResult

        } catch (error) {
            console.error('[HighlightService] Failed to create highlight:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    /**
     * 更新高亮颜色
     */
    async updateHighlightColor(highlightId: string, newColor: string): Promise<HighlightResult> {
        try {
            // 更新存储
            const updateResult = await this.storage.updateHighlight(highlightId, { color: newColor })
            if (!updateResult.success) {
                return updateResult
            }

            // 更新DOM
            this.domManager.updateHighlightColor(highlightId, newColor)

            console.log(`[HighlightService] Updated highlight color: ${highlightId} -> ${newColor}`)
            return updateResult

        } catch (error) {
            console.error('[HighlightService] Failed to update highlight color:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    /**
     * 删除高亮
     */
    async deleteHighlight(highlightId: string): Promise<HighlightResult> {
        try {
            // 从DOM移除
            this.domManager.removeHighlight(highlightId)

            // 从存储删除
            const deleteResult = await this.storage.deleteHighlight(highlightId)

            console.log(`[HighlightService] Deleted highlight: ${highlightId}`)
            return deleteResult

        } catch (error) {
            console.error('[HighlightService] Failed to delete highlight:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    /**
     * 恢复页面高亮
     */
    async restorePageHighlights(): Promise<void> {
        try {
            const highlights = await this.storage.getCurrentPageHighlights()
            console.log(`[HighlightService] Restoring ${highlights.length} highlights`)

            for (const highlight of highlights) {
                await this.restoreHighlight(highlight)
            }

            console.log('[HighlightService] Page highlights restored')
        } catch (error) {
            console.error('[HighlightService] Failed to restore page highlights:', error)
        }
    }

    /**
     * 恢复单个高亮
     */
    private async restoreHighlight(highlight: HighlightRecord): Promise<void> {
        try {
            // 使用文本匹配算法查找对应的文本
            const range = await this.findTextRange(highlight)
            if (!range) {
                console.warn(`[HighlightService] Could not find text for highlight: ${highlight.id}`)
                return
            }

            // 创建DOM高亮
            this.domManager.createHighlight(range, highlight.color, highlight.id)
            console.log(`[HighlightService] Restored highlight: ${highlight.id}`)

        } catch (error) {
            console.error(`[HighlightService] Failed to restore highlight ${highlight.id}:`, error)
        }
    }

    /**
     * 查找文本范围
     */
    private async findTextRange(highlight: HighlightRecord): Promise<Range | null> {
        const { originalText, context, selector } = highlight

        try {
            // 首先尝试通过选择器定位
            let targetElements: Element[] = []
            if (selector) {
                const elements = document.querySelectorAll(selector)
                targetElements = Array.from(elements)
            }

            // 如果没有找到元素，则搜索整个文档
            if (targetElements.length === 0) {
                targetElements = [document.body]
            }

            // 在目标元素中搜索文本
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

    /**
     * 在元素中查找文本
     */
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

        // 构建完整文本
        const fullText = textNodes.map(node => node.textContent || '').join('')

        // 查找目标文本
        const targetIndex = this.findBestMatch(fullText, targetText, context)
        if (targetIndex === -1) {
            return null
        }

        // 创建范围
        return this.createRangeFromIndex(textNodes, targetIndex, targetText.length)
    }

    /**
     * 查找最佳匹配
     */
    private findBestMatch(fullText: string, targetText: string, context: { before: string; after: string }): number {
        // 首先尝试精确匹配
        let index = fullText.indexOf(targetText)
        if (index !== -1) {
            return index
        }

        // 尝试模糊匹配
        const normalizedTarget = textUtils.normalize(targetText)
        const normalizedFull = textUtils.normalize(fullText)

        index = normalizedFull.indexOf(normalizedTarget)
        if (index !== -1) {
            return index
        }

        // 使用上下文辅助匹配
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

    /**
     * 从索引创建范围
     */
    private createRangeFromIndex(textNodes: Text[], startIndex: number, length: number): Range | null {
        let currentIndex = 0
        let startNode: Text | null = null
        let startOffset = 0
        let endNode: Text | null = null
        let endOffset = 0

        // 查找起始位置
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

        // 查找结束位置
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

        // 创建范围
        const range = document.createRange()
        range.setStart(startNode, startOffset)
        range.setEnd(endNode, endOffset)

        return range
    }

    /**
     * 获取当前页面高亮
     */
    async getCurrentPageHighlights(): Promise<HighlightRecord[]> {
        return this.storage.getCurrentPageHighlights()
    }

    /**
     * 清除所有高亮
     */
    async clearAllHighlights(): Promise<void> {
        // 清除DOM
        this.domManager.clearAllHighlights()

        // 清除存储
        await this.storage.clearAllHighlights()

        console.log('[HighlightService] All highlights cleared')
    }

    /**
     * 获取高亮统计
     */
    async getHighlightStats(): Promise<{
        storage: { total: number; active: number; archived: number; deleted: number }
        dom: { total: number; colors: Record<string, number> }
    }> {
        const storageStats = await this.storage.getStats()
        const domStats = this.domManager.getHighlightStats()

        return {
            storage: storageStats,
            dom: domStats
        }
    }
} 