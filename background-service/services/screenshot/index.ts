/**
 * Background service for the screenshot capture chain (docs/v2/screenshot.md,
 * storage.md §3.5): viewport capture via chrome.tabs.captureVisibleTab, PNG
 * download into AnnHub/, and library persistence.
 *
 * Persistence now writes processed image BYTES as a Blob plus screenshot
 * metadata into the shared fragment-store (`assets` + `screenshots` object
 * stores, one transaction) — dataUrl is only a transport for downloads.
 */
import type { IService } from '../../service-manager'
import type { ResponseMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isTopFrameTabSender } from '../../sender'
import { RESOURCE_TIMEOUT_MS, assertFetchableUrl, readImage } from './fetch-policy'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import { uiText } from '../../../utils/ui-text'
import { quotaAvailable } from '../../../utils/storage-quota'
import { FragmentStore } from '../../../learning-core/fragment-store'
import { sha256Hex, MAX_IMAGE_BYTES } from '../../../learning-core/wire'
import type { ImageAsset, ScreenshotRecord } from '../../../learning-core/types'

export class ScreenshotService implements IService {
  readonly name = 'screenshot' as const
  private static instance: ScreenshotService | null = null
  private initialized = false
  private store: FragmentStore

  private constructor() {
    this.store = new FragmentStore('fragment-store')
  }

  static getInstance(): ScreenshotService {
    if (!ScreenshotService.instance) {
      ScreenshotService.instance = new ScreenshotService()
    }
    return ScreenshotService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.store.initialize()
    this.initialized = true
    Logger.info('[ScreenshotService] Initialized (shared fragment-store v4 assets)')
  }

  getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
    return {
      CAPTURE_VISIBLE_TAB: async (message, sender) => {
        const requestId = (message as { requestId?: string }).requestId ?? 'unknown'
        try {
          const dataUrl = await this.captureSenderTab(sender)
          Logger.info(`[ScreenshotService] Captured visible tab (request ${requestId})`)
          return MessageUtils.createResponse(true, { dataUrl, requestId })
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          Logger.error(`[ScreenshotService] captureVisibleTab failed (request ${requestId}):`, detail)
          return MessageUtils.createResponse(false, undefined, detail)
        }
      },

      SAVE_SCREENSHOT: async message => {
        try {
          const {
            bytes,
            dataUrl,
            filename,
            mimeType = 'image/png',
            persist,
            download = false,
            sourceUrl,
            sourceTitle,
            capturedAt,
          } = (
            message as {
              data: {
                bytes?: Blob
                dataUrl?: string
                filename: string
                mimeType?: ImageAsset['mimeType']
                persist?: boolean
                download?: boolean
                sourceUrl?: string
                sourceTitle?: string
                capturedAt?: number
              }
            }
          ).data
          if (!download && !persist) throw new Error(uiText('shot.error.noAction'))
          if (persist && !bytes && !dataUrl) throw new Error(uiText('shot.error.noData'))

          let library: { screenshot: ScreenshotRecord; asset: ImageAsset } | undefined
          if (persist) {
            const blob = bytes ?? dataUrlToBlob(dataUrl!)
            if (blob.size > MAX_IMAGE_BYTES) {
              throw new Error(uiText('shot.error.tooLarge', { limit: Math.round(MAX_IMAGE_BYTES / 1024 / 1024), size: Math.round(blob.size / 1024 / 1024) }))
            }
            // Quota guard (roadmap R1.4): report failure and keep the session
            // retryable — never show a successful save that wasn't persisted.
            if (!(await quotaAvailable(blob.size))) {
              throw new Error(uiText('shot.error.quota'))
            }
            const digest = await sha256Hex(new Uint8Array(await blobBytes(blob)))
            const dimensions = await imageDimensions(blob)
            library = await this.store.saveScreenshotWithAsset({
              bytes: blob,
              mimeType: mimeType,
              sha256: digest,
              width: dimensions.width,
              height: dimensions.height,
              sourceUrl: sourceUrl ?? '',
              sourceTitle,
              capturedAt,
            })
          }
          const downloadId = download ? await this.downloadDataUrl(dataUrl ?? (bytes ? await blobToDataUrl(bytes) : ''), filename) : undefined
          Logger.info(`[ScreenshotService] Saved screenshot ${filename} (download ${downloadId}${library ? `, library ${library.screenshot.id}` : ''})`)
          return MessageUtils.createResponse(true, { downloadId, filename, screenshot: library?.screenshot, asset: library?.asset })
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          Logger.error('[ScreenshotService] Failed to save screenshot:', detail)
          return MessageUtils.createResponse(false, undefined, detail)
        }
      },

      FETCH_RESOURCE: async (message, sender) => {
        // Only a page's own content script asks for this, and only to inline an image into an element capture.
        if (!isTopFrameTabSender(sender)) return MessageUtils.createResponse(false, undefined, 'Forbidden: a tab is required')
        try {
          const { url } = (message as { data: { url: string } }).data
          const dataUrl = await this.fetchAsDataUrl(url)
          return MessageUtils.createResponse(true, { dataUrl })
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          return MessageUtils.createResponse(false, undefined, detail)
        }
      },

      GET_SCREENSHOTS: async (_message, sender) => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          return MessageUtils.createResponse(true, await this.store.listScreenshots())
        } catch (error) {
          return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : String(error))
        }
      },

      DELETE_SCREENSHOT: async (message, sender) => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          const { id } = (message as { data: { id: string } }).data
          await this.store.deleteScreenshot(id)
          return MessageUtils.createResponse(true, { id })
        } catch (error) {
          return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : String(error))
        }
      },
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }

  async cleanup(): Promise<void> {
    this.initialized = false
    Logger.info('[ScreenshotService] Cleaned up')
  }

  getStore(): FragmentStore {
    return this.store
  }

  /**
   * Photographs the tab that asked, and only while it is the one on screen. `captureVisibleTab`
   * takes the active tab of a window whoever asks, so the current window's tab was whatever the user
   * happened to be looking at: a page in a background tab or another window could have had a picture
   * of it. The window is the sender's own, and the sender must be its active tab both before and after
   * the capture (a tab switch in between would otherwise hand back another page).
   */
  private async captureSenderTab(sender: chrome.runtime.MessageSender): Promise<string> {
    const notVisible = () => new Error(uiText('shot.error.notVisible'))
    if (!isTopFrameTabSender(sender)) throw notVisible()
    const tabId = sender.tab!.id!
    const before = await chrome.tabs.get(tabId)
    if (!before.active) throw notVisible()
    const dataUrl = await captureWindow(before.windowId)
    const after = await chrome.tabs.get(tabId)
    if (!after.active || after.windowId !== before.windowId) throw notVisible()
    return dataUrl
  }

  /**
   * Cross-origin resource fetch for element capture image inlining. The extension's <all_urls> host
   * permission lets the background bypass page CORS, which the page-context fetch html-to-image does
   * cannot; `fetch-policy.ts` is what keeps that from being a proxy to the user's own network.
   */
  private async fetchAsDataUrl(raw: string): Promise<string> {
    const url = assertFetchableUrl(raw)
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS) })
    // A redirect can lead anywhere: the address the answer finally came from has to pass too.
    if (response.redirected) assertFetchableUrl(response.url)
    if (!response.ok) throw new Error(`fetch failed: ${response.status}`)
    return blobToDataUrl(await readImage(response))
  }

  private downloadDataUrl(dataUrl: string, filename: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, downloadId => {
        const error = chrome.runtime.lastError
        if (error || downloadId === undefined) {
          reject(new Error(error?.message || 'download failed'))
          return
        }
        resolve(downloadId)
      })
    })
  }
}

// PNG keeps text crisp; the viewport-only limitation is documented in docs/v2/screenshot.md:
// region capture uses viewport pixels.
function captureWindow(windowId: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, dataUrl => {
      const error = chrome.runtime.lastError
      if (error || !dataUrl) {
        reject(new Error(error?.message || 'captureVisibleTab returned no image'))
        return
      }
      resolve(dataUrl)
    })
  })
}

// ── blob helpers (SW-safe; FileReader fallback for jsdom) ───────────────

async function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('BLOB_READ_FAILED'))
    reader.readAsArrayBuffer(blob)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(blob)
    const { width, height } = bitmap
    bitmap.close()
    return { width, height }
  } catch {
    // Decoding failed — record zeros rather than blocking the save; the ZIP
    // export reads real bytes regardless.
    return { width: 0, height: 0 }
  }
}
