/**
 * The download domain — docs/product/download.md. A block, a page's main
 * article or picked library entries become a local Markdown folder (or one
 * ZIP); this pure core holds what every producer shares: the caps of one download (download.md §5.2),
 * title→filename cleaning, media names made only of a slot number and the
 * response type, the page Markdown's frontmatter, and the README that lists
 * what could not be saved. The environment (worker, offscreen document,
 * library page) supplies the bytes and the records; nothing here touches
 * chrome.* or the DOM.
 */
import { clipBody, frontmatterFor, localDate, type ExportLanguage } from './export'
import type { EntryRecord, PropertyDefinition } from './types'

/** The caps of one download (download.md §5.2). Over one of these, that item keeps its address. */
export const DOWNLOAD_LIMITS = {
  /** One image, bytes. */
  imageMaxBytes: 20 * 1024 * 1024,
  /** One video or audio file, bytes. */
  mediaMaxBytes: 200 * 1024 * 1024,
  /** One download writes at most this many files. */
  maxFiles: 500,
  /** Everything a download writes, bytes. */
  totalMaxBytes: 1024 * 1024 * 1024,
  /** Media requests in flight at once. */
  concurrency: 4,
  /** A request with no progress for this long gives up on that item. */
  stallTimeoutMs: 30_000,
  /** Images smaller than this square are decoration or trackers, not content. */
  minImagePx: 16,
  /** Library multi-download entries at once. */
  libraryMaxEntries: 200,
  /** Above this many expected files the dialog suggests the ZIP form. */
  zipAdviceFiles: 100,
  /** Folder and Markdown file names, characters. */
  nameMaxChars: 80,
} as const

export type DownloadForm = 'folder' | 'zip'
export type DownloadMediaKind = 'image' | 'video' | 'audio'

// ── File names (download.md §4.4) ───────────────────────────────────────

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

/**
 * The folder and Markdown file name a title becomes: `\ / : * ? " < > |`
 * and control characters out, whitespace collapsed, dots and spaces off the
 * ends, Windows' reserved names dodged, length capped (download.md §4.4). An empty
 * result falls back to the source's host name.
 */
export function sanitizeTitle(title: string, fallbackHost: string): string {
  let name = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`
  name = [...name]
    .slice(0, DOWNLOAD_LIMITS.nameMaxChars)
    .join('')
    .trim()
    .replace(/[\s.]+$/g, '')
  if (!name) name = sanitizeHost(fallbackHost)
  return name
}

const HOST_SAFE = /[^a-z0-9.-]/g

function sanitizeHost(host: string): string {
  const safe = host
    .toLowerCase()
    .replace(HOST_SAFE, '')
    .slice(0, DOWNLOAD_LIMITS.nameMaxChars)
    .replace(/^[.]+|[.]+$/g, '')
  return safe && !WINDOWS_RESERVED.test(safe) ? safe : 'download'
}

/** `name`, then `name (2)`, `name (3)` … — separates same-titled entries in one batch and a README from a same-named article (download.md §4.2, §4.4). */
export function dedupeName(name: string, taken: ReadonlySet<string>): string {
  const normalized = new Set([...taken].map(value => value.normalize('NFC').toLowerCase()))
  const exists = (value: string): boolean => normalized.has(value.normalize('NFC').toLowerCase())
  if (!exists(name)) return name
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const base = [...name].slice(0, Math.max(1, DOWNLOAD_LIMITS.nameMaxChars - suffix.length)).join('')
    const candidate = `${base}${suffix}`
    if (!exists(candidate)) return candidate
  }
}

/** Avoid overwriting an article titled README with its missing-media report. */
export function markdownFileName(title: string, withReadme: boolean): string {
  return `${dedupeName(title, new Set(withReadme ? ['README'] : []))}.md`
}

/** The library multi-download root, by the download day's local date (download.md §4.2). */
export function batchFolderName(at: number): string {
  return `AnnHub-download-${localDate(at)}`
}

const MEDIA_PREFIX: Record<DownloadMediaKind, string> = { image: 'img', video: 'video', audio: 'audio' }

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'oga',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
}

/** The media kind a response type stands for, or null when it is none of the three (download.md §5.2). */
export function mediaKindOfMime(mime: string): DownloadMediaKind | null {
  const type = mime.split(';')[0]!.trim().toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return null
}

/** `img-001.jpg` — a slot number and the response type's extension, never a name from the page (download.md §4.2). */
export function mediaSlotName(kind: DownloadMediaKind, slot: number, mime: string): string {
  const type = mime.split(';')[0]!.trim().toLowerCase()
  const ext = MIME_EXT[type] ?? (/^[a-z0-9]{1,10}$/.exec(type.split('/')[1] ?? '') ? type.split('/')[1]! : 'bin')
  return `${MEDIA_PREFIX[kind]}-${String(slot).padStart(3, '0')}.${ext}`
}

// ── Page download Markdown (download.md §4.3) ───────────────────────────

/** One media address a page itself declared, with the kind the collector read off its element. */
export interface DownloadMediaItem {
  url: string
  kind: DownloadMediaKind
}

/** What became of one media item: the file it landed as, or why it kept its address. */
export type MediaOutcome = { url: string; status: 'saved'; fileName: string } | { url: string; status: 'missing'; reason: MissingMediaReason }

export type MissingMediaReason = 'unreachable' | 'too-large' | 'wrong-type' | 'offline' | 'write-failed' | 'limit'

export interface PageDownloadMeta {
  title: string
  sourceUrl: string
  site?: string
  language?: string
  image?: string
  author?: string[]
  published?: string
  description?: string
}

/**
 * The page Markdown: frontmatter with the Obsidian Web Clipper's default
 * keys (title, source, author, published, created, description — absent
 * fields absent), then the converted block with every fetched medium's
 * address swapped for its `assets/` relative link. What was not fetched
 * keeps the address it has (download.md §4.3, §5.4).
 */
export function composePageMarkdown(meta: PageDownloadMeta, markdown: string, outcomes: MediaOutcome[], downloadedAt: number): string {
  const lines: string[] = []
  const scalar = (value: string): string => `'${value.replace(/'/g, "''")}'`
  lines.push(`title: ${scalar(meta.title)}`)
  lines.push(`source: ${scalar(meta.sourceUrl)}`)
  if (meta.author && meta.author.length > 0) {
    lines.push(`author:${meta.author.map(item => `\n  - ${scalar(item)}`).join('')}`)
  }
  if (meta.published) lines.push(`published: ${meta.published}`)
  lines.push(`created: ${localDate(downloadedAt)}`)
  if (meta.description) lines.push(`description: ${scalar(meta.description)}`)
  for (const key of ['site', 'language', 'image'] as const) {
    if (meta[key]) lines.push(`${key}: ${scalar(meta[key])}`)
  }
  const frontmatter = `---\n${lines.join('\n')}\n---`
  let body = markdown
  for (const outcome of outcomes) {
    if (outcome.status !== 'saved') continue
    body = replaceUrl(body, outcome.url, downloadAssetPath(outcome.fileName))
  }
  return `${frontmatter}\n\n${body}\n`
}

/** A browser-renamed file is still a Markdown URL, not a raw filesystem path. */
export function downloadAssetPath(fileName: string): string {
  return `assets/${encodeURIComponent(fileName).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

/** Replaces a URL wherever the converter wrote it — raw or with the `()`/space encodings it applies to destinations. */
export function replaceUrl(text: string, url: string, replacement: string): string {
  const variants = [url.replace(/\\/g, '\\\\')]
  const encoded = url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20')
  if (!variants.includes(encoded)) variants.push(encoded)
  let out = text
  for (const variant of variants) {
    // a longer address that merely starts with this one (…png vs …png?w=800) keeps its own link
    out = out.replace(new RegExp(escapeRegExp(variant) + '(?=[)\\s]|$)', 'g'), replacement)
  }
  return out
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\\]/g, '\\$&')
}

// ── README (download.md §4.2, §5.4) ─────────────────────────────────────

const MISSING_LABELS: Record<ExportLanguage, Record<MissingMediaReason, string>> = {
  zh: {
    'unreachable': '取回失败',
    'too-large': '超过大小上限',
    'wrong-type': '类型不符',
    'offline': '离线，未联网取回',
    'write-failed': '写入失败',
    'limit': '超过本次下载的数量或大小上限',
  },
  en: {
    'unreachable': 'could not fetch',
    'too-large': 'over the size cap',
    'wrong-type': 'not the declared kind',
    'offline': 'offline, not fetched',
    'write-failed': 'could not write the file',
    'limit': "over this download's file or size cap",
  },
}

const README_LABELS: Record<ExportLanguage, { title: string; heading: string; offline: string; skipped: string }> = {
  zh: {
    title: '下载说明',
    heading: '未保存的媒体',
    offline: '下载时离线：媒体保留原地址，联网后可重新下载。',
    skipped: '未选择同时下载媒体：媒体保留原地址。',
  },
  en: {
    title: 'Download notes',
    heading: 'Media not saved',
    offline: 'The download ran offline: media keep their addresses; download again while online.',
    skipped: 'Media download was left unchecked: media keep their addresses.',
  },
}

/** The folder README, listing each unsaved medium's address and reason. Null when everything saved (download.md §4.2, §3.4). */
export function mediaReadme(lang: ExportLanguage, missing: MediaOutcome[], opts: { offline?: boolean; skipped?: boolean } = {}): string | null {
  const missed = missing.filter((item): item is Extract<MediaOutcome, { status: 'missing' }> => item.status === 'missing')
  if (missed.length === 0 && !opts.offline && !opts.skipped) return null
  const t = README_LABELS[lang]
  const lines = [`# ${t.title}`, '']
  if (opts.offline) lines.push(`- ${t.offline}`)
  if (opts.skipped) lines.push(`- ${t.skipped}`)
  if (missed.length > 0) {
    lines.push('', `## ${t.heading}`, '')
    for (const item of missed) lines.push(`- ${item.url} — ${MISSING_LABELS[lang][item.reason]}`)
  }
  return lines.join('\n') + '\n'
}

// ── Library entry downloads (download.md §3.4) ──────────────────────────

/** The address a screenshot's saved bytes stand in for inside the planned Markdown; the runner swaps in the real file name. */
export const ASSET_MARKER_BASE = 'annhub-asset://'

/** One library entry as a folder's worth of planned files: the Markdown (media still by address) and what to fetch or read. */
export interface EntryDownloadPlan {
  entryId: string
  /** The unique, sanitized folder name (without any parent path). */
  folder: string
  markdown: string
  media: DownloadMediaItem[]
  /** A screenshot's bytes come from the store, never the network (download.md §3.4). */
  assetId?: string
}

/** Every image-syntax address in a Markdown text — the remote media a clip entry declares. */
export function clipMediaUrls(markdown: string): DownloadMediaItem[] {
  const items: DownloadMediaItem[] = []
  const seen = new Set<string>()
  for (const match of markdown.matchAll(/!\[[^\]]*\]\((<[^>]+>|[^)\s]+)\)/g)) {
    const raw = match[1]!.replace(/^<|>$/g, '')
    if (!/^https?:\/\//i.test(raw) || seen.has(raw)) continue
    seen.add(raw)
    items.push({ url: raw, kind: 'image' })
  }
  return items
}

/**
 * One entry as the download writes it: frontmatter and sections exactly as
 * the whole-library export composes them (storage.md §6), highlights as
 * `==…==`, one folder per entry named from the title.
 */
export function planEntryDownload(entry: EntryRecord, registry: PropertyDefinition[], lang: ExportLanguage, taken: ReadonlySet<string>): EntryDownloadPlan {
  const title = String(entry.properties['title'] ?? '')
  const folder = dedupeName(sanitizeTitle(title, entry.sourceHost), taken)
  if (entry.type === 'screenshot') {
    const marker = `${ASSET_MARKER_BASE}${entry.assetId ?? 'missing'}`
    const image = entry.assetId ? `![${title.replace(/[[\]]/g, '')}](${marker})` : clipImageMissing(lang)
    const markdown = `${frontmatterFor(entry, registry)}\n\n## ${imageSectionLabel(lang)}\n\n${image}\n`
    return { entryId: entry.id, folder, markdown, media: [], ...(entry.assetId ? { assetId: entry.assetId } : {}) }
  }
  const body = clipBody(entry, lang)
  return { entryId: entry.id, folder, markdown: `${frontmatterFor(entry, registry)}\n\n${body}\n`, media: clipMediaUrls(body) }
}

const ENTRY_LABELS: Record<ExportLanguage, { image: string; imageMissing: string; readmeTitle: string; entries: string; failed: string }> = {
  zh: { image: '图片', imageMissing: '图片缺失', readmeTitle: '下载清单', entries: '条目', failed: '未能下载的条目' },
  en: { image: 'Image', imageMissing: 'Image missing', readmeTitle: 'Download manifest', entries: 'entries', failed: 'Entries not downloaded' },
}

function imageSectionLabel(lang: ExportLanguage): string {
  return ENTRY_LABELS[lang].image
}

function clipImageMissing(lang: ExportLanguage): string {
  return ENTRY_LABELS[lang].imageMissing
}

/** The multi-download root README: the manifest of entries and the ones that could not be downloaded (download.md §4.2). */
export function batchReadme(lang: ExportLanguage, folders: string[], failedTitles: string[]): string {
  const t = ENTRY_LABELS[lang]
  const lines = [`# ${t.readmeTitle}`, '', `- ${folders.length} ${t.entries}`]
  for (const folder of folders) lines.push(`- ${folder}`)
  if (failedTitles.length > 0) {
    lines.push('', `## ${t.failed}`, '')
    for (const title of failedTitles) lines.push(`- ${title}`)
  }
  return lines.join('\n') + '\n'
}

/** What a dialog can state before anything runs: the file count a plan expects (Markdown files, media, READMEs). */
export function estimateFileCount(entryCount: number, mediaCount: number): number {
  return entryCount + mediaCount + (mediaCount > 0 ? 1 : 0)
}
