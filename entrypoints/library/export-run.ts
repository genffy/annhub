/**
 * The one export's execution (extension.md §2.2, storage.md §6), moved out of
 * the App shell: read the library, build the ZIP, hand its Blob URL to
 * chrome.downloads, record the event, and answer the four fields the dialog
 * and the nav note show. The shell owns the state; this owns the doing.
 */
import MessageUtils from '../../utils/message'
import { currentUiLanguage, uiText } from '../../utils/ui-text'
import { buildExport, exportFileName } from '../../core/export'
import { bucketCount } from '../../core/metrics'
import { EntryStore } from '../../core/store'
import type { ExportStage } from './export-error'
import { exportFailureKey } from './export-error'

export type ExportPhase = 'idle' | 'busy' | 'done' | 'partial' | 'failed'

export interface ExportOutcome {
  state: Exclude<ExportPhase, 'idle'>
  summary: string
  missing: string[]
  error: string
}

export async function runExport(): Promise<ExportOutcome> {
  const store = new EntryStore('annhub')
  let stage: ExportStage = 'build'
  try {
    await store.initialize()
    const exportedAt = Date.now()
    const summary = await buildExport({
      exportedAt,
      lang: currentUiLanguage(),
      entries: await store.listEntries(),
      registry: await store.listPropertyDefinitions(),
      readAsset: async assetId => {
        const asset = await store.getAsset(assetId)
        return asset ? { metadata: asset.metadata, bytes: asset.bytes } : undefined
      },
    })
    const url = URL.createObjectURL(summary.blob)
    stage = 'download'
    try {
      await chrome.downloads.download({ url, filename: exportFileName(exportedAt), saveAs: false })
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    void MessageUtils.sendMessage({
      type: 'RECORD_EVENT',
      name: 'export.completed',
      props: { result: summary.result, missing_assets: bucketCount(summary.missingAssets.length) },
    })
    return {
      state: summary.result === 'full' ? 'done' : 'partial',
      summary: uiText('library.exportSummary', { clips: summary.clips, screenshots: summary.screenshots, missing: summary.missingAssets.length }),
      missing: summary.missingAssets,
      error: '',
    }
  } catch (error) {
    return { state: 'failed', summary: '', missing: [], error: uiText(exportFailureKey(error, stage)) }
  } finally {
    await store.close()
  }
}
