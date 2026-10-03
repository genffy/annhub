/**
 * Page-side Markdown ZIP export (storage.md §7). Runs inside extension pages
 * (words / settings): the page shares the fragment-store origin, so image
 * bytes are read directly from IndexedDB — chrome.runtime messaging cannot
 * carry Blobs, and highlights/clips come back as plain JSON.
 */
import { FragmentStore } from '../learning-core/fragment-store'
import { buildExportZip, type ExportHighlight, type ExportClip, type ExportManifest } from '../learning-core/markdown-export'
import MessageUtils from '../utils/message'
import type { HighlightRecord } from '../types/highlight'
import type { ClipRecord } from '../types/clip'

let pageStore: FragmentStore | null = null

export async function exportContentZip(): Promise<{ blob: Blob; manifest: ExportManifest }> {
  if (!pageStore) {
    pageStore = new FragmentStore('fragment-store')
    await pageStore.initialize()
  }
  const [fragments, screenshots, writingTasks, relations, highlightResponse, clipStorage] = await Promise.all([
    pageStore.getAllFragments(),
    pageStore.listScreenshots(),
    pageStore.getAllWritingTasks(),
    pageStore.getAllRelations(),
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
  // storage.md §7：导出开始固定快照；资产读取（耗时段）后重读发生变化的
  // 记录，避免把旧版本写进 ZIP。新出现的记录不追加快照范围。
  const fresh = await pageStore.getAllFragments()
  const freshById = new Map(fresh.map(f => [f.id, f]))
  const pinnedFragments = fragments.map(f => freshById.get(f.id) ?? f)

  return buildExportZip({
    exportedAt: Date.now(),
    fragments: pinnedFragments,
    highlights,
    clips,
    writingTasks,
    relations,
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
