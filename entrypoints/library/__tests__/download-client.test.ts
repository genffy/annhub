import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useLibraryDownload, type LibraryDownload } from '../download-client'
import type { DownloadNoticeMessage } from '../../../types/messages'

const send = vi.hoisted(() => vi.fn())
vi.mock('../../../utils/message', () => ({ default: { sendMessage: send } }))
let client: LibraryDownload
let listener: (message: DownloadNoticeMessage) => void
let root: Root
let host: HTMLDivElement
function Harness() {
  client = useLibraryDownload()
  return null
}
function notice(message: Omit<DownloadNoticeMessage, 'type'>): void {
  listener({ ...message, type: 'DOWNLOAD_NOTICE', clientRunId: send.mock.calls.filter(call => call[0].type === 'START_LIBRARY_DOWNLOAD').slice(-1)[0]![0].clientRunId })
}
beforeEach(async () => {
  send.mockReset()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: (value: typeof listener) => {
          listener = value
        },
        removeListener: vi.fn(),
      },
    },
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(createElement(Harness)))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

it('rejects a second entrance during startup and retries the original entries', async () => {
  let answer!: (value: unknown) => void
  send
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answer = resolve
        }),
    )
    .mockResolvedValue({ success: true })
  let pending!: Promise<boolean>
  act(() => {
    pending = client.start({ entryIds: ['first'], via: 'drawer' })
  })
  await act(async () => {
    expect(await client.start({ entryIds: ['second'], via: 'reading' })).toBe(false)
  })
  expect(send).toHaveBeenCalledTimes(1)
  await act(async () => {
    answer({ success: true })
    await pending
  })
  act(() => notice({ phase: 'failed', processed: 0, total: 0, missingCount: 0, errorCode: 'DOWNLOAD_FAILED' }))
  await act(async () => client.retry())
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'START_LIBRARY_DOWNLOAD', entryIds: ['first'], via: 'drawer' }))
})

it('remembers cancellation while the backend is still accepting the start', async () => {
  let answer!: (value: unknown) => void
  send
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answer = resolve
        }),
    )
    .mockResolvedValue({ success: true })
  let pending!: Promise<boolean>
  act(() => {
    pending = client.start({ entryIds: ['first'], via: 'selection' })
  })
  act(() => client.cancel())
  expect(send).toHaveBeenCalledTimes(1)
  await act(async () => {
    answer({ success: true })
    await pending
  })
  expect(send).toHaveBeenLastCalledWith({ type: 'CANCEL_DOWNLOAD' })
})

it('retries a failed ZIP as a folder with the same selected entries and media option', async () => {
  send.mockResolvedValue({ success: true })
  await act(async () => {
    await client.start({ entryIds: ['first', 'second'], via: 'selection', form: 'zip', withMedia: false })
  })
  act(() => notice({ phase: 'failed', processed: 0, total: 0, missingCount: 0, errorCode: 'DOWNLOAD_ZIP_FAILED' }))
  expect(client.state.retryForm).toBe('folder')
  expect(client.state.error).toContain('文件夹')
  await act(async () => client.retry())
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ entryIds: ['first', 'second'], via: 'selection', form: 'folder', withMedia: false }))
})

it('ignores other pages while accepting a terminal notice that beats its own start response', async () => {
  let answer!: (value: unknown) => void
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        answer = resolve
      }),
  )
  let pending!: Promise<boolean>
  act(() => {
    pending = client.start({ entryIds: ['first'], via: 'drawer' })
  })
  act(() => listener({ type: 'DOWNLOAD_NOTICE', clientRunId: 'other-page', phase: 'done', processed: 1, total: 1, missingCount: 0 }))
  expect(client.state.phase).toBe('active')
  act(() => notice({ phase: 'done', processed: 1, total: 1, missingCount: 0 }))
  expect(client.state.phase).toBe('done')
  await act(async () => {
    answer({ success: true })
    await pending
  })
  expect(client.state.phase).toBe('done')
})
