/**
 * The screenshot session's top hint bar: the gestures and keys of the current state, the anonymize
 * and watermark toggles, and the note to click the page while it has no keyboard focus. The session
 * draws it on every state change; the segments are one localized string split on " · ", with a
 * leading key name turned into a keycap.
 */
import { uiText } from '../ui-text'

export interface HintBarOptions {
  /** the selection is awaiting confirmation: the hint says how to adjust it */
  pending: boolean
  /** null when neither identity kind is selected in settings and `A` has nothing to do */
  anonymize: { on: boolean } | null
  /** null when the watermark is disabled in settings and `W` never shows */
  watermark: { on: boolean } | null
  textNode: (text: string) => Text
  kbdNode: (key: string) => HTMLElement
}

export function renderHintBar(doc: Document, hintEl: HTMLElement, options: HintBarOptions): void {
  hintEl.innerHTML = ''
  // the address bar holds the keys while the page has no focus: Esc would land in the
  // browser, so the hint says to click the page first
  if (!doc.hasFocus()) {
    const dot = doc.createElement('span')
    dot.className = 'ann-shot-sep'
    dot.textContent = '·'
    hintEl.append(options.textNode(uiText('page.noFocus')), dot)
  }
  // the segments read as one line; the muted dots keep them from running together
  // (without them the hint reads as one run: “Esc to cancelAAnonymize: on”),
  // and the keys ride as keycaps
  const sep = (): HTMLElement => {
    const dot = doc.createElement('span')
    dot.className = 'ann-shot-sep'
    dot.textContent = '·'
    return dot
  }
  // one localized string, its “ · ”-separated parts re-drawn: a leading key name
  // (“Esc 取消”, “Enter to confirm”) becomes a keycap and the words follow it
  const segment = (part: string): Array<Node> => {
    const keyed = /^(A|W|Esc|Enter) (.+)$/.exec(part)
    if (!keyed) return [options.textNode(part)]
    return [options.kbdNode(keyed[1]!), options.textNode(` ${keyed[2]!}`)]
  }
  const parts = uiText(options.pending ? 'shot.hintPending' : 'shot.hint').split(' · ')
  for (const [index, part] of parts.entries()) {
    if (index > 0) hintEl.append(sep())
    hintEl.append(...segment(part))
  }
  // a pending frame is settled by its own keys and a click outside; the picking line would promise gestures that are not on
  hintEl.append(
    // with both identity kinds switched off in settings there is nothing for `A` to do
    ...(options.anonymize ? [sep(), options.kbdNode('A'), options.textNode(` ${uiText('shot.anonymize', { state: uiText(options.anonymize.on ? 'shot.on' : 'shot.off') })}`)] : []),
    ...(options.watermark !== null
      ? [sep(), options.kbdNode('W'), options.textNode(` ${uiText('shot.watermark', { state: uiText(options.watermark.on ? 'shot.on' : 'shot.off') })}`)]
      : []),
  )
}
