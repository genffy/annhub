import { HighlightRecord } from '../../../types/highlight'
import { ClipRecord } from '../../../types/clip'
import { LogseqConfig } from '../../../types/logseq'

/**
 * Converts AnnHub records into Logseq journal block content with tags.
 *
 * Journal-based sync strategy:
 * - All highlights/clips are added to the journal page for the date (e.g., [[2025-01-15]])
 * - Uses #tags for categorization instead of page namespace
 * - Includes source link and metadata in block properties
 *
 * Highlight block in journal:
 *   #annhub [[Page Title]] [🔗](https://example.com/article)
 *   > highlighted text
 *   (child block) 💭 user note
 *
 * Clip block in journal:
 *   #annhub [[Page Title]] [🔗](https://example.com/article)
 *   > clipped text
 *   (child block) 💭 user note
 */

function formatDate(ts: number | string): string {
    const d = typeof ts === 'string' ? new Date(ts) : new Date(ts)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

function getJournalPageName(ts: number | string): string {
    return formatDate(ts)
}

function sanitizeTag(tag: string): string {
    let cleaned = tag.trim()
    if (!cleaned.startsWith('#')) {
        cleaned = '#' + cleaned
    }
    return cleaned.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5#-]/g, '')
}

function buildTagsString(
    config: Pick<LogseqConfig, 'customTags' | 'autoTagDomain'>,
    domain?: string
): string {
    const tags = ['#annhub']

    if (config.customTags.trim()) {
        const custom = config.customTags
            .split(',')
            .map(t => sanitizeTag(t))
            .filter(Boolean)
        tags.push(...custom)
    }

    if (config.autoTagDomain && domain) {
        const domainTag = '#' + domain.replace(/[./]/g, '_')
        tags.push(domainTag)
    }

    return tags.join(' ')
}

function sanitizePageTitle(title: string): string {
    return title
        .replace(/[\[\]]/g, '') // Remove brackets that might break links
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100)
}

export interface FormattedJournalBlock {
    journalPage: string // e.g., "2025-01-15"
    content: string // Main block content with tags and link
    properties: Record<string, string> // Block properties for metadata
    children?: string[] // Child blocks (quote, note, etc.)
}

export class LogseqFormatter {
    /**
     * Format a highlight record for journal sync.
     *
     * Block structure:
     *   #annhub [[Page Title]] [🔗](https://...)
     *     annhubId:: hl_xxx
     *   - > highlighted text
     *   - 💭 user note
     */
    static formatHighlight(
        record: HighlightRecord,
        config: Pick<LogseqConfig, 'customTags' | 'autoTagDomain'>
    ): FormattedJournalBlock {
        const journalPage = getJournalPageName(record.timestamp)
        const pageTitle = sanitizePageTitle(record.metadata?.pageTitle || record.domain)
        const sourceUrl = record.metadata?.sourceUrl || record.metadata?.pageUrl || record.url
        const tags = buildTagsString(config, record.domain)

        // Main block: tags + page link + clickable source link
        const content = `${tags} [[${pageTitle}]] [🔗](${sourceUrl})`

        // Only keep annhubId for duplicate detection
        const properties: Record<string, string> = {
            'annhubId': record.id,
        }

        // Highlight quote as first child block
        const quoteContent = `> ${record.originalText.trim()}`

        // Build children array
        const children: string[] = [quoteContent]
        if (record.user_note?.trim()) {
            children.push(`💭 ${record.user_note.trim()}`)
        }

        return {
            journalPage,
            content,
            properties,
            children,
        }
    }

    /**
     * Format a clip record for journal sync.
     */
    static formatClip(
        record: ClipRecord,
        config: Pick<LogseqConfig, 'customTags' | 'autoTagDomain'>
    ): FormattedJournalBlock {
        const journalPage = getJournalPageName(record.capture_time)
        const pageTitle = sanitizePageTitle(record.source_title || '')
        const sourceUrl = record.source_detail_url || record.source_url
        const url = new URL(sourceUrl)
        const tags = buildTagsString(config, url.hostname)

        // Main block: tags + page link + clickable source link
        const content = pageTitle
            ? `${tags} [[${pageTitle}]] [🔗](${sourceUrl})`
            : `${tags} [🔗](${sourceUrl})`

        // Only keep annhubId for duplicate detection
        const properties: Record<string, string> = {
            'annhubId': record.id,
        }

        // Clip content as child block
        const clipContent = `> ${record.content.trim()}`

        // Build children array
        const children: string[] = [clipContent]
        if (record.user_note?.trim()) {
            children.push(`💭 ${record.user_note.trim()}`)
        }

        return {
            journalPage,
            content,
            properties,
            children,
        }
    }

    /**
     * Get the journal page name for a record.
     */
    static getJournalPageName(ts: number | string): string {
        return getJournalPageName(ts)
    }
}
