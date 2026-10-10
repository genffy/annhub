import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../../../../learning-core/store', () => ({ EntryStore: vi.fn() }))

const tabs = {
  get: vi.fn(),
  captureVisibleTab: vi.fn(),
}
const downloads = { download: vi.fn() }
const runtime: { id: string; getURL: (path: string) => string; lastError?: { message: string } } = {
  id: 'ext-id',
  getURL: path => `chrome-extension://ext-id/${path}`,
}
;(globalThis as any).chrome = { runtime, tabs, downloads }

import { Logger } from '../../../../utils/logger'
import { ScreenshotService } from '../index'

const handlers = ScreenshotService.getInstance().getMessageHandlers()

const page = (tab: Partial<chrome.tabs.Tab> = { id: 7 }, frameId = 0) => ({ id: 'ext-id', url: 'https://evil.example/', tab, frameId }) as chrome.runtime.MessageSender
const library = { id: 'ext-id', url: 'chrome-extension://ext-id/library.html' } as chrome.runtime.MessageSender

describe('CAPTURE_VISIBLE_TAB', () => {
  beforeEach(() => {
    tabs.get.mockReset()
    tabs.captureVisibleTab.mockReset()
    tabs.captureVisibleTab.mockImplementation((_windowId: number, _options: unknown, callback: (dataUrl?: string) => void) => callback('data:image/png;base64,AAAA'))
  })

  it("photographs the sender's own window, not the current one", async () => {
    tabs.get.mockResolvedValue({ id: 7, windowId: 42, active: true })
    const response = await handlers.CAPTURE_VISIBLE_TAB!({}, page({ id: 7, windowId: 42 }))
    expect(response).toMatchObject({ success: true, data: { dataUrl: 'data:image/png;base64,AAAA' } })
    expect(tabs.get).toHaveBeenCalledWith(7)
    expect(tabs.captureVisibleTab).toHaveBeenCalledWith(42, { format: 'png' }, expect.any(Function))
  })

  it('takes nothing for a page that is not the tab on screen: a background tab cannot photograph the one in front', async () => {
    tabs.get.mockResolvedValue({ id: 7, windowId: 42, active: false })
    const response = await handlers.CAPTURE_VISIBLE_TAB!({}, page({ id: 7, windowId: 42 }))
    expect(response.success).toBe(false)
    expect(response.error).toBe('CAPTURE_NOT_VISIBLE')
    expect(response.data).toBeUndefined()
    expect(tabs.captureVisibleTab).not.toHaveBeenCalled()
  })

  it('discards the picture when the user switched tabs while it was taken', async () => {
    tabs.get.mockResolvedValueOnce({ id: 7, windowId: 42, active: true }).mockResolvedValueOnce({ id: 7, windowId: 42, active: false })
    const response = await handlers.CAPTURE_VISIBLE_TAB!({}, page({ id: 7, windowId: 42 }))
    expect(tabs.captureVisibleTab).toHaveBeenCalledTimes(1)
    expect(response).toMatchObject({ success: false, error: 'CAPTURE_NOT_VISIBLE' })
    expect(response.data).toBeUndefined()
  })

  it.each([
    ['an extension page without a tab', library],
    ['a frame inside the page', page({ id: 7, windowId: 42 }, 3)],
    ['a sender with a tab that has no id', page({ windowId: 42 })],
  ])('refuses %s', async (_label, sender) => {
    const response = await handlers.CAPTURE_VISIBLE_TAB!({}, sender)
    expect(response.success).toBe(false)
    // a code the page can localize — never an English sentence that would reach the user
    expect(response.error).toBe('CAPTURE_NOT_VISIBLE')
    expect(tabs.captureVisibleTab).not.toHaveBeenCalled()
  })

  it('answers a capture the browser refused with a stable code, and keeps what it said in the log', async () => {
    tabs.get.mockResolvedValue({ id: 7, windowId: 42, active: true })
    tabs.captureVisibleTab.mockImplementation((_windowId: number, _options: unknown, callback: (dataUrl?: string) => void) => {
      runtime.lastError = { message: 'Cannot access contents of the page.' }
      callback(undefined)
      runtime.lastError = undefined
    })
    const response = await handlers.CAPTURE_VISIBLE_TAB!({}, page({ id: 7, windowId: 42 }))
    expect(response).toMatchObject({ success: false, error: 'CAPTURE_FAILED' })
    expect(JSON.stringify(response)).not.toContain('Cannot access')
    expect(Logger.error).toHaveBeenCalledWith(expect.any(String), 'CAPTURE_FAILED', 'Cannot access contents of the page.')
  })
})

describe('FETCH_IMAGE', () => {
  const fetchMock = vi.fn()
  const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
  const ask = (url: string, sender = page({ id: 7, windowId: 42 })) => handlers.FETCH_IMAGE!({ url }, sender)

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('returns a public image as a data URL, fetched without credentials', async () => {
    fetchMock.mockResolvedValue(png())
    const response = await ask('https://cdn.example.com/a.png')
    expect(response.success).toBe(true)
    expect((response.data as { dataUrl: string }).dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://cdn.example.com/a.png')
    expect(init).toMatchObject({ credentials: 'omit' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    'http://localhost:8080/health',
    'http://127.0.0.1:8080/health',
    'http://192.168.1.1/logo.png',
    'http://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    '/relative.png',
  ])('does not even request %s', async url => {
    const response = await ask(url)
    expect(response.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns no body that is not an image: a CORS-protected API answer stays out of the page', async () => {
    fetchMock.mockResolvedValue(new Response('{"token":"secret"}', { headers: { 'content-type': 'application/json' } }))
    const response = await ask('https://api.example.com/me')
    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
    expect(JSON.stringify(response)).not.toContain('secret')
  })

  it('refuses an answer that a redirect brought from a private address', async () => {
    const redirected = png()
    Object.defineProperty(redirected, 'redirected', { value: true })
    Object.defineProperty(redirected, 'url', { value: 'http://192.168.1.1/camera.png' })
    fetchMock.mockResolvedValue(redirected)
    const response = await ask('https://short.example.com/r/1')
    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
  })

  it('follows a redirect that stays on the public web', async () => {
    const redirected = png()
    Object.defineProperty(redirected, 'redirected', { value: true })
    Object.defineProperty(redirected, 'url', { value: 'https://cdn.example.com/final.png' })
    fetchMock.mockResolvedValue(redirected)
    expect((await ask('https://short.example.com/r/1')).success).toBe(true)
  })

  it('reports an HTTP error without returning a body', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404, headers: { 'content-type': 'image/png' } }))
    expect(await ask('https://cdn.example.com/missing.png')).toMatchObject({ success: false, error: 'IMAGE_FETCH_FAILED' })
    expect(Logger.error).toHaveBeenCalledWith(expect.any(String), 'IMAGE_FETCH_FAILED', 'fetch failed: 404')
  })

  it('serves a content script in a tab only', async () => {
    const response = await ask('https://cdn.example.com/a.png', library)
    expect(response.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('image message validation (RV-BG-02)', () => {
  it('rejects a download with an unsupported extension or mismatched bytes', async () => {
    downloads.download.mockReset()
    downloads.download.mockImplementation((_options, callback) => callback(1))
    const sender = page({ id: 7, windowId: 42 })
    const badExtension = await handlers.DOWNLOAD_IMAGE!({ dataUrl: 'data:image/png;base64,AAAA', extension: 'html' }, sender)
    const badBytes = await handlers.DOWNLOAD_IMAGE!({ dataUrl: 'data:image/png;base64,AAAA', extension: 'png' }, sender)
    expect(badExtension.success).toBe(false)
    expect(badBytes.success).toBe(false)
    expect(downloads.download).not.toHaveBeenCalled()
  })

  it('answers a download the browser refused with a stable code, not its message', async () => {
    const png = `data:image/png;base64,${btoa(String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0))}`
    downloads.download.mockReset()
    downloads.download.mockImplementation((_options, callback) => {
      runtime.lastError = { message: 'Download canceled by the user' }
      callback(undefined)
      runtime.lastError = undefined
    })
    const response = await handlers.DOWNLOAD_IMAGE!({ dataUrl: png, extension: 'png' }, page({ id: 7, windowId: 42 }))
    expect(response).toMatchObject({ success: false, error: 'DOWNLOAD_FAILED' })
    expect(JSON.stringify(response)).not.toContain('canceled')
  })

  it('rejects empty and non-PNG screenshot bytes before storage', async () => {
    const sender = page({ id: 7, windowId: 42 })
    for (const dataUrl of ['data:image/png;base64,', 'data:image/jpeg;base64,AAAA', 'data:image/png;base64,AAAA']) {
      const response = await handlers.SAVE_SCREENSHOT!({ data: { dataUrl, width: 1, height: 1, sourceUrl: 'https://page.example/a', title: 'Shot', via: 'menu' } }, sender)
      expect(response).toMatchObject({ success: false, error: 'ENTRY_ASSET_MISSING' })
    }
  })
})
