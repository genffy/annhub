import { beforeEach, expect, expectTypeOf, it, vi } from 'vitest'
import MessageUtils from '../message'
import type { ResponseDataForEveryMessage, ResponseDataMap, ResponseMessage, RecordingState } from '../../types/messages'

/** utils/message: only connection-level failures retry; an orphaned content script never can. */
const send = vi.fn()
beforeEach(() => {
  send.mockReset()
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
})

it('fails once with the reload code when the extension context was invalidated', async () => {
  send.mockRejectedValue(new Error('Extension context invalidated.'))
  const response = await MessageUtils.sendMessage({ type: 'SAVE_CLIP' } as never)
  expect(response.success).toBe(false)
  expect(response.error).toBe('EXTENSION_CONTEXT_INVALIDATED')
  expect(send).toHaveBeenCalledTimes(1)
})

it('retries a receiver miss and reports the last error', async () => {
  send.mockRejectedValue(new Error('Receiving end does not exist'))
  const response = await MessageUtils.sendMessage({ type: 'SAVE_CLIP' } as never)
  expect(response.success).toBe(false)
  expect(response.error).toBe('Receiving end does not exist')
  expect(send).toHaveBeenCalledTimes(3)
})

it('does not retry a handler that answered with a failure', async () => {
  send.mockResolvedValue({ type: 'RESPONSE', success: false, error: 'EMPTY_CONTENT', timestamp: 0 })
  const response = await MessageUtils.sendMessage({ type: 'SAVE_CLIP' } as never)
  expect(response.success).toBe(false)
  expect(send).toHaveBeenCalledTimes(1)
})

it('derives the response data from the message type, never from the caller (RV-BG-12)', async () => {
  // Referencing the Pick alias is the exhaustiveness lock: a message type without a ResponseDataMap
  // entry breaks this file's compilation.
  expectTypeOf<ResponseDataForEveryMessage>().toEqualTypeOf<ResponseDataMap>()
  send.mockResolvedValue({ type: 'RESPONSE', success: true, data: { status: 'idle', withMic: false }, timestamp: 0 })
  const response = MessageUtils.sendMessage({ type: 'GET_RECORDING_STATE' })
  expectTypeOf(await response).toEqualTypeOf<ResponseMessage<(RecordingState & { holdsVideo: boolean }) | undefined>>()
})
