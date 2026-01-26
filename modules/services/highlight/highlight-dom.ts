import { HighlightColor } from '../../../types/highlight'

/**
 * DOM高亮管理器
 * 负责在页面上创建、显示和移除高亮效果
 */
export class HighlightDOMManager {
    private static instance: HighlightDOMManager | null = null
    private highlightElements: Map<string, HTMLElement[]> = new Map()

    // 默认高亮颜色配置
    private readonly DEFAULT_COLORS: HighlightColor[] = [
        { name: 'Yellow', value: '#ffeb3b', textColor: '#000000' },
        { name: 'Green', value: '#4caf50', textColor: '#ffffff' },
        { name: 'Blue', value: '#2196f3', textColor: '#ffffff' },
        { name: 'Pink', value: '#e91e63', textColor: '#ffffff' },
        { name: 'Orange', value: '#ff9800', textColor: '#000000' },
        { name: 'Purple', value: '#9c27b0', textColor: '#ffffff' }
    ]

    private constructor() {
        this.initializeStyles()
    }

    static getInstance(): HighlightDOMManager {
        if (!HighlightDOMManager.instance) {
            HighlightDOMManager.instance = new HighlightDOMManager()
        }
        return HighlightDOMManager.instance
    }

    /**
     * 初始化样式表
     */
    private initializeStyles(): void {
        // 创建样式表
        const style = document.createElement('style')
        style.id = 'ann-highlight-styles'
        document.head.appendChild(style)

        // 基础高亮样式
        const css = `
            .ann-highlight {
                position: relative;
                border-radius: 2px;
                transition: all 0.2s ease;
                cursor: pointer;
            }

            .ann-highlight:hover {
                opacity: 0.8;
                transform: scale(1.02);
            }

            .ann-highlight::before {
                content: '';
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                background: inherit;
                border-radius: inherit;
                opacity: 0.3;
                z-index: -1;
                pointer-events: none;
            }

            .ann-highlight-tooltip {
                position: absolute;
                background: #333;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 10000;
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease;
                pointer-events: none;
            }

            .ann-highlight:hover .ann-highlight-tooltip {
                opacity: 1;
                visibility: visible;
            }

            .ann-highlight-menu {
                position: absolute;
                background: white;
                border: 1px solid #ddd;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                z-index: 10001;
                min-width: 120px;
                padding: 4px 0;
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease;
            }

            .ann-highlight-menu.visible {
                opacity: 1;
                visibility: visible;
            }

            .ann-highlight-menu-item {
                padding: 8px 12px;
                cursor: pointer;
                font-size: 14px;
                border: none;
                background: none;
                width: 100%;
                text-align: left;
                color: #333;
            }

            .ann-highlight-menu-item:hover {
                background: #f5f5f5;
            }

            .ann-highlight-menu-item.delete {
                color: #dc3545;
            }

            .ann-highlight-menu-item.delete:hover {
                background: #fee;
            }
        `

        style.textContent = css
    }

    /**
     * 创建高亮元素
     */
    createHighlight(range: Range, color: string, highlightId: string): HTMLElement[] {
        const highlightElements: HTMLElement[] = []

        try {
            // 获取所有文本节点
            const textNodes = this.getTextNodesInRange(range)

            textNodes.forEach((textNode) => {
                // 检查文本节点是否部分选中
                const nodeRange = document.createRange()
                nodeRange.selectNodeContents(textNode)

                // 计算实际需要高亮的部分
                let startOffset = 0
                let endOffset = textNode.textContent?.length || 0

                // 如果是起始节点，使用range的起始偏移
                if (textNode === range.startContainer) {
                    startOffset = range.startOffset
                }

                // 如果是结束节点，使用range的结束偏移
                if (textNode === range.endContainer) {
                    endOffset = range.endOffset
                }

                // 如果节点只是部分被选中，需要分割文本节点
                if (startOffset > 0 || endOffset < (textNode.textContent?.length || 0)) {
                    // 如果有起始偏移，分割出前面的部分
                    if (startOffset > 0) {
                        textNode.splitText(startOffset)
                        // splitText返回后半部分，textNode现在是前半部分
                        // 我们需要高亮的是后半部分
                        const nextNode = textNode.nextSibling as Text
                        if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
                            // 调整结束偏移（因为已经分割了）
                            const newLength = endOffset - startOffset
                            if (newLength < (nextNode.textContent?.length || 0)) {
                                // 还需要分割结束部分
                                nextNode.splitText(newLength)
                            }
                            // 现在nextNode就是我们要高亮的部分
                            this.wrapTextNode(nextNode, color, highlightId, highlightElements)
                        }
                    } else if (endOffset < (textNode.textContent?.length || 0)) {
                        // 只需要分割结束部分
                        textNode.splitText(endOffset)
                        // textNode现在是需要高亮的部分
                        this.wrapTextNode(textNode, color, highlightId, highlightElements)
                    }
                } else {
                    // 整个节点都被选中
                    this.wrapTextNode(textNode, color, highlightId, highlightElements)
                }
            })

            // 保存高亮元素引用
            this.highlightElements.set(highlightId, highlightElements)

            console.log(`[HighlightDOMManager] Created highlight ${highlightId} with ${highlightElements.length} elements`)

        } catch (error) {
            console.error('[HighlightDOMManager] Failed to create highlight:', error)
        }

        return highlightElements
    }

    /**
     * 包装文本节点
     */
    private wrapTextNode(textNode: Text, color: string, highlightId: string, highlightElements: HTMLElement[]): void {
        const span = document.createElement('span')
        span.className = 'ann-highlight'
        span.setAttribute('data-highlight-id', highlightId)
        span.setAttribute('data-highlight-color', color)
        span.style.backgroundColor = color

        // 设置文本颜色（根据背景色自动选择）
        span.style.color = this.getContrastColor(color)

        // 添加工具提示
        const tooltip = document.createElement('div')
        tooltip.className = 'ann-highlight-tooltip'
        tooltip.textContent = `Highlight (${new Date().toLocaleDateString()})`
        tooltip.style.top = '-30px'
        tooltip.style.left = '0'
        span.appendChild(tooltip)

        // 添加右键菜单事件
        span.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            this.showContextMenu(e, highlightId)
        })

        // 包装文本节点
        const parent = textNode.parentNode
        if (parent) {
            parent.insertBefore(span, textNode)
            span.appendChild(textNode)
            highlightElements.push(span)
        }
    }

    /**
     * 移除高亮
     */
    removeHighlight(highlightId: string): void {
        const elements = this.highlightElements.get(highlightId)
        if (!elements) return

        elements.forEach(element => {
            const parent = element.parentNode
            if (parent) {
                // 将子节点移回原位置
                while (element.firstChild) {
                    parent.insertBefore(element.firstChild, element)
                }
                // 移除高亮元素
                parent.removeChild(element)
            }
        })

        this.highlightElements.delete(highlightId)
        console.log(`[HighlightDOMManager] Removed highlight ${highlightId}`)
    }

    /**
     * 更新高亮颜色
     */
    updateHighlightColor(highlightId: string, newColor: string): void {
        const elements = this.highlightElements.get(highlightId)
        if (!elements) return

        elements.forEach(element => {
            element.style.backgroundColor = newColor
            element.style.color = this.getContrastColor(newColor)
            element.setAttribute('data-highlight-color', newColor)
        })

        console.log(`[HighlightDOMManager] Updated highlight ${highlightId} color to ${newColor}`)
    }

    /**
     * 获取范围内的文本节点
     */
    private getTextNodesInRange(range: Range): Text[] {
        const textNodes: Text[] = []

        // 如果范围为空，直接返回
        if (range.collapsed) {
            return textNodes
        }

        // 使用更精确的方法获取文本节点
        const startContainer = range.startContainer
        const endContainer = range.endContainer

        // 如果开始和结束在同一个文本节点中
        if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
            textNodes.push(startContainer as Text)
            return textNodes
        }

        // 创建树遍历器
        const walker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // 对于文本节点，检查是否与范围相交
                    if (node.nodeType === Node.TEXT_NODE) {
                        // 特殊处理：如果是起始或结束容器，直接接受
                        if (node === startContainer || node === endContainer) {
                            return NodeFilter.FILTER_ACCEPT
                        }

                        try {
                            // 创建一个包含该节点的范围
                            const nodeRange = document.createRange()
                            nodeRange.selectNodeContents(node)

                            // 使用更可靠的相交检测方法
                            // 检查节点是否在选择范围之前
                            const nodeBeforeRange = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0
                            // 检查节点是否在选择范围之后
                            const nodeAfterRange = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0

                            // 如果节点既不在范围之前也不在范围之后，那么它与范围相交
                            if (!nodeBeforeRange && !nodeAfterRange) {
                                return NodeFilter.FILTER_ACCEPT
                            }

                            // 清理创建的范围
                            nodeRange.detach()
                        } catch (error) {
                            console.warn('[HighlightDOMManager] Error comparing ranges:', error)
                            // 如果比较失败，使用备用方法
                            try {
                                return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
                            } catch {
                                return NodeFilter.FILTER_REJECT
                            }
                        }
                    }
                    return NodeFilter.FILTER_REJECT
                }
            }
        )

        let node: Text | null
        while (node = walker.nextNode() as Text) {
            textNodes.push(node)
        }

        // 确保起始和结束容器被包含（如果它们是文本节点）
        if (startContainer.nodeType === Node.TEXT_NODE && !textNodes.includes(startContainer as Text)) {
            textNodes.unshift(startContainer as Text)
        }
        if (endContainer.nodeType === Node.TEXT_NODE &&
            endContainer !== startContainer &&
            !textNodes.includes(endContainer as Text)) {
            textNodes.push(endContainer as Text)
        }

        // 按照文档顺序排序文本节点
        textNodes.sort((a, b) => {
            const position = a.compareDocumentPosition(b)
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                return -1
            } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
                return 1
            }
            return 0
        })

        return textNodes
    }

    /**
     * 获取范围内所有文本节点的备用方法
     */
    private getAllTextNodesInRange(range: Range): Text[] {
        const textNodes: Text[] = []
        const walker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            null
        )

        let node: Text | null
        while (node = walker.nextNode() as Text) {
            // 创建一个包含该文本节点的范围
            const nodeRange = document.createRange()
            nodeRange.selectNodeContents(node)

            // 检查是否与目标范围有交集
            try {
                const startToEnd = range.compareBoundaryPoints(Range.START_TO_END, nodeRange)
                const endToStart = range.compareBoundaryPoints(Range.END_TO_START, nodeRange)

                if (startToEnd > 0 && endToStart < 0) {
                    textNodes.push(node)
                }
            } catch (error) {
                // 如果比较失败，检查节点内容是否包含在范围的文本中
                const rangeText = range.toString()
                const nodeText = node.textContent || ''
                if (rangeText.includes(nodeText) || nodeText.includes(rangeText)) {
                    textNodes.push(node)
                }
            }
        }

        return textNodes
    }

    /**
     * 根据背景色获取对比色
     */
    private getContrastColor(backgroundColor: string): string {
        // 移除 # 符号
        const hex = backgroundColor.replace('#', '')

        // 转换为 RGB
        const r = parseInt(hex.substr(0, 2), 16)
        const g = parseInt(hex.substr(2, 2), 16)
        const b = parseInt(hex.substr(4, 2), 16)

        // 计算亮度
        const brightness = (r * 299 + g * 587 + b * 114) / 1000

        // 返回对比色
        return brightness > 128 ? '#000000' : '#ffffff'
    }

    /**
     * 显示右键菜单
     */
    private showContextMenu(event: MouseEvent, highlightId: string): void {
        // 移除现有菜单
        const existingMenu = document.querySelector('.ann-highlight-menu')
        if (existingMenu) {
            existingMenu.remove()
        }

        // 创建菜单
        const menu = document.createElement('div')
        menu.className = 'ann-highlight-menu visible'
        menu.style.left = `${event.pageX}px`
        menu.style.top = `${event.pageY}px`

        // 菜单项
        const menuItems = [
            { text: 'Change Color', action: () => this.showColorPicker(highlightId) },
            { text: 'Copy Text', action: () => this.copyHighlightText(highlightId) },
            { text: 'Delete', action: () => this.deleteHighlight(highlightId), className: 'delete' }
        ]

        menuItems.forEach(item => {
            const button = document.createElement('button')
            button.className = `ann-highlight-menu-item ${item.className || ''}`
            button.textContent = item.text
            button.addEventListener('click', () => {
                item.action()
                menu.remove()
            })
            menu.appendChild(button)
        })

        document.body.appendChild(menu)

        // 点击外部关闭菜单
        const closeMenu = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                menu.remove()
                document.removeEventListener('click', closeMenu)
            }
        }
        setTimeout(() => document.addEventListener('click', closeMenu), 10)
    }

    /**
     * 显示颜色选择器
     */
    private showColorPicker(highlightId: string): void {
        const colorPicker = document.createElement('div')
        colorPicker.className = 'ann-highlight-color-picker'
        colorPicker.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10002;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        `

        this.DEFAULT_COLORS.forEach(color => {
            const colorButton = document.createElement('button')
            colorButton.style.cssText = `
                width: 32px;
                height: 32px;
                border: 2px solid #ddd;
                border-radius: 4px;
                background: ${color.value};
                cursor: pointer;
                transition: transform 0.2s ease;
            `
            colorButton.addEventListener('click', () => {
                this.updateHighlightColor(highlightId, color.value)
                colorPicker.remove()
                // 触发颜色更新事件
                this.dispatchColorUpdateEvent(highlightId, color.value)
            })
            colorButton.addEventListener('mouseenter', () => {
                colorButton.style.transform = 'scale(1.1)'
            })
            colorButton.addEventListener('mouseleave', () => {
                colorButton.style.transform = 'scale(1)'
            })
            colorPicker.appendChild(colorButton)
        })

        document.body.appendChild(colorPicker)

        // 点击外部关闭
        const closePicker = (e: MouseEvent) => {
            if (!colorPicker.contains(e.target as Node)) {
                colorPicker.remove()
                document.removeEventListener('click', closePicker)
            }
        }
        setTimeout(() => document.addEventListener('click', closePicker), 10)
    }

    /**
     * 复制高亮文本
     */
    private copyHighlightText(highlightId: string): void {
        const elements = this.highlightElements.get(highlightId)
        if (!elements) return

        const text = elements.map(el => el.textContent || '').join('')
        navigator.clipboard.writeText(text).then(() => {
            console.log(`[HighlightDOMManager] Copied highlight text: ${text}`)
        }).catch(err => {
            console.error('[HighlightDOMManager] Failed to copy text:', err)
        })
    }

    /**
     * 删除高亮
     */
    private deleteHighlight(highlightId: string): void {
        this.removeHighlight(highlightId)
        // 触发删除事件
        this.dispatchDeleteEvent(highlightId)
    }

    /**
     * 触发颜色更新事件
     */
    private dispatchColorUpdateEvent(highlightId: string, newColor: string): void {
        const event = new CustomEvent('ann-highlight-color-updated', {
            detail: { highlightId, newColor }
        })
        window.dispatchEvent(event)
    }

    /**
     * 触发删除事件
     */
    private dispatchDeleteEvent(highlightId: string): void {
        const event = new CustomEvent('ann-highlight-deleted', {
            detail: { highlightId }
        })
        window.dispatchEvent(event)
    }

    /**
     * 清除所有高亮
     */
    clearAllHighlights(): void {
        this.highlightElements.forEach((_, highlightId) => {
            this.removeHighlight(highlightId)
        })
        this.highlightElements.clear()
        console.log('[HighlightDOMManager] Cleared all highlights')
    }

    /**
     * 获取高亮统计
     */
    getHighlightStats(): { total: number; colors: Record<string, number> } {
        const colors: Record<string, number> = {}
        let total = 0

        this.highlightElements.forEach((elements) => {
            total++
            const color = elements[0]?.getAttribute('data-highlight-color') || '#ffeb3b'
            colors[color] = (colors[color] || 0) + 1
        })

        return { total, colors }
    }
} 