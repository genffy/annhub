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
    expect(captures()).toHaveLength(0)
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
    expect(captures()).toHaveLength(0)
    expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).toBeNull() // the script's up did not confirm
    expect((session()!.querySelector('.ann-shot-rect') as HTMLElement).style.width).toBe('290px') // the script's move did not stretch it

    // the user's up enters the pending confirmation; Enter captures
    aPerson = true
    document.body.dispatchEvent(pointer('pointerup', 300, 200))
    await vi.waitFor(() => expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).not.toBeNull())
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(captures()).toHaveLength(1))
  })

  it('takes the capture from a real drag after confirming the selection', async () => {
    enterScreenshotMode()
    aPerson = true
    document.body.dispatchEvent(pointer('pointerdown', 10, 10))
    document.body.dispatchEvent(pointer('pointermove', 300, 200))
    document.body.dispatchEvent(pointer('pointerup', 300, 200))
    await vi.waitFor(() => expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).not.toBeNull())
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(captures()).toHaveLength(1))
  })

  it('is not cancelled, or changed, by keys a script dispatched', () => {
    enterScreenshotMode()
    aPerson = false
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(hintText()).toMatch(/匿名/) // untouched, default on
    expect(hintText()).toMatch(/开/)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(isScreenshotSessionActive()).toBe(true)
    expect(session()).not.toBeNull()

    aPerson = true
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(hintText()).toMatch(/关/)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(isScreenshotSessionActive()).toBe(false)
    expect(session()).toBeNull()
  })

  it('keeps a confirming frame when a click inside it misses Confirm (issue #108)', async () => {
    const post = document.getElementById('post')!
    const capsule = document.createElement('div')
    capsule.setAttribute('data-ann-ui', 'block-capsule')
    const outline = document.createElement('div')
    outline.setAttribute('data-ann-ui', 'block-outline')
    document.documentElement.append(capsule, outline)
    let pageHits = 0
    post.addEventListener('pointerdown', () => {
      pageHits += 1
    })
    post.addEventListener('click', () => {
      pageHits += 1
    })

    dragToConfirm()
    await vi.waitFor(() => expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).not.toBeNull())
    const root = session() as HTMLElement
    expect(root.classList.contains('ann-shot-modal')).toBe(true)
    expect(root.style.pointerEvents).toBe('auto')
    expect(document.querySelector('[data-ann-ui="block-capsule"]')).toBeNull()
    expect(document.querySelector('[data-ann-ui="block-outline"]')).toBeNull()

    // The hit target before the shield was the page element under the frame.
    const down = pointer('pointerdown', 80, 80)
    post.dispatchEvent(down)
    document.body.dispatchEvent(pointer('pointerup', 80, 80))
    expect(down.defaultPrevented).toBe(true)
    expect(pageHits).toBe(0)
    expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).not.toBeNull()
    expect(session()!.querySelectorAll('.ann-shot-rect')).toHaveLength(1)
    expect((session()!.querySelector('.ann-shot-rect') as HTMLElement).isConnected).toBe(true)
    expect(root.classList.contains('ann-shot-modal')).toBe(true)

    // The rect itself is the hit target once the shield is up.
    session()!
      .querySelector('.ann-shot-rect')!
      .dispatchEvent(pointer('pointerdown', 120, 90))
    document.body.dispatchEvent(pointer('pointerup', 120, 90))
    expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).not.toBeNull()
    expect(captures()).toHaveLength(0)

    session()!
      .querySelector('[data-ann-ui="shot-handle-se"]')!
      .dispatchEvent(pointer('pointerdown', 300, 200))
    document.body.dispatchEvent(pointer('pointerup', 300, 200))
    expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).not.toBeNull()
    expect(root.classList.contains('ann-shot-modal')).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(isScreenshotSessionActive()).toBe(false)
  })

  it('still leaves confirming through Cancel or Confirm, and a press outside the frame starts a new selection', async () => {
    dragToConfirm()
    await vi.waitFor(() => expect(session()!.querySelector('[data-ann-ui="shot-confirm-btn"]')).not.toBeNull())
    session()!
      .querySelector('[data-ann-ui="shot-confirm-btn"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(captures()).toHaveLength(1))
    expect((session() as HTMLElement).style.pointerEvents).toBe('')

    exitScreenshotMode()
    dragToConfirm()
    await vi.waitFor(() => expect(session()!.querySelector('[data-ann-ui="shot-confirm-cancel"]')).not.toBeNull())
    session()!
      .querySelector('[data-ann-ui="shot-confirm-cancel"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(isScreenshotSessionActive()).toBe(false)

    dragToConfirm()
    await vi.waitFor(() => expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).not.toBeNull())
    session()!
      .querySelector('.ann-shot-overlay')!
      .dispatchEvent(pointer('pointerdown', 4, 4))
    expect(session()!.querySelector('[data-ann-ui="shot-confirm-bar"]')).toBeNull()
    expect(session()!.classList.contains('ann-shot-modal')).toBe(false)
    document.body.dispatchEvent(pointer('pointerup', 4, 4))
    expect(session()!.querySelectorAll('.ann-shot-rect')).toHaveLength(0)
    expect(captures()).toHaveLength(1)
  })
})

function dragToConfirm(): void {
  enterScreenshotMode()
  aPerson = true
  document.body.dispatchEvent(pointer('pointerdown', 10, 10))
  document.body.dispatchEvent(pointer('pointermove', 300, 200))
  document.body.dispatchEvent(pointer('pointerup', 300, 200))
}

/** Only the privileged calls: GET_SETTINGS noise from session bootstrap is fine. */
function captures(): unknown[] {
  return sendMessage.mock.calls.filter(call => (call[0] as { type?: string }).type === 'CAPTURE_VISIBLE_TAB')
}

function hintText(): string {
  return (session()!.querySelector('.ann-shot-hint') as HTMLElement)?.textContent ?? ''
}
