import { HighlightColor } from '../../../types/highlight'
import { MixedSelectionContent } from '../../../types/dom'


export class HighlightDOMManager {
    private static instance: HighlightDOMManager | null = null
    private highlightElements: Map<string, HTMLElement[]> = new Map()


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


    private initializeStyles(): void {

        const style = document.createElement('style')
        style.id = 'ann-highlight-styles'
        document.head.appendChild(style)


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


    createHighlight(range: Range, color: string, highlightId: string): HTMLElement[] {
        const highlightElements: HTMLElement[] = []

        try {

            const textNodes = this.getTextNodesInRange(range)

            textNodes.forEach((textNode) => {

                const nodeRange = document.createRange()
                nodeRange.selectNodeContents(textNode)


                let startOffset = 0
                let endOffset = textNode.textContent?.length || 0


                if (textNode === range.startContainer) {
                    startOffset = range.startOffset
                }


                if (textNode === range.endContainer) {
                    endOffset = range.endOffset
                }


                if (startOffset > 0 || endOffset < (textNode.textContent?.length || 0)) {

                    if (startOffset > 0) {
                        textNode.splitText(startOffset)

                        const nextNode = textNode.nextSibling as Text
                        if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {

                            const newLength = endOffset - startOffset
                            if (newLength < (nextNode.textContent?.length || 0)) {

                                nextNode.splitText(newLength)
                            }

                            this.wrapTextNode(nextNode, color, highlightId, highlightElements)
                        }
                    } else if (endOffset < (textNode.textContent?.length || 0)) {

                        textNode.splitText(endOffset)

                        this.wrapTextNode(textNode, color, highlightId, highlightElements)
                    }
                } else {

                    this.wrapTextNode(textNode, color, highlightId, highlightElements)
                }
            })


            this.highlightElements.set(highlightId, highlightElements)

            console.log(`[HighlightDOMManager] Created highlight ${highlightId} with ${highlightElements.length} elements`)

        } catch (error) {
            console.error('[HighlightDOMManager] Failed to create highlight:', error)
        }

        return highlightElements
    }


    private wrapTextNode(textNode: Text, color: string, highlightId: string, highlightElements: HTMLElement[]): void {
        const span = document.createElement('span')
        span.className = 'ann-highlight'
        span.setAttribute('data-highlight-id', highlightId)
        span.setAttribute('data-highlight-color', color)
        span.style.backgroundColor = color


        span.style.color = this.getContrastColor(color)


        const tooltip = document.createElement('div')
        tooltip.className = 'ann-highlight-tooltip'
        tooltip.textContent = `Highlight (${new Date().toLocaleDateString()})`
        tooltip.style.top = '-30px'
        tooltip.style.left = '0'
        span.appendChild(tooltip)


        span.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            this.showContextMenu(e, highlightId)
        })


        const parent = textNode.parentNode
        if (parent) {
            parent.insertBefore(span, textNode)
            span.appendChild(textNode)
            highlightElements.push(span)
        }
    }


    removeHighlight(highlightId: string): void {
        const elements = this.highlightElements.get(highlightId)
        if (!elements) return

        elements.forEach(element => {
            const parent = element.parentNode
            if (parent) {

                while (element.firstChild) {
                    parent.insertBefore(element.firstChild, element)
                }

                parent.removeChild(element)
            }
        })

        this.highlightElements.delete(highlightId)
        console.log(`[HighlightDOMManager] Removed highlight ${highlightId}`)
    }


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


    private getTextNodesInRange(range: Range): Text[] {
        const textNodes: Text[] = []


        if (range.collapsed) {
            return textNodes
        }


        const startContainer = range.startContainer
        const endContainer = range.endContainer


        if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
            textNodes.push(startContainer as Text)
            return textNodes
        }


        const walker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {

                    if (node.nodeType === Node.TEXT_NODE) {

                        if (node === startContainer || node === endContainer) {
                            return NodeFilter.FILTER_ACCEPT
                        }

                        try {

                            const nodeRange = document.createRange()
                            nodeRange.selectNodeContents(node)



                            const nodeBeforeRange = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0

                            const nodeAfterRange = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0


                            if (!nodeBeforeRange && !nodeAfterRange) {
                                return NodeFilter.FILTER_ACCEPT
                            }


                            nodeRange.detach()
                        } catch (error) {
                            console.warn('[HighlightDOMManager] Error comparing ranges:', error)

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


        if (startContainer.nodeType === Node.TEXT_NODE && !textNodes.includes(startContainer as Text)) {
            textNodes.unshift(startContainer as Text)
        }
        if (endContainer.nodeType === Node.TEXT_NODE &&
            endContainer !== startContainer &&
            !textNodes.includes(endContainer as Text)) {
            textNodes.push(endContainer as Text)
        }


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


    private getAllTextNodesInRange(range: Range): Text[] {
        const textNodes: Text[] = []
        const walker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            null
        )

        let node: Text | null
        while (node = walker.nextNode() as Text) {

            const nodeRange = document.createRange()
            nodeRange.selectNodeContents(node)


            try {
                const startToEnd = range.compareBoundaryPoints(Range.START_TO_END, nodeRange)
                const endToStart = range.compareBoundaryPoints(Range.END_TO_START, nodeRange)

                if (startToEnd > 0 && endToStart < 0) {
                    textNodes.push(node)
                }
            } catch (error) {

                const rangeText = range.toString()
                const nodeText = node.textContent || ''
                if (rangeText.includes(nodeText) || nodeText.includes(rangeText)) {
                    textNodes.push(node)
                }
            }
        }

        return textNodes
    }


    private getContrastColor(backgroundColor: string): string {

        const hex = backgroundColor.replace('#', '')


        const r = parseInt(hex.substr(0, 2), 16)
        const g = parseInt(hex.substr(2, 2), 16)
        const b = parseInt(hex.substr(4, 2), 16)


        const brightness = (r * 299 + g * 587 + b * 114) / 1000


        return brightness > 128 ? '#000000' : '#ffffff'
    }


    private showContextMenu(event: MouseEvent, highlightId: string): void {

        const existingMenu = document.querySelector('.ann-highlight-menu')
        if (existingMenu) {
            existingMenu.remove()
        }


        const menu = document.createElement('div')
        menu.className = 'ann-highlight-menu visible'
        menu.style.left = `${event.pageX}px`
        menu.style.top = `${event.pageY}px`


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


        const closeMenu = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                menu.remove()
                document.removeEventListener('click', closeMenu)
            }
        }
        setTimeout(() => document.addEventListener('click', closeMenu), 10)
    }


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


        const closePicker = (e: MouseEvent) => {
            if (!colorPicker.contains(e.target as Node)) {
                colorPicker.remove()
                document.removeEventListener('click', closePicker)
            }
        }
        setTimeout(() => document.addEventListener('click', closePicker), 10)
    }


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


    private deleteHighlight(highlightId: string): void {
        this.removeHighlight(highlightId)

        this.dispatchDeleteEvent(highlightId)
    }


    private dispatchColorUpdateEvent(highlightId: string, newColor: string): void {
        const event = new CustomEvent('ann-highlight-color-updated', {
            detail: { highlightId, newColor }
        })
        window.dispatchEvent(event)
    }


    private dispatchDeleteEvent(highlightId: string): void {
        const event = new CustomEvent('ann-highlight-deleted', {
            detail: { highlightId }
        })
        window.dispatchEvent(event)
    }


    clearAllHighlights(): void {
        this.highlightElements.forEach((_, highlightId) => {
            this.removeHighlight(highlightId)
        })
        this.highlightElements.clear()
        console.log('[HighlightDOMManager] Cleared all highlights')
    }


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


    static generateSelector(range: Range): string {
        const container = range.commonAncestorContainer
        const element = container.nodeType === Node.TEXT_NODE
            ? container.parentElement
            : container as Element

        if (!element) return ''


        let selector = element.tagName.toLowerCase()

        if (element.id) {
            selector += `#${element.id}`
        } else if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim())
            if (classes.length > 0) {
                selector += `.${classes.join('.')}`
            }
        }

        return selector
    }

    static getTextContext(range: Range, contextLength: number = 50): { before: string; after: string } {
        const container = range.commonAncestorContainer
        const fullText = container.textContent || ''
        const startOffset = range.startOffset
        const endOffset = range.endOffset

        const before = fullText.substring(Math.max(0, startOffset - contextLength), startOffset)
        const after = fullText.substring(endOffset, Math.min(fullText.length, endOffset + contextLength))

        return { before, after }
    }


    extractMixedSelectionContent(selection: Selection): MixedSelectionContent {
        const result: MixedSelectionContent = {
            text: '',
            images: [],
            hasText: false,
            hasImages: false,
            totalElements: 0
        }

        if (!selection || selection.rangeCount === 0) {
            return result
        }

        const range = selection.getRangeAt(0)
        const text = selection.toString().trim()


        if (text && text.length > 0) {
            result.text = text
            result.hasText = true
        }


        const addedImageSrcs = new Set<string>()


        try {
            const rangeRect = range.getBoundingClientRect()
            const allImages = document.querySelectorAll('img')

            allImages.forEach(img => {
                const imgRect = img.getBoundingClientRect()


                if (this.isRectOverlapping(imgRect, rangeRect) ||
                    this.isRectContained(imgRect, rangeRect)) {

                    const imgSrc = img.src || img.dataset.src || ''
                    const imgKey = `${imgSrc}-${img.alt}-${Math.round(imgRect.x)}-${Math.round(imgRect.y)}`


                    if (!addedImageSrcs.has(imgKey)) {
                        addedImageSrcs.add(imgKey)
                        result.images.push({
                            element: img,
                            src: imgSrc,
                            alt: img.alt || '',
                            rect: imgRect
                        })
                        result.hasImages = true
                    }
                }
            })
        } catch (error) {
            console.warn('Error checking image overlap:', error)
        }


        try {
            const container = range.commonAncestorContainer
            const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_ELEMENT,
                {
                    acceptNode: (node) => {

                        try {
                            if (range.intersectsNode && range.intersectsNode(node)) {
                                return NodeFilter.FILTER_ACCEPT
                            }
                            return NodeFilter.FILTER_SKIP
                        } catch {
                            return NodeFilter.FILTER_SKIP
                        }
                    }
                }
            )

            let node: Element | null
            while (node = walker.nextNode() as Element) {
                result.totalElements++

                if (node.tagName === 'IMG') {
                    const img = node as HTMLImageElement
                    const imgRect = img.getBoundingClientRect()
                    const imgSrc = img.src || img.dataset.src || ''
                    const imgKey = `${imgSrc}-${img.alt}-${Math.round(imgRect.x)}-${Math.round(imgRect.y)}`

                    if (!addedImageSrcs.has(imgKey)) {
                        addedImageSrcs.add(imgKey)
                        result.images.push({
                            element: img,
                            src: imgSrc,
                            alt: img.alt || '',
                            rect: imgRect
                        })
                        result.hasImages = true
                    }
                }
            }
        } catch (error) {
            console.warn('Error traversing selection nodes:', error)
        }

        return result
    }


    private isRectOverlapping(rect1: DOMRect, rect2: DOMRect): boolean {
        return !(rect1.right < rect2.left ||
            rect1.left > rect2.right ||
            rect1.bottom < rect2.top ||
            rect1.top > rect2.bottom)
    }


    private isRectContained(rect1: DOMRect, rect2: DOMRect): boolean {
        return rect1.left >= rect2.left &&
            rect1.right <= rect2.right &&
            rect1.top >= rect2.top &&
            rect1.bottom <= rect2.bottom
    }
} 