/**
 * ClipRecord — structured capture data for AI/export consumption.
 * Matches the schema in the design doc for Markdown, Logseq, Obsidian, Webhook export.
 */
export interface ClipRecord {
    id: string                        // e.g. "clip_1707884155"
    source_url: string
    source_title: string
    capture_time: string              // ISO 8601
    mode_used: 'Mode A' | 'Mode B'
    content: string                   // actual selected text
    context_before: string            // ~20 chars before selection
    context_after: string             // ~20 chars after selection
    user_note?: string
    source_detail_url?: string
}
