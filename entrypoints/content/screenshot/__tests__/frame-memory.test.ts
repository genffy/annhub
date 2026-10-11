import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { readFrame, rememberFrame } from '../frame-memory'

describe('the session hands its last frame to the worker (screenshot.md §1.4)', () => {
  const sendMessage = vi.fn()
  const record = { kind: 'box', pageX: 120, pageY: 64, width: 300, height: 200 } as const

  beforeEach(() => {
    sendMessage.mockReset()
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    sessionStorage.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // the page's own storage is read by the site's scripts (真机走查 P2-11)
  it('sends the frame and asks for it back, writing nothing into the page', async () => {
    sendMessage.mockResolvedValueOnce({ type: 'RESPONSE', success: true }).mockResolvedValueOnce({ type: 'RESPONSE', success: true, data: { record } })
    await rememberFrame(record)
    expect(await readFrame()).toEqual(record)
    expect(sendMessage.mock.calls.map(([message]) => [message.type, message.record])).toEqual([
      ['REMEMBER_FRAME', record],
      ['READ_FRAME', undefined],
    ])
    expect(sessionStorage.length + localStorage.length).toBe(0)
  })

  it('without an answer there is no remembered frame', async () => {
    sendMessage.mockResolvedValueOnce({ type: 'RESPONSE', success: false, error: 'Forbidden' })
    expect(await readFrame()).toBeNull()
    sendMessage.mockRejectedValueOnce(new Error('the worker failed'))
    expect(await readFrame()).toBeNull()
  })
})
