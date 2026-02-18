import { HighlightRecord } from '../../../types/highlight'
import { ClipRecord } from '../../../types/clip'

/**
 * Converts AnnHub records into Logseq block content and properties.
 *
 * Highlight block layout in Logseq:
 *   > highlighted text
 *     annhub-id:: hl_xxx
 *     source-url:: https://...
 *     date:: [[2024-01-15]]
 *     color:: #ffeb3b
 *   (child block) 💭 user note
 *
 * Clip block layout:
 *   > clipped text
 *     annhub-id:: clip_xxx
 *     source-url:: https://...
 *     date:: [[2024-01-15]]
 *     mode:: Mode A
 *   (child block) 💭 user note
 */

function formatDate(ts: number | string): string {
    const d = typeof ts === 'string' ? new Date(ts) : new Date(ts)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

function sanitizePageTitle(title: string): string {
    return title
        .replace(/[\/\\#\[\]{}|^]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 120)
}

export interface FormattedBlock {
    content: string
    properties: Record<string, string>
    childContent?: string
}

export class LogseqFormatter {
    static formatHighlight(record: HighlightRecord): FormattedBlock {
        const text = record.originalText.trim()
        const content = `> ${text}`
        const dateStr = formatDate(record.timestamp)
        const sourceUrl = record.metadata?.sourceUrl || record.metadata?.pageUrl || record.url

        const properties: Record<string, string> = {
            'annhub-id': record.id,
            'source-url': sourceUrl,
            'date': `[[${dateStr}]]`,
            'color': record.color,
        }

        const childContent = record.user_note?.trim()
            ? `💭 ${record.user_note.trim()}`
            : undefined

        return { content, properties, childContent }
    }

    static formatClip(record: ClipRecord): FormattedBlock {
        const text = record.content.trim()
        const content = `> ${text}`
        const dateStr = formatDate(record.capture_time)
        const sourceUrl = record.source_detail_url || record.source_url

        const properties: Record<string, string> = {
            'annhub-id': record.id,
            'source-url': sourceUrl,
            'date': `[[${dateStr}]]`,
            'mode': record.mode_used,
        }

        const childContent = record.user_note?.trim()
            ? `💭 ${record.user_note.trim()}`
            : undefined

        return { content, properties, childContent }
    }

    static buildPageName(prefix: string, title: string): string {
        const sanitized = sanitizePageTitle(title)
        return sanitized ? `${prefix}/${sanitized}` : prefix
    }

    static buildPageProperties(url: string, domain: string): Record<string, string> {
        return { url, domain }
    }

    static highlightPageName(prefix: string, record: HighlightRecord): string {
        const title = record.metadata?.pageTitle || new URL(record.url).hostname
        return this.buildPageName(prefix, title)
    }

    static clipPageName(prefix: string, record: ClipRecord): string {
        const title = record.source_title || new URL(record.source_url).hostname
        return this.buildPageName(prefix, title)
    }
}
