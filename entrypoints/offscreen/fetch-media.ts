/**
 * Media fetching for downloads — download.md §5. Runs in the offscreen
 * document on the user's click. The rules are the screenshot proxy's
 * (screenshot.md §2): a public http(s) address only, no credentials, the
 * redirect re-checked, and the response's kind and size read at read time.
 * What fails keeps its address in the Markdown and a line in the README; one
 * request with no progress for the stall window (download.md §5.3) gives up on that item.
 */
import { assertFetchableUrl, sniffImageType, ResourceRefused } from '../../core/fetch-policy'
import { DOWNLOAD_LIMITS, mediaKindOfMime, type DownloadMediaKind } from '../../core/download'

/** A medium this run declines; the code is the README's stable reason, never shown raw. */
export class MediaRefused extends Error {
  constructor(readonly code: 'unreachable' | 'too-large' | 'wrong-type') {
    super(code)
  }
}

/** Playlists of a stream, not a file (download.md §5.2): the link stays, nothing is fetched. */
const PLAYLIST_PATH = /\.(m3u8|mpd)(?:[?#]|$)/i

/** Types a server gives a file it has no better name for; image buckets often send them (screenshot.md §2). */
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-binary'])

/**
 * Fetches one declared medium as a Blob of the kind its element claims.
 * `signal` is the run's: aborting it cancels the item without an outcome.
 */
export async function fetchMedia(raw: string, expected: DownloadMediaKind, signal: AbortSignal): Promise<Blob> {
  const url = guard(raw)
  const controller = new AbortController()
  const forward = () => controller.abort(signal.reason)
  if (signal.aborted) throw createAbort()
  signal.addEventListener('abort', forward, { once: true })
  try {
    let response: Response
    let timer: number | undefined
    try {
      // the stall window also covers the wait for the response's first byte, not only reads of its body
      const stalled = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          controller.abort()
          reject(new MediaRefused('unreachable'))
        }, DOWNLOAD_LIMITS.stallTimeoutMs)
      })
      response = await Promise.race([fetch(url, { credentials: 'omit', signal: controller.signal }), stalled])
    } catch (error) {
      throw error instanceof Error && error.name === 'AbortError' ? createAbort() : new MediaRefused('unreachable')
    } finally {
      window.clearTimeout(timer)
    }
    if (response.redirected) guard(response.url)
    if (!response.ok) throw new MediaRefused('unreachable')
    const blob = expected === 'image' ? await readImageBody(response, controller) : await readMediaBody(response, expected, controller)
    if (mediaKindOfMime(blob.type) !== expected || blob.type === 'image/svg+xml') throw new MediaRefused('wrong-type')
    return blob
  } finally {
    signal.removeEventListener('abort', forward)
  }
}

function guard(raw: string): string {
  try {
    const url = assertFetchableUrl(raw)
    if (PLAYLIST_PATH.test(url.pathname)) throw new MediaRefused('wrong-type')
    return url.href
  } catch (error) {
    if (error instanceof MediaRefused) throw error
    if (error instanceof ResourceRefused) throw new MediaRefused('unreachable')
    throw error
  }
}

function createAbort(): DOMException {
  return new DOMException('The download was cancelled', 'AbortError')
}

/** Reads the body chunk by chunk, giving up when the stall window (download.md §5.3) passes with no byte. */
async function readChunks(response: Response, controller: AbortController, limit: number): Promise<Uint8Array[]> {
  const reader = response.body?.getReader()
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > limit) throw new MediaRefused('too-large')
    return [bytes]
  }
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await reader.cancel().catch(() => undefined)
    throw new MediaRefused('too-large')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    let stall: number | undefined
    const stalled = new Promise<never>((_, reject) => {
      stall = window.setTimeout(() => {
        controller.abort()
        reject(new MediaRefused('unreachable'))
      }, DOWNLOAD_LIMITS.stallTimeoutMs)
    })
    let step: ReadableStreamReadResult<Uint8Array>
    try {
      step = await Promise.race([reader.read(), stalled])
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    } finally {
      window.clearTimeout(stall)
    }
    if (step.done) break
    size += step.value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      throw new MediaRefused('too-large')
    }
    chunks.push(step.value)
  }
  return chunks
}

/** An image body: a declared `image/*`, or a generic bucket whose first bytes sniff as an image (SVG excluded later). */
async function readImageBody(response: Response, controller: AbortController): Promise<Blob> {
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!type.startsWith('image/') && !GENERIC_TYPES.has(type)) throw new MediaRefused('wrong-type')
  const chunks = await readChunks(response, controller, DOWNLOAD_LIMITS.imageMaxBytes)
  if (type.startsWith('image/')) return new Blob(chunks as BlobPart[], { type })
  const sniffed = sniffImageType(firstBytes(chunks, 16))
  if (!sniffed) throw new MediaRefused('wrong-type')
  return new Blob(chunks as BlobPart[], { type: sniffed })
}

/** A video or audio file must be declared `video/*` or `audio/*` (download.md §5.2) — no generic buckets, no sniffing. */
async function readMediaBody(response: Response, expected: DownloadMediaKind, controller: AbortController): Promise<Blob> {
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!type.startsWith(`${expected}/`)) throw new MediaRefused('wrong-type')
  const chunks = await readChunks(response, controller, DOWNLOAD_LIMITS.mediaMaxBytes)
  return new Blob(chunks as BlobPart[], { type })
}

function firstBytes(chunks: Uint8Array[], count: number): Uint8Array {
  const head = new Uint8Array(count)
  let filled = 0
  for (const chunk of chunks) {
    if (filled >= count) break
    const take = Math.min(count - filled, chunk.byteLength)
    head.set(chunk.subarray(0, take), filled)
    filled += take
  }
  return head.subarray(0, filled)
}
