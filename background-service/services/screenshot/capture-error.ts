/**
 * A failure of the capture chain that is not an entry validation failure. The worker answers with the
 * stable `code`; the page that shows it picks the localized words (utils/ui-text.ts), so no raw browser
 * message ever reaches the user (extension.md §6).
 */
export type CaptureErrorCode = 'CAPTURE_NOT_VISIBLE' | 'CAPTURE_FAILED' | 'DOWNLOAD_FAILED' | 'IMAGE_FETCH_FAILED'

export class CaptureError extends Error {
  constructor(
    readonly code: CaptureErrorCode,
    detail?: string,
  ) {
    super(detail ?? code)
    this.name = 'CaptureError'
  }
}
