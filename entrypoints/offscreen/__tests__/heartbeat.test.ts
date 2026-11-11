// @vitest-environment jsdom
// The offscreen document this code runs in has a window; the node project does not (RV-TEST-08).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncHeartbeat } from '../heartbeat'

/**
 * The suspended-after-30 s worker only wakes for incoming messages, so the
 * offscreen document pings it every 10 s while a recording runs or a finished
 * video waits for the disk (annotate.md §2.4, RV-REC-02). The ping stops when
 * RECORDING_CLEANUP has released the video — there is nothing left to keep alive.
 */
describe('the offscreen heartbeat (annotate.md §2.4, RV-REC-02)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('pings the worker every 10 seconds while there is something to keep alive', () => {
    const send = vi.fn()
    syncHeartbeat(send, true)
    vi.advanceTimersByTime(10_000)
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(20_000)
    expect(send).toHaveBeenCalledTimes(3)
    syncHeartbeat(send, false)
  })

  it('stops after the cleanup releases the video: nothing pings any more', () => {
    const send = vi.fn()
    syncHeartbeat(send, true)
    vi.advanceTimersByTime(10_000)
    expect(send).toHaveBeenCalledTimes(1)
    // RECORDING_CLEANUP led here: no recording, no unsaved video
    syncHeartbeat(send, false)
    vi.advanceTimersByTime(60_000)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not pile up pings when the state flips repeatedly', () => {
    const send = vi.fn()
    syncHeartbeat(send, true)
    syncHeartbeat(send, true)
    vi.advanceTimersByTime(10_000)
    expect(send).toHaveBeenCalledTimes(1)
    syncHeartbeat(send, false)
    syncHeartbeat(send, false)
    vi.advanceTimersByTime(30_000)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
