import { uiText } from '../ui-text'
import { readFrame, rememberFrame, type FrameRecord } from './frame-memory'
import { boxWithinTolerance, expandByMargin, fitsInViewport, sameFrame } from './selection'
import type { ViewportRect } from './crop'

/** What the remembered frame offered the session, when it had something to offer. */
export interface OfferedFrame {
  frame: ViewportRect
  /** The label the confirming bar shows: the size, and the notice when the anchor is gone. */
  label: string
  /** True when the element anchor was found; the offered record stays the element's. */
  anchored: boolean
  record: FrameRecord
}

/**
 * The last frame memory (RV-CAP-18, split out of the session): the frame that produced a
 * capture is remembered per page per tab and offered to the next session as a pending
 * selection (screenshot.md §1.4). Owns the pending record and what was offered; the session
 * paints and confirms through the returned offer.
 */
export class LastFrame {
  private record: FrameRecord | null = null
  private offered: ViewportRect | null = null
  /** True while this session's capture came from the remembered frame (`capture.saved`'s frame kind). */
  reused = false

  /** The remembered record, if the session confirmed a frame worth remembering. */
  pending(): FrameRecord | null {
    return this.record
  }

  /** A drag replaced whatever was offered; only an element frame confirmed as offered stays the element's. */
  adopted(selection: ViewportRect, scroll: { x: number; y: number }): void {
    const asOffered = this.record?.kind === 'element' && this.offered && sameFrame(this.offered, selection)
    if (asOffered) return
    this.record = {
      kind: 'box',
      pageX: selection.x + scroll.x,
      pageY: selection.y + scroll.y,
      width: selection.width,
      height: selection.height,
    }
  }

  /** Element and block captures remember their anchor with the margins they were taken with. */
  adoptElement(record: FrameRecord): void {
    this.record = record
  }

  reset(): void {
    this.record = null
    this.offered = null
    this.reused = false
  }

  /**
   * 入库 / 复制 / 下载 succeeded: refresh the record (element frames refresh their anchor and
   * size; box frames their page position) and write it. Cancel never writes.
   */
  remember(doc: Document, selection: ViewportRect | null): void {
    const record = this.record
    if (!record) return
    if (record.kind === 'element') {
      const el = doc.querySelector(record.selector)
      const view = doc.defaultView!
      if (el) {
        const box = el.getBoundingClientRect()
        record.width = box.width
        record.height = box.height
        record.pageX = box.left + view.scrollX
        record.pageY = box.top + view.scrollY
      }
    } else {
      const view = doc.defaultView!
      if (selection) {
        record.pageX = selection.x + view.scrollX
        record.pageY = selection.y + view.scrollY
      }
    }
    void rememberFrame(record)
  }

  /**
   * Reads the remembered frame and turns it into an offer, where it is in the window now:
   * anchored to its element when that is found within 10% drift, otherwise at the recorded
   * page position with a notice. The page is never scrolled for it — a feed that recycles its
   * cells can answer the element or the position with another post entirely — so a frame that
   * is not wholly in the window is not offered, and the memory waits for the next trigger.
   */
  async offer(doc: Document): Promise<OfferedFrame | null> {
    const record = await readFrame()
    if (!record) return null
    const view = doc.defaultView!
    const margin = record.kind === 'element' ? record.margin : 0
    const found = record.kind === 'element' ? doc.querySelector(record.selector)?.getBoundingClientRect() : undefined
    // the element's place now when it is still about the size it was; else where the frame was drawn on the page
    const anchor = found && boxWithinTolerance({ width: found.width, height: found.height }, record) ? found : null
    const frame = expandByMargin(
      anchor
        ? { x: anchor.left, y: anchor.top, width: anchor.width, height: anchor.height }
        : { x: record.pageX - view.scrollX, y: record.pageY - view.scrollY, width: record.width, height: record.height },
      margin,
    )
    if (!fitsInViewport(frame, { width: view.innerWidth, height: view.innerHeight })) return null
    let label = `${uiText('shot.lastFrame')} · ${Math.round(frame.width)} × ${Math.round(frame.height)}`
    if (anchor) {
      this.record = { ...record, width: anchor.width, height: anchor.height }
    } else {
      this.record = null
      if (record.kind === 'element') label += ` · ${uiText('shot.frameNotFound')}`
    }
    this.offered = { ...frame }
    this.reused = true
    return { frame, label, anchored: anchor !== null, record: this.record! }
  }
}
