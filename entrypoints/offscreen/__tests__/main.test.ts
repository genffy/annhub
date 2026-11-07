import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The offscreen document listens only to the extension's own background
 * (RV-BG-11): a tab sender is any page's content script and a foreign id is
 * another extension — either one could stop a recording or start a download
 * nobody asked for. Those senders are ignored without an answer.
 */

type Listener = (message: { type: string }, sender: { id?: string; tab?: { id: number } }, sendResponse: (answer: unknown) => void) => unknown

let listener: Listener | undefined
const sendMessage = vi.fn(async () => undefined)

vi.stubGlobal('chrome', {
  runtime: { onMessage: { addListener: vi.fn((fn: Listener) => (listener = fn)) }, sendMessage, getURL: (path = '') => `chrome-extension://abc/${String(path)}`, id: 'abc' },
  offscreen: { Reason: { USER_MEDIA: 'USER_MEDIA', BLOBS: 'BLOBS', DOM_PARSER: 'DOM_PARSER' } },
})
vi.stubGlobal('MediaRecorder', class {})
vi.stubGlobal('AudioContext', class {})

await import('../main')

beforeEach(() => {
  sendMessage.mockClear()
})

function send(message: Record<string, unknown>, sender: { id?: string; tab?: { id: number } }): { answered: boolean; answer: unknown } {
  const sendResponse = vi.fn()
  listener!(message as { type: string }, sender, sendResponse)
  return { answered: sendResponse.mock.calls.length > 0, answer: sendResponse.mock.calls[0]?.[0] }
}

describe('the offscreen sender gate (RV-BG-11, notes/sender-rules.md)', () => {
  it('a tab sender cannot stop a recording, start or finish a download, or extract a page', () => {
    const tabSender = { id: 'abc', tab: { id: 7 } }
    for (const type of ['RECORDING_STOP', 'RECORDING_START', 'DOWNLOAD_RUN', 'DOWNLOAD_FINISH', 'DOWNLOAD_EXTRACT', 'DOWNLOAD_CANCEL']) {
      const { answered, answer } = send({ type }, tabSender)
      expect(answered, type).toBe(false)
      expect(answer, type).toBeUndefined()
    }
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('a foreign extension id is ignored the same way', () => {
    const foreign = { id: 'another-extension' }
    for (const type of ['RECORDING_STOP', 'DOWNLOAD_RUN']) {
      const { answered, answer } = send({ type }, foreign)
      expect(answered, type).toBe(false)
      expect(answer, type).toBeUndefined()
    }
  })

  it('the worker itself gets through: its run request is answered', () => {
    const own = { id: 'abc' }
    const { answered, answer } = send({ type: 'DOWNLOAD_RUN', requestId: 'dl_1', form: 'folder', basePath: 'AnnHub/x', withMedia: false, media: [] }, own)
    expect(answered).toBe(true)
    expect((answer as { success: boolean }).success).toBe(true)
  })
})
