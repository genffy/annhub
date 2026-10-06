import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const tabs = {
  get: vi.fn(),
  captureVisibleTab: vi.fn(),
}
const runtime: { id: string; getURL: (path: string) => string; lastError?: { message: string } } = {
  id: 'ext-id',
  getURL: path => `chrome-extension://ext-id/${path}`,
}
;(globalThis as any).chrome = { runtime, tabs }

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
    const response = await handlers.CAPTURE_VISIBLE_TAB!({ requestId: 'r1' }, page({ id: 7, windowId: 42 }))
    expect(response).toMatchObject({ success: true, data: { dataUrl: 'data:image/png;base64,AAAA', requestId: 'r1' } })
    expect(tabs.get).toHaveBeenCalledWith(7)
    expect(tabs.captureVisibleTab).toHaveBeenCalledWith(42, { format: 'png' }, expect.any(Function))
  })

  it('takes nothing for a page that is not the tab on screen: a background tab cannot photograph the one in front', async () => {
    tabs.get.mockResolvedValue({ id: 7, windowId: 42, active: false })
    const response = await handlers.CAPTURE_VISIBLE_TAB!({ requestId: 'r2' }, page({ id: 7, windowId: 42 }))
    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
    expect(tabs.captureVisibleTab).not.toHaveBeenCalled()
  })

  it('discards the picture when the user switched tabs while it was taken', async () => {
    tabs.get.mockResolvedValueOnce({ id: 7, windowId: 42, active: true }).mockResolvedValueOnce({ id: 7, windowId: 42, active: false })
    const response = await handlers.CAPTURE_VISIBLE_TAB!({ requestId: 'r3' }, page({ id: 7, windowId: 42 }))
    expect(tabs.captureVisibleTab).toHaveBeenCalledTimes(1)
    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
  })

  it('discards the picture when the tab moved to another window while it was taken', async () => {
    tabs.get.mockResolvedValueOnce({ id: 7, windowId: 42, active: true }).mockResolvedValueOnce({ id: 7, windowId: 43, active: true })
    const response = await handlers.CAPTURE_VISIBLE_TAB!({ requestId: 'r4' }, page({ id: 7, windowId: 42 }))
    expect(response.success).toBe(false)
  })

  it.each([
    ['an extension page without a tab', library],
    ['a frame inside the page', page({ id: 7, windowId: 42 }, 3)],
    ['a sender with a tab that has no id', page({ windowId: 42 })],
  ])('refuses %s', async (_label, sender) => {
    const response = await handlers.CAPTURE_VISIBLE_TAB!({ requestId: 'r5' }, sender)
    expect(response.success).toBe(false)
    expect(tabs.captureVisibleTab).not.toHaveBeenCalled()
  })

  it('reports a capture the browser refused, with what it said', async () => {
    tabs.get.mockResolvedValue({ id: 7, windowId: 42, active: true })
    tabs.captureVisibleTab.mockImplementation((_windowId: number, _options: unknown, callback: (dataUrl?: string) => void) => {
      runtime.lastError = { message: 'Cannot access contents of the page.' }
      callback(undefined)
      runtime.lastError = undefined
    })
    const response = await handlers.CAPTURE_VISIBLE_TAB!({ requestId: 'r6' }, page({ id: 7, windowId: 42 }))
    expect(response).toMatchObject({ success: false, error: 'Cannot access contents of the page.' })
  })
})

describe('FETCH_RESOURCE', () => {
  const fetchMock = vi.fn()
  const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
  const ask = (url: string, sender = page({ id: 7, windowId: 42 })) => handlers.FETCH_RESOURCE!({ data: { url } }, sender)

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
    expect(await ask('https://cdn.example.com/missing.png')).toMatchObject({ success: false, error: 'fetch failed: 404' })
  })

  it('serves a content script in a tab only', async () => {
    const response = await ask('https://cdn.example.com/a.png', library)
    expect(response.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the screenshot library messages', () => {
  it.each(['GET_SCREENSHOTS', 'DELETE_SCREENSHOT'])('%s answers an extension page and not a content script', async type => {
    const response = await handlers[type]!({ data: { id: 'x' } }, page({ id: 7, windowId: 42 }))
    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
  })
})
