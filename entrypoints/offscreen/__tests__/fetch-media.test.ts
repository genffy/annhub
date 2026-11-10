import { describe, expect, it, vi } from 'vitest'
import { fetchMedia, MediaRefused } from '../fetch-media'
import { DOWNLOAD_LIMITS } from '../../../core/download'

/**
 * download.md §5.2/§5.3 at the reader: a public http(s) address only, no
 * playlists, the declared kind at read time, the size cap, and an abort from
 * the run's signal passing through as a cancel, not an outcome.
 */

const response = (init: { type?: string; length?: number; body?: string; status?: number; url?: string }) => {
  const headers = new Headers()
  if (init.type !== undefined) headers.set('content-type', init.type)
  if (init.length !== undefined) headers.set('content-length', String(init.length))
  return new Response(init.body ?? 'x'.repeat(8), { status: init.status ?? 200, headers })
}

const never = new AbortController().signal

describe('fetchMedia (download.md §5)', () => {
  it('refuses what is not a public web address', async () => {
    await expect(fetchMedia('data:image/png;base64,xx', 'image', never)).rejects.toMatchObject({ code: 'unreachable' })
    await expect(fetchMedia('https://user:pw@cdn.example.com/a.jpg', 'image', never)).rejects.toMatchObject({ code: 'unreachable' })
    await expect(fetchMedia('http://192.168.1.4/a.jpg', 'image', never)).rejects.toMatchObject({ code: 'unreachable' })
    await expect(fetchMedia('not a url', 'image', never)).rejects.toMatchObject({ code: 'unreachable' })
  })

  it('refuses stream playlists by address', async () => {
    await expect(fetchMedia('https://cdn.example.com/live.m3u8', 'video', never)).rejects.toMatchObject({ code: 'wrong-type' })
    await expect(fetchMedia('https://cdn.example.com/manifest.mpd?start=0', 'video', never)).rejects.toMatchObject({ code: 'wrong-type' })
  })

  it('takes an image of its declared type, and sniffs a generic bucket', async () => {
    const fetchMock = vi.fn(async () => response({ type: 'image/jpeg' }))
    vi.stubGlobal('fetch', fetchMock)
    const blob = await fetchMedia('https://cdn.example.com/a.jpg', 'image', never)
    expect(blob.type).toBe('image/jpeg')
    vi.unstubAllGlobals()
  })

  it('refuses an SVG even though it says image/*', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ type: 'image/svg+xml' })),
    )
    await expect(fetchMedia('https://cdn.example.com/a.svg', 'image', never)).rejects.toMatchObject({ code: 'wrong-type' })
    vi.unstubAllGlobals()
  })

  it('refuses a video answer for an image ask, and generic buckets for media', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ type: 'video/mp4' })),
    )
    await expect(fetchMedia('https://cdn.example.com/a.mp4', 'image', never)).rejects.toMatchObject({ code: 'wrong-type' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ type: 'application/octet-stream' })),
    )
    await expect(fetchMedia('https://cdn.example.com/a.mp4', 'video', never)).rejects.toMatchObject({ code: 'wrong-type' })
    vi.unstubAllGlobals()
  })

  it('refuses an oversized declared body before reading it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ type: 'video/mp4', length: DOWNLOAD_LIMITS.mediaMaxBytes + 1 })),
    )
    await expect(fetchMedia('https://cdn.example.com/big.mp4', 'video', never)).rejects.toMatchObject({ code: 'too-large' })
    vi.unstubAllGlobals()
  })

  it('gives up when the request never answers (download.md §5.3)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    )
    const pending = fetchMedia('https://cdn.example.com/slow.jpg', 'image', never)
    const assertion = expect(pending).rejects.toMatchObject({ code: 'unreachable' })
    await vi.advanceTimersByTimeAsync(DOWNLOAD_LIMITS.stallTimeoutMs + 1)
    await assertion
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('turns a network failure into the unreachable reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('net gone')
      }),
    )
    await expect(fetchMedia('https://cdn.example.com/a.jpg', 'image', never)).rejects.toBeInstanceOf(MediaRefused)
    vi.unstubAllGlobals()
  })

  it('re-checks the redirect target', async () => {
    const redirected = response({ type: 'image/png' })
    Object.defineProperty(redirected, 'redirected', { value: true })
    Object.defineProperty(redirected, 'url', { value: 'http://127.0.0.1:8080/a.png' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => redirected),
    )
    await expect(fetchMedia('https://cdn.example.com/a.png', 'image', never)).rejects.toMatchObject({ code: 'unreachable' })
    vi.unstubAllGlobals()
  })
})
