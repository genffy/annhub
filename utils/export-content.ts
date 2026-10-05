/**
 * Page-side Markdown ZIP export (storage.md §7). Runs inside extension pages
 * (words / settings): the page shares the fragment-store origin, so image
 * bytes are read directly from IndexedDB — chrome.runtime messaging cannot
 * carry Blobs, and highlights/clips come back as plain JSON.
 */
import { FragmentStore } from '../learning-core/fragment-store'
import { buildExportZip, type ExportHighlight, type ExportClip, type ExportManifest } from '../learning-core/markdown-export'
import MessageUtils from '../utils/message'
import { currentUiLanguage } from './ui-text'
import type { HighlightRecord } from '../types/highlight'
import type { ClipRecord } from '../types/clip'

let pageStore: FragmentStore | null = null

export async function exportContentZip(): Promise<{ blob: Blob; manifest: ExportManifest }> {
  if (!pageStore) {
    pageStore = new FragmentStore('fragment-store')
    await pageStore.initialize()
  }
  const [fragments, screenshots, highlightResponse, clipStorage] = await Promise.all([
    pageStore.getAllFragments(),
    pageStore.listScreenshots(),
    MessageUtils.sendMessage<HighlightRecord[]>({ type: 'GET_HIGHLIGHTS' }),
    new Promise<Record<string, ClipRecord[] | undefined>>(resolve => {
      chrome.storage.local.get('ann-clips', result => resolve(result as Record<string, ClipRecord[] | undefined>))
    }),
  ])
  const highlights: ExportHighlight[] = (highlightResponse.success && Array.isArray(highlightResponse.data) ? highlightResponse.data : [])
    .filter(h => h.status === 'active')
    .map(h => ({
      id: h.id,
      text: h.originalText,
      note: h.user_note,
      sourceUrl: h.metadata.sourceUrl ?? h.url,
      sourceTitle: h.metadata.pageTitle,
      createdAt: h.timestamp,
    }))
  const clips: ExportClip[] = (clipStorage['ann-clips'] ?? []).map(c => ({
    id: c.id,
    text: c.content,
    sourceUrl: c.source_detail_url ?? c.source_url,
    sourceTitle: c.source_title,
    createdAt: Date.parse(c.capture_time) || Date.now(),
  }))
  // storage.md §7: the export pins its snapshot at the start; after the slow asset reads the
  // records that changed are re-read so an old version never lands in the ZIP. Records that
  // appeared meanwhile are not added to the pinned range.
  const fresh = await pageStore.getAllFragments()
  const freshById = new Map(fresh.map(f => [f.id, f]))
  const pinnedFragments = fragments.map(f => freshById.get(f.id) ?? f)

  return buildExportZip({
    exportedAt: Date.now(),
    lang: currentUiLanguage(),
    fragments: pinnedFragments,
    highlights,
    clips,
    screenshots: screenshots.map(({ asset, ...record }) => record),
    getAsset: async id => pageStore!.getAsset(id),
  })
}

/** Triggers the browser download for an exported ZIP. */
export function downloadZip(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AnnHub-export-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
