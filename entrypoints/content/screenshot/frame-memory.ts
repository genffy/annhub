/**
 * The last frame (screenshot.md §1.4) is the worker's, kept for this tab and this page; the session only hands it a
 * frame and asks for it back. Nothing is written into the page's own storage, which the site's scripts read
 * (真机走查 P2-11). Without an answer there is simply no remembered frame.
 */
import MessageUtils from '../../../utils/message'
import type { FrameRecord } from '../../../types/messages'

export type { FrameRecord }

/** Remembers the frame for the next session on this page in this tab. */
export async function rememberFrame(record: FrameRecord): Promise<void> {
  await MessageUtils.sendMessage({ type: 'REMEMBER_FRAME', record })
}

/** This tab's frame for this page, or null. */
export async function readFrame(): Promise<FrameRecord | null> {
  const response = await MessageUtils.sendMessage<{ record: FrameRecord | null }>({ type: 'READ_FRAME' })
  return response.success ? (response.data?.record ?? null) : null
}
