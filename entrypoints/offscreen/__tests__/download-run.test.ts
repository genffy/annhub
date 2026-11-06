import { afterEach, expect, it, vi } from 'vitest'
import { acceptDownloadRun, cleanupDownloadRun, deliverFinish } from '../download-run'
import { fetchMedia } from '../../../background-service/services/download/fetch-media'
import { buildZip } from '../../../core/zip'

vi.mock('../../../core/zip', () => ({ buildZip: vi.fn() }))
vi.mock('../../../core/download', async importOriginal => {
  const original = await importOriginal<typeof import('../../../core/download')>()
  return { ...original, DOWNLOAD_LIMITS: { ...original.DOWNLOAD_LIMITS, totalMaxBytes: 10 } }
})

vi.mock('../../../background-service/services/download/fetch-media', () => ({
  fetchMedia: vi.fn(),
  MediaRefused: class extends Error {},
}))

afterEach(async () => {
  await cleanupDownloadRun({ type: 'DOWNLOAD_CANCEL', requestId: 'cancel-test' })
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('reports ZIP packing failure distinctly and releases the run for a folder retry', async () => {
  vi.mocked(buildZip).mockRejectedValueOnce(new Error('packing failed'))
  const send = vi.fn().mockResolvedValue({ success: true })
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
  const request = { type: 'DOWNLOAD_RUN' as const, requestId: 'cancel-test', form: 'zip' as const, basePath: 'AnnHub/test', withMedia: false, media: [] }
  acceptDownloadRun(request)
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'media' })))
  deliverFinish({ type: 'DOWNLOAD_FINISH', requestId: request.requestId, files: [{ path: 'text.md', text: 'Retained body' }] })
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'failed', errorCode: 'DOWNLOAD_ZIP_FAILED' })))
  expect(acceptDownloadRun({ ...request, form: 'folder' })).toBe(true)
})

it('enforces the shared media budget when concurrent requests finish together', async () => {
  vi.mocked(fetchMedia).mockResolvedValue(new Blob(['123456'], { type: 'image/png' }))
  const send = vi.fn().mockResolvedValue({ success: true })
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  acceptDownloadRun({
    type: 'DOWNLOAD_RUN',
    requestId: 'cancel-test',
    form: 'folder',
    basePath: 'AnnHub/test',
    withMedia: true,
    media: Array.from({ length: 4 }, (_, index) => ({ url: `https://example.com/${index}.png`, kind: 'image', dir: '', slot: index + 1 })),
  })
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'media' })))
  const result = send.mock.calls.find(([message]) => message.event === 'media')![0]
  expect(result.outcomes.filter((item: { status: string }) => item.status === 'saved')).toHaveLength(1)
  expect(result.outcomes.filter((item: { reason?: string }) => item.reason === 'limit')).toHaveLength(3)
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'progress', processed: 4, total: 4 }))
})

it('does not create a leaked blob URL when ZIP packing finishes after cancellation', async () => {
  let finish!: (blob: Blob) => void
  vi.mocked(buildZip).mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  const send = vi.fn().mockResolvedValue({ success: true })
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
  const create = vi.spyOn(URL, 'createObjectURL')
  acceptDownloadRun({ type: 'DOWNLOAD_RUN', requestId: 'cancel-test', form: 'zip', basePath: 'AnnHub/test', withMedia: false, media: [] })
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'media' })))
  deliverFinish({ type: 'DOWNLOAD_FINISH', requestId: 'cancel-test', files: [{ path: 'test.md', text: 'text' }] })
  await cleanupDownloadRun({ type: 'DOWNLOAD_CANCEL', requestId: 'cancel-test' })
  send.mockClear()
  finish(new Blob(['zip']))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(create).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})

it('falls back after a refused image and fetches shared candidates only once', async () => {
  vi.mocked(fetchMedia).mockImplementation(async url => {
    if (url.endsWith('small.png')) return new Blob(['ok'], { type: 'image/png' })
    throw new Error('refused')
  })
  const send = vi.fn().mockResolvedValue({ success: true })
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  acceptDownloadRun({
    type: 'DOWNLOAD_RUN',
    requestId: 'cancel-test',
    form: 'folder',
    basePath: 'AnnHub/test',
    withMedia: true,
    media: [1, 2].map(slot => ({ url: `https://example.com/large-${slot}.png`, candidates: ['https://example.com/small.png'], kind: 'image', dir: '', slot })),
  })
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'media' })))
  expect(vi.mocked(fetchMedia).mock.calls.filter(([url]) => url.endsWith('small.png'))).toHaveLength(1)
  const result = send.mock.calls.find(([message]) => message.event === 'media')![0]
  expect(result.outcomes).toEqual([1, 2].map(slot => expect.objectContaining({ ref: `|https://example.com/large-${slot}.png`, status: 'saved', mime: 'image/png' })))
})

it('cancels every in-flight fetch and never starts queued media after cancellation', async () => {
  const signals: AbortSignal[] = []
  vi.mocked(fetchMedia).mockImplementation((_url, _kind, signal) => {
    signals.push(signal)
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
    })
  })
  const send = vi.fn().mockResolvedValue({ success: true })
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
  expect(
    acceptDownloadRun({
      type: 'DOWNLOAD_RUN',
      requestId: 'cancel-test',
      form: 'folder',
      basePath: 'AnnHub/test',
      withMedia: true,
      media: Array.from({ length: 8 }, (_, index) => ({ url: `https://example.com/${index}.png`, kind: 'image', dir: '', slot: index + 1 })),
    }),
  ).toBe(true)
  expect(signals).toHaveLength(4)
  send.mockClear()
  await cleanupDownloadRun({ type: 'DOWNLOAD_CANCEL', requestId: 'cancel-test' })
  expect(signals.every(signal => signal.aborted)).toBe(true)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(signals).toHaveLength(4)
  expect(send).not.toHaveBeenCalled()
})
