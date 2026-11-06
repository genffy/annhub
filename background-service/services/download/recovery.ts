/** Only routing and coarse metric fields survive a worker restart; never page text or media. */
import type { DownloadForm, DownloadVia } from '../../../types/messages'

export type DownloadOrigin = { kind: 'tab'; tabId: number } | { kind: 'page'; clientRunId?: string }
export interface DownloadRunMetric {
  source: 'page' | 'library'
  via: DownloadVia
  scope: 'block' | 'page' | 'entry' | 'multi'
  form: DownloadForm
  blockKind?: string
}
export interface InterruptedDownload {
  requestId: string
  origin: DownloadOrigin
  metric: DownloadRunMetric
}
const KEY = 'annhub.download.active'

export async function rememberDownload(run: InterruptedDownload): Promise<void> {
  if (!chrome.storage.session) return
  await chrome.storage.session.set({ [KEY]: { requestId: run.requestId, origin: run.origin, metric: run.metric } })
}

export async function interruptedDownload(): Promise<InterruptedDownload | undefined> {
  if (!chrome.storage.session) return undefined
  const value = (await chrome.storage.session.get(KEY))[KEY] as InterruptedDownload | undefined
  return value?.requestId && value.origin && value.metric ? value : undefined
}

export async function forgetDownload(requestId: string): Promise<void> {
  if (!chrome.storage.session) return
  const current = await interruptedDownload()
  if (current?.requestId === requestId) await chrome.storage.session.remove(KEY)
}
