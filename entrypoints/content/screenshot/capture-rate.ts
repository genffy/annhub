/**
 * The visible-tab capture ask, with the browser's rate limit waited out
 * (screenshot.md §2). The wait lives in the page, whose timers keep time; a
 * service worker's own timers can fire seconds late.
 */
import MessageUtils from '../../../utils/message'
import type { ResponseMessage } from '../../../types/messages'

/** Asking again this often, this many times, covers the whole second the browser's capture limit counts. */
const CAPTURE_RATE_RETRY_MS = 400
const CAPTURE_RATE_RETRIES = 3

/** One capture ask; `cancelled` ends the waiting early — nothing more is to be photographed. */
export async function requestCapture(cancelled: () => boolean): Promise<ResponseMessage<{ dataUrl: string } | undefined>> {
  for (let retry = 0; ; retry++) {
    const response = await MessageUtils.sendMessage({ type: 'CAPTURE_VISIBLE_TAB', requestId: `shot-${Date.now()}` })
    if (response.success || response.error !== 'CAPTURE_RATE_LIMITED' || retry === CAPTURE_RATE_RETRIES) return response
    await new Promise(resolve => setTimeout(resolve, CAPTURE_RATE_RETRY_MS))
    if (cancelled()) return response
  }
}
