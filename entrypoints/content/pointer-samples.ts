/**
 * The pointer samples of one event (annotate.md §1.2): the browser dispatches
 * at most one `pointermove` per frame and folds the moves of that frame into
 * `getCoalescedEvents()`, so a fast drag read off the event alone loses most
 * of its samples and comes out as a polygon. An event whose coalesced list is
 * empty — `pointerup` never has one — or from an implementation without the
 * method falls back to the event itself.
 */
export function pointerSamples(event: PointerEvent): PointerEvent[] {
  const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
  return coalesced.length > 0 ? coalesced : [event]
}
