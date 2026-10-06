/**
 * Image asset helpers shared by the screenshot service and the fragment store
 * (docs/v2/storage.md §3).
 */
import { nanoid } from 'nanoid'

/** Per-image byte ceiling for a saved screenshot. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const newAssetId = (): string => `asset_${Date.now().toString(36)}_${nanoid(8)}`
export const newScreenshotId = (): string => `shot_${Date.now().toString(36)}_${nanoid(8)}`

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
