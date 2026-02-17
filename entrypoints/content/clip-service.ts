/**
 * Content-side ClipService — builds ClipRecord from a selection Range
 * and sends it to the background for persistence.
 */
import { ClipRecord } from '../../types/clip'
import { generateId } from '../../utils/helpers'
import MessageUtils from '../../utils/message'
import { HighlightDOMManager } from './highlight/highlight-dom'

const CONTEXT_LENGTH = 20

export class ClipService {
    private static instance: ClipService | null = null

    private constructor() { }

    static getInstance(): ClipService {
        if (!ClipService.instance) {
            ClipService.instance = new ClipService()
        }
        return ClipService.instance
    }

    /**
     * Capture the current selection and persist it.
     * Returns the saved ClipRecord on success, or null on failure.
     */
    async captureSelection(
        range: Range,
        mode: 'Mode A' | 'Mode B',
        userNote?: string
    ): Promise<ClipRecord | null> {
        const content = range.toString().trim()
        if (!content || content.length <= 2) return null

        const { before, after } = this.getContext(range)
        let sourceUrl: string | null = null
        try {
            sourceUrl = HighlightDOMManager.findSourceUrl(range)
        } catch (err) {
            console.warn('[ClipService] Failed to extract source URL:', err)
        }

        const clip: ClipRecord = {
            id: generateId('clip'),
            source_url: window.location.href,
            source_title: document.title,
            capture_time: new Date().toISOString(),
            mode_used: mode,
            content,
            context_before: before,
            context_after: after,
            user_note: userNote || undefined,
            source_detail_url: sourceUrl || undefined,
        }

        try {
            const response = await MessageUtils.sendMessage({
                type: 'SAVE_CLIP',
                data: clip,
            })
            if (response.success) {
                console.log(`[ClipService] Clip saved: ${clip.id}`)
                return clip
            }
            console.error('[ClipService] Failed to save clip:', response.error)
            return null
        } catch (error) {
            console.error('[ClipService] Error saving clip:', error)
            return null
        }
    }

    /**
     * Extract up to CONTEXT_LENGTH characters before and after the selection.
     */
    private getContext(range: Range): { before: string; after: string } {
        const container = range.commonAncestorContainer
        const fullText = container.textContent || ''

        // For text nodes, use the offset relative to the parent text
        let selStart = 0
        let selEnd = fullText.length

        if (container.nodeType === Node.TEXT_NODE) {
            selStart = range.startOffset
            selEnd = range.endOffset
        } else {
            // For element containers, approximate with string search
            const selectedText = range.toString()
            const idx = fullText.indexOf(selectedText)
            if (idx !== -1) {
                selStart = idx
                selEnd = idx + selectedText.length
            }
        }

        const before = fullText.substring(
            Math.max(0, selStart - CONTEXT_LENGTH),
            selStart
        )
        const after = fullText.substring(
            selEnd,
            Math.min(fullText.length, selEnd + CONTEXT_LENGTH)
        )

        return { before, after }
    }
}
