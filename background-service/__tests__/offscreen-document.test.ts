import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureOffscreenDocument } from '../offscreen-document'

/**
 * One offscreen document for the whole worker (RV-BG-11): a recording and a
 * download can ask at the same moment — one createDocument, both callers
 * served — and a "already exists" answer from the browser counts as success.
 */

const getContexts = vi.fn(async () => [] as unknown[])
const createDocument = vi.fn(async (..._args: unknown[]) => undefined as unknown)

vi.stubGlobal('chrome', {
  runtime: { getContexts, ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' } },
  offscreen: { createDocument, Reason: { USER_MEDIA: 'USER_MEDIA', BLOBS: 'BLOBS', DOM_PARSER: 'DOM_PARSER' } },
})

beforeEach(() => {
  createDocument.mockClear()
  createDocument.mockResolvedValue(undefined)
  getContexts.mockResolvedValue([])
})

describe('the one offscreen document (RV-BG-11)', () => {
  it('creates the document once with all three reasons when two services ask together', async () => {
    let release!: () => void
    const first = new Promise<void>(resolve => {
      release = resolve
    })
    createDocument.mockImplementationOnce(() => first)
    const a = ensureOffscreenDocument()
    const b = ensureOffscreenDocument()
    release()
    await expect(a).resolves.toBeUndefined()
    await expect(b).resolves.toBeUndefined()
    expect(createDocument).toHaveBeenCalledTimes(1)
    const call = (createDocument.mock.calls[0] as unknown as [{ reasons: string[]; justification: string }])[0]
    expect(call.reasons).toEqual(['USER_MEDIA', 'BLOBS', 'DOM_PARSER'])
    expect(call.justification).toMatch(/Recording/)
    expect(call.justification).toMatch(/download/)
  })

  it('an existing document answers the second caller without another createDocument', async () => {
    getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    await expect(ensureOffscreenDocument()).resolves.toBeUndefined()
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('a createDocument that lost the race answers "already exists" and both callers go on', async () => {
    createDocument.mockRejectedValueOnce(new Error('Only a single offscreen document may be created'))
    await expect(ensureOffscreenDocument()).resolves.toBeUndefined()
    expect(createDocument).toHaveBeenCalledTimes(1)
  })

  it('a real failure still fails', async () => {
    createDocument.mockRejectedValueOnce(new Error('quota'))
    await expect(ensureOffscreenDocument()).rejects.toThrow(/quota/)
  })
})
