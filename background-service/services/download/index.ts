/**
 * Download service — docs/product/download.md. One download at a time,
 * across tabs and pages alike: the worker holds the single-flight state,
 * composes the Markdown once the media outcomes are known, drives the
 * offscreen document that fetches and writes, forwards progress to the
 * origin surface (the page's notice bar, the library's dialog), and records
 * the one metric. Nothing a download touches becomes an entry.
 */
import type { IService, MessageHandlers } from '../../service-manager'
import type {
  DownloadFinishMessage,
  DownloadForm,
  DownloadMissingItem,
  DownloadNoticeMessage,
  DownloadRunEventMessage,
  DownloadVia,
  PageDownloadMedia,
  ResponseMessage,
  StartLibraryDownloadMessage,
  StartPageDownloadMessage,
} from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isTopFrameTabSender } from '../../sender'
import MessageUtils from '../../../utils/message'
import { Logger } from '../../../utils/logger'
import { readSettings } from '../../settings-storage'
import { bucketCount } from '../../../core/metrics'
import { cleanSourceUrl } from '../../../core/url'
import { DOWNLOAD_LIMITS, mediaSlotName } from '../../../core/download'
import { recordEvent } from '../metrics/record'
import { planLibraryDownload, planPageDownload, type DownloadRunPlan } from './library-plan'
import { initializedEntryStore } from '../../store-instance'
import { currentUiLanguage } from '../../../utils/ui-language'
import { forgetDownload, interruptedDownload, rememberDownload, type DownloadOrigin } from './recovery'
import { occupiedNames, rememberProduct, resolveName } from './ownership'
import { createFolderRun, type ActiveRun, type WrittenFile } from './folder-write'
import { ensureOffscreenDocument } from '../../offscreen-document'

/** A run whose offscreen document died silently must not block the next download forever (download.md §8). */
const RUN_WATCHDOG_MS = 2_000

const PAGE_VIAS = new Set<DownloadVia>(['capsule', 'block_mode', 'popup', 'command'])
const LIBRARY_VIAS = new Set<DownloadVia>(['drawer', 'reading', 'selection'])

type RunOrigin = DownloadOrigin

export class DownloadService implements IService {
  readonly name = 'download' as const
  private static instance: DownloadService | null = null
  private initDone = false
  private run: ActiveRun | null = null
  private requestId = 0
  /** A start between its first await and the run it opens: a second start in that gap is one too many. */
  private startInFlight = false
  private extracting = false

  /** The folder form's writing stage (folder-write.ts), wired to this service's run-wide operations. */
  private readonly folderRun = createFolderRun({
    currentRun: () => this.run,
    itemByRef: (run, ref) => this.itemByRef(run, ref),
    writeDownload: (run, url, filename, conflict) => this.writeDownload(run, url, filename, conflict),
    notify: (run, notice) => this.notify(run, notice),
    finishRun: (run, result, extra, saved, missing, missingItems) => this.finishRun(run, result, extra, saved, missing, missingItems),
  })

  static getInstance(): DownloadService {
    DownloadService.instance ??= new DownloadService()
    return DownloadService.instance
  }

  async initialize(): Promise<void> {
    if (this.initDone) return
    const interrupted = await interruptedDownload()
    if (interrupted) {
      await this.tellOffscreen({ type: 'DOWNLOAD_CANCEL', requestId: interrupted.requestId })
      await this.notify(interrupted, { type: 'DOWNLOAD_NOTICE', phase: 'failed', errorCode: 'DOWNLOAD_FAILED', processed: 0, total: 0, missingCount: 0 })
      await recordEvent('download.completed', {
        source: interrupted.metric.source,
        via: interrupted.metric.via,
        scope: interrupted.metric.scope,
        form: interrupted.metric.form,
        ...(interrupted.metric.blockKind ? { block_kind: interrupted.metric.blockKind } : {}),
        result: 'failed',
        media: '0',
        missing: '0',
      })
      await forgetDownload(interrupted.requestId)
    }
    this.initDone = true
    Logger.info('[DownloadService] Initialized')
  }

  getMessageHandlers(): MessageHandlers {
    return {
      EXTRACT_DOWNLOAD_PAGE: async (message, sender) => {
        if (!isTopFrameTabSender(sender)) return forbiddenResponse()
        if (!this.canStart()) return busy()
        if (typeof message.html !== 'string' || typeof message.url !== 'string' || !/^https?:/i.test(message.url))
          return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_EMPTY')
        this.extracting = true
        try {
          await this.ensureOffscreenDocument()
          const response = await chrome.runtime.sendMessage({ type: 'DOWNLOAD_EXTRACT', html: message.html, url: message.url, hasArticle: message.hasArticle === true })
          return response?.success && typeof response.data?.html === 'string'
            ? MessageUtils.createResponse(true, { html: response.data.html })
            : MessageUtils.createResponse(false, undefined, 'DOWNLOAD_FAILED')
        } catch {
          return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_FAILED')
        } finally {
          this.extracting = false
        }
      },

      START_PAGE_DOWNLOAD: async (message, sender) => {
        // the page's own content script, from the top frame: the page chose what to download (download.md §2)
        if (!isTopFrameTabSender(sender) || sender.tab?.id === undefined) return forbiddenResponse()
        return this.startPage(message, sender.tab.id)
      },

      START_LIBRARY_DOWNLOAD: async (message, sender) => {
        // only the library's own pages start a library download (download.md §3)
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        return this.startLibrary(message)
      },

      ESTIMATE_DOWNLOAD: async (message, sender) => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const entryIds = Array.isArray(message.entryIds) ? message.entryIds.filter(id => typeof id === 'string') : []
        if (entryIds.length === 0 || entryIds.length > DOWNLOAD_LIMITS.libraryMaxEntries) return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_TOO_MANY')
        const store = await initializedEntryStore()
        const [entries, settings] = await Promise.all([Promise.all(entryIds.map(id => store.getEntry(id))), readSettings()])
        const present = entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        const clips = present.filter(entry => entry.type === 'clip').length
        const screenshots = present.length - clips
        // the same planner the run uses: the estimate's folder count and media slots match what lands (download.md §3.3, §4.2)
        const plan = await planLibraryDownload({
          entryIds: present.map(entry => entry.id),
          form: settings.downloadForm,
          withMedia: true,
          lang: currentUiLanguage(),
          at: Date.now(),
        })
        return MessageUtils.createResponse(true, {
          entryCount: present.length,
          clips,
          screenshots,
          media: plan.totalMedia,
          files: present.length + plan.totalMedia + (entryIds.length > 1 ? 1 : 0),
          basePath: plan.basePath,
        })
      },

      CANCEL_DOWNLOAD: async (_message, sender) => {
        if (!isExtensionPageSender(sender) && !isTopFrameTabSender(sender)) return forbiddenResponse()
        await this.cancel()
        return MessageUtils.createResponse(true)
      },

      SHOW_DOWNLOAD_FILE: async (message, sender) => {
        if (!isExtensionPageSender(sender) && !isTopFrameTabSender(sender)) return forbiddenResponse()
        const shown = await Promise.resolve(chrome.downloads.show(Number(message.downloadId))).then(
          () => true,
          () => false,
        )
        return MessageUtils.createResponse(shown)
      },

      DOWNLOAD_RUN_EVENT: async (message, sender) => {
        // the offscreen document is an extension page without a tab; a tab sender is not the runner
        if (!isExtensionPageSender(sender) || sender.tab) return forbiddenResponse()
        await this.onRunEvent(message)
        return MessageUtils.createResponse(true)
      },
    }
  }

  isInitialized(): boolean {
    return this.initDone
  }

  // ── Starts ─────────────────────────────────────────────────────────────

  private async startPage(message: StartPageDownloadMessage, tabId: number): Promise<ResponseMessage<{ accepted: boolean; total: number } | undefined>> {
    if (!this.canStart()) return busy()
    const title = typeof message.meta?.title === 'string' && message.meta.title.trim() ? message.meta.title : ''
    const markdown = typeof message.markdown === 'string' ? message.markdown.trim() : ''
    const sourceUrl = typeof message.meta?.sourceUrl === 'string' ? message.meta.sourceUrl : ''
    if (!title || !markdown || !/^https?:/i.test(sourceUrl)) return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_EMPTY')
    if (!PAGE_VIAS.has(message.via)) return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_EMPTY')
    const media = Array.isArray(message.media)
      ? message.media
          .filter((item): item is PageDownloadMedia => typeof item?.url === 'string' && /^https?:/i.test(item.url) && ['image', 'video', 'audio'].includes(item?.kind))
          .map(item => ({
            url: item.url,
            kind: item.kind,
            ...(item.kind === 'image' && Array.isArray(item.candidates)
              ? { candidates: [...new Set(item.candidates.filter((url): url is string => typeof url === 'string' && /^https?:/i.test(url)))] }
              : {}),
          }))
      : []

    this.startInFlight = true
    try {
      const settings = await readSettings()
      const form: DownloadForm = message.form === 'zip' || message.form === 'folder' ? message.form : settings.downloadForm
      // the identity is the cleaned source address — the anchor counts in it, token params never survive (download.md §4.1, D-94)
      const identityUrl = cleanSourceUrl(sourceUrl)
      const identity = `page:${identityUrl}`
      const plan = planPageDownload({
        title,
        sourceUrl: identityUrl,
        markdown,
        media,
        form,
        withMedia: settings.downloadMedia && media.length > 0,
        lang: message.lang === 'zh' || message.lang === 'en' ? message.lang : currentUiLanguage(),
        at: Date.now(),
        meta: {
          ...(Array.isArray(message.meta.author) ? { author: message.meta.author } : {}),
          ...(message.meta.published ? { published: message.meta.published } : {}),
          ...(message.meta.description ? { description: message.meta.description } : {}),
          ...(typeof message.meta.site === 'string' ? { site: message.meta.site } : {}),
          ...(typeof message.meta.language === 'string' ? { language: message.meta.language } : {}),
          ...(typeof message.meta.image === 'string' && /^https?:/i.test(message.meta.image) ? { image: message.meta.image } : {}),
        },
      })
      // the identity is the cleaned source address — the anchor counts in it, token params never survive (download.md §4.1, D-94)
      const resolved = await this.resolvePlanBase(plan, form, identity)
      return await this.launch({
        origin: { kind: 'tab', tabId },
        metric: {
          source: 'page',
          via: message.via,
          scope: message.via === 'capsule' || message.via === 'block_mode' ? 'block' : 'page',
          form,
          ...(message.blockKind ? { blockKind: message.blockKind } : {}),
        },
        plan,
        identity,
        replacing: resolved.replacing,
      })
    } finally {
      this.startInFlight = false
    }
  }

  private async startLibrary(message: StartLibraryDownloadMessage): Promise<ResponseMessage<{ accepted: boolean; total: number } | undefined>> {
    if (!this.canStart()) return busy()
    const entryIds = Array.isArray(message.entryIds) ? message.entryIds.filter((id): id is string => typeof id === 'string') : []
    if (entryIds.length === 0) return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_EMPTY')
    if (entryIds.length > DOWNLOAD_LIMITS.libraryMaxEntries) return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_TOO_MANY')
    if (!LIBRARY_VIAS.has(message.via)) return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_EMPTY')

    this.startInFlight = true
    try {
      const settings = await readSettings()
      const form: DownloadForm = message.form === 'zip' || message.form === 'folder' ? message.form : settings.downloadForm
      const plan = await planLibraryDownload({
        entryIds,
        form,
        // the dialog may override the setting for this run; an absent field means the setting (download.md §3.3)
        withMedia: message.withMedia ?? settings.downloadMedia,
        lang: message.lang === 'zh' || message.lang === 'en' ? message.lang : currentUiLanguage(),
        at: Date.now(),
      })
      // one entry's product belongs to the entry itself; a multi selection is a fresh batch every time (download.md §4.1, D-94)
      const identity = entryIds.length > 1 ? `batch:${Date.now().toString(36)}:${++this.requestId}` : `entry:${entryIds[0]}`
      const resolved = await this.resolvePlanBase(plan, form, identity)
      return await this.launch({
        origin: { kind: 'page', ...(typeof message.clientRunId === 'string' && message.clientRunId.length <= 80 ? { clientRunId: message.clientRunId } : {}) },
        metric: { source: 'library', via: message.via, scope: entryIds.length > 1 ? 'multi' : 'entry', form },
        plan,
        identity,
        replacing: resolved.replacing,
      })
    } finally {
      this.startInFlight = false
    }
  }

  /** Picks the product name the plan writes into: this identity's recorded path is replaced, everything else on disk is taken (download.md §4.1, D-94). */
  private async resolvePlanBase(plan: DownloadRunPlan, form: DownloadForm, identity: string): Promise<ReturnType<typeof resolveName>> {
    const desired = plan.basePath.replace(/^AnnHub\//, '')
    const resolved = await resolveName(desired, identity, form === 'zip' ? 'zip' : 'folder', await occupiedNames(form === 'zip' ? 'zip' : 'folder'))
    plan.basePath = `AnnHub/${resolved.name}`
    plan.productName = resolved.name
    return resolved
  }

  private canStart(): boolean {
    return this.run === null && !this.startInFlight && !this.extracting
  }

  private async launch(input: {
    origin: RunOrigin
    metric: ActiveRun['metric']
    plan: DownloadRunPlan
    identity: string
    replacing: boolean
  }): Promise<ResponseMessage<{ accepted: boolean; total: number } | undefined>> {
    const requestId = `dl_${Date.now().toString(36)}_${++this.requestId}`
    const run: ActiveRun = { requestId, ...input, outcomes: [], missing: [], downloadIds: [], cancelled: false, abort: new AbortController(), writes: new Set() }
    this.run = run
    try {
      await rememberDownload(run)
      await this.ensureOffscreenDocument()
    } catch (error) {
      Logger.warn('[DownloadService] Offscreen document unavailable:', error)
      return this.failStart(run, 'DOWNLOAD_FAILED')
    }
    if (run.cancelled || this.run !== run) return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_FAILED')
    const accepted = await this.tellOffscreen({
      type: 'DOWNLOAD_RUN',
      requestId,
      form: run.plan.form,
      basePath: run.plan.basePath,
      withMedia: run.plan.withMedia,
      media: run.plan.media,
    })
    if (!accepted.ok) return this.failStart(run, 'DOWNLOAD_FAILED')
    if (this.run === run && !run.cancelled)
      run.watchdog = setInterval(() => {
        if (typeof chrome.runtime.getContexts !== 'function') return
        void chrome.runtime
          .getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
          .then(contexts => {
            if (contexts.length === 0 && this.run === run) return this.finishRun(run, 'failed', { errorCode: 'DOWNLOAD_FAILED' }, 0, 0)
          })
          .catch(() => undefined)
      }, RUN_WATCHDOG_MS)
    return MessageUtils.createResponse(true, { accepted: true, total: run.plan.totalMedia })
  }

  private async failStart(run: ActiveRun, code: string): Promise<ResponseMessage<undefined>> {
    await forgetDownload(run.requestId)
    this.clearRun(run)
    return MessageUtils.createResponse(false, undefined, code)
  }

  // ── The running download ────────────────────────────────────────────────

  private async onRunEvent(message: DownloadRunEventMessage): Promise<void> {
    const run = this.run
    if (!run || run.cancelled || run.requestId !== message.requestId) return // a finished or cancelled run's late report
    switch (message.event) {
      case 'heartbeat':
        return
      case 'progress': {
        // the fetch stage reports unique addresses; the bar counts every planned medium, stored assets included,
        // so n/N never goes back down when the writing stage starts (download.md §3.3)
        const total = Math.max(run.plan.totalMedia, message.total ?? 0)
        await this.notify(run, {
          type: 'DOWNLOAD_NOTICE',
          phase: 'progress',
          processed: Math.min(message.processed ?? 0, total),
          total,
          missingCount: 0,
          stage: 'fetch',
        })
        return
      }
      case 'media': {
        const fetched = message.outcomes ?? []
        run.outcomes = fetched
        if (run.plan.form === 'zip') {
          // the ZIP's names are the planned slot names; the offscreen document packs, the `zip` event answers
          const planned = fetched.map(outcome =>
            outcome.status === 'saved' && outcome.mime
              ? { ...outcome, fileName: mediaSlotName(this.kindOfItem(run, outcome.ref), this.slotOfItem(run, outcome.ref), outcome.mime) }
              : outcome,
          )
          const { files, missing } = run.plan.compose(planned, message.offline === true)
          run.missing = missing
          await this.notify(run, { type: 'DOWNLOAD_NOTICE', phase: 'progress', processed: run.plan.totalMedia, total: run.plan.totalMedia, missingCount: 0, stage: 'write' })
          if (run.cancelled || this.run !== run) return
          const sent = await this.tellOffscreen({ type: 'DOWNLOAD_FINISH', requestId: run.requestId, files } satisfies DownloadFinishMessage)
          if (!sent.ok) await this.finishRun(run, 'failed', { errorCode: 'DOWNLOAD_FAILED' }, 0, 0)
          return
        }
        await this.folderRun(run, fetched, message.offline === true)
        return
      }
      case 'zip': {
        // the packed archive as a blob URL the offscreen document keeps alive until the cleanup;
        // a replacement swaps the archive when the new one has finished writing (download.md §4.4)
        const landed = message.blobUrl ? await this.writeDownload(run, message.blobUrl, `${run.plan.basePath}.zip`, run.replacing ? 'overwrite' : 'uniquify') : null
        const missing = run.missing.length
        const saved = run.outcomes.filter(item => item.status === 'saved').length
        await this.finishRun(
          run,
          landed ? (missing > 0 ? 'partial' : 'ok') : 'failed',
          landed ? { downloadId: landed.id } : { errorCode: 'DOWNLOAD_FAILED' },
          saved,
          missing,
          landed ? run.missing : [],
        )
        return
      }
      case 'failed': {
        await this.finishRun(run, 'failed', { errorCode: message.errorCode ?? 'DOWNLOAD_FAILED' }, 0, 0)
        return
      }
      default:
        return
    }
  }

  private kindOfItem(run: ActiveRun, ref: string): 'image' | 'video' | 'audio' {
    return this.itemByRef(run, ref)?.kind ?? 'image'
  }

  private slotOfItem(run: ActiveRun, ref: string): number {
    return this.itemByRef(run, ref)?.slot ?? 1
  }

  private itemByRef(run: ActiveRun, ref: string) {
    return run.plan.media.find(item => `${item.dir}|${item.url ?? `asset:${item.assetId ?? ''}`}` === ref)
  }

  /** One browser download of this run: no saveAs prompt (download.md §4.1), waited to its final state, answered with the id and the file's real path. */
  private writeDownload(run: ActiveRun, url: string, filename: string, conflict: 'uniquify' | 'overwrite'): Promise<WrittenFile> {
    const pending = this.performWrite(run, url, filename, conflict)
    run.writes.add(pending)
    void pending.finally(() => run.writes.delete(pending))
    return pending
  }

  private async performWrite(run: ActiveRun, url: string, filename: string, conflict: 'uniquify' | 'overwrite'): Promise<WrittenFile> {
    if (run.cancelled || this.run !== run) return null
    try {
      const id = await new Promise<number>((resolve, reject) => {
        chrome.downloads.download({ url, filename, saveAs: false, conflictAction: conflict }, downloadId => {
          const error = chrome.runtime.lastError
          if (error || downloadId === undefined) reject(new Error(error?.message ?? 'download refused'))
          else resolve(downloadId)
        })
      })
      run.downloadIds.push(id)
      if (run.cancelled || this.run !== run) {
        await this.removeDownload(id)
        return null
      }
      const state = await this.settleDownload(id, run.abort.signal)
      if (state !== 'complete') {
        await chrome.downloads.cancel(id).catch(() => undefined)
        await chrome.downloads.removeFile(id).catch(() => undefined)
        return null
      }
      const items = await chrome.downloads.search({ id }).catch(() => [])
      const path = items[0]?.filename?.replace(/\\/g, '/')
      const name = path?.split('/').pop()
      return path && name ? { id, name, path } : null
    } catch (error) {
      Logger.info('[DownloadService] One file of the download was refused:', error)
      return null
    }
  }

  /** Waits for one download to leave the in-progress state. */
  private settleDownload(id: number, signal: AbortSignal): Promise<string | null> {
    return new Promise(resolve => {
      const finish = (state: string | null): void => {
        chrome.downloads.onChanged.removeListener(listener)
        signal.removeEventListener('abort', abort)
        resolve(state)
      }
      const abort = (): void => finish(null)
      const listener = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id !== id || !delta.state) return
        finish(delta.state.current ?? null)
      }
      if (signal.aborted) {
        resolve(null)
        return
      }
      signal.addEventListener('abort', abort, { once: true })
      chrome.downloads.onChanged.addListener(listener)
      void chrome.downloads
        .search({ id })
        .then(items => {
          const state = items[0]?.state
          if (state && state !== 'in_progress') {
            finish(state)
          }
        })
        .catch(() => finish(null))
    })
  }

  private async cancel(): Promise<void> {
    const run = this.run
    // past the replacement's commit point a cancel changes nothing: the run writes on to its own end (download.md §2.5)
    if (!run || run.ending || run.committed) return
    run.cancelled = true
    run.abort.abort()
    // stop the fetches and the in-flight files, remove what already landed (download.md §2.5); the folder the browser made stays
    await Promise.all([this.tellOffscreen({ type: 'DOWNLOAD_CANCEL', requestId: run.requestId }), ...run.downloadIds.map(id => this.removeDownload(id)), ...run.writes])
    if (this.run !== run) return // it finished while the cleanup was running
    await this.finishRun(run, 'cancelled', {}, 0, 0)
  }

  private async removeDownload(id: number): Promise<void> {
    await chrome.downloads.cancel(id).catch(() => undefined)
    await chrome.downloads.removeFile(id).catch(() => undefined)
  }

  /** Ends the run: the last notice to its origin, the one metric, the slot freed. */
  private async finishRun(
    run: ActiveRun,
    result: 'ok' | 'partial' | 'failed' | 'cancelled',
    extra: { downloadId?: number; errorCode?: string },
    saved: number,
    missing: number,
    missingItems: DownloadMissingItem[] = [],
  ): Promise<void> {
    if (this.run !== run || run.ending || (run.cancelled && result !== 'cancelled')) return
    run.ending = true
    run.abort.abort()
    await this.tellOffscreen({ type: 'DOWNLOAD_CANCEL', requestId: run.requestId }) // a completed run answers instantly; a failed one still has files to remove
    await forgetDownload(run.requestId)
    // the ownership record lands only once the run's files are all on the disk (download.md §4.1, D-94)
    if (result === 'ok' || result === 'partial') {
      const productPath = run.metric.form === 'zip' ? `${run.plan.basePath}.zip` : run.plan.basePath
      await rememberProduct(productPath, run.identity, Date.now()).catch(() => undefined)
    }
    this.clearRun(run)
    await this.notify(run, {
      type: 'DOWNLOAD_NOTICE',
      phase: result === 'ok' ? 'done' : result,
      processed: saved + missing,
      total: saved + missing,
      missingCount: missing,
      ...(extra.downloadId !== undefined ? { downloadId: extra.downloadId } : {}),
      ...(extra.errorCode ? { errorCode: extra.errorCode } : {}),
      ...(missingItems.length > 0 ? { missing: missingItems } : {}),
    })
    await recordEvent('download.completed', {
      source: run.metric.source,
      via: run.metric.via,
      scope: run.metric.scope,
      form: run.metric.form,
      ...(run.metric.blockKind ? { block_kind: run.metric.blockKind } : {}),
      result,
      media: bucketCount(saved),
      missing: bucketCount(missing),
    })
  }

  private clearRun(run: ActiveRun): void {
    if (this.run !== run) return
    clearInterval(run.watchdog)
    this.run = null
  }

  private async notify(run: { origin: RunOrigin }, notice: DownloadNoticeMessage): Promise<void> {
    try {
      if (run.origin.kind === 'tab') await chrome.tabs.sendMessage(run.origin.tabId, notice)
      else await chrome.runtime.sendMessage({ ...notice, ...(run.origin.clientRunId ? { clientRunId: run.origin.clientRunId } : {}) })
    } catch {
      // the tab or page may be gone; the download itself keeps going
    }
  }

  // ── The offscreen document ──────────────────────────────────────────────

  private async ensureOffscreenDocument(): Promise<void> {
    // the one document both flows share (RV-BG-11)
    await ensureOffscreenDocument()
  }

  private async tellOffscreen(message: object): Promise<{ ok: boolean }> {
    try {
      const answer = await chrome.runtime.sendMessage(message)
      return { ok: answer?.success !== false }
    } catch {
      return { ok: false }
    }
  }
}

function busy(): ResponseMessage<undefined> {
  return MessageUtils.createResponse(false, undefined, 'DOWNLOAD_ACTIVE')
}
