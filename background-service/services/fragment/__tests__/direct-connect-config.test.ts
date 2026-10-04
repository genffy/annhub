import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const store: Record<string, unknown> = {}
;(globalThis as any).chrome = {
  runtime: { id: 'ext-id', getURL: (path: string) => `chrome-extension://ext-id/${path}`, onMessage: { addListener: vi.fn() } },
  storage: {
    local: {
      get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
      set: vi.fn(async (entries: Record<string, unknown>) => void Object.assign(store, entries)),
    },
  },
}

import { FragmentService } from '../index'
import { DIRECT_CONNECT_STORAGE_KEY } from '../direct-connect'
import { fragmentMessageHandlers } from '../message-handles'

const SECRET = 'PAIR-SECRET-1234'
const settingsPage = { id: 'ext-id', url: 'chrome-extension://ext-id/options.html' } as chrome.runtime.MessageSender
const contentScript = { id: 'ext-id', url: 'https://news.example/post', tab: { id: 7 } } as chrome.runtime.MessageSender

function service() {
  return FragmentService.getInstance()
}

describe('direct-connect configuration', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
    vi.restoreAllMocks()
    // The status block reads the IndexedDB outbox, which jsdom does not have; the config is what is under test.
    vi.spyOn(service(), 'getDeliveryStats').mockResolvedValue({ pendingFragments: 0, pendingAssets: 0, rejected: 0 })
    vi.spyOn(service(), 'getDeliveryState').mockResolvedValue({})
    vi.spyOn(service(), 'getRejectedDeliveries').mockResolvedValue([])
  })

  it('never returns the pairing code to a page, only whether one is stored', async () => {
    await service().setDirectConnectConfig({ token: SECRET, autoSync: true })

    const response = await fragmentMessageHandlers.GET_DESKTOP_DIRECT_CONNECT!({}, settingsPage)
    expect(response.success).toBe(true)
    expect(response.data.config).toEqual({ endpoint: 'http://127.0.0.1:8765', autoSync: true, hasToken: true })
    expect(JSON.stringify(response)).not.toContain(SECRET)

    const saved = await fragmentMessageHandlers.SET_DESKTOP_DIRECT_CONNECT!({ config: { token: SECRET } }, settingsPage)
    expect(JSON.stringify(saved)).not.toContain(SECRET)
  })

  it('refuses to read the connection from a content script', async () => {
    await service().setDirectConnectConfig({ token: SECRET })

    const response = await fragmentMessageHandlers.GET_DESKTOP_DIRECT_CONNECT!({}, contentScript)
    expect(response.success).toBe(false)
    expect(response.data).toBeUndefined()
    expect(JSON.stringify(response)).not.toContain(SECRET)
  })

  it('keeps the stored code when a save leaves the token out, and unpairs on an empty one', async () => {
    await service().setDirectConnectConfig({ token: SECRET })
    await service().setDirectConnectConfig({ autoSync: true })
    expect((await service().getDirectConnectConfig()).token).toBe(SECRET)

    expect(await service().setDirectConnectConfig({ token: '  ' })).toMatchObject({ hasToken: false })
    expect((await service().getDirectConnectConfig()).token).toBe('')
  })

  it.each(['https://evil.example', 'http://evil.example:8765', 'http://127.0.0.1@evil.example', 'http://127.0.0.1:8765/path'])(
    'rejects the endpoint %s and stores nothing',
    async endpoint => {
      await expect(service().setDirectConnectConfig({ endpoint, token: SECRET })).rejects.toThrow()
      expect(store[DIRECT_CONNECT_STORAGE_KEY]).toBeUndefined()

      const response = await fragmentMessageHandlers.SET_DESKTOP_DIRECT_CONNECT!({ config: { endpoint } }, settingsPage)
      expect(response.success).toBe(false)
      expect(response.error).toContain('127.0.0.1')
    },
  )

  it('stores a normalized loopback endpoint', async () => {
    expect(await service().setDirectConnectConfig({ endpoint: ' http://localhost:9000/ ' })).toMatchObject({ endpoint: 'http://localhost:9000' })
  })

  it('ignores a non-loopback endpoint that is already in storage, so the code is never sent there', async () => {
    store[DIRECT_CONNECT_STORAGE_KEY] = { endpoint: 'https://evil.example', token: SECRET, autoSync: true }
    expect((await service().getDirectConnectConfig()).endpoint).toBe('http://127.0.0.1:8765')

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await service().pingDirectConnect()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL((fetchMock.mock.calls[0] as unknown as [string])[0]).hostname).toBe('127.0.0.1')
    vi.unstubAllGlobals()
  })
})
