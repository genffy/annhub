import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The offscreen document listens only to the extension's own background
 * (RV-BG-11): a tab sender is any page's content script and a foreign id is
 * another extension — either one could stop a recording or start a download
 * nobody asked for. Those senders are ignored without an answer.
 *
 * The start guard is the other contract here (RV-REC-05, annotate.md §2.5):
 * a recorder still rolling, a start already on its way, or a video the
 * worker still holds refuses the next start; only the worker's clear "no
 * video" drops the stale state and lets a new recording begin.
 */

type Listener = (message: { type: string } & Record<string, unknown>, sender: { id?: string; tab?: { id: number } }, sendResponse: (answer: unknown) => void) => unknown

let listener: Listener | undefined

/** The worker's answer to GET_RECORDING_STATE; per-test configurable (RV-REC-05). */
let workerStateAnswer: unknown = { success: true, data: { holdsVideo: false } }
const sendMessage = vi.fn(async (message: { type: string }) => {
  if (message.type === 'GET_RECORDING_STATE') {
    if (workerStateAnswer instanceof Error) throw workerStateAnswer
    return workerStateAnswer
  }
  return { success: true }
})

vi.stubGlobal('chrome', {
  runtime: { onMessage: { addListener: vi.fn((fn: Listener) => (listener = fn)) }, sendMessage, getURL: (path = '') => `chrome-extension://abc/${String(path)}`, id: 'abc' },
  offscreen: { Reason: { USER_MEDIA: 'USER_MEDIA', BLOBS: 'BLOBS', DOM_PARSER: 'DOM_PARSER' } },
})

/** A recorder whose stop delivers one chunk and then the stop event, the order the real one uses. */
class FakeRecorder {
  static instances: FakeRecorder[] = []
  static isTypeSupported(): boolean {
    return true
  }
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor() {
    FakeRecorder.instances.push(this)
  }
  start(): void {
    this.state = 'recording'
  }
  stop(): void {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['chunk']) })
    this.onstop?.()
  }
}

const tracks = { getTracks: () => [] as [], getAudioTracks: () => [] as [], getVideoTracks: () => [] as [] }
/** Resolvable per test, so a start can be held in the middle of taking its stream. */
let resolveUserMedia: (() => void) | null = null
const getUserMedia = vi.fn(
  () =>
    new Promise(resolve => {
      resolveUserMedia = () => resolve(tracks)
      resolveUserMedia()
    }),
)

vi.stubGlobal('MediaRecorder', FakeRecorder)
vi.stubGlobal(
  'MediaStream',
  class {
    constructor(_tracks: unknown[] = []) {}
  },
)
vi.stubGlobal(
  'AudioContext',
  class {
    destination = {}
    close() {
      return Promise.resolve()
    }
    createMediaStreamSource() {
      return { connect: () => undefined }
    }
  },
)
vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

let blobSeq = 0
const revokeObjectURL = vi.fn()
URL.createObjectURL = vi.fn(() => `blob:offscreen-${String(++blobSeq)}`)
URL.revokeObjectURL = revokeObjectURL

await import('../main')

const own = { id: 'abc' }

beforeEach(() => {
  sendMessage.mockClear()
  revokeObjectURL.mockClear()
  FakeRecorder.instances.length = 0
  blobSeq = 0
  workerStateAnswer = { success: true, data: { holdsVideo: false } }
})

function send(message: Record<string, unknown>, sender: { id?: string; tab?: { id: number } }): { answered: boolean; answer: unknown } {
  const sendResponse = vi.fn()
  listener!(message as { type: string }, sender, sendResponse)
  return { answered: sendResponse.mock.calls.length > 0, answer: sendResponse.mock.calls[0]?.[0] }
}

/** Sends a command whose answer comes back asynchronously (RECORDING_START). */
function sendAsync(message: Record<string, unknown>, sender = own): Promise<unknown> {
  return new Promise(resolve => {
    listener!(message as { type: string }, sender, resolve)
  })
}

/** A fire-and-forget command (RECORDING_STOP, RECORDING_CLEANUP) plus the tick its async work needs. */
async function command(message: Record<string, unknown>): Promise<void> {
  listener!(message as { type: string }, own, vi.fn())
  await new Promise(resolve => setTimeout(resolve, 0))
}

/** Leaves the module idle for the next test: no recording, no unsaved video, no heartbeat. */
async function settleIdle(): Promise<void> {
  await command({ type: 'RECORDING_STOP', stoppedBy: 'user' })
  await command({ type: 'RECORDING_CLEANUP' })
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
    const { answered, answer } = send({ type: 'DOWNLOAD_RUN', requestId: 'dl_1', form: 'folder', basePath: 'AnnHub/x', withMedia: false, media: [] }, own)
    expect(answered).toBe(true)
    expect((answer as { success: boolean }).success).toBe(true)
  })
})

describe('the start guard on stale state (RV-REC-05, annotate.md §2.5)', () => {
  it('a recorder still rolling refuses the next start without asking the worker', async () => {
    await expect(await sendAsync({ type: 'RECORDING_START', streamId: 's1', withMic: false })).toMatchObject({ success: true })
    expect(FakeRecorder.instances[FakeRecorder.instances.length - 1]?.state).toBe('recording')
    const answer = await sendAsync({ type: 'RECORDING_START', streamId: 's2', withMic: false })
    expect(answer).toMatchObject({ success: false })
    expect(sendMessage, 'the worker is not asked while its recorder rolls').not.toHaveBeenCalledWith({ type: 'GET_RECORDING_STATE' })
    expect(getUserMedia, 'no second stream').toHaveBeenCalledTimes(1)
    await settleIdle()
  })

  it('a lost RECORDING_CLEANUP with the worker done with the video: the next start succeeds and revokes the old URL once', async () => {
    await sendAsync({ type: 'RECORDING_START', streamId: 's1', withMic: false })
    await command({ type: 'RECORDING_STOP', stoppedBy: 'user' })
    // the video's landing was never reported: the document still holds it
    workerStateAnswer = { success: true, data: { holdsVideo: false } }
    const answer = await sendAsync({ type: 'RECORDING_START', streamId: 's2', withMic: false })
    expect(answer).toMatchObject({ success: true })
    expect(sendMessage).toHaveBeenCalledWith({ type: 'GET_RECORDING_STATE' })
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:offscreen-1')
    await settleIdle()
  })

  it('the video still waiting for the disk: the start is refused, nothing is revoked, RECORDING_CLEANUP then revokes it', async () => {
    await sendAsync({ type: 'RECORDING_START', streamId: 's1', withMic: false })
    await command({ type: 'RECORDING_STOP', stoppedBy: 'user' })
    workerStateAnswer = { success: true, data: { holdsVideo: true } }
    const answer = await sendAsync({ type: 'RECORDING_START', streamId: 's2', withMic: false })
    expect(answer).toMatchObject({ success: false })
    expect(revokeObjectURL, 'the video is not dropped before the download lands').not.toHaveBeenCalled()
    await command({ type: 'RECORDING_CLEANUP' })
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:offscreen-1')
  })

  it('a start while the first still takes its stream is refused: no worker question, no second stream', async () => {
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveUserMedia = () => resolve(tracks)
          // not resolved: the first start stays on its way to the stream
        }),
    )
    const first = sendAsync({ type: 'RECORDING_START', streamId: 's1', withMic: false })
    const second = await sendAsync({ type: 'RECORDING_START', streamId: 's2', withMic: false })
    expect(second).toMatchObject({ success: false })
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'GET_RECORDING_STATE' })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    resolveUserMedia!()
    await expect(first).resolves.toMatchObject({ success: true })
    await settleIdle()
  })

  it('a worker that cannot be asked: the start is refused and the state stays', async () => {
    await sendAsync({ type: 'RECORDING_START', streamId: 's1', withMic: false })
    await command({ type: 'RECORDING_STOP', stoppedBy: 'user' })
    workerStateAnswer = new Error('worker is gone')
    const answer = await sendAsync({ type: 'RECORDING_START', streamId: 's2', withMic: false })
    expect(answer).toMatchObject({ success: false })
    expect(revokeObjectURL).not.toHaveBeenCalled()
    // the state survived: once the worker is back and done with the video, the next start clears it
    workerStateAnswer = { success: true, data: { holdsVideo: false } }
    const retry = await sendAsync({ type: 'RECORDING_START', streamId: 's3', withMic: false })
    expect(retry).toMatchObject({ success: true })
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    await settleIdle()
  })
})
