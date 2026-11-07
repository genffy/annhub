/**
 * The one offscreen document (RV-BG-11): a recording and a Markdown download
 * run can start while the other is going, and Chrome allows only one offscreen
 * document — two services asking at once would race, and the loser's run would
 * fail on "already exists". One module owns the creation: the reasons declare
 * all three uses, concurrent asks share one createDocument, and an "already
 * exists" answer counts as success. Nothing here closes the document: closing
 * it would interrupt whichever other flow is still using it.
 */

const OFFSCREEN_URL = 'offscreen.html'

let creating: Promise<void> | null = null

export async function ensureOffscreenDocument(): Promise<void> {
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
    if (contexts.length > 0) return
  }
  // the async gap between getContexts and createDocument is where two callers race; share one promise
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.BLOBS, chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Recording the tab the user asked to record (annotate.md §2); fetching media and packing ZIP downloads (download.md §4–§5)',
    })
    .then(
      () => undefined,
      (error: unknown) => {
        // a simultaneous createDocument won the race: its document serves this caller too
        if (error instanceof Error && /single offscreen|exist/i.test(error.message)) return
        throw error
      },
    )
    .finally(() => {
      creating = null
    })
  await creating
}
