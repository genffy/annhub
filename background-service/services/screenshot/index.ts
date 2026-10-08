/**
 * Background service for the screenshot chain (docs/v2/screenshot.md §2, §4):
 * viewport capture of the asking tab only, cross-origin image proxying under
 * the fetch policy, PNG download, and library persistence as a screenshot
 * entry whose asset commits in the same transaction.
 */
import type { IService } from '../../service-manager'
import type { ResponseMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isTopFrameTabSender } from '../../sender'
import { RESOURCE_TIMEOUT_MS, assertFetchableUrl, readImage } from './fetch-policy'
import { initializedEntryStore } from '../../store-instance'
import { presetProperties } from '../../../learning-core/properties'
import { cleanSourceUrl } from '../../../learning-core/url'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import { recordCaptureSaved, recordCaptureFailed, recordEvent } from '../metrics/record'

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
          const iso = new Date().toISOString().replace(/[:.]/g, '-')
          const downloadId = await this.downloadDataUrl(message.dataUrl, `AnnHub/screenshot-${iso}.png`)
          await recordEvent('screenshot.downloaded', { format: 'png', watermark: false, beautify: false })
          return MessageUtils.createResponse(true, { downloadId })
        } catch (error) {
          return this.failure('downloadImage', error)
        }
      },

      SAVE_SCREENSHOT: async (message, sender): Promise<ResponseMessage> => {
        if (!isTopFrameTabSender(sender) && !isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          const { dataUrl, width, height, sourceUrl, title, via, frame, durationMs } = message.data
          const blob = dataUrlToBlob(dataUrl)
          const registry = await store.listPropertyDefinitions()
          const started = performance.now()
          const entry = await store.saveEntry({
            type: 'screenshot',
            content: '',
            sourceUrl: cleanSourceUrl(sourceUrl),
            properties: presetProperties('screenshot', registry, { title }),
            asset: { bytes: blob, width, height },
          })
          await recordCaptureSaved({ type: 'screenshot', via, frame, durationMs: durationMs ?? performance.now() - started })
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

  private failure(where: string, error: unknown): ResponseMessage {
    const detail = error instanceof Error ? error.message : String(error)
    Logger.error(`[ScreenshotService] ${where} failed:`, detail)
    return MessageUtils.createResponse(false, undefined, detail)
  }

  /**
   * Photographs the tab that asked, and only while it is the one on screen
   * (screenshot.md §2): checked before and after the capture, so a tab
   * switched away mid-shot never hands back another page.
   */
  private async captureSenderTab(sender: chrome.runtime.MessageSender): Promise<string> {
    const notVisible = () => new Error('only the visible tab can be captured')
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
          reject(new Error(error?.message || 'download failed'))
          return
        }
        resolve(downloadId)
      })
    })
  }
}

// PNG keeps text crisp (screenshot.md §2); region capture uses viewport pixels.
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
  const mime = /data:([^;]+)/.exec(meta ?? '')?.[1] ?? 'image/png'
  const binary = atob(base64 ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
