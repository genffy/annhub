import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadService } from '../index'
import { planLibraryDownload } from '../library-plan'
import type { DownloadRunEventMessage, ResponseMessage } from '../../../../types/messages'

/**
 * download.md with stubs where the browser would act: one download at a
 * time across tabs and pages, the offscreen document fetches and writes,
 * the worker composes the Markdown once the outcomes are known, the origin
 * hears progress and the outcome, and the one metric lands. The library
 * plan composes entry folders from a real (fake) IndexedDB store.
 */

const runtimeMessages: Record<string, unknown>[] = []
const tabMessages: { tabId: number; message: unknown }[] = []
const downloadsShow = vi.fn(async () => undefined)
/** id → the file the worker asked to land; the mock answers complete with that very name. */
const landedFiles = new Map<number, string>()
let nextDownloadId = 0
const downloadsDownload = vi.fn((options: { filename?: string }, callback: (id: number) => void) => {
  const id = ++nextDownloadId
  if (options.filename) landedFiles.set(id, options.filename)
  callback(id)
})
const downloadsSearch = vi.fn(async (query: { id?: number }) => {
  const id = query?.id
  const filename = id !== undefined ? landedFiles.get(id) : undefined
  return filename === undefined ? [] : [{ state: 'complete', filename: `/tmp/downloads/${filename}` }]
})
const localStorageMap = new Map<string, unknown>()
const sessionStorageMap = new Map<string, unknown>()

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(async (message: Record<string, unknown>) => {
      runtimeMessages.push(message)
      return { success: true }
    }),
    getURL: (path = '') => `chrome-extension://abc/${String(path).replace(/^\//, '')}`,
    id: 'abc',
    lastError: undefined as { message: string } | undefined,
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
  },
  offscreen: { createDocument: vi.fn(async () => undefined), Reason: { BLOBS: 'BLOBS', USER_MEDIA: 'USER_MEDIA' } },
  downloads: {
    download: downloadsDownload,
    search: downloadsSearch,
    show: downloadsShow,
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    cancel: vi.fn(async () => undefined),
    removeFile: vi.fn(async () => undefined),
  },
  tabs: { sendMessage: vi.fn(async (tabId: number, message: unknown) => void tabMessages.push({ tabId, message })) },
  storage: {
    session: {
      get: vi.fn(async (key: string) => ({ [key]: sessionStorageMap.get(key) })),
      set: vi.fn(async (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values)) sessionStorageMap.set(key, value)
      }),
      remove: vi.fn(async (key: string) => {
        sessionStorageMap.delete(key)
      }),
    },
    local: {
      get: vi.fn(async (key: string) => (localStorageMap.has(key) ? { [key]: localStorageMap.get(key) } : {})),
      set: vi.fn(async (objects: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(objects)) localStorageMap.set(key, value)
      }),
    },
  },
})

const service = DownloadService.getInstance()
const tabSender = { url: 'https://blog.example.com/post', tab: { id: 7 }, frameId: 0 } as unknown as chrome.runtime.MessageSender
const pageSender = { url: 'chrome-extension://abc/library.html', tab: undefined } as unknown as chrome.runtime.MessageSender
const offscreenSender = { url: 'chrome-extension://abc/offscreen.html', tab: undefined } as unknown as chrome.runtime.MessageSender

async function dispatch(message: object, sender: chrome.runtime.MessageSender = tabSender): Promise<ResponseMessage> {
  await service.initialize()
  const typed = message as Record<string, unknown>
  const handler = service.getMessageHandlers()[typed['type'] as string]
  if (!handler) throw new Error(`no handler for ${String(typed['type'])}`)
  return handler(message, sender)
}

function lastRunMessage(): Record<string, unknown> {
  return [...runtimeMessages].reverse().find(message => message['type'] === 'DOWNLOAD_RUN')!
}

function notices() {
  return tabMessages.filter(entry => (entry.message as { type?: string }).type === 'DOWNLOAD_NOTICE').map(entry => entry.message as Record<string, unknown>)
}

/** The Markdown the worker wrote, decoded from the data URLs its download calls carried. */
function writtenMarkdown(): { path: string; text: string }[] {
  return downloadsDownload.mock.calls
    .filter((call: unknown[]) => typeof (call[0] as { url?: string }).url === 'string' && String((call[0] as { url?: string }).url).startsWith('data:text/markdown'))
    .map((call: unknown[]) => {
      const url = String((call[0] as { url: string }).url)
      return { path: (call[0] as { filename: string }).filename, text: atob(url.split(',')[1]!) }
    })
}

/** The props of the recorded download.completed events, merged; the store keeps them as serialized keys. */
async function recordedMetric(): Promise<Record<string, string> | undefined> {
  const stored = localStorageMap.get('annhub.metrics') as Record<string, Record<string, { byProps: Record<string, number> }>> | undefined
  const days = stored?.['download.completed']
  if (!days) return undefined
  const merged: Record<string, string> = {}
  for (const day of Object.values(days)) {
    for (const key of Object.keys(day.byProps)) {
      for (const pair of key.split('|')) {
        const at = pair.indexOf('=')
        if (at > 0) merged[pair.slice(0, at)] = pair.slice(at + 1)
      }
    }
  }
  return merged
}

function event(partial: Partial<DownloadRunEventMessage> & { requestId: string; event: DownloadRunEventMessage['event'] }): DownloadRunEventMessage {
  return { type: 'DOWNLOAD_RUN_EVENT', ...partial } as DownloadRunEventMessage
}

const PAGE_START = {
  type: 'START_PAGE_DOWNLOAD',
  meta: { title: 'A good post', sourceUrl: 'https://blog.example.com/post?token=secrets' },
  markdown: 'Words ![alt](https://cdn.example.com/pic.jpg)',
  media: [{ url: 'https://cdn.example.com/pic.jpg', kind: 'image' }],
  via: 'capsule',
  blockKind: 'post',
}

beforeAll(async () => {
  await service.initialize()
})

beforeEach(() => {
  runtimeMessages.length = 0
  tabMessages.length = 0
  localStorageMap.delete('annhub.metrics')
})

describe('the download service (download.md §2, §3, §7)', () => {
  it('extracts only top-frame snapshots and keeps extraction single-flight without storing content', async () => {
    const message = { type: 'EXTRACT_DOWNLOAD_PAGE', html: '<article>Private body</article>', url: 'https://blog.example.com/post', hasArticle: true }
    const child = { ...tabSender, frameId: 1 }
    expect((await dispatch(message, child)).success).toBe(false)
    expect((await dispatch(message, pageSender)).success).toBe(false)
    expect(runtimeMessages).toHaveLength(0)
    let finish!: (response: unknown) => void
    vi.mocked(chrome.runtime.sendMessage).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }) as never,
    )
    const pending = dispatch(message)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect((await dispatch(message)).error).toBe('DOWNLOAD_ACTIVE')
    expect((await dispatch(PAGE_START)).error).toBe('DOWNLOAD_ACTIVE')
    finish({ success: true, data: { html: '<p>Private body</p>' } })
    expect(await pending).toMatchObject({ success: true, data: { html: '<p>Private body</p>' } })
    expect(JSON.stringify([...sessionStorageMap])).not.toContain('Private body')
    expect(notices()).toHaveLength(0)
    expect((await dispatch({ ...message, html: null })).error).toBe('DOWNLOAD_EMPTY')
  })

  it.each(['folder', 'zip'] as const)('reports media omitted by the file cap as partial in %s form', async form => {
    const media = Array.from({ length: 501 }, (_, index) => ({ url: `https://cdn.example.com/${index}.png`, kind: 'image' as const }))
    await dispatch({ ...PAGE_START, form, media, markdown: media.map(item => `![](${item.url})`).join('\n') })
    const run = lastRunMessage()
    const items = run['media'] as { dir: string; url: string }[]
    expect(items).toHaveLength(498)
    await dispatch(
      event({
        requestId: run['requestId'] as string,
        event: 'media',
        outcomes: items.map(item => ({ ref: `${item.dir}|${item.url}`, status: 'saved', mime: 'image/png', blobUrl: 'blob:media' })),
      }),
      offscreenSender,
    )
    if (form === 'zip') await dispatch(event({ requestId: run['requestId'] as string, event: 'zip', blobUrl: 'blob:zip' }), offscreenSender)
    const result = notices()[notices().length - 1]!
    expect(result).toMatchObject({ phase: 'partial', missingCount: 3, total: 501 })
    const writes = notices().filter(notice => notice['phase'] === 'progress' && notice['stage'] === 'write')
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.every(notice => notice['processed'] === 501 && notice['total'] === 501)).toBe(true)
    expect(result['missing']).toEqual(media.slice(498).map(item => ({ url: item.url, reason: 'limit' })))
    expect(await recordedMetric()).toMatchObject({ result: 'partial', missing: '3-5' })
    downloadsDownload.mockClear()
  })
  it('keeps only routing metadata and clears an interrupted task after a worker restart', async () => {
    await dispatch(PAGE_START)
    const journal = sessionStorageMap.get('annhub.download.active')
    expect(journal).toMatchObject({ origin: { kind: 'tab', tabId: 7 } })
    expect(JSON.stringify(journal)).not.toMatch(/Words|pic\.jpg|good post|blog\.example/)
    const restarted = new DownloadService()
    await restarted.initialize()
    expect(notices()[notices().length - 1]).toMatchObject({ phase: 'failed', errorCode: 'DOWNLOAD_FAILED' })
    expect(sessionStorageMap.has('annhub.download.active')).toBe(false)
    expect(await recordedMetric()).toMatchObject({ result: 'failed', block_kind: 'post' })
    // Dispose the old test instance's interval; a real terminated worker has no timers.
    await dispatch({ type: 'CANCEL_DOWNLOAD' })
  })
  it("starts a page download only from a tab's top frame", async () => {
    const denied = await dispatch(PAGE_START, pageSender)
    expect(denied.success).toBe(false)
    expect(denied.error).toMatch(/Forbidden/)
  })

  it('starts a library download only from an extension page', async () => {
    const denied = await dispatch({ type: 'START_LIBRARY_DOWNLOAD', entryIds: ['ent_x'], via: 'drawer' }, tabSender)
    expect(denied.success).toBe(false)
    expect(denied.error).toMatch(/Forbidden/)
  })

  it('rejects an empty page payload with a stable code', async () => {
    const empty = await dispatch({ ...PAGE_START, markdown: '  ' })
    expect(empty.success).toBe(false)
    expect(empty.error).toBe('DOWNLOAD_EMPTY')
  })

  it('runs the happy path: run → progress → media → finish → done + metric', async () => {
    const started = await dispatch({ ...PAGE_START, media: [{ ...PAGE_START.media[0], candidates: ['https://cdn.example.com/small.jpg'] }] })
    expect(started.success).toBe(true)
    expect(started.data).toEqual({ accepted: true, total: 1 })

    const run = lastRunMessage()
    expect(run['basePath']).toBe('AnnHub/A good post')
    expect(run['form']).toBe('folder')
    expect(run['media']).toEqual([{ url: 'https://cdn.example.com/pic.jpg', candidates: ['https://cdn.example.com/small.jpg'], kind: 'image', dir: '', slot: 1 }])

    await dispatch(
      event({
        requestId: run['requestId'] as string,
        event: 'media',
        outcomes: [{ ref: '|https://cdn.example.com/pic.jpg', status: 'saved', blobUrl: 'blob:abc', mime: 'image/jpeg' }],
      }),
      offscreenSender,
    )
    // the worker writes the landed media itself: one browser download per file, the Markdown last
    expect(downloadsDownload).toHaveBeenCalledWith(expect.objectContaining({ filename: 'AnnHub/A good post/assets/img-001.jpg' }), expect.any(Function))
    expect(notices().map(notice => notice['phase'])).toContain('progress')
    const files = writtenMarkdown()
    expect(files.map(file => file.path)).toEqual(['AnnHub/A good post/A good post.md'])
    expect(files[0]!.text).toContain('![alt](assets/img-001.jpg)')
    expect(files[0]!.text).toContain("source: 'https://blog.example.com/post'")

    expect(notices()[notices().length - 1]).toMatchObject({ phase: 'done', missingCount: 0 })
    expect(await recordedMetric()).toMatchObject({ result: 'ok', source: 'page', via: 'capsule', scope: 'block', form: 'folder', media: '1-2', missing: '0' })

    // the slot is free again
    const again = await dispatch({ ...PAGE_START, title: 'Another' })
    expect(again.success).toBe(true)
    await dispatch({ type: 'CANCEL_DOWNLOAD' }, tabSender)
  })

  it('reports a partial download when media could not be saved, and writes the README', async () => {
    await dispatch(PAGE_START)
    const run = lastRunMessage()
    await dispatch(
      event({
        requestId: run['requestId'] as string,
        event: 'media',
        offline: true,
        outcomes: [{ ref: '|https://cdn.example.com/pic.jpg', status: 'missing', reason: 'offline' }],
      }),
      offscreenSender,
    )
    const files = writtenMarkdown()
    expect(files.map(file => file.path)).toEqual(['AnnHub/A good post/A good post.md', 'AnnHub/A good post/README.md'])
    expect(files[0]!.text).toContain('https://cdn.example.com/pic.jpg')
    expect(files[1]!.text).toContain('https://cdn.example.com/pic.jpg')

    expect(notices()[notices().length - 1]).toMatchObject({ phase: 'partial', missingCount: 1 })
    expect(await recordedMetric()).toMatchObject({ result: 'partial', missing: '1-2' })
  })

  it('holds one download at a time, across tabs and pages', async () => {
    await dispatch(PAGE_START)
    const busyPage = await dispatch({ ...PAGE_START, meta: { ...PAGE_START.meta, title: 'Second' } })
    expect(busyPage.error).toBe('DOWNLOAD_ACTIVE')
    const busyLibrary = await dispatch({ type: 'START_LIBRARY_DOWNLOAD', entryIds: ['ent_x'], via: 'drawer' }, pageSender)
    expect(busyLibrary.error).toBe('DOWNLOAD_ACTIVE')
    await dispatch({ type: 'CANCEL_DOWNLOAD' }, pageSender)
    expect(notices()[notices().length - 1]).toMatchObject({ phase: 'cancelled' })
    expect(await recordedMetric()).toMatchObject({ result: 'cancelled' })
    const restart = await dispatch(PAGE_START)
    expect(restart.success).toBe(true)
    await dispatch({ type: 'CANCEL_DOWNLOAD' }, tabSender)
  })

  it('cancels a file whose browser ID arrives after the cancel request, before reporting completion', async () => {
    await dispatch(PAGE_START)
    const run = lastRunMessage()
    let accept!: (id: number) => void
    const before = downloadsDownload.mock.calls.length
    downloadsDownload.mockImplementationOnce((_options, callback) => {
      accept = callback
    })
    const writing = dispatch(
      event({
        requestId: run['requestId'] as string,
        event: 'media',
        outcomes: [{ ref: '|https://cdn.example.com/pic.jpg', status: 'saved', blobUrl: 'blob:slow', mime: 'image/png' }],
      }),
      offscreenSender,
    )
    await vi.waitFor(() => expect(accept).toBeTypeOf('function'))
    const cancelling = dispatch({ type: 'CANCEL_DOWNLOAD' }, tabSender)
    await Promise.resolve()
    expect(notices().some(notice => notice['phase'] === 'cancelled')).toBe(false)
    accept(999)
    await Promise.all([writing, cancelling])
    expect(chrome.downloads.cancel).toHaveBeenCalledWith(999)
    expect(chrome.downloads.removeFile).toHaveBeenCalledWith(999)
    expect(downloadsDownload.mock.calls.length - before).toBe(1)
    expect(notices().map(notice => notice['phase'])).toEqual(['cancelled'])
    expect(await recordedMetric()).toMatchObject({ result: 'cancelled' })
  })

  it('reports a failed file write even when an earlier Markdown file succeeded', async () => {
    await dispatch(PAGE_START)
    const run = lastRunMessage()
    const regular = downloadsDownload.getMockImplementation()!
    downloadsDownload.mockImplementationOnce(regular).mockImplementationOnce((_options, callback) => callback(undefined as unknown as number))
    await dispatch(
      event({ requestId: run['requestId'] as string, event: 'media', outcomes: [{ ref: '|https://cdn.example.com/pic.jpg', status: 'missing', reason: 'unreachable' }] }),
      offscreenSender,
    )
    expect(notices()[notices().length - 1]).toMatchObject({ phase: 'failed', errorCode: 'DOWNLOAD_FAILED' })
    expect(await recordedMetric()).toMatchObject({ result: 'failed' })
  })

  it('fails cleanly when the offscreen document refuses the run', async () => {
    const sendMessage = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>
    sendMessage.mockImplementationOnce(async () => ({ success: false }))
    const failed = await dispatch({ ...PAGE_START, meta: { ...PAGE_START.meta, title: 'Refused' } })
    expect(failed.success).toBe(false)
    expect(failed.error).toBe('DOWNLOAD_FAILED')
    // the slot did not stay taken
    const next = await dispatch({ ...PAGE_START, meta: { ...PAGE_START.meta, title: 'Refused' } })
    expect(next.success).toBe(true)
    await dispatch({ type: 'CANCEL_DOWNLOAD' }, tabSender)
  })

  it("ignores a finished run's late reports", async () => {
    await dispatch(PAGE_START)
    const run = lastRunMessage()
    await dispatch({ type: 'CANCEL_DOWNLOAD' }, tabSender)
    const before = notices().length
    await dispatch(event({ requestId: run['requestId'] as string, event: 'zip', blobUrl: 'blob:late' }), offscreenSender)
    expect(notices().length).toBe(before)
  })

  it('answers a busy download with a stable code from an offscreen event sender only', async () => {
    const denied = await dispatch(event({ requestId: 'dl_x', event: 'media' }), tabSender)
    expect(denied.success).toBe(false)
    expect(denied.error).toMatch(/Forbidden/)
  })

  it('caps a library selection and rejects unknown ids payloads', async () => {
    const tooMany = await dispatch({ type: 'START_LIBRARY_DOWNLOAD', entryIds: Array.from({ length: 201 }, (_, i) => `ent_${i}`), via: 'selection' }, pageSender)
    expect(tooMany.error).toBe('DOWNLOAD_TOO_MANY')
    const empty = await dispatch({ type: 'START_LIBRARY_DOWNLOAD', entryIds: [], via: 'drawer' }, pageSender)
    expect(empty.error).toBe('DOWNLOAD_EMPTY')
  })
})

describe('planLibraryDownload (download.md §3.4)', () => {
  it("composes per-entry folders with the export's frontmatter and swaps outcomes into links", async () => {
    const { sharedEntryStore } = await import('../../../store-instance')
    const store = sharedEntryStore()
    await store.initialize()
    const clip = await store.saveEntry({
      type: 'clip',
      content: 'Body ![pic](https://cdn.example.com/a.png) end',
      sourceUrl: 'https://blog.example.com/x',
      properties: { title: 'Clip One' },
    })
    const shot = await store.saveEntry({
      type: 'screenshot',
      content: '',
      sourceUrl: 'https://blog.example.com/shot',
      properties: { title: 'Shot One' },
      asset: { bytes: pngBlob(), width: 2, height: 2 },
    })
    const plan = await planLibraryDownload({ entryIds: [clip.id, shot.id], form: 'zip', withMedia: true, lang: 'zh', takenRoots: [], at: Date.parse('2026-11-04T10:00:00') })
    expect(plan.basePath).toBe('AnnHub/AnnHub-download-2026-11-04')
    expect(plan.media.map(item => [item.url ?? `asset:${item.assetId}`, item.dir, item.slot])).toEqual([
      ['https://cdn.example.com/a.png', 'Clip One', 1],
      [`asset:${shot.assetId}`, 'Shot One', 1],
    ])

    const { files } = plan.compose(
      [
        { ref: 'Clip One|https://cdn.example.com/a.png', status: 'missing', reason: 'too-large' },
        { ref: `Shot One|asset:${shot.assetId}`, status: 'saved', fileName: 'img-001.png' },
      ],
      false,
    )
    expect(files.map(file => file.path)).toEqual(['README.md', 'Clip One/Clip One.md', 'Clip One/README.md', 'Shot One/Shot One.md'])
    expect(files[1]!.text).toContain('![pic](https://cdn.example.com/a.png)')
    expect(files[2]!.text).toContain('超过大小上限')
    expect(files[3]!.text).toContain('assets/img-001.png')
    expect(files[3]!.text).toContain('annhub_type: screenshot')
  })
})

function pngBlob(bytes = 16): Blob {
  const buffer = new Uint8Array(bytes)
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return new Blob([buffer], { type: 'image/png' })
}
