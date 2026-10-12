/**
 * Background service for the screenshot chain (docs/v2/screenshot.md §2, §4):
 * viewport capture of the asking tab only, cross-origin image proxying under
 * the fetch policy, PNG download, and library persistence as a screenshot
 * entry whose asset commits in the same transaction.
 */
import type { IService } from '../../service-manager'
import type { ResponseMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isTopFrameTabSender, rememberCapture } from '../../sender'
import { RESOURCE_TIMEOUT_MS, assertFetchableUrl, readImage } from './fetch-policy'
import { initializedEntryStore } from '../../store-instance'
import { presetProperties } from '../../../learning-core/properties'
import { cleanSourceUrl } from '../../../learning-core/url'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import { recordCaptureSaved, recordCaptureFailed, recordEvent } from '../metrics/record'
import { EntryValidationError } from '../../../learning-core/types'
import { storageErrorCode } from '../errors'
import { CaptureError } from './capture-error'
import { frameRecordFrom, readFrame, rememberFrame } from './frame-memory'

export class ScreenshotService implements IService {
  readonly name = 'screenshot' as const
  private static instance: ScreenshotService | null = null
  private initialized = false

  static getInstance(): ScreenshotService {
    ScreenshotService.instance ??= new ScreenshotService()
    return ScreenshotService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await initializedEntryStore()
    this.initialized = true
    Logger.info('[ScreenshotService] Initialized')
  }

  getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
    return {
      CAPTURE_VISIBLE_TAB: async (_message, sender): Promise<ResponseMessage> => {
        try {
          const dataUrl = await this.captureSenderTab(sender)
          return MessageUtils.createResponse(true, { dataUrl })
        } catch (error) {
          return this.failure('captureVisibleTab', error)
        }
      },

      FETCH_IMAGE: async (message, sender): Promise<ResponseMessage> => {
        // Only a page's own content script asks for this, and only to inline
        // an image into an element capture (screenshot.md §2).
        if (!isTopFrameTabSender(sender)) return forbiddenResponse()
        try {
          const dataUrl = await this.fetchAsDataUrl(message.url)
          return MessageUtils.createResponse(true, { dataUrl })
        } catch (error) {
          return this.failure('fetchImage', error)
        }
      },

      DOWNLOAD_IMAGE: async (message, sender): Promise<ResponseMessage> => {
        if (!isTopFrameTabSender(sender) && !isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          // local time, like the export filename (storage.md §6): a UTC stamp crosses a day near midnight
          const now = new Date()
          const pad = (n: number) => String(n).padStart(2, '0')
          const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`
          const extension = message.extension ?? 'png'
          if (extension !== 'png' && extension !== 'jpg' && extension !== 'webp') throw new EntryValidationError('ENTRY_ASSET_MISSING')
          decodeImageDataUrl(message.dataUrl, extension === 'jpg' ? 'jpeg' : extension)
          const downloadId = await this.downloadDataUrl(message.dataUrl, `AnnHub/screenshot-${stamp}.${extension}`)
          await recordEvent('screenshot.downloaded', {
            format: extension === 'jpg' ? 'jpeg' : extension,
            watermark: message.watermark === true,
            beautify: message.beautify === true,
          })
          return MessageUtils.createResponse(true, { downloadId })
        } catch (error) {
          return this.failure('downloadImage', error)
        }
      },

      // The last frame (screenshot.md §1.4) belongs to the asking tab and the page its top frame shows.
      REMEMBER_FRAME: async (message, sender): Promise<ResponseMessage> => {
        if (!isTopFrameTabSender(sender)) return forbiddenResponse()
        const record = frameRecordFrom(message.record)
        if (!record) return MessageUtils.createResponse(false, undefined, 'FRAME_INVALID')
        await rememberFrame(sender.tab!.id!, sender.url, record)
        return MessageUtils.createResponse(true)
      },

      READ_FRAME: async (_message, sender): Promise<ResponseMessage> => {
        if (!isTopFrameTabSender(sender)) return forbiddenResponse()
        return MessageUtils.createResponse(true, { record: await readFrame(sender.tab!.id!, sender.url) })
      },

      SAVE_SCREENSHOT: async (message, sender): Promise<ResponseMessage> => {
        if (!isTopFrameTabSender(sender) && !isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          const { id, dataUrl, sourceUrl, title, author, published, description, via, frame, durationMs, startedAt } = message.data
          const { bytes, width, height } = decodePngDataUrl(dataUrl)
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' })
          const store = await initializedEntryStore()
          const registry = await store.listPropertyDefinitions()
          const started = performance.now()
          const entry = await store.saveEntry({
            id,
            type: 'screenshot',
            content: '',
            sourceUrl: cleanSourceUrl(sourceUrl),
            // only the screenshot presets attach (entry.md §5.4); page meta
            // for unchecked presets is dropped, title comes with its own fallback
            properties: presetProperties('screenshot', registry, {
              title,
              ...(author ? { author } : {}),
              ...(published ? { published } : {}),
              ...(description ? { description } : {}),
            }),
            asset: { bytes: blob, width, height },
          })
          await recordCaptureSaved({
            type: 'screenshot',
            via,
            frame,
            durationMs: typeof startedAt === 'number' && startedAt > 0 ? Math.max(0, Date.now() - startedAt) : (durationMs ?? performance.now() - started),
          })
          await rememberCapture(sender, entry.id)
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          void recordCaptureFailed(error, 'screenshot')
          return this.failure('saveScreenshot', error)
        }
      },
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }

  /** Always answers with a stable code (never a raw browser message); the detail goes to the log only. */
  private failure(where: string, error: unknown): ResponseMessage {
    const code = error instanceof CaptureError ? error.code : where === 'fetchImage' ? 'IMAGE_FETCH_FAILED' : storageErrorCode(error)
    Logger.error(`[ScreenshotService] ${where} failed:`, code, error instanceof Error ? error.message : '')
    return MessageUtils.createResponse(false, undefined, code)
  }

  /**
   * Photographs the tab that asked, and only while it is the one on screen
   * (screenshot.md §2): checked before and after the capture, so a tab
   * switched away mid-shot never hands back another page.
   */
  private async captureSenderTab(sender: chrome.runtime.MessageSender): Promise<string> {
    const notVisible = () => new CaptureError('CAPTURE_NOT_VISIBLE', 'only the visible tab can be captured')
    if (!isTopFrameTabSender(sender)) throw notVisible()
    const tabId = sender.tab!.id!
    const before = await chrome.tabs.get(tabId)
    if (!before.active) throw notVisible()
    const dataUrl = await captureWindow(before.windowId)
    const after = await chrome.tabs.get(tabId)
    if (!after.active || after.windowId !== before.windowId) throw notVisible()
    return dataUrl
  }

  /** Cross-origin image fetch for element capture; fetch-policy keeps it from becoming a proxy. */
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
          reject(new CaptureError('DOWNLOAD_FAILED', error?.message || 'download failed'))
          return
        }
        resolve(downloadId)
      })
    })
  }
}

/** The refusal the browser gives a third capture within a second (`tabs.MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` is 2). */
const CAPTURE_QUOTA_ERROR = 'MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND'

// PNG keeps text crisp (screenshot.md §2); region capture uses viewport pixels.
function captureWindow(windowId: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, dataUrl => {
      const error = chrome.runtime.lastError
      if (error || !dataUrl) {
        // the page waits the second out and asks again: its timers keep time, a worker's need not
        const code = error?.message?.includes(CAPTURE_QUOTA_ERROR) ? 'CAPTURE_RATE_LIMITED' : 'CAPTURE_FAILED'
        reject(new CaptureError(code, error?.message || 'captureVisibleTab returned no image'))
        return
      }
      resolve(dataUrl)
    })
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

function decodeImageDataUrl(dataUrl: unknown, expectedMime: 'png' | 'jpeg' | 'webp'): Uint8Array {
  if (typeof dataUrl !== 'string') throw new EntryValidationError('ENTRY_ASSET_MISSING')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[1] !== expectedMime || match[2]!.length % 4 !== 0) throw new EntryValidationError('ENTRY_ASSET_MISSING')
  let binary: string
  try {
    binary = atob(match[2]!)
  } catch {
    throw new EntryValidationError('ENTRY_ASSET_MISSING')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if ((expectedMime === 'png' && !png) || (expectedMime === 'jpeg' && !jpeg) || (expectedMime === 'webp' && !webp)) throw new EntryValidationError('ENTRY_ASSET_MISSING')
  return bytes
}

function decodePngDataUrl(dataUrl: unknown): { bytes: Uint8Array; width: number; height: number } {
  const bytes = decodeImageDataUrl(dataUrl, 'png')
  if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new EntryValidationError('ENTRY_ASSET_MISSING')
  const view = new DataView(bytes.buffer)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width === 0 || height === 0) throw new EntryValidationError('ENTRY_ASSET_MISSING')
  return { bytes, width, height }
}
