/**
 * The capture hides the extension's surface for the shot (annotate.md §3.2): the event goes to
 * this document and, down the frame tree, to every same-origin subframe's — a cursor highlight
 * following the pointer inside an iframe, a nested one included, would otherwise stay in the picture.
 */
export function dispatchCaptureVisibility(doc: Document, type: 'annhub:capture-hide' | 'annhub:capture-restore'): void {
  doc.dispatchEvent(new CustomEvent(type))
  for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
    // contentDocument is null for a cross-origin frame: nothing of ours runs there (annotate.md §3.2)
    const inner = frame.contentDocument
    if (inner) dispatchCaptureVisibility(inner, type)
  }
}
