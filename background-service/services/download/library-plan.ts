/**
 * Library download planning (download.md §3.4): the entries the picker chose
 * become the run's plan — one folder per entry, the export's frontmatter and
 * sections, the clip's remote media and the screenshot's stored bytes. The
 * worker holds this; the offscreen document executes the fetching and the
 * writing. The finish files (the Markdown itself) are composed only once the
 * media outcomes are known, so the plan carries a composer, not the files.
 */
import type { ExportLanguage } from '../../../core/export'
import {
  ASSET_MARKER_BASE,
  batchFolderName,
  batchReadme,
  composePageMarkdown,
  DOWNLOAD_LIMITS,
  downloadAssetPath,
  mediaReadme,
  markdownFileName,
  planEntryDownload,
  replaceUrl,
  sanitizeTitle,
  type DownloadForm,
  type DownloadMediaKind,
  type EntryDownloadPlan,
  type MediaOutcome,
} from '../../../core/download'
import type { DownloadItemOutcome, DownloadMissingItem, DownloadPlanItem } from '../../../types/messages'
import { initializedEntryStore } from '../../store-instance'

/** A medium's outcome as the composer reads it: the file it landed as (the folder form's actual, browser-named file), or why it kept its address. */
export interface PlanOutcome {
  ref: string
  status: 'saved' | 'missing'
  fileName?: string
  reason?: DownloadItemOutcome['reason']
}

/** Everything a download run needs before the first byte moves. */
export interface DownloadRunPlan {
  form: DownloadForm
  basePath: string
  /** The folder name the product's Markdown file follows; the service renames it when the disk already holds the desired name (download.md §4.1, D-94). */
  productName: string
  withMedia: boolean
  media: DownloadPlanItem[]
  /** The Markdown and README files, once every medium has an outcome. */
  compose(outcomes: PlanOutcome[], offline: boolean): { files: { path: string; text: string }[]; missing: DownloadMissingItem[] }
  /** The media count the origin's progress UI starts from. */
  totalMedia: number
}

const refOf = (item: DownloadPlanItem): string => `${item.dir}|${item.url ?? `asset:${item.assetId ?? ''}`}`

/** Slot numbers per folder and kind: `assets/img-001.jpg` starts over in each entry's folder (download.md §4.2). */
class SlotCounter {
  private counts = new Map<string, number>()
  next(dir: string, kind: DownloadMediaKind): number {
    const key = `${dir}\u0000${kind}`
    const next = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, next)
    return next
  }
}

interface PlannedEntry {
  plan: EntryDownloadPlan
  /** The kept items of this entry, in order. */
  items: DownloadPlanItem[]
  /** The entry's items the run's file cap pushed out; they keep their addresses (download.md §5.2). */
  capped: DownloadPlanItem[]
}

/**
 * Plans the library download: reads the entries and the registry, gives each
 * entry its folder (unique among the batch's own entries), and collects the
 * media. Entries that no longer exist go to the multi root README's failure
 * list.
 */
export async function planLibraryDownload(input: { entryIds: string[]; form: DownloadForm; withMedia: boolean; lang: ExportLanguage; at: number }): Promise<DownloadRunPlan> {
  const { entryIds, form, withMedia, lang, at } = input
  const store = await initializedEntryStore()
  const [registry, records] = await Promise.all([store.listPropertyDefinitions(), Promise.all(entryIds.map(id => store.getEntry(id)))])
  const multi = entryIds.length > 1
  const taken = new Set<string>()
  const slots = new SlotCounter()
  const planned: PlannedEntry[] = []
  const failedIds: string[] = []
  records.forEach((entry, index) => {
    if (!entry) {
      failedIds.push(entryIds[index]!)
      return
    }
    const plan = planEntryDownload(entry, registry, lang, taken)
    taken.add(plan.folder)
    planned.push({ plan, items: [], capped: [] })
  })

  const all: DownloadPlanItem[] = []
  for (const entry of planned) {
    const dir = multi ? entry.plan.folder : ''
    if (entry.plan.assetId) {
      // stored bytes, never the network (download.md §3.4)
      entry.items.push({ assetId: entry.plan.assetId, kind: 'image', dir, slot: slots.next(dir, 'image') })
    }
    if (withMedia) {
      for (const medium of entry.plan.media) {
        entry.items.push({ url: medium.url, kind: medium.kind, dir, slot: slots.next(dir, medium.kind) })
      }
    }
    all.push(...entry.items)
  }

  // the file cap (download.md §5.2): the Markdown files themselves take room; a stored asset never moves to the
  // capped list — a screenshot without its bytes is nothing — so only remote media can be pushed out
  const storedFiles = all.filter(item => item.assetId).length
  const possibleReadmes = planned.filter(entry => entry.plan.media.length > 0).length
  const room = Math.max(0, DOWNLOAD_LIMITS.maxFiles - planned.length - storedFiles - possibleReadmes - (multi ? 1 : 0))
  let kept = 0
  for (const entry of planned) {
    for (const item of entry.items) {
      const stored = !item.url
      if (stored || kept < room) {
        if (!stored) kept++
        continue
      }
      entry.capped.push(item)
    }
    entry.items = entry.items.filter(item => !entry.capped.includes(item))
  }
  const media = planned.flatMap(entry => entry.items)

  const basePath = multi ? `AnnHub/${batchFolderName(at)}` : planned[0] ? `AnnHub/${planned[0].plan.folder}` : 'AnnHub/download'
  const productName = multi ? batchFolderName(at) : planned[0] ? planned[0].plan.folder : 'download'

  const plan: DownloadRunPlan = {
    form,
    basePath,
    productName,
    withMedia,
    media,
    totalMedia: all.length,
    compose(outcomes: PlanOutcome[], offline: boolean) {
      const byRef = new Map(outcomes.map(outcome => [outcome.ref, outcome]))
      const files: { path: string; text: string }[] = []
      const allMissing: DownloadMissingItem[] = []
      if (multi)
        files.push({
          path: 'README.md',
          text: batchReadme(
            lang,
            planned.map(entry => entry.plan.folder),
            failedIds,
          ),
        })
      for (const entry of planned) {
        let markdown = entry.plan.markdown
        const missing: MediaOutcome[] = []
        const skipped = !withMedia && entry.plan.media.length > 0
        for (const item of [...entry.items, ...entry.capped]) {
          const from = item.url ?? `${ASSET_MARKER_BASE}${item.assetId ?? ''}`
          if (entry.capped.includes(item)) {
            if (item.url) missing.push({ url: item.url, status: 'missing', reason: 'limit' })
            else markdown = markdown.split(from).join(imageMissing(lang))
            continue
          }
          const outcome = byRef.get(refOf(item))
          if (outcome?.status === 'saved' && outcome.fileName) {
            const path = downloadAssetPath(outcome.fileName)
            markdown = item.url ? replaceUrl(markdown, item.url, path) : markdown.split(from).join(path)
          } else if (item.url) {
            missing.push({ url: item.url, status: 'missing', reason: outcome?.reason ?? 'unreachable' })
          } else {
            markdown = markdown.replace(/!\[[^\]]*\]\(annhub-asset:\/\/[^)]*\)/g, imageMissing(lang))
            missing.push({ url: from, status: 'missing', reason: outcome?.reason ?? 'unreachable' })
          }
        }
        allMissing.push(...missing.flatMap(item => (item.status === 'missing' ? [{ url: item.url, reason: item.reason }] : [])))
        const readme = mediaReadme(lang, missing, { offline, skipped })
        // the multi root holds one folder per entry; a single entry's base path already is its folder (download.md §4.2)
        const at = multi ? `${entry.plan.folder}/` : ''
        files.push({ path: `${at}${markdownFileName(multi ? entry.plan.folder : plan.productName, Boolean(readme))}`, text: markdown })
        if (readme) files.push({ path: `${at}README.md`, text: readme })
      }
      return { files, missing: allMissing }
    },
  }
  return plan
}

function imageMissing(lang: ExportLanguage): string {
  return lang === 'zh' ? '图片缺失' : 'Image missing'
}

/** The page download's plan: one folder named from the page title, the block's Markdown, its media manifest. */
export function planPageDownload(input: {
  title: string
  sourceUrl: string
  markdown: string
  media: { url: string; kind: DownloadMediaKind; candidates?: string[] }[]
  form: DownloadForm
  withMedia: boolean
  lang: ExportLanguage
  at: number
  meta: { author?: string[]; published?: string; description?: string; site?: string; language?: string; image?: string }
}): DownloadRunPlan {
  let host: string
  try {
    host = new URL(input.sourceUrl).hostname
  } catch {
    host = ''
  }
  const folder = sanitizeTitle(input.title, host)
  const slots = new SlotCounter()
  // the run's file cap (download.md §5.2), less the Markdown and a possible README: the rest keep their addresses
  const room = Math.max(0, DOWNLOAD_LIMITS.maxFiles - 2)
  const kept = input.withMedia ? input.media.slice(0, room) : []
  const items: DownloadPlanItem[] = kept.map(medium => ({ ...medium, dir: '', slot: slots.next('', medium.kind) }))
  const plan: DownloadRunPlan = {
    form: input.form,
    basePath: `AnnHub/${folder}`,
    productName: folder,
    withMedia: input.withMedia,
    media: items,
    totalMedia: input.withMedia ? input.media.length : 0,
    compose(outcomes: PlanOutcome[], offline: boolean) {
      let keptIndex = 0
      const mediaOutcomes: MediaOutcome[] = input.media.map(medium => {
        if (keptIndex >= items.length || items[keptIndex]!.url !== medium.url) return { url: medium.url, status: 'missing', reason: 'limit' }
        const item = items[keptIndex]!
        keptIndex++
        const outcome = outcomes.find(candidate => candidate.ref === refOf(item))
        if (outcome?.status === 'saved' && outcome.fileName) return { url: medium.url, status: 'saved', fileName: outcome.fileName }
        return { url: medium.url, status: 'missing', reason: outcome?.reason ?? (input.withMedia ? 'unreachable' : 'limit') }
      })
      const markdown = composePageMarkdown({ title: input.title, sourceUrl: input.sourceUrl, ...input.meta }, input.markdown, mediaOutcomes, input.at)
      const readme = mediaReadme(input.lang, input.withMedia ? mediaOutcomes : [], { offline, skipped: !input.withMedia && input.media.length > 0 })
      // the base path already holds the folder: <标题>.md and README.md sit inside it (download.md §4.2)
      const files = [{ path: markdownFileName(plan.productName, Boolean(readme)), text: markdown }]
      if (readme) files.push({ path: 'README.md', text: readme })
      return { files, missing: input.withMedia ? mediaOutcomes.flatMap(item => (item.status === 'missing' ? [{ url: item.url, reason: item.reason }] : [])) : [] }
    },
  }
  return plan
}
