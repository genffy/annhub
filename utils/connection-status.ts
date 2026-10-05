/**
 * Desktop connection status shared by the library header and the toolbar popup
 * (extension.md §6): four states plus paired-but-offline. Always rendered as a
 * dot plus text — colour is never the only signal (§10.1).
 */
import { uiCount, uiText, type UiLanguage } from './ui-text'

export interface Connection {
  online: boolean
  paired: boolean
  detail: string
  pendingFragments: number
  pendingAssets: number
  lastError?: string
  lastSyncAt?: number
}

export type ConnectionState = 'unpaired' | 'error' | 'pending' | 'connected' | 'offline'

/** Relative time (extension.md §5.3): just now / N min / N h / N days, then the date after 7 days. */
export function relativeTime(epochMs: number, now = Date.now(), lang?: UiLanguage): string {
  const delta = now - epochMs
  if (delta < 60_000) return uiText('time.justNow', {}, lang)
  if (delta < 3_600_000) return uiText('time.minutesAgo', { count: Math.floor(delta / 60_000) }, lang)
  if (delta < 86_400_000) return uiText('time.hoursAgo', { count: Math.floor(delta / 3_600_000) }, lang)
  if (delta < 7 * 86_400_000) return uiCount('time.daysAgo', Math.floor(delta / 86_400_000), {}, lang)
  return new Date(epochMs).toLocaleDateString()
}

export function connectionView(connection: Connection, now = Date.now(), lang?: UiLanguage): { state: ConnectionState; label: string } {
  const pending = connection.pendingFragments + connection.pendingAssets
  if (!connection.paired) return { state: 'unpaired', label: uiText('connection.unpaired', {}, lang) }
  if (connection.lastError) return { state: 'error', label: uiText('connection.error', {}, lang) }
  if (pending > 0) return { state: 'pending', label: uiText('connection.pending', { fragments: connection.pendingFragments, assets: connection.pendingAssets }, lang) }
  if (connection.online) {
    return {
      state: 'connected',
      label: connection.lastSyncAt ? uiText('connection.connectedAt', { time: relativeTime(connection.lastSyncAt, now, lang) }, lang) : uiText('connection.connected', {}, lang),
    }
  }
  return { state: 'offline', label: uiText('connection.offline', {}, lang) }
}
