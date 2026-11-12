import { afterEach, describe, expect, it } from 'vitest'
import { dispatchCaptureVisibility } from '../capture-visibility'

/**
 * The capture hides the extension's surface for the shot: the event goes to the document and to
 * every same-origin frame below it, so the cursor highlight a recording keeps inside an iframe —
 * a nested one too — stays out of the picture.
 */

function frameIn(doc: Document): HTMLIFrameElement {
  const frame = doc.createElement('iframe')
  doc.body.appendChild(frame)
  return frame
}

/** Counts the events of one type a document receives. */
function counter(doc: Document, type: string): () => number {
  let seen = 0
  doc.addEventListener(type, () => {
    seen += 1
  })
  return () => seen
}

afterEach(() => document.body.replaceChildren())

describe('dispatchCaptureVisibility', () => {
  it('reaches the document, a same-origin frame and a frame nested in it (annotate.md §3.2, RV-CAP-19)', () => {
    const child = frameIn(document)
    const grandchild = frameIn(child.contentDocument!)
    const documents = [document, child.contentDocument!, grandchild.contentDocument!]
    for (const type of ['annhub:capture-hide', 'annhub:capture-restore'] as const) {
      const seen = documents.map(doc => counter(doc, type))
      dispatchCaptureVisibility(document, type)
      expect(
        seen.map(read => read()),
        `${type}: the top document, the frame, the frame inside it`,
      ).toEqual([1, 1, 1])
    }
  })

  it('skips a frame it cannot reach and still serves its sibling (annotate.md §3.2, RV-CAP-19)', () => {
    const blocked = frameIn(document)
    // a cross-origin frame has no contentDocument for the extension either
    Object.defineProperty(blocked, 'contentDocument', { get: () => null })
    const sibling = frameIn(document)
    const seen = counter(sibling.contentDocument!, 'annhub:capture-hide')
    expect(() => dispatchCaptureVisibility(document, 'annhub:capture-hide')).not.toThrow()
    expect(seen()).toBe(1)
  })
})
