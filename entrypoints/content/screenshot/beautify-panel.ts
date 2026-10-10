/**
 * The beautify panel of the screenshot editor (screenshot.md §4.4): background, padding, corners, shadow and the output
 * canvas ratio, a switch for the whole style and a reset. Plain DOM like the rest of the session shell. The session owns
 * the style and the preview; the panel shows the style it is given and reports what the user changes — it keeps no state
 * of its own, so a reset or a change that turned beautify on shows up in the controls through `sync`.
 */
import { uiText } from '../../../utils/ui-text'
import { BEAUTIFY_BACKGROUND_IDS, BEAUTIFY_RADII, PADDING_PX, backgroundCss, ratioOf, type BeautifyPadding, type BeautifySettings } from './output'

export const BEAUTIFY_PANEL_UI = 'screenshot-beautify-panel'

export interface BeautifyPanelOptions {
  /** the style the panel opens on */
  settings: BeautifySettings
  /** the ratios the settings turned on, in their order; "free" is always offered besides them */
  ratios: readonly string[]
  /** the user changed these fields of the style */
  onChange(patch: Partial<BeautifySettings>): void
  /** the user asked for the initial style back */
  onReset(): void
}

export interface BeautifyPanel {
  readonly el: HTMLDivElement
  /** Shows `settings` in every control. */
  sync(settings: BeautifySettings): void
  /** Puts the keyboard on the first control. */
  focus(): void
}

type IconNode = Array<[tag: 'path' | 'circle', attributes: Record<string, string>]>

// lucide's palette and move (ISC), drawn here because the session shell is plain DOM
const PALETTE: IconNode = [
  ['path', { d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' }],
  ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }],
  ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }],
  ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }],
  ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
]
const MOVE: IconNode = [
  ['path', { d: 'M12 2v20' }],
  ['path', { d: 'm15 19-3 3-3-3' }],
  ['path', { d: 'm19 9 3 3-3 3' }],
  ['path', { d: 'M2 12h20' }],
  ['path', { d: 'm5 9-3 3 3 3' }],
  ['path', { d: 'm9 5 3-3 3 3' }],
]

export function createBeautifyPanel(doc: Document, options: BeautifyPanelOptions): BeautifyPanel {
  const el = doc.createElement('div')
  el.className = 'ann-shot-bz'
  el.setAttribute('data-ann-ui', BEAUTIFY_PANEL_UI)
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', uiText('shot.beautify'))
  // the page listens for keys on its document; typing on the panel stays on the panel
  el.addEventListener('keydown', event => event.stopPropagation())

  const shows: Array<(settings: BeautifySettings) => void> = []

  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  const icon = (nodes: IconNode): SVGSVGElement => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    for (const [tag, attributes] of nodes) {
      const part = doc.createElementNS('http://www.w3.org/2000/svg', tag)
      for (const [name, value] of Object.entries(attributes)) part.setAttribute(name, value)
      svg.append(part)
    }
    return svg
  }

  /** A button; `label` names one that has no words of its own (a swatch, a switch). */
  const button = (className: string, label?: string): HTMLButtonElement => {
    const node = make('button', className)
    node.type = 'button'
    if (label !== undefined) node.setAttribute('aria-label', label)
    return node
  }

  /** An on/off control named `label`. */
  const toggle = (label: string, read: (settings: BeautifySettings) => boolean, write: (on: boolean) => Partial<BeautifySettings>): HTMLButtonElement => {
    const node = button('ann-shot-bz-switch', label)
    node.setAttribute('role', 'switch')
    node.addEventListener('click', () => options.onChange(write(node.getAttribute('aria-checked') !== 'true')))
    shows.push(settings => node.setAttribute('aria-checked', String(read(settings))))
    return node
  }

  /** One button of a group of exclusive choices, pressed while `isCurrent` says it is the style's. */
  const choice = (node: HTMLButtonElement, isCurrent: (settings: BeautifySettings) => boolean, patch: Partial<BeautifySettings>): HTMLButtonElement => {
    node.addEventListener('click', () => options.onChange(patch))
    shows.push(settings => node.setAttribute('aria-pressed', String(isCurrent(settings))))
    return node
  }

  const group = (className: string, label: string, ...children: HTMLElement[]): HTMLDivElement => {
    const node = make('div', className)
    node.setAttribute('role', 'group')
    node.setAttribute('aria-label', label)
    node.append(...children)
    return node
  }

  const section = (...children: HTMLElement[]): HTMLDivElement => {
    const node = make('div', 'ann-shot-bz-sec')
    node.append(...children)
    return node
  }

  const row = (label: string, control: HTMLElement): HTMLDivElement => {
    const node = make('div', 'ann-shot-bz-row')
    node.append(make('span', undefined, label), control)
    return node
  }

  // title, the switch for the whole style, and the reset
  const reset = make('button', 'ann-shot-bz-reset', uiText('shot.beautify.reset'))
  reset.type = 'button'
  reset.addEventListener('click', () => options.onReset())
  const enabled = toggle(
    uiText('shot.beautify.enabled'),
    settings => settings.enabled,
    on => ({ enabled: on }),
  )
  const header = make('div', 'ann-shot-bz-hd')
  header.append(icon(PALETTE), make('span', undefined, uiText('shot.beautify')), enabled, make('span', 'ann-shot-bz-grow'), reset)
  el.append(header)

  // background: eight swatches, each named
  const swatches = BEAUTIFY_BACKGROUND_IDS.map(id => {
    const name = uiText(`shot.beautify.background.${id}`)
    const node = button(`ann-shot-bz-sw${id === 'none' ? ' ann-shot-bz-none' : ''}`, name)
    node.title = name
    node.style.setProperty('--ann-bz-sw', backgroundCss(id))
    return choice(node, settings => settings.background === id, { background: id })
  })
  el.append(section(make('div', 'ann-shot-bz-lb', uiText('shot.beautify.background')), group('ann-shot-bz-sws', uiText('shot.beautify.background'), ...swatches)))

  // padding and corners: small segmented controls
  const sizes = (Object.keys(PADDING_PX) as BeautifyPadding[]).map(size => {
    const node = button('')
    node.textContent = uiText(`settings.size.${size}`)
    node.title = `${PADDING_PX[size]} px`
    return choice(node, settings => settings.padding === size, { padding: size })
  })
  el.append(section(row(uiText('shot.beautify.padding'), group('ann-shot-bz-seg', uiText('shot.beautify.padding'), ...sizes))))
  const radii = BEAUTIFY_RADII.map(radius => {
    const node = button('')
    node.textContent = String(radius)
    node.title = `${radius} px`
    return choice(node, settings => settings.radius === radius, { radius })
  })
  el.append(section(row(uiText('shot.beautify.radius'), group('ann-shot-bz-seg', uiText('shot.beautify.radius'), ...radii))))

  // the shadow: the only control called 阴影
  const shadow = toggle(
    uiText('shot.beautify.shadow'),
    settings => settings.shadow,
    on => ({ shadow: on }),
  )
  el.append(section(row(uiText('shot.beautify.shadow'), shadow)))

  // the output canvas ratio: free, and the ratios the settings turned on, each with a small outline of its shape
  const free = button('ann-shot-bz-chip')
  free.append(icon(MOVE), make('span', undefined, uiText('shot.ratio.free')))
  const chips: HTMLButtonElement[] = [choice(free, settings => settings.ratio === undefined, { ratio: undefined })]
  for (const id of options.ratios) {
    const preset = ratioOf(id)
    if (!preset) continue
    const node = button('ann-shot-bz-chip')
    const glyph = make('i', 'ann-shot-bz-rg')
    const longest = 13 / Math.max(preset.w, preset.h)
    glyph.style.width = `${Math.round(preset.w * longest)}px`
    glyph.style.height = `${Math.round(preset.h * longest)}px`
    node.append(glyph, make('span', undefined, id))
    chips.push(choice(node, settings => settings.ratio === id, { ratio: id }))
  }
  el.append(section(make('div', 'ann-shot-bz-lb', uiText('shot.beautify.ratio')), group('ann-shot-bz-chips', uiText('shot.beautify.ratio'), ...chips)))

  const sync = (settings: BeautifySettings): void => {
    for (const show of shows) show(settings)
  }
  sync(options.settings)

  return { el, sync, focus: () => enabled.focus() }
}
