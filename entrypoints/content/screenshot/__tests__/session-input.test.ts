/**
 * The capture session lives in the page's DOM, where the page's own scripts can dispatch events at it.
 * Only the user's input (`isUserInput`) may move it along; jsdom's events are never trusted, so the
 * tests stand in for a person with a switch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const sendMessage = vi.fn()
vi.mock('../../../../utils/message', () => ({ default: { sendMessage: (...args: unknown[]) => sendMessage(...args) } }))

let aPerson = false
vi.mock('../../user-input', () => ({ isUserInput: () => aPerson }))

import { enterScreenshotMode, exitScreenshotMode, isScreenshotSessionActive } from '../index'

function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })
}

const session = () => document.querySelector('[data-ann-ui="screenshot-session"]')

describe('the screenshot session and input made up by the page', () => {
  beforeEach(() => {
    sendMessage.mockReset()
    sendMessage.mockResolvedValue({ success: false, error: 'stop here' })
    aPerson = false
    document.body.innerHTML = '<main><p id="post">A post the user reads.</p></main>'
  })

  afterEach(() => {
    exitScreenshotMode()
    document.body.innerHTML = ''
  })

  it('does not start a drag from a pointerdown a script dispatched', async () => {
    enterScreenshotMode()
    aPerson = false
    const down = pointer('pointerdown', 10, 10)
    document.body.dispatchEvent(down)
    document.body.dispatchEvent(pointer('pointermove', 300, 200))
    document.body.dispatchEvent(pointer('pointerup', 300, 200))
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(down.defaultPrevented).toBe(false) // left for the page: the session did not take it
    expect(session()!.querySelector('.ann-shot-rect')).toBeNull()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does not finish a drag the user began with a pointerup a script dispatched', async () => {
    enterScreenshotMode()
    aPerson = true
    document.body.dispatchEvent(pointer('pointerdown', 10, 10))
    document.body.dispatchEvent(pointer('pointermove', 300, 200))
    expect(session()!.querySelector('.ann-shot-rect')).not.toBeNull()

    aPerson = false
    document.body.dispatchEvent(pointer('pointermove', 600, 400))
    document.body.dispatchEvent(pointer('pointerup', 600, 400))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(sendMessage).not.toHaveBeenCalled()
    expect((session()!.querySelector('.ann-shot-rect') as HTMLElement).style.width).toBe('290px') // the script's move did not stretch it

    aPerson = true
    document.body.dispatchEvent(pointer('pointerup', 300, 200))
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    expect(sendMessage.mock.calls[0]![0]).toMatchObject({ type: 'CAPTURE_VISIBLE_TAB' })
  })

  it('takes the capture from a real drag', async () => {
    enterScreenshotMode()
    aPerson = true
    document.body.dispatchEvent(pointer('pointerdown', 10, 10))
    document.body.dispatchEvent(pointer('pointermove', 300, 200))
    document.body.dispatchEvent(pointer('pointerup', 300, 200))
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    expect(sendMessage.mock.calls[0]![0]).toMatchObject({ type: 'CAPTURE_VISIBLE_TAB' })
  })

  it('is not cancelled, or changed, by keys a script dispatched', () => {
    enterScreenshotMode()
    aPerson = false
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(session()!.textContent).toContain('匿名：开')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(isScreenshotSessionActive()).toBe(true)
    expect(session()).not.toBeNull()

    aPerson = true
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(session()!.textContent).toContain('匿名：关')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(isScreenshotSessionActive()).toBe(false)
    expect(session()).toBeNull()
  })
})
