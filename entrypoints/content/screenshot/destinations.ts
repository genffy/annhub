import MessageUtils from '../../../utils/message'
import { screenshotFailureText, screenshotSaveErrorText, uiText } from '../ui-text'
import { extractPageMeta } from '../page-meta'
import { normalizeHost } from '../../../core/normalize'
import { downloadExtension, downloadFormatFor, downloadMime, matteOnWhite, type DownloadFormat } from '../../../utils/screenshot-output'
import type { CaptureVia } from '../../../types/messages'
import type { ExtensionSettings } from '../../../core/settings'

/**
 * The screenshot's three destinations (RV-CAP-18, split out of the session): 入库 saves the
 * processed picture as an entry, 复制 writes it to the clipboard without ending the session,
 * 下载 writes a file in the format the settings choose (screenshot.md §4). Owns nothing but
 * the run's busy state; the session answers through the port.
 */
export interface DestinationsPort {
  readonly doc: Document
  /** The entry id the save uses. */
  entryId(): string
  via(): CaptureVia
  settings(): ExtensionSettings | null
  /** The capture as edited; null before the editor exists. */
  croppedCanvas(): HTMLCanvasElement | null
  /** What the preview shows — beautify and watermark composed; null before the editor exists. */
  displayCanvas(): HTMLCanvasElement | null
  beautifyEnabled(): boolean
  watermarkOn(): boolean
  /** `stitched`, `reused`, `element` or `drag`, by where this capture came from. */
  frameKind(): 'stitched' | 'reused' | 'element' | 'drag'
  sourceUrl(): string
  /** 入库 / 复制 / 下载 all remember the frame that produced the capture. */
  rememberFrame(): void
  say(message: string, isError?: boolean): void
  saved(): void
}

/** One destination run: the caller's busy flag, not a field. */
export class Destinations {
  constructor(private readonly port: DestinationsPort) {}

  /** Confirm: save the processed image as a screenshot entry, in one transaction with its asset. */
  async save(busy: (on: boolean) => void): Promise<void> {
    const canvas = this.port.croppedCanvas()
    busy(true)
    try {
      // `capture.saved` times the click to the committed write (metrics.md §9), not the editing that came before it
      const clickedAt = Date.now()
      // runtime messaging cannot carry Blobs, so the processed PNG travels as
      // a dataUrl; the store persists bytes (dataUrl is transport only).
      const dataUrl = canvas!.toDataURL('image/png')
      // the page's meta fills whichever presets the user checked for
      // screenshots (entry.md §5.4) — same extractor and fallbacks as clips
      const meta = extractPageMeta(this.port.doc, normalizeHost(this.port.doc.defaultView!.location.href))
      const response = await MessageUtils.sendMessage({
        type: 'SAVE_SCREENSHOT',
        data: {
          id: this.port.entryId(),
          dataUrl,
          width: canvas!.width,
          height: canvas!.height,
          sourceUrl: this.port.sourceUrl(),
          title: meta.title,
          ...(meta.author ? { author: meta.author } : {}),
          ...(meta.published ? { published: meta.published } : {}),
          ...(meta.description ? { description: meta.description } : {}),
          via: this.port.via(),
          frame: this.port.frameKind(),
          startedAt: clickedAt,
        },
      })
      if (!response.success) throw new Error(screenshotSaveErrorText(response.error))
      this.port.rememberFrame()
      this.port.saved()
    } catch (error) {
      this.port.say(error instanceof Error ? error.message : uiText('shot.error.saveFailed'), true)
    } finally {
      busy(false)
    }
  }

  /** Copy keeps the editing session (screenshot.md §4.2); `http:` pages get the download hint. */
  async copy(busy: (on: boolean) => void): Promise<void> {
    const canvas = this.port.displayCanvas() ?? this.port.croppedCanvas()
    busy(true)
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, 'image/png'))
      if (!blob || !this.port.doc.defaultView!.navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error(uiText('shot.copyInstead'))
      }
      await this.port.doc.defaultView!.navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      this.port.rememberFrame()
      this.port.say(uiText('shot.copied'))
      void MessageUtils.sendMessage({
        type: 'RECORD_EVENT',
        name: 'screenshot.copied',
        props: { watermark: Boolean(this.port.settings()?.watermark.enabled && this.port.watermarkOn()), beautify: this.port.beautifyEnabled() },
      })
    } catch {
      // The clipboard API is closed on http: pages and can be rejected without
      // focus — the image and every annotation stay for download or retry.
      this.port.say(this.port.doc.defaultView!.location.protocol === 'http:' ? uiText('shot.copyInstead') : uiText('shot.error.copyFailed'), true)
    } finally {
      busy(false)
    }
  }

  /** Download keeps the editing session, in the format chosen in settings (screenshot.md §4.2). */
  async download(busy: (on: boolean) => void): Promise<void> {
    const canvas = this.port.displayCanvas() ?? this.port.croppedCanvas()
    busy(true)
    try {
      const format: DownloadFormat = (this.port.settings()?.downloadFormat as DownloadFormat) ?? 'png'
      // JPEG has no alpha: whatever is transparent is painted on white first (screenshot.md §4.2)
      const output = format === 'jpeg' ? matteOnWhite(canvas!, this.port.doc) : canvas!
      const dataUrl = output.toDataURL(downloadMime(format), this.port.settings()?.downloadQuality ?? 0.9)
      // a codec the browser cannot encode comes back as PNG bytes (screenshot.md §5):
      // download the PNG and say so, instead of failing on a name the bytes do not match
      const actual = downloadFormatFor(format, dataUrl)
      const response = await MessageUtils.sendMessage({
        type: 'DOWNLOAD_IMAGE',
        dataUrl,
        extension: downloadExtension(actual),
        watermark: Boolean(this.port.settings()?.watermark.enabled && this.port.watermarkOn()),
        beautify: this.port.beautifyEnabled(),
      })
      if (!response.success) throw new Error(screenshotFailureText(response.error, 'shot.error.downloadFailed'))
      this.port.rememberFrame()
      this.port.say(actual === format ? uiText('shot.downloaded') : uiText('shot.downloadedAsPng'))
    } catch (error) {
      this.port.say(error instanceof Error ? error.message : uiText('shot.error.downloadFailed'), true)
    } finally {
      busy(false)
    }
  }
}
