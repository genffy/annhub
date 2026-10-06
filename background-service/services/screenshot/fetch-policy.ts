/**
 * What the service worker will fetch for an element capture (docs/v2/screenshot.md §2).
 *
 * The worker holds the `<all_urls>` host permission, so a fetch from it ignores the page's CORS rules
 * and is made from this machine's network position. Asked for any URL it would be an open proxy to
 * whatever the machine can reach — a localhost service, the intranet, a router — for anyone who can
 * put a URL in front of it, and the page chooses the `<img src>` an element capture starts from. So
 * it fetches only a web address that is not on a private network, without credentials, and hands back
 * only an image no larger than the library accepts. What fails these is left to the element capture's
 * own fallback: the image keeps its address and renders if the page itself can load it.
 */
import { MAX_IMAGE_BYTES } from '../../../learning-core/assets'

export const RESOURCE_MAX_BYTES = MAX_IMAGE_BYTES
export const RESOURCE_TIMEOUT_MS = 15_000

/** A resource this worker declines to fetch or return; the message is for logs, not for people. */
export class ResourceRefused extends Error {}

/** The URL to fetch, or a `ResourceRefused` saying why not. */
export function assertFetchableUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ResourceRefused('not an absolute URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ResourceRefused(`${url.protocol} is not fetched`)
  if (url.username || url.password) throw new ResourceRefused('the address carries credentials')
  if (isPrivateHost(url.hostname)) throw new ResourceRefused('the address is on a private network')
  return url
}

const PRIVATE_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.home', '.private']

/**
 * True for a host name that names this machine or a private network, and for any address in a
 * private, loopback, link-local, multicast or reserved range. It reads what the URL parser leaves:
 * every numeric spelling of an IPv4 address (`2130706433`, `0x7f.1`) is already dotted decimal there.
 * A public name that resolves to a private address cannot be told apart from here.
 */
export function isPrivateHost(hostname: string): boolean {
  let host = hostname.toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (host.endsWith('.')) host = host.slice(0, -1)
  if (host === '') return true
  if (host.includes(':')) return isPrivateIPv6(host)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isPrivateIPv4(host.split('.').map(Number))
  // A name with one label (`printer`, `intranet`) only resolves through the local search domains.
  if (!host.includes('.')) return true
  return PRIVATE_SUFFIXES.some(suffix => host.endsWith(suffix))
}

function isPrivateIPv4([a = 0, b = 0, c = 0]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, and the cloud metadata address
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  )
}

/** The eight 16-bit groups of an IPv6 literal, or undefined when it does not parse. */
function ipv6Groups(literal: string): number[] | undefined {
  let text = literal
  let embedded: number[] | undefined
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)
  if (dotted) {
    const [a = 0, b = 0, c = 0, d = 0] = dotted.slice(1).map(Number)
    if ([a, b, c, d].some(part => part > 255)) return undefined
    embedded = [(a << 8) | b, (c << 8) | d]
    text = `${text.slice(0, dotted.index)}0:0`
  }
  const halves = text.split('::')
  if (halves.length > 2) return undefined
  const groupsOf = (part: string | undefined) => (part ? part.split(':').map(group => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN)) : [])
  const head = groupsOf(halves[0])
  const rest = halves.length === 2 ? groupsOf(halves[1]) : []
  let groups: number[]
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length
    if (missing < 1) return undefined
    groups = [...head, ...new Array<number>(missing).fill(0), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== 8 || groups.some(Number.isNaN)) return undefined
  if (embedded) [groups[6], groups[7]] = embedded as [number, number]
  return groups
}

function isPrivateIPv6(literal: string): boolean {
  const groups = ipv6Groups(literal)
  if (!groups) return true // not an address we can read: not one we fetch from
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups
  const v4 = [g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]
  if (groups.slice(0, 7).every(group => group === 0) && g7 <= 1) return true // :: and ::1
  if ((g0 & 0xfe00) === 0xfc00) return true // unique local, fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true // link-local, fe80::/10
  if ((g0 & 0xff00) === 0xff00) return true // multicast
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) return isPrivateIPv4(v4) // ::ffff:a.b.c.d and ::a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPrivateIPv4(v4) // NAT64
  if (g0 === 0x2002) return isPrivateIPv4([g1 >> 8, g1 & 255, g2 >> 8, g2 & 255]) // 6to4
  return false
}

/** Types a server gives to a file it has no better name for; storage buckets often send them for images. */
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-binary'])

/** The image type the first bytes say, for the formats a page's `<img>` loads from a bucket that names no type. */
export function sniffImageType(head: Uint8Array): string | undefined {
  const at = (offset: number, ...bytes: number[]) => bytes.every((byte, index) => head[offset + index] === byte)
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'
  if (at(4, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69)) return 'image/avif' // ftypavi(f|s)
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return 'image/x-icon'
  if (at(0, 0x42, 0x4d)) return 'image/bmp'
  return undefined
}

/**
 * The body of an image response, refusing anything that is not an image or is over `limit` bytes.
 * An image is what the server says is one, or, when it names no type, what its first bytes show.
 */
export async function readImage(response: Response, limit = RESOURCE_MAX_BYTES): Promise<Blob> {
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const declaredImage = type.startsWith('image/')
  if (!declaredImage && !GENERIC_TYPES.has(type)) throw new ResourceRefused('the response is not an image')
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new ResourceRefused('the image is too large')

  const chunks: Uint8Array[] = []
  const reader = response.body?.getReader()
  if (reader) {
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new ResourceRefused('the image is too large')
      }
      chunks.push(value)
    }
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > limit) throw new ResourceRefused('the image is too large')
    chunks.push(bytes)
  }
  if (declaredImage) return new Blob(chunks as BlobPart[], { type })
  const sniffed = sniffImageType(firstBytes(chunks, 16))
  if (!sniffed) throw new ResourceRefused('the response is not an image')
  return new Blob(chunks as BlobPart[], { type: sniffed })
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
