import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DownloadNoticeMessage } from '../../../types/messages'

const send = vi.hoisted(() => vi.fn())
vi.mock('../../../utils/message', () => ({ default: { sendMessage: send } }))
let flow: typeof import('../download-flow')
beforeEach(async () => {
  vi.resetModules()
  send.mockReset()
  vi.useFakeTimers()
  document.body.innerHTML = '<article>First body</article>'
  flow = await import('../download-flow')
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  document.querySelectorAll('[data-ann-ui="download-notice"]').forEach(el => el.remove())
  document.body.innerHTML = ''
})

it.each(['done', 'partial', 'failed', 'cancelled'] as const)('keeps an early %s notice when the start reply arrives afterwards', async phase => {
  let answer!: (value: unknown) => void
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        answer = resolve
      }),
  )
  flow.downloadBlock({ kind: 'article', element: document.querySelector('article')! }, 'capsule')
  flow.onDownloadNotice({ type: 'DOWNLOAD_NOTICE', phase, processed: 1, total: 1, missingCount: 1 } as DownloadNoticeMessage)
  const before = document.querySelector('[data-ann-ui="download-notice"]')!.textContent
  answer({ success: true })
  await Promise.resolve()
  expect(document.querySelector('[data-ann-ui="download-notice"]')!.textContent).toBe(before)
})

it('does not replace the retry body when a second entrance arrives during startup', async () => {
  let answer!: (value: unknown) => void
  send
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answer = resolve
        }),
    )
    .mockResolvedValue({ success: true })
  const article = document.querySelector('article')!
  flow.downloadBlock({ kind: 'article', element: article }, 'capsule')
  article.textContent = 'Second body'
  flow.downloadBlock({ kind: 'article', element: article }, 'capsule')
  expect(send).toHaveBeenCalledTimes(1)
  answer({ success: false, error: 'DOWNLOAD_FAILED' })
  await Promise.resolve()
  document.querySelector<HTMLButtonElement>('[data-ann-ui="download-notice"] button')!.click()
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'START_PAGE_DOWNLOAD', markdown: 'First body' }))
  await Promise.resolve()
})

it('keeps the original page body and retries without ZIP packing after a ZIP error', async () => {
  send.mockResolvedValue({ success: true })
  flow.downloadBlock({ kind: 'article', element: document.querySelector('article')! }, 'capsule')
  await Promise.resolve()
  flow.onDownloadNotice({ type: 'DOWNLOAD_NOTICE', phase: 'failed', processed: 0, total: 0, missingCount: 0, errorCode: 'DOWNLOAD_ZIP_FAILED' })
  expect(document.querySelector('[data-ann-ui="download-notice"]')!.textContent).toContain('文件夹')
  document.querySelector('article')!.textContent = 'Changed page'
  document.querySelector<HTMLButtonElement>('[data-ann-ui="download-notice"] button')!.click()
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ markdown: 'First body', form: 'folder' }))
  await Promise.resolve()
})

it('retries a failed extraction with its original snapshot and refuses a second entrance while extracting', async () => {
  let finish!: (value: unknown) => void
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  flow.downloadMainArticle('popup')
  await Promise.resolve()
  expect(send).toHaveBeenCalledTimes(1)
  const snapshot = send.mock.calls[0]![0]
  expect(snapshot).toMatchObject({ type: 'EXTRACT_DOWNLOAD_PAGE' })
  expect(snapshot.html).toContain('First body')
  flow.downloadBlock({ kind: 'article', element: document.querySelector('article')! }, 'capsule')
  expect(send).toHaveBeenCalledTimes(1)
  finish({ success: false, error: 'DOWNLOAD_FAILED' })
  await Promise.resolve()
  document.querySelector('article')!.textContent = 'Changed page'
  send.mockResolvedValueOnce({ success: true, data: { html: '<p>First body</p>' } }).mockResolvedValue({ success: true })
  document.querySelector<HTMLButtonElement>('[data-ann-ui="download-notice"] button')!.click()
  expect(send).toHaveBeenLastCalledWith(snapshot)
  await Promise.resolve()
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'START_PAGE_DOWNLOAD', markdown: 'First body' }))
  await Promise.resolve()
})
