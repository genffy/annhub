/**
 * The picking bar's ratio chips (screenshot.md §1.3): 自由 plus the presets enabled in settings,
 * then the scrolling-capture button. Rendered whenever the picking state can show it; the session
 * keeps the element and removes the old bar before the next render.
 */
import { uiText } from '../../../utils/ui-text'
import { isUserInput } from '../user-input'
import { ratioOf } from '../../../utils/screenshot-output'

export interface RatioBarOptions {
  /** the active ratio id: "free" or one of `presets` */
  ratio: string
  /** the preset ids enabled in settings, in their order */
  presets: readonly string[]
  textNode(text: string): Text
  /** the user picked a ratio: the session stores it and renders the bar again */
  onRatio(id: string): void
  /** the user asked for the scrolling capture */
  onStitch(): void
}

export function renderRatioBar(doc: Document, host: HTMLElement, options: RatioBarOptions): HTMLDivElement {
  const bar = doc.createElement('div')
  bar.className = 'ann-shot-ratio-bar'
  bar.setAttribute('data-ann-ui', 'screenshot-ratio-bar')
  // the draft's .rchip: a small outline of the ratio's shape, the longest side 13px
  const glyph = (id: string): Node => {
    if (id === 'free') {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('aria-hidden', 'true')
      svg.innerHTML = '<path d="M12 2v20" /><path d="m15 19-3 3-3-3" /><path d="m19 9 3 3-3 3" /><path d="M2 12h20" /><path d="m5 9-3 3 3 3" /><path d="m9 5 3-3 3 3" />'
      return svg
    }
    const preset = ratioOf(id)
    const box = doc.createElement('i')
    box.className = 'ann-shot-rg'
    if (preset) {
      const k = 13 / Math.max(preset.w, preset.h)
      box.style.width = `${Math.round(preset.w * k)}px`
      box.style.height = `${Math.round(preset.h * k)}px`
    }
    return box
  }
  const chip = (id: string, label: string) => {
    const button = doc.createElement('button')
    button.type = 'button'
    button.append(glyph(id), options.textNode(label))
    button.className = options.ratio === id ? 'ann-shot-ratio-active' : ''
    button.setAttribute('aria-pressed', String(options.ratio === id))
    button.addEventListener('click', event => {
      if (!isUserInput(event)) return
      options.onRatio(id)
    })
    return button
  }
  bar.append(chip('free', uiText('shot.ratio.free')))
  for (const id of options.presets) bar.append(chip(id, id))
  const stitched = doc.createElement('button')
  stitched.type = 'button'
  stitched.append(options.textNode(uiText('shot.stitch.button')))
  stitched.setAttribute('data-ann-ui', 'shot-stitch-button')
  stitched.setAttribute('aria-label', uiText('shot.stitch.button'))
  stitched.addEventListener('click', event => {
    if (!isUserInput(event)) return
    options.onStitch()
  })
  bar.appendChild(stitched)
  host.appendChild(bar)
  return bar
}
