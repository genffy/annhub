/**
 * The folder form's writing stage (download.md §4.1, §8): media first as
 * their own browser downloads — the browser's real file names are what the
 * Markdown links — then the Markdown and README, then the sweep of the
 * replaced folder. Lives beside the service, which hands it the run-wide
 * operations (one write, one notice, one finish) it must share with the ZIP
 * path.
 */
import type { DownloadItemOutcome, DownloadMissingItem, DownloadNoticeMessage } from '../../../types/messages'
import { mediaSlotName } from '../../../core/download'
import { normalizePath } from './ownership'
import type { DownloadRunPlan } from './library-plan'
import type { DownloadRunMetric } from './recovery'

export type WrittenFile = { id: number; name: string; path: string } | null

export interface ActiveRun {
  requestId: string
  origin: { kind: 'tab'; tabId: number } | { kind: 'page'; clientRunId?: string }
  /** The source this run's product belongs to (download.md §4.1): the cleaned page address, the entry id, or a fresh batch. */
  identity: string
  metric: DownloadRunMetric
  /** The plan this run writes: base path, media slots and the composer. */
  plan: DownloadRunPlan
  /** True when the run replaces a path this very identity wrote before (D-94): its old files are swept after the Markdown lands. */
  replacing: boolean
  /** The offscreen document's per-item report, kept for the outcome counts at completion. */
  outcomes: DownloadItemOutcome[]
  missing: DownloadMissingItem[]
  /** The browser downloads this run started, for cancel's file removal. */
  downloadIds: number[]
  cancelled: boolean
  abort: AbortController
  writes: Set<Promise<WrittenFile>>
  /** True once a replacement's first `overwrite` has landed: past this commit point a cancel changes nothing (download.md §2.5). */
  committed?: boolean
  ending?: boolean
  watchdog?: ReturnType<typeof setTimeout>
}

/** The run-wide operations the writing stage shares with the service that owns the run. */
export interface FolderRunDeps {
  currentRun(): ActiveRun | null
  itemByRef(run: ActiveRun, ref: string): { dir: string; kind: 'image' | 'video' | 'audio'; slot: number } | undefined
  writeDownload(run: ActiveRun, url: string, filename: string, conflict: 'uniquify' | 'overwrite'): Promise<WrittenFile>
  notify(run: ActiveRun, notice: DownloadNoticeMessage): Promise<void>
  finishRun(
    run: ActiveRun,
    result: 'ok' | 'partial' | 'failed' | 'cancelled',
    extra: { downloadId?: number; errorCode?: string },
    saved: number,
    missing: number,
    missingItems?: DownloadMissingItem[],
  ): Promise<void>
}

/**
 * Media always write `uniquify`: a name on disk is never overwritten, a replaced product's new media land beside
 * the old ones as ` (1)`. A replacement whose media did not all land writes no Markdown or README and fails with
 * the old version whole. A replacement's Markdown and README write last, `overwrite`; the first one to land is
 * the commit point past which a cancel changes nothing (download.md §2.5), and once it has landed, the folder's
 * files this run did not write are removed — never before, so a cancel or failure leaves the previous version
 * whole (download.md §8).
 */
export function createFolderRun(deps: FolderRunDeps) {
  return async function writeFolderRun(run: ActiveRun, fetched: DownloadItemOutcome[], offline: boolean): Promise<void> {
    const byRef = new Map<string, DownloadItemOutcome>()
    let writeFailed = false
    const writtenPaths = new Set<string>()
    for (const outcome of fetched) {
      if (run.cancelled || deps.currentRun() !== run) return
      if (outcome.status === 'saved' && outcome.blobUrl && outcome.mime) {
        const item = deps.itemByRef(run, outcome.ref)
        const name = item ? mediaSlotName(item.kind, item.slot, outcome.mime) : 'file.bin'
        // an empty dir (the page form's root) must not become a double slash in the path
        const dir = item?.dir ? `${item.dir}/` : ''
        const landed = await deps.writeDownload(run, outcome.blobUrl, `${run.plan.basePath}/${dir}assets/${name}`, 'uniquify')
        if (run.cancelled || deps.currentRun() !== run) return
        if (!landed) writeFailed = true
        else writtenPaths.add(normalizePath(landed.path))
        byRef.set(
          outcome.ref,
          landed
            ? ({ ref: outcome.ref, status: 'saved', fileName: landed.name } as DownloadItemOutcome & { fileName?: string })
            : { ref: outcome.ref, status: 'missing', reason: 'write-failed' },
        )
      } else {
        byRef.set(outcome.ref, outcome)
      }
      if (run.cancelled || deps.currentRun() !== run) return
      await deps.notify(run, { type: 'DOWNLOAD_NOTICE', phase: 'progress', processed: run.plan.totalMedia, total: run.plan.totalMedia, missingCount: 0, stage: 'write' })
      if (deps.currentRun() !== run) return // cancelled while writing
    }
    const finalOutcomes = [...byRef.values()] as Parameters<typeof run.plan.compose>[0]
    // a replacement whose media did not all land writes no Markdown or README: the old version must not be
    // overwritten by a Markdown that marks its own media missing. The written new media stay (download.md §8),
    // a retry that succeeds sweeps them with the rest. A first download keeps today's behavior.
    if (run.replacing && writeFailed) {
      await deps.finishRun(
        run,
        'failed',
        { errorCode: 'DOWNLOAD_FAILED' },
        finalOutcomes.filter(item => item.status === 'saved').length,
        finalOutcomes.filter(item => item.status !== 'saved').length,
      )
      return
    }
    const { files, missing: missingItems } = run.plan.compose(finalOutcomes, offline)
    let first: number | null = null
    for (const file of files) {
      const landed = await deps.writeDownload(run, dataUrlOf(file.text), `${run.plan.basePath}/${file.path}`, run.replacing ? 'overwrite' : 'uniquify')
      if (!landed) writeFailed = true
      else {
        // the first overwrite to land is the replacement's commit point: from here a cancel changes nothing (download.md §2.5)
        if (run.replacing) run.committed = true
        writtenPaths.add(normalizePath(landed.path))
      }
      if (landed && first === null) first = landed.id
      if (deps.currentRun() !== run || run.cancelled) return
    }
    // the Markdown has landed: the folder's stale files go — the previous version's media, and anything a failed
    // attempt of this same product left behind. A run with a failed write keeps everything for download.md §8.
    if (run.replacing && !writeFailed) await sweepReplacedFolder(run, writtenPaths)
    const missing = missingItems.length
    await deps.finishRun(
      run,
      first === null || writeFailed ? 'failed' : missing > 0 ? 'partial' : 'ok',
      first === null || writeFailed ? { errorCode: 'DOWNLOAD_FAILED' } : { downloadId: first },
      finalOutcomes.filter(item => item.status === 'saved').length,
      missing,
      first === null ? [] : missingItems,
    )
  }
}

/** Deletes the replaced folder's files this run did not write — an old item may share a path with a new file, so the written paths are excluded (download.md §4.1). */
async function sweepReplacedFolder(run: ActiveRun, writtenPaths: Set<string>): Promise<void> {
  try {
    const folder = normalizePath(run.plan.basePath.replace(/^AnnHub\//, ''))
    // limit: 0 — the browser caps an unbounded search at 1000 items, a longer history would leave old files behind
    const items = await chrome.downloads.search({ limit: 0 })
    for (const item of items) {
      const lower = normalizePath((item.filename ?? '').replace(/\\/g, '/'))
      const at = lower.lastIndexOf('/annhub/')
      if (at === -1) continue
      if (!lower.slice(at + '/annhub/'.length).startsWith(`${folder}/`)) continue
      if (writtenPaths.has(lower)) continue
      await chrome.downloads.removeFile(item.id).catch(() => undefined)
    }
  } catch {
    /* a closed history only leaves stale files until the next replacement */
  }
}

/** A Markdown file's text as a data URL: the worker cannot make blob URLs, and a text file fits the data form. */
function dataUrlOf(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:text/markdown;base64,${btoa(binary)}`
}
