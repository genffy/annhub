/**
 * ID and digest helpers for entries, highlights and image assets
 * (docs/v2/entry.md §3, storage.md §4).
 */
import { nanoid } from 'nanoid'

/** Per-image byte ceiling for a saved screenshot (initial value; Q-03 calibrates it). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const time36 = (): string => Date.now().toString(36)

export const newEntryId = (): string => `ent_${time36()}_${nanoid(8)}`
export const newHighlightId = (): string => `hl_${time36()}_${nanoid(6)}`
export const newAssetId = (): string => `asset_${time36()}_${nanoid(8)}`

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
