import { afterEach, describe, expect, it, vi } from 'vitest'
import { uiText } from '../../../../utils/ui-text'
import { createBeautifyPanel, type BeautifyPanel } from '../beautify-panel'
import { applyBeautifyChange, BEAUTIFY_BACKGROUND_IDS, DEFAULT_BEAUTIFY, backgroundCss, type BeautifySettings } from '../output'

/** The panel with a stand-in for the session: it applies what the panel reports and shows the result back. */
function open(settings: BeautifySettings = DEFAULT_BEAUTIFY, ratios: readonly string[] = ['1:1', '4:5', '3:4', '16:9']) {
  const state = { style: settings }
  const onChange = vi.fn((patch: Partial<BeautifySettings>) => {
    state.style = applyBeautifyChange(state.style, patch)
    panel.sync(state.style)
  })
  const onReset = vi.fn(() => {
    state.style = { ...DEFAULT_BEAUTIFY }
    panel.sync(state.style)
  })
  const panel: BeautifyPanel = createBeautifyPanel(document, { settings, ratios, onChange, onReset })
  document.body.append(panel.el)
  return { panel, state, onChange, onReset }
}

const group = (panel: BeautifyPanel, name: string) => panel.el.querySelector<HTMLElement>(`[role="group"][aria-label="${name}"]`)!
const names = (container: HTMLElement) => [...container.querySelectorAll('button')].map(button => button.getAttribute('aria-label') ?? button.textContent)
const pressed = (container: HTMLElement) =>
  [...container.querySelectorAll('button')].filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.getAttribute('aria-label') ?? button.textContent)
const switchNamed = (panel: BeautifyPanel, name: string) => panel.el.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${name}"]`)!
const buttonLabelled = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('button')].find(button => (button.getAttribute('aria-label') ?? button.textContent) === label)!

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the beautify panel (screenshot.md §4.4)', () => {
  it('is a labelled group of controls with one name each — eight named backgrounds, three paddings, three radii, one shadow switch', () => {
    const { panel } = open()
    expect(panel.el.getAttribute('role')).toBe('group')
    expect(panel.el.getAttribute('aria-label')).toBe(uiText('shot.beautify'))
    expect(names(group(panel, uiText('shot.beautify.background')))).toEqual(BEAUTIFY_BACKGROUND_IDS.map(id => uiText(`shot.beautify.background.${id}`)))
    expect(names(group(panel, uiText('shot.beautify.padding')))).toEqual([uiText('settings.size.small'), uiText('settings.size.medium'), uiText('settings.size.large')])
    expect(names(group(panel, uiText('shot.beautify.radius')))).toEqual(['0', '12', '24'])

    const switches = [...panel.el.querySelectorAll('[role="switch"]')].map(node => node.getAttribute('aria-label'))
    expect(switches, 'the style switch and the shadow, each its own name').toEqual([uiText('shot.beautify.enabled'), uiText('shot.beautify.shadow')])
    expect(new Set(switches).size).toBe(2)
    expect(panel.el.querySelectorAll('select, input'), 'no browser controls').toHaveLength(0)
    expect(panel.el.querySelector('.ann-shot-bz-reset')!.textContent).toBe(uiText('shot.beautify.reset'))
  })

  it('names no background A, B or a number', () => {
    const { panel } = open()
    for (const label of names(group(panel, uiText('shot.beautify.background')))) expect(label).not.toMatch(/^[AB1-5]$/)
  })

  it('draws each swatch as the background it paints', () => {
    const { panel } = open()
    const swatches = [...group(panel, uiText('shot.beautify.background')).querySelectorAll<HTMLElement>('button')]
    expect(swatches.map(swatch => swatch.style.getPropertyValue('--ann-bz-sw'))).toEqual(BEAUTIFY_BACKGROUND_IDS.map(id => backgroundCss(id)))
    expect(swatches.map(swatch => swatch.title)).toEqual(swatches.map(swatch => swatch.getAttribute('aria-label')))
  })

  it('offers free and the ratios it was given, in their order, each with an outline of its shape', () => {
    const { panel } = open(DEFAULT_BEAUTIFY, ['16:9', '9:16', 'nonsense', '1:1'])
    const chips = group(panel, uiText('shot.beautify.ratio'))
    expect(names(chips)).toEqual([uiText('shot.ratio.free'), '16:9', '9:16', '1:1'])
    const glyphs = [...chips.querySelectorAll<HTMLElement>('.ann-shot-bz-rg')].map(glyph => [glyph.style.width, glyph.style.height])
    expect(glyphs).toEqual([
      ['13px', '7px'],
      ['7px', '13px'],
      ['13px', '13px'],
    ])
  })

  it('shows the style it opens on, and shows a new one after sync', () => {
    const style: BeautifySettings = { enabled: true, background: 'grad-green', padding: 'large', radius: 24, shadow: false, ratio: '4:5' }
    const { panel } = open(style)
    expect(pressed(group(panel, uiText('shot.beautify.background')))).toEqual([uiText('shot.beautify.background.grad-green')])
    expect(pressed(group(panel, uiText('shot.beautify.padding')))).toEqual([uiText('settings.size.large')])
    expect(pressed(group(panel, uiText('shot.beautify.radius')))).toEqual(['24'])
    expect(pressed(group(panel, uiText('shot.beautify.ratio')))).toEqual(['4:5'])
    expect(switchNamed(panel, uiText('shot.beautify.enabled')).getAttribute('aria-checked')).toBe('true')
    expect(switchNamed(panel, uiText('shot.beautify.shadow')).getAttribute('aria-checked')).toBe('false')

    panel.sync({ ...DEFAULT_BEAUTIFY })
    expect(pressed(group(panel, uiText('shot.beautify.background')))).toEqual([uiText('shot.beautify.background.solid-white')])
    expect(pressed(group(panel, uiText('shot.beautify.ratio')))).toEqual([uiText('shot.ratio.free')])
    expect(switchNamed(panel, uiText('shot.beautify.enabled')).getAttribute('aria-checked')).toBe('false')
    expect(switchNamed(panel, uiText('shot.beautify.shadow')).getAttribute('aria-checked')).toBe('true')
  })

  it('reports each change as the one field it changes', () => {
    const { panel, onChange } = open()
    buttonLabelled(group(panel, uiText('shot.beautify.background')), uiText('shot.beautify.background.grad-slate')).click()
    expect(onChange).toHaveBeenLastCalledWith({ background: 'grad-slate' })
    buttonLabelled(group(panel, uiText('shot.beautify.padding')), uiText('settings.size.small')).click()
    expect(onChange).toHaveBeenLastCalledWith({ padding: 'small' })
    buttonLabelled(group(panel, uiText('shot.beautify.radius')), '24').click()
    expect(onChange).toHaveBeenLastCalledWith({ radius: 24 })
    buttonLabelled(group(panel, uiText('shot.beautify.ratio')), '16:9').click()
    expect(onChange).toHaveBeenLastCalledWith({ ratio: '16:9' })
    buttonLabelled(group(panel, uiText('shot.beautify.ratio')), uiText('shot.ratio.free')).click()
    expect(onChange).toHaveBeenLastCalledWith({ ratio: undefined })
    expect(onChange).toHaveBeenCalledTimes(5)
  })

  it('turns the shadow and the whole style on and off from their switches', () => {
    const { panel, onChange } = open()
    switchNamed(panel, uiText('shot.beautify.enabled')).click()
    expect(onChange).toHaveBeenLastCalledWith({ enabled: true })
    switchNamed(panel, uiText('shot.beautify.enabled')).click()
    expect(onChange).toHaveBeenLastCalledWith({ enabled: false })
    switchNamed(panel, uiText('shot.beautify.shadow')).click()
    expect(onChange).toHaveBeenLastCalledWith({ shadow: false })
    switchNamed(panel, uiText('shot.beautify.shadow')).click()
    expect(onChange).toHaveBeenLastCalledWith({ shadow: true })
  })

  it('shows the style turning on when any other control is used', () => {
    const { panel } = open()
    const enabled = switchNamed(panel, uiText('shot.beautify.enabled'))
    expect(enabled.getAttribute('aria-checked')).toBe('false')
    buttonLabelled(group(panel, uiText('shot.beautify.padding')), uiText('settings.size.large')).click()
    expect(enabled.getAttribute('aria-checked')).toBe('true')
    enabled.click()
    expect(enabled.getAttribute('aria-checked'), 'and off again by its switch').toBe('false')
  })

  it('asks for a reset without reporting a change, and shows the style it gets back', () => {
    const { panel, onChange, onReset } = open()
    buttonLabelled(group(panel, uiText('shot.beautify.radius')), '24').click()
    expect(pressed(group(panel, uiText('shot.beautify.radius')))).toEqual(['24'])
    onChange.mockClear()
    panel.el.querySelector<HTMLButtonElement>('.ann-shot-bz-reset')!.click()
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(pressed(group(panel, uiText('shot.beautify.radius')))).toEqual(['12'])
    expect(document.body.contains(panel.el), 'the panel stays').toBe(true)
  })

  it('keeps its keystrokes from the page, which listens on its document', () => {
    const { panel } = open()
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    switchNamed(panel, uiText('shot.beautify.shadow')).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
  })

  it('takes the keyboard on its first control', () => {
    const { panel } = open()
    panel.focus()
    expect(document.activeElement).toBe(switchNamed(panel, uiText('shot.beautify.enabled')))
  })
})
