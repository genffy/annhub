/**
 * Storage quota pre-check (storage.md §5): a write is refused up front when the
 * origin cannot hold it, so the UI never shows success before a failed commit.
 * `quotaSatisfied` is pure so tests can drive it without real storage.
 */
export function quotaSatisfied(estimate: { usage?: number; quota?: number } | null | undefined, requiredBytes: number, headroom = 1.2): boolean {
  if (!estimate || typeof estimate.quota !== 'number') return true // the browser reports no quota — nothing to compare
  const usage = typeof estimate.usage === 'number' ? estimate.usage : 0
  return estimate.quota - usage > requiredBytes * headroom
}

export async function quotaAvailable(requiredBytes: number): Promise<boolean> {
  if (!navigator.storage?.estimate) return true
  return quotaSatisfied(await navigator.storage.estimate(), requiredBytes)
}
