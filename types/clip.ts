/**
 * ClipRecord — structured capture data for AI/export consumption.
 */
export interface ClipRecord {
  id: string // e.g. "clip_1707884155"
  source_url: string
  source_title: string
  capture_time: string // ISO 8601
  content: string // actual selected text
  context_before: string // ~20 chars before selection
  context_after: string // ~20 chars after selection
  user_note?: string
  source_detail_url?: string
}
