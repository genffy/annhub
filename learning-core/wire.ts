/**
 * Wire contract for extension → Desktop per-item delivery (docs/v2/storage.md §8).
 *
 * Both ends hash capture fields byte-wise, so canonical JSON is implemented
 * here explicitly instead of relying on platform JSON encoders:
 *   - object keys sorted (code-unit order), no whitespace
 *   - strings escape only " \ and \n \r \t; other control chars as \u00xx
 *     lowercase hex (validation already rejects them in stored text)
 *   - integers render as digits; non-integers round to 6 decimals with
 *     trailing zeros trimmed (rect floats live in [0, 1])
 *   - `undefined` object properties are omitted, like JSON.stringify does
 * The Swift side mirrors this exact algorithm — change both or neither.
 */
import { nanoid } from 'nanoid'
import type { FragmentRecord } from './types'

/** Shared per-image byte ceiling; Desktop answers 413 above it (storage.md §8). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const newAssetId = (): string => `asset_${Date.now().toString(36)}_${nanoid(8)}`
export const newScreenshotId = (): string => `shot_${Date.now().toString(36)}_${nanoid(8)}`

/** A Fragment reduced to its capture fields — `review` never travels (storage.md §8). */
export type FragmentWire = Omit<FragmentRecord, 'review'>

export function toFragmentWire(record: FragmentRecord): FragmentWire {
  const { review: _review, ...wire } = record
  return wire
}

// ── canonical JSON ──────────────────────────────────────────────────────

function canonicalString(text: string): string {
  let out = '"'
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f) out += `\\u${code.toString(16).padStart(4, '0')}`
    else out += ch
  }
  return out + '"'
}

function canonicalNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const fixed = n.toFixed(6)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}

/**
 * An object member holding `undefined` is an absent member, exactly as JSON.stringify (the request
 * body) and the Swift side (nil is omitted) treat it, so the hash covers the bytes that are sent. A
 * record read back from IndexedDB keeps such members — a fragment saved in standard mode has
 * `processing.guess` and, without a page title, `context.sourceTitle` as own `undefined` keys — and
 * throwing on them stopped every real capture from reaching the Desktop. An `undefined` array
 * element is not JSON data and is still rejected rather than silently turned into `null`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'number') return canonicalNumber(value)
  if (typeof value === 'string') return canonicalString(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
    return `{${keys.map(k => `${canonicalString(k)}:${canonicalJson(record[k])}`).join(',')}}`
  }
  throw new Error(`canonicalJson: unsupported value ${typeof value}`)
}

// ── hashing ─────────────────────────────────────────────────────────────

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** SHA-256 over the canonical JSON of a fragment's capture fields (storage.md §8). */
export function fragmentWireHash(wire: FragmentWire): Promise<string> {
  return sha256Hex(canonicalJson(wire))
}

// ── outbox payloads (storage.md §3.4: IDs and metadata only, never bytes) ──

export interface FragmentDeliveryPayload {
  fragmentId: string
  revision: number
}

export interface AssetDeliveryPayload {
  assetId: string
}
