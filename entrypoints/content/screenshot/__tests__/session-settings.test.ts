/**
 * The session asks for the settings as it starts, and the shot can be on its way before they arrive: the block
 * capsule's shot starts together with the session, and a frame the selection menu hands over can be confirmed at
 * once. Every capture waits for them, so the anonymize default and the kinds it covers (screenshot.md §3) always hold;
 * `A` works until the shot is taken, and a late answer does not undo it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../../../background-service/settings-schema'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const sendMessage = vi.fn()
vi.mock('../../../../utils/message', () => ({ default: { sendMessage: (...args: unknown[]) => sendMessage(...args) } }))

let aPerson = false
vi.mock('../../user-input', () => ({ isUserInput: () => aPerson }))

const captureElement = vi.fn()
vi.mock('../element-capture', () => ({ captureElement: (...args: unknown[]) => captureElement(...args) }))

const applyViewportAnonymization = vi.fn()
vi.mock('../anonymize', () => ({ applyViewportAnonymization: (...args: unknown[]) => applyViewportAnonymization(...args) }))

import { enterScreenshotMode, exitScreenshotMode } from '../index'

const frame = { x: 20, y: 20, width: 300, height: 150 }

/** GET_SETTINGS answers when the test says so; everything else fails, which ends the session's work there. */
function settingsLater(): (settings: ExtensionSettings) => void {
  let answer: (settings: ExtensionSettings) => void = () => undefined
  const pending = new Promise<ExtensionSettings>(resolve => (answer = resolve))
  sendMessage.mockImplementation((message: { type: string }) =>
    message.type === 'GET_SETTINGS' ? pending.then(data => ({ success: true, data })) : Promise.resolve({ success: false, error: 'stop here' }),
  )
  return answer
}

describe('the screenshot session and its settings (screenshot.md §3)', () => {
  beforeEach(() => {
    sendMessage.mockReset()
    captureElement.mockReset()
    captureElement.mockRejectedValue(new Error('stop here'))
    applyViewportAnonymization.mockReset()
    applyViewportAnonymization.mockReturnValue(() => undefined)
    aPerson = false
    document.body.innerHTML = '<main><p id="post">A post the user reads.</p></main>'
  })

  afterEach(() => {
    exitScreenshotMode()
    document.body.innerHTML = ''
  })

  it("holds the block capsule's shot until the settings arrive, then covers only the kinds they keep", async () => {
    const answer = settingsLater()
    enterScreenshotMode({ via: 'block', element: document.getElementById('post')! })
    await settle()
    expect(captureElement).not.toHaveBeenCalled()

    answer({ ...DEFAULT_SETTINGS, anonymizeAvatars: false })
    await vi.waitFor(() => expect(captureElement).toHaveBeenCalledTimes(1))
    expect(captureElement.mock.calls[0]![1]).toEqual({ anonymize: { avatar: false, name: true } })
  })

  it("takes the block capsule's shot unanonymized when the settings say so", async () => {
    settingsLater()({ ...DEFAULT_SETTINGS, anonymizeDefault: false })
    enterScreenshotMode({ via: 'block', element: document.getElementById('post')! })
    await vi.waitFor(() => expect(captureElement).toHaveBeenCalledTimes(1))
    expect(captureElement.mock.calls[0]![1]).toEqual({})
  })

  it("lets A switch a frame the selection menu handed over, and keeps the user's choice when the settings come later", async () => {
    const answer = settingsLater()
    enterScreenshotMode({ via: 'menu', initialRect: frame })
    expect(session().querySelector('[data-ann-ui="shot-confirm-bar"]')).not.toBeNull()

    aPerson = true
    press('a')
    expect(hintText()).toMatch(/匿名：关/)
    answer({ ...DEFAULT_SETTINGS, anonymizeDefault: true })
    await settle()
    expect(hintText()).toMatch(/匿名：关/)

    press('Enter')
    await vi.waitFor(() => expect(captures()).toHaveLength(1))
    expect(applyViewportAnonymization).not.toHaveBeenCalled()
  })

  it('confirms a pending frame once, with the settings that arrive after Enter', async () => {
    const answer = settingsLater()
    enterScreenshotMode({ via: 'menu', initialRect: frame })
    aPerson = true
    press('Enter')
    press('Enter')
    await settle()
    expect(captures()).toHaveLength(0)

    answer({ ...DEFAULT_SETTINGS, anonymizeNames: false })
    await vi.waitFor(() => expect(captures()).toHaveLength(1))
    expect(applyViewportAnonymization).toHaveBeenCalledTimes(1)
    expect(applyViewportAnonymization.mock.calls[0]![2]).toEqual({ avatar: true, name: false })
    await settle()
    expect(captures()).toHaveLength(1)
  })

  it('does not offer A when the settings switch both kinds off', async () => {
    const answer = settingsLater()
    enterScreenshotMode()
    expect(hintText()).toMatch(/匿名/)
    answer({ ...DEFAULT_SETTINGS, anonymizeAvatars: false, anonymizeNames: false })
    await vi.waitFor(() => expect(hintText()).not.toMatch(/匿名/))

    aPerson = true
    const key = press('a')
    expect(key.defaultPrevented).toBe(false) // left for the page
    expect(hintText()).not.toMatch(/匿名/)
  })

  it('keeps a hover the user already started; the remembered frame does not take it over', async () => {
    // the settings and the frame both come back from the worker, later than the user's first move
    let answerSettings: (settings: ExtensionSettings) => void = () => undefined
    let answerFrame: (record: unknown) => void = () => undefined
    const settingsPending = new Promise<ExtensionSettings>(resolve => (answerSettings = resolve))
    const framePending = new Promise<unknown>(resolve => (answerFrame = resolve))
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_SETTINGS') return settingsPending.then(data => ({ success: true, data }))
      if (message.type === 'READ_FRAME') return framePending.then(record => ({ success: true, data: { record } }))
      return Promise.resolve({ success: false, error: 'stop here' })
    })

    enterScreenshotMode()
    aPerson = true
    const post = document.getElementById('post')!
    // jsdom has no elementsFromPoint; the session skips hover without it, so lend it this one element
    const realElementsFromPoint = document.elementsFromPoint?.bind(document)
    document.elementsFromPoint = () => [post]
    try {
      document.dispatchEvent(new Event('pointermove'))
      await settle()
      expect(session().querySelector('[data-ann-ui="shot-hover-outline"]')).not.toBeNull()
      expect(session().querySelector('[data-ann-ui="shot-margin-bar"]')).not.toBeNull()

      answerSettings({ ...DEFAULT_SETTINGS })
      answerFrame({ kind: 'element', selector: '#post', margin: 24, pageX: 0, pageY: 0, width: 300, height: 150 })
      await settle()
      // the hover (and its margin bar) survive; no pending "last frame" takes the pointer's target away
      expect(session().querySelector('[data-ann-ui="shot-margin-bar"]')).not.toBeNull()
      expect(session().querySelector('[data-ann-ui="shot-frame-label"]')).toBeNull()
    } finally {
      if (realElementsFromPoint) document.elementsFromPoint = realElementsFromPoint
      else Reflect.deleteProperty(document, 'elementsFromPoint')
    }
  })
})

const session = (): Element => document.querySelector('[data-ann-ui="screenshot-session"]')!

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

function captures(): unknown[] {
  return sendMessage.mock.calls.filter(call => (call[0] as { type?: string }).type === 'CAPTURE_VISIBLE_TAB')
}

function hintText(): string {
  return (session().querySelector('.ann-shot-hint') as HTMLElement)?.textContent ?? ''
}
