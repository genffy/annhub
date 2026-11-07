/**
 * The worker that owns the recording's route is suspended after ~30 s idle,
 * and only incoming messages reset that timer (Chrome's service worker
 * lifecycle). While a recording runs, or a finished video waits for the disk,
 * this document pings the worker every 10 s so the popup, the badge and the
 * stop paths stay reachable (annotate.md §2.4, RV-REC-02).
 */

/** Starts the 10 s ping; the returned stopper is what RECORDING_CLEANUP leads to. */
export function startHeartbeat(send: () => void, intervalMs = 10_000): () => void {
  const timer = window.setInterval(send, intervalMs)
  return () => window.clearInterval(timer)
}

let stopHeartbeat: (() => void) | null = null

/** One call site per state change: pings while there is something to keep alive, stops when there is not. */
export function syncHeartbeat(send: () => void, active: boolean): void {
  if (active && stopHeartbeat === null) stopHeartbeat = startHeartbeat(send)
  if (!active && stopHeartbeat !== null) {
    stopHeartbeat()
    stopHeartbeat = null
  }
}
