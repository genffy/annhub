/**
 * Desktop connection status shared by the library header and the toolbar popup
 * (extension.md §6): four states plus paired-but-offline. Always rendered as a
 * dot plus text — colour is never the only signal (§10.1).
 */
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

/** 相对时间（extension.md §5.3）：刚刚 / N 分钟前 / N 小时前 / N 天前 / 超过 7 天回落日期。 */
export function relativeTime(epochMs: number, now = Date.now()): string {
  const delta = now - epochMs
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)} 天前`
  return new Date(epochMs).toLocaleDateString()
}

export function connectionView(connection: Connection, now = Date.now()): { state: ConnectionState; label: string } {
  const pending = connection.pendingFragments + connection.pendingAssets
  if (!connection.paired) return { state: 'unpaired', label: '未配置' }
  if (connection.lastError) return { state: 'error', label: '交付错误' }
  if (pending > 0) return { state: 'pending', label: `待发送 ${connection.pendingFragments} 条碎片 · ${connection.pendingAssets} 张图片` }
  if (connection.online) return { state: 'connected', label: connection.lastSyncAt ? `已连接 / ${relativeTime(connection.lastSyncAt, now)}交付` : '已连接' }
  return { state: 'offline', label: '未连接' }
}
