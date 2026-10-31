import { describe, expect, it } from 'vitest'
import { pointerSamples } from '../pointer-samples'

/**
 * The samples of one pointer event (annotate.md §1.2): a frame folds its moves into
 * `getCoalescedEvents()`, and a drag read off the event alone loses them.
 */

describe('pointerSamples (annotate.md §1.2)', () => {
  const at = (x: number, y: number): PointerEvent => new PointerEvent('pointermove', { clientX: x, clientY: y })

  it('returns the coalesced list, in its order', () => {
    const event = at(104, 101)
    const coalesced = [at(101, 100), at(102, 101), at(104, 101)]
    Object.defineProperty(event, 'getCoalescedEvents', { value: () => coalesced })
    expect(pointerSamples(event)).toBe(coalesced)
  })

  it('falls back to the event itself when the coalesced list is empty — pointerup never has one', () => {
    const event = at(104, 101)
    Object.defineProperty(event, 'getCoalescedEvents', { value: () => [] })
    const samples = pointerSamples(event)
    expect(samples).toHaveLength(1)
    expect(samples[0]).toBe(event)
  })

  it('falls back to the event itself where the method does not exist', () => {
    const event = at(104, 101)
    Object.defineProperty(event, 'getCoalescedEvents', { value: undefined })
    const samples = pointerSamples(event)
    expect(samples).toHaveLength(1)
    expect(samples[0]).toBe(event)
  })
})
