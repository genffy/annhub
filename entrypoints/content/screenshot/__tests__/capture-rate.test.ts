/**
 * The browser takes two captures a second and refuses a third. The worker answers that refusal with
 * `CAPTURE_RATE_LIMITED`; the session waits the second out and asks again instead of telling the user the page
 * cannot be captured (screenshot.md §2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../../background-service/settings-schema'

vi.mock('../../../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const sendMessage = vi.fn()
vi.mock('../../../../utils/message', () => ({ default: { sendMessage: (...args: unknown[]) => sendMessage(...args) } }))
vi.mock('../../user-input', () => ({ isUserInput: () => true }))
vi.mock('../anonymize', () => ({ applyViewportAnonymization: () => () => undefined }))

import { enterScreenshotMode, exitScreenshotMode } from '../index'

const frame = { x: 20, y: 20, width: 300, height: 150 }

/** When each capture was asked for. The worker refuses the first `refusals` for the limit, and fails the rest for good. */
function limitRefuses(refusals: number): number[] {
  const asked: number[] = []
  sendMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === 'GET_SETTINGS') return { success: true, data: DEFAULT_SETTINGS }
    if (message.type !== 'CAPTURE_VISIBLE_TAB') return { success: false }
    asked.push(performance.now())
    return { success: false, error: asked.length <= refusals ? 'CAPTURE_RATE_LIMITED' : 'CAPTURE_FAILED' }
  })
  return asked
}

const errorText = (): string | null => document.querySelector('[data-ann-ui="screenshot-error"]')?.textContent ?? null

function confirmFrame(): void {
  enterScreenshotMode({ via: 'menu', initialRect: frame })
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

describe("the browser's limit of two captures a second (screenshot.md §2)", () => {
  beforeEach(() => {
    sendMessage.mockReset()
    document.body.innerHTML = '<main><p>A page the user reads.</p></main>'
  })

  afterEach(() => {
    exitScreenshotMode()
    document.body.innerHTML = ''
  })

  it('a shot right after two others waits the second out and asks again, saying nothing in between', async () => {
    const asked = limitRefuses(2)
    confirmFrame()
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    expect(errorText(), 'a refusal for the limit is not a failure').toBeNull()

    await vi.waitFor(() => expect(asked).toHaveLength(3), { timeout: 3000 })
    expect(asked[1]! - asked[0]!, 'waits before asking again').toBeGreaterThanOrEqual(390)
    expect(asked[2]! - asked[1]!).toBeGreaterThanOrEqual(390)
    // the third answer is a real failure: that one is told, in the usual words
    await vi.waitFor(() => expect(errorText()).toContain('无法截取此页面'))
  })

  it('stops after the second has passed, and says the capture failed', async () => {
    const asked = limitRefuses(Infinity)
    confirmFrame()
    await vi.waitFor(() => expect(errorText()).toContain('无法截取此页面'), { timeout: 3000 })
    // at 0, 400, 800 and 1200 ms: the last is past the second the first refusal fell in
    expect(asked).toHaveLength(4)
  })

  it('asks no more once the user cancels during the wait', async () => {
    const asked = limitRefuses(Infinity)
    confirmFrame()
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    exitScreenshotMode()
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(asked).toHaveLength(1)
    expect(errorText()).toBeNull()
  })
})
