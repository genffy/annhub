/**
 * The download runner inside the offscreen document (download.md §4, §5).
 * The service worker has no page environment, so the fetching and packing
 * happen here; the offscreen document's extension API set stops at
 * messaging, so the WRITING happens in the worker: this document hands over
 * each fetched body as a blob URL it keeps alive until the run's cleanup
 * (the recording's pattern), and for the ZIP form packs the whole tree into
 * one archive. Cancel aborts the fetches and lets the bodies go.
 */
import type { DownloadCancelMessage, DownloadFinishMessage, DownloadItemOutcome, DownloadPlanItem, DownloadRunEventMessage, DownloadRunMessage } from '../../types/messages'
import { buildZip } from '../../core/zip'
import { DOWNLOAD_LIMITS, mediaSlotName } from '../../core/download'
import { EntryStore } from '../../core/store'
import { fetchMedia, MediaRefused } from './fetch-media'

type Reason = NonNullable<DownloadItemOutcome['reason']>

interface Run {
  requestId: string
  form: 'folder' | 'zip'
  basePath: string
  items: DownloadPlanItem[]
  signal: AbortController
  /** Fetched bodies and their failures, by address. */
  blobs: Map<string, Blob>
  requests: Map<string, Promise<Blob>>
  failures: Map<string, Reason>
  assets: Map<string, Blob>
  offline: boolean
  bytes: number
  /** The blob URLs handed to the worker, revoked at cleanup. */
  urls: string[]
  heartbeat?: ReturnType<typeof setInterval>
}

let run: Run | null = null

function report(requestId: string, event: DownloadRunEventMessage['event'], extra: Partial<DownloadRunEventMessage> = {}): void {
  void chrome.runtime.sendMessage({ type: 'DOWNLOAD_RUN_EVENT', requestId, event, ...extra }).catch(() => {
    /* the worker is gone: like a recording, the download dies with it (download.md §8) */
  })
}

/** Takes a run when none is live; the answer is the only word the worker gets on acceptance. */
export function acceptDownloadRun(message: DownloadRunMessage): boolean {
  if (run) return false
  run = {
    requestId: message.requestId,
    form: message.form,
    basePath: message.basePath,
    items: Array.isArray(message.media) ? message.media.filter(item => item && (item.url || item.assetId)) : [],
    signal: new AbortController(),
    blobs: new Map(),
    requests: new Map(),
    failures: new Map(),
    assets: new Map(),
    offline: false,
    bytes: 0,
    urls: [],
  }
  const current = run
  current.heartbeat = setInterval(() => report(current.requestId, 'heartbeat'), 10_000)
  void phaseOne(run)
  // the origin's notice bar shows 正在下载 0/N the moment the run starts: the
  // fetch is the cancellable part (download.md §2.5)
  report(run.requestId, 'progress', { processed: 0, total: run.items.filter(item => item.url).length })
  return true
}

/** The composed Markdown for the ZIP form; the packed archive answers as the `zip` event. */
export function deliverFinish(message: DownloadFinishMessage): boolean {
  if (!run || run.requestId !== message.requestId || !Array.isArray(message.files)) return false
  void packZip(run, message.files)
  return true
}

/** Stops a run and lets its bodies go; the worker cancels and removes its own files (download.md §2.5). */
export function cleanupDownloadRun(message: DownloadCancelMessage): Promise<void> {
  const current = run
  if (!current || current.requestId !== message.requestId) return Promise.resolve()
  cleanup(current)
  return Promise.resolve()
}

// ── Phase one: the media ─────────────────────────────────────────────────

async function phaseOne(current: Run): Promise<void> {
  try {
    await Promise.all([fetchDeclared(current), readStoredAssets(current)])
    if (run !== current) return
    report(current.requestId, 'media', { outcomes: outcomesOf(current), ...(current.offline ? { offline: true } : {}) })
  } catch {
    if (run !== current) return
    cleanup(current)
    report(current.requestId, 'failed', { errorCode: 'DOWNLOAD_FAILED' })
  }
}

/** Every planned item's outcome: the held body as a blob URL, or why it kept its address. */
function outcomesOf(current: Run): DownloadItemOutcome[] {
  return current.items.map(item => {
    const ref = `${item.dir}|${item.url ?? `asset:${item.assetId ?? ''}`}`
    const blob = item.url ? current.blobs.get(item.url) : current.assets.get(item.assetId ?? '')
    const failed = item.url ? current.failures.get(item.url) : current.failures.get(`asset:${item.assetId}`)
    if (!blob || failed) return { ref, status: 'missing' as const, reason: failed ?? 'write-failed' }
    const url = URL.createObjectURL(blob)
    current.urls.push(url)
    return { ref, status: 'saved' as const, blobUrl: url, mime: blob.type }
  })
}

/** Fetches every unique address, four at a time, under the run's total-size cap. */
async function fetchDeclared(current: Run): Promise<void> {
  const urls = [...new Set(current.items.filter(item => item.url).map(item => item.url!))]
  const queue = [...urls]
  const total = urls.length
  let settled = 0
  const workers = Array.from({ length: Math.min(DOWNLOAD_LIMITS.concurrency, queue.length) }, () =>
    (async () => {
      for (;;) {
        const url = queue.shift()
        if (url === undefined || run !== current) return
        if (current.bytes >= DOWNLOAD_LIMITS.totalMaxBytes) {
          current.failures.set(url, 'limit')
          settled++
          report(current.requestId, 'progress', { processed: settled, total })
          continue
        }
        try {
          const blob = await fetchCandidates(current, url)
          if (run !== current) return
          if (current.bytes + blob.size > DOWNLOAD_LIMITS.totalMaxBytes) current.failures.set(url, 'limit')
          else {
            current.blobs.set(url, blob)
            current.bytes += blob.size
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
          if (typeof navigator !== 'undefined' && navigator.onLine === false) current.offline = true
          current.failures.set(url, error instanceof MediaRefused ? error.code : 'unreachable')
        }
        settled++
        report(current.requestId, 'progress', { processed: settled, total })
      }
    })(),
  )
  await Promise.all(workers)
}

function kindOf(current: Run, url: string): 'image' | 'video' | 'audio' {
  return current.items.find(item => item.url === url)?.kind ?? 'image'
}

/** Each declared address is requested once, including candidates shared by images. */
async function fetchCandidates(current: Run, primary: string): Promise<Blob> {
  const kind = kindOf(current, primary)
  const alternatives = current.items.find(item => item.url === primary)?.candidates ?? []
  let failure: unknown = new MediaRefused('unreachable')
  for (const url of new Set([primary, ...alternatives])) {
    if (current.signal.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    let request = current.requests.get(url)
    if (!request) {
      request = fetchMedia(url, kind, current.signal.signal)
      current.requests.set(url, request)
    }
    try {
      return await request
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      failure = error
    }
  }
  throw failure
}

/** A screenshot's bytes come out of the store, never the network (download.md §3.4). */
async function readStoredAssets(current: Run): Promise<void> {
  const ids = [...new Set(current.items.filter(item => item.assetId).map(item => item.assetId!))]
  if (ids.length === 0) return
  const store = await assetStore()
  for (const id of ids) {
    if (run !== current) return
    const asset = await store.getAsset(id).catch(() => undefined)
    if (run !== current) return
    if (asset && current.bytes + asset.bytes.size > DOWNLOAD_LIMITS.totalMaxBytes) current.failures.set(`asset:${id}`, 'limit')
    else if (asset) {
      current.assets.set(id, asset.bytes)
      current.bytes += asset.bytes.size
    } else current.failures.set(`asset:${id}`, 'unreachable')
  }
}

let storePromise: Promise<EntryStore> | null = null

function assetStore(): Promise<EntryStore> {
  storePromise ??= (async () => {
    const store = new EntryStore()
    await store.initialize()
    return store
  })().catch(error => {
    storePromise = null
    throw error
  })
  return storePromise
}

// ── Phase two (ZIP): the one archive ─────────────────────────────────────

async function packZip(current: Run, files: { path: string; text: string }[]): Promise<void> {
  try {
    const root = current.basePath.split('/').pop() ?? 'AnnHub'
    const entries = [
      ...files.map(file => ({ name: `${root}/${file.path}`, data: new TextEncoder().encode(file.text) })),
      ...current.items.flatMap(item => {
        const blob = item.url ? current.blobs.get(item.url) : current.assets.get(item.assetId ?? '')
        // missing media keep their address in the Markdown; nothing of them is packed
        if (!blob) return []
        const dir = item.dir ? `${item.dir}/` : ''
        return [{ name: `${root}/${dir}assets/${mediaSlotName(item.kind, item.slot, blob.type)}`, data: blob }]
      }),
    ]
    const blob = await buildZip(entries)
    if (run !== current) return
    const url = URL.createObjectURL(blob)
    current.urls.push(url)
    report(current.requestId, 'zip', { blobUrl: url })
  } catch {
    if (run !== current) return
    cleanup(current)
    report(current.requestId, 'failed', { errorCode: 'DOWNLOAD_ZIP_FAILED' })
  }
}

function cleanup(current: Run): void {
  if (run === current) run = null
  current.signal.abort()
  clearInterval(current.heartbeat)
  for (const url of current.urls) URL.revokeObjectURL(url)
  current.urls = []
}
