/**
 * The page-side download flow (download.md §2): the capsule, block mode's
 * `D`, the popup's button and the unbound command all hand over one block or
 * the page's main article; the notice bar — the clip toast's look — follows
 * the run: 「正在下载 n/N · 取消」 while it works, 「已下载 · 显示文件」
 * when it lands, the partial and failure readings with their own actions.
 * Only real user input starts one; the payload stays for Retry, so a failed
 * download never loses the converted text.
 */
import { overlayIcon } from './icons'
import { elementToMarkdown } from './markdown'
import { extractPageMeta, resolvePermalink } from './page-meta'
import { normalizeHost } from '../../core/normalize'
import { collectMedia, findMainArticle, type CollectedMedia } from './download-collect'
import { downloadSnapshot, extractedDownloadBody } from './download-snapshot'
import { collectFullXArticle, extractXContent } from './platform-x'
import type { BlockCandidate } from './blocks'
import type { DownloadNoticeMessage, DownloadVia, ExtractDownloadPageMessage, PageDownloadMedia, StartPageDownloadMessage } from '../../types/messages'
import MessageUtils from '../../utils/message'
import { currentUiLanguage, uiText } from '../../utils/ui-text'

const ROOT_ATTR = 'data-ann-ui'
const NOTICE_MS = 6000

export type PageDownloadVia = Extract<DownloadVia, 'capsule' | 'block_mode' | 'popup' | 'command'>

/** What one start hands the worker; kept for Retry until the run ends. */
interface Handover {
  form?: StartPageDownloadMessage['form']
  meta: StartPageDownloadMessage['meta']
  markdown: string
  media: CollectedMedia[]
  via: PageDownloadVia
  blockKind?: BlockCandidate['kind']
}

let pending: Handover | null = null
let noticeHost: HTMLElement | null = null
let noticeTimer: number | null = null
/** The phase the bar on screen shows, and the line progress rewrites in place (download.md §2.5). */
let noticePhase: DownloadNoticeMessage['phase'] | null = null
let noticeLabel: HTMLElement | null = null
let busyTimer: number | null = null
let starting = false
/** The read view reassembly runs before a run exists; a second click waits it out. */
let preparing = false
let extracting = false
let retryExtraction: (() => Promise<void>) | null = null
let receivedNoticeVersion = 0

/** The download's own stable answers, worded for people (download.md §2.5, §8). */
function downloadFailureText(code: string | undefined): string | undefined {
  if (code === 'DOWNLOAD_ZIP_FAILED') return uiText('download.zipFailed')
  if (code === 'DOWNLOAD_ACTIVE') return uiText('download.busyReason')
  return code ? uiText('download.failedReason') : undefined
}

/** A local failure notice (before any run exists) in the same shape the worker's reports use. */
function notice(phase: DownloadNoticeMessage['phase'], errorCode?: string, total = 0): DownloadNoticeMessage {
  return { type: 'DOWNLOAD_NOTICE', phase, processed: 0, total, missingCount: 0, ...(errorCode ? { errorCode } : {}) }
}

function dismissNotice(): void {
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
  noticeTimer = null
  if (busyTimer !== null) window.clearTimeout(busyTimer)
  busyTimer = null
  noticeHost?.remove()
  noticeHost = null
  noticePhase = null
  noticeLabel = null
}

function autoLeave(): void {
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(dismissNotice, NOTICE_MS)
}

/** Starts the download of a hovered or keyboard-targeted block (download.md §2.1, §2.2). */
export function downloadBlock(candidate: BlockCandidate, via: PageDownloadVia): void {
  if (extracting) {
    flashBusy()
    return
  }
  const { element, kind, range } = candidate
  const slice = range && range.start.parentElement === element ? { from: range.start, to: range.end } : undefined
  const { markdown, platform } = elementToMarkdown(element, slice, 'download')
  if (!markdown.trim()) {
    showNotice(notice('failed', 'EMPTY_CONTENT'))
    return
  }
  start({
    meta: { ...pageMetaFor(platform?.sourceUrl ?? sourceOf(candidate)), ...platform?.meta },
    markdown,
    media: collectMedia(element, markdown, slice),
    via,
    blockKind: kind,
  })
}

/** The popup's button and the unbound command: the page's main article, or the pointer-hint notice (download.md §2.3, §2.4). */
export async function downloadMainArticle(via: 'popup' | 'command'): Promise<void> {
  if (extracting || starting || preparing || noticePhase === 'progress') {
    flashBusy()
    return
  }
  preparing = true
  try {
    const article = findMainArticle(document)
    const source = article ?? document.body
    // X mounts the long-form body one viewport at a time; reassemble it before
    // converting, or the download holds only the first screens (download.md §4.3).
    const assembled = await collectFullXArticle(document)
    const platform = extractXContent(assembled ?? source)
    // The worker round-trips this assembly; the marker stops the second pass
    // from re-extracting it (download.md §4.3).
    if (platform) platform.element.setAttribute('data-ann-platform', '')
    const root = platform?.element ?? source
    const meta = { ...pageMetaFor(platform?.sourceUrl ?? sourceOf({ element: source, kind: 'article' })), ...platform?.meta }
    const originals = new Map(collectMedia(root).map(item => [item.url, item]))
    const message: ExtractDownloadPageMessage = {
      type: 'EXTRACT_DOWNLOAD_PAGE',
      html: downloadSnapshot(root, Boolean(article)),
      url: location.href,
      hasArticle: Boolean(article),
    }
    pending = null
    await extractMainPage(message, meta, originals, via, document.baseURI)
  } catch {
    showNotice(notice('failed', 'DOWNLOAD_FAILED'))
  } finally {
    preparing = false
  }
}

async function extractMainPage(
  message: ExtractDownloadPageMessage,
  meta: Handover['meta'],
  originals: Map<string, CollectedMedia>,
  via: 'popup' | 'command',
  baseUrl: string,
): Promise<void> {
  if (extracting || starting || noticePhase === 'progress') {
    flashBusy()
    return
  }
  extracting = true
  retryExtraction = () => extractMainPage(message, meta, originals, via, baseUrl)
  try {
    const response = await MessageUtils.sendMessage<{ html: string }>(message)
    if (!response.success || !response.data) {
      showNotice(notice('failed', response.error ?? 'DOWNLOAD_FAILED'))
      return
    }
    const body = extractedDownloadBody(response.data.html, baseUrl)
    const { markdown } = elementToMarkdown(body, undefined, 'download')
    if (!markdown.trim()) {
      retryExtraction = null
      showNotice(notice('failed', 'NO_ARTICLE'))
      return
    }
    retryExtraction = null
    await start({ meta, markdown, media: collectMedia(body, markdown).flatMap(item => originals.get(item.url) ?? []), via, blockKind: 'article' })
  } catch {
    showNotice(notice('failed', 'DOWNLOAD_FAILED'))
  } finally {
    extracting = false
  }
}

function sourceOf(candidate: { element: Element; kind: BlockCandidate['kind']; range?: BlockCandidate['range'] }): string {
  return resolvePermalink(candidate.range?.start ?? candidate.element, location.href, candidate.kind)
}

function pageMetaFor(sourceUrl: string): Handover['meta'] {
  const meta = extractPageMeta(document, normalizeHost(location.href))
  const site = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim()
  const language = document.documentElement.lang.trim()
  const cover = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]')?.getAttribute('content')
  let image: string | undefined
  try {
    const parsed = cover ? new URL(cover, document.baseURI) : undefined
    if (parsed && /^https?:$/.test(parsed.protocol)) image = parsed.href
  } catch {
    /* Invalid cover metadata stays absent. */
  }
  return {
    title: meta.title,
    sourceUrl,
    ...(site ? { site } : {}),
    ...(language ? { language } : {}),
    ...(image ? { image } : {}),
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.published ? { published: meta.published } : {}),
    ...(meta.description ? { description: meta.description } : {}),
  }
}

async function start(handover: Handover): Promise<void> {
  if (starting || noticePhase === 'progress') {
    flashBusy()
    return
  }
  starting = true
  retryExtraction = null
  const initialVersion = receivedNoticeVersion
  pending = handover
  const response = await MessageUtils.sendMessage<{ accepted?: boolean }>({
    type: 'START_PAGE_DOWNLOAD',
    ...(handover.form ? { form: handover.form } : {}),
    meta: handover.meta,
    markdown: handover.markdown,
    media: handover.media satisfies PageDownloadMedia[],
    via: handover.via,
    lang: currentUiLanguage(),
    ...(handover.blockKind ? { blockKind: handover.blockKind } : {}),
  })
  starting = false
  if (!response.success) {
    if (response.error === 'DOWNLOAD_ACTIVE') {
      // the running bar keeps its progress and cancel; a second line says the click was refused (download.md §2.5)
      flashBusy()
      return
    }
    // the worker refused for another reason: the text stays for the next try
    showNotice(notice('failed', response.error))
    return
  }
  // only an accepted run gets its own bar: a refused second click never takes the running one's progress away
  if (receivedNoticeVersion === initialVersion) showNotice(notice('progress', undefined, handover.media.length))
}

/** 「上一个还在进行」 under the running bar, without taking its cancel away. */
function flashBusy(): void {
  if (noticeHost === null || noticePhase !== 'progress') {
    showNotice(notice('failed', 'DOWNLOAD_ACTIVE'))
    return
  }
  const bar = noticeHost.querySelector('.ann-clip-toast')
  if (!bar) return
  let line = bar.querySelector<HTMLElement>('.ann-download-busy')
  if (!line) {
    line = noteLine(uiText('download.busyReason'))
    line.classList.add('ann-download-busy')
    bar.appendChild(line)
  } else {
    line.textContent = uiText('download.busyReason')
  }
  if (busyTimer !== null) window.clearTimeout(busyTimer)
  busyTimer = window.setTimeout(() => {
    busyTimer = null
    line?.remove()
  }, 2600)
}

/** The worker's reports about this tab's download land here (download.md §2.5). */
export function onDownloadNotice(message: DownloadNoticeMessage): void {
  if (message.errorCode === 'DOWNLOAD_ZIP_FAILED' && pending) pending = { ...pending, form: 'folder' }
  receivedNoticeVersion++
  showNotice(message)
}

function showNotice(message: DownloadNoticeMessage): void {
  // progress is the same bar updating in place: replacing the node on every
  // update would move the 取消 button out from under the pointer (download.md §2.5)
  if (message.phase === 'progress' && noticeHost !== null && noticePhase === 'progress') {
    if (noticeLabel) noticeLabel.textContent = uiText('download.progress', { done: message.processed, total: message.total })
    return
  }
  dismissNotice()
  noticePhase = message.phase
  const failed = message.phase === 'failed'
  const host = document.createElement('div')
  host.setAttribute(ROOT_ATTR, 'download-notice')
  host.setAttribute('role', failed ? 'alert' : 'status')
  host.setAttribute('aria-live', failed ? 'assertive' : 'polite')
  const bar = document.createElement('div')
  bar.className = 'ann-clip-toast'
  const row = document.createElement('div')
  row.className = 'ann-clip-toast-row'
  const mark = document.createElement('span')
  mark.className = 'ann-clip-toast-icon'
  mark.appendChild(overlayIcon(document, failed ? 'alert' : message.phase === 'progress' ? 'download' : 'check'))

  const label = document.createElement('span')
  noticeLabel = label
  if (message.phase === 'progress') {
    label.textContent = uiText('download.progress', { done: message.processed, total: message.total })
    const cancel = document.createElement('button')
    cancel.textContent = uiText('download.cancel')
    cancel.addEventListener('click', () => {
      // the worker answers with the cancelled notice, which replaces this bar
      cancel.disabled = true
      void MessageUtils.sendMessage<{ ok?: boolean }>({ type: 'CANCEL_DOWNLOAD' })
        .then(response => {
          if (!response.success) cancel.disabled = false
        })
        .catch(() => {
          cancel.disabled = false
        })
    })
    row.append(mark, label, cancel)
  } else if (message.phase === 'done' || message.phase === 'partial') {
    label.textContent = message.phase === 'partial' ? uiText('download.partial', { count: message.missingCount }) : uiText('download.done')
    row.append(mark, label)
    if (message.downloadId !== undefined) {
      const files = document.createElement('button')
      files.textContent = uiText('download.showFiles')
      files.addEventListener('click', () => void showFiles(message.downloadId))
      row.append(files)
    }
    pending = null
  } else if (message.phase === 'cancelled') {
    label.textContent = uiText('download.cancelled')
    row.append(mark, label)
    bar.appendChild(noteLine(uiText('download.cancelledNote')))
    pending = null
  } else {
    // the failure readings: no main article found, the worker's stable codes; Retry keeps the converted text
    const noArticle = message.errorCode === 'NO_ARTICLE'
    label.textContent = noArticle ? uiText('download.noArticle') : uiText('download.failed')
    row.append(mark, label)
    const why = downloadFailureText(message.errorCode)
    if (why && !noArticle) bar.appendChild(reasonLine(why))
    const saved = pending
    const again = saved ? () => start(saved) : retryExtraction
    if (!noArticle && message.errorCode !== 'DOWNLOAD_ACTIVE' && again) {
      const retry = document.createElement('button')
      retry.textContent = uiText('toast.retry')
      retry.addEventListener('click', () => {
        dismissNotice()
        void again()
      })
      row.append(retry)
    }
  }
  bar.prepend(row)
  host.appendChild(bar)
  document.documentElement.appendChild(host)
  noticeHost = host
  if (message.phase === 'done' || message.phase === 'cancelled') autoLeave()
}

function reasonLine(text: string): HTMLElement {
  const why = document.createElement('div')
  why.className = 'ann-clip-toast-reason'
  why.textContent = text
  return why
}

/** A quieter second line under the notice: what cancelling leaves on disk (download.md §2.5). */
function noteLine(text: string): HTMLElement {
  const note = document.createElement('div')
  note.className = 'ann-clip-toast-note'
  note.textContent = text
  return note
}

async function showFiles(downloadId: number | undefined): Promise<void> {
  if (downloadId === undefined) return
  await MessageUtils.sendMessage({ type: 'SHOW_DOWNLOAD_FILE', downloadId })
}
