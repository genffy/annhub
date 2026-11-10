/**
 * The session asks for the settings as it starts, and the shot can be on its way before they arrive: the block
 * capsule's shot starts together with the session, and a frame the selection menu hands over can be confirmed at
 * once. Every capture waits for them, so the anonymize default and the kinds it covers (screenshot.md §3) always hold;
 * `A` works until the shot is taken, and a late answer does not undo it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../../../core/settings'

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

describe('the remembered frame opens the session where it is, and never moves the page (screenshot.md §1.4)', () => {
  /** Every way the session could move the page lands here: the scroller's offsets, scrollIntoView, scrollTo, scrollBy. */
  const pageMoved = vi.fn()
  const root = document.documentElement
  const spies: Array<{ mockRestore: () => void }> = []

  /** GET_SETTINGS and READ_FRAME answer at once; everything else fails, which ends the session's work there. */
  function remembering(record: unknown): void {
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_SETTINGS') return Promise.resolve({ success: true, data: { ...DEFAULT_SETTINGS } })
      if (message.type === 'READ_FRAME') return Promise.resolve({ success: true, data: { record } })
      return Promise.resolve({ success: false, error: 'stop here' })
    })
  }

  /** jsdom lays nothing out: put the post where the test wants it in the window. */
  function placePost(box: { left: number; top: number; width: number; height: number }): void {
    const post = document.getElementById('post')!
    post.getBoundingClientRect = () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => ({}) }) as DOMRect
  }

  const label = (): string => session().querySelector('[data-ann-ui="shot-frame-label"]')?.textContent ?? ''
  const confirmBar = (): Element | null => session().querySelector('[data-ann-ui="shot-confirm-bar"]')
  const ratioBar = (): Element | null => session().querySelector('[data-ann-ui="screenshot-ratio-bar"]')
  /** Once the picking chips or a pending frame is up, the session has settled what the remembered frame does. */
  const decided = (): Promise<void> => vi.waitFor(() => expect(session().querySelector('[data-ann-ui="screenshot-ratio-bar"], [data-ann-ui="shot-confirm-bar"]')).not.toBeNull())

  beforeEach(() => {
    sendMessage.mockReset()
    pageMoved.mockReset()
    aPerson = false
    document.body.innerHTML = '<main><p id="post">A post the user reads.</p></main>'
    // jsdom has no scrollingElement, and the session moves the page through it: give it one that reports every write
    Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => root })
    Object.defineProperty(root, 'scrollTop', { configurable: true, get: () => 0, set: pageMoved })
    Object.defineProperty(root, 'scrollLeft', { configurable: true, get: () => 0, set: pageMoved })
    Element.prototype.scrollIntoView = pageMoved
    spies.push(vi.spyOn(window, 'scrollTo').mockImplementation(pageMoved), vi.spyOn(window, 'scrollBy').mockImplementation(pageMoved))
  })

  afterEach(() => {
    exitScreenshotMode()
    for (const spy of spies.splice(0)) spy.mockRestore()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    Reflect.deleteProperty(root, 'scrollTop')
    Reflect.deleteProperty(root, 'scrollLeft')
    Reflect.deleteProperty(document, 'scrollingElement')
    document.body.innerHTML = ''
  })

  it("offers the frame of its element, with the margin, in the element's place now — without scrolling", async () => {
    placePost({ left: 100, top: 100, width: 300, height: 150 })
    remembering({ kind: 'element', selector: '#post', margin: 24, pageX: 100, pageY: 700, width: 300, height: 150 })
    enterScreenshotMode()

    await vi.waitFor(() => expect(label()).toMatch(/上次取景框 · 348 × 198/))
    const rect = session().querySelector('.ann-shot-rect') as HTMLElement
    expect([rect.style.left, rect.style.top, rect.style.width, rect.style.height]).toEqual(['76px', '76px', '348px', '198px'])
    expect(pageMoved).not.toHaveBeenCalled()
  })

  it('does not offer the frame of an element that is not wholly in the window, and does not go and fetch it', async () => {
    placePost({ left: 100, top: 2400, width: 300, height: 150 })
    remembering({ kind: 'element', selector: '#post', margin: 24, pageX: 100, pageY: 2400, width: 300, height: 150 })
    enterScreenshotMode()

    await decided()
    await settle()
    expect(confirmBar()).toBeNull()
    expect(pageMoved).not.toHaveBeenCalled()
  })

  it('does not offer a frame with its margin cut off by the window edge', async () => {
    placePost({ left: 10, top: 100, width: 300, height: 150 }) // the post fits; its 24px margin would not
    remembering({ kind: 'element', selector: '#post', margin: 24, pageX: 10, pageY: 100, width: 300, height: 150 })
    enterScreenshotMode()

    await decided()
    await settle()
    expect(confirmBar()).toBeNull()
    expect(pageMoved).not.toHaveBeenCalled()
  })

  it('falls back to the recorded place when the element is gone, if that place is in the window — with the notice', async () => {
    remembering({ kind: 'element', selector: '#gone', margin: 0, pageX: 120, pageY: 160, width: 400, height: 200 })
    enterScreenshotMode()

    await vi.waitFor(() => expect(label()).toMatch(/上次取景框 · 400 × 200 · 没找到上次的元素/))
    const rect = session().querySelector('.ann-shot-rect') as HTMLElement
    expect([rect.style.left, rect.style.top]).toEqual(['120px', '160px'])
    expect(pageMoved).not.toHaveBeenCalled()
  })

  it('leaves the recorded place alone when it is out of the window: the page is not carried back to it', async () => {
    remembering({ kind: 'element', selector: '#gone', margin: 0, pageX: 120, pageY: 3000, width: 400, height: 200 })
    enterScreenshotMode()

    await decided()
    await settle()
    expect(confirmBar()).toBeNull()
    expect(pageMoved).not.toHaveBeenCalled()
  })

  it('does not offer a place that is only partly in the window either', async () => {
    remembering({ kind: 'box', pageX: 60, pageY: 600, width: 360, height: 400 }) // runs off the bottom of the 768px window
    enterScreenshotMode()

    await decided()
    await settle()
    expect(confirmBar()).toBeNull()
    expect(pageMoved).not.toHaveBeenCalled()
  })

  it('offers a dragged frame where it was drawn on the page', async () => {
    remembering({ kind: 'box', pageX: 60, pageY: 80, width: 360, height: 180 })
    enterScreenshotMode()

    await vi.waitFor(() => expect(label()).toMatch(/上次取景框 · 360 × 180/))
    expect(label()).not.toMatch(/没找到/)
    expect(pageMoved).not.toHaveBeenCalled()
  })

  it('hands the screen back to picking when the offered frame is let go: its label goes, the chips and the picking hint are back for the drag', async () => {
    remembering({ kind: 'box', pageX: 60, pageY: 80, width: 360, height: 180 })
    enterScreenshotMode()
    await vi.waitFor(() => expect(label()).toMatch(/上次取景框/))
    expect(ratioBar()).toBeNull()
    expect(hintText()).toMatch(/点选区外重选/)

    aPerson = true
    document.body.dispatchEvent(pointer('pointerdown', 700, 400))
    expect(ratioBar()).not.toBeNull()
    expect(hintText()).toMatch(/单击选择元素/)
    document.body.dispatchEvent(pointer('pointermove', 900, 600))
    document.body.dispatchEvent(pointer('pointerup', 900, 600))
    await vi.waitFor(() => expect(confirmBar()).not.toBeNull())
    // the frame the user drew is theirs: nothing of the one that was offered rides along
    expect(label()).toBe('')
    expect(hintText()).toMatch(/点选区外重选/)
    expect(ratioBar()).toBeNull()
  })

  it('does not flash the picking chips beside a frame the memory is about to offer', async () => {
    const chipsAdded = vi.fn()
    const watcher = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element && node.getAttribute('data-ann-ui') === 'screenshot-ratio-bar') chipsAdded()
    })
    watcher.observe(document.documentElement, { childList: true, subtree: true })
    try {
      remembering({ kind: 'box', pageX: 60, pageY: 80, width: 360, height: 180 })
      enterScreenshotMode()
      await vi.waitFor(() => expect(label()).toMatch(/上次取景框/))
      await settle()
      expect(chipsAdded).not.toHaveBeenCalled()
    } finally {
      watcher.disconnect()
    }
  })

  it('shows the picking chips once the memory has nothing to offer', async () => {
    remembering(null)
    enterScreenshotMode()
    await vi.waitFor(() => expect(ratioBar()).not.toBeNull())
    expect(confirmBar()).toBeNull()
    expect(hintText()).toMatch(/单击选择元素/)
  })

  it('does not offer a frame bigger than the window', async () => {
    placePost({ left: 0, top: 0, width: 1200, height: 900 })
    remembering({ kind: 'element', selector: '#post', margin: 0, pageX: 0, pageY: 0, width: 1200, height: 900 })
    enterScreenshotMode()

    await decided()
    await settle()
    expect(confirmBar()).toBeNull()
    expect(pageMoved).not.toHaveBeenCalled()
  })
})

const session = (): Element => document.querySelector('[data-ann-ui="screenshot-session"]')!

function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })
}

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

describe('a section target hands its interval to the capture (RV-CAP-13, capture.md §6.2)', () => {
  beforeEach(() => {
    sendMessage.mockImplementation((message: { type: string }) =>
      message.type === 'GET_SETTINGS' ? Promise.resolve({ success: true, data: { ...DEFAULT_SETTINGS } }) : Promise.resolve({ success: false, error: 'stop here' }),
    )
  })

  it("the capsule's shot on a section captures the container with its interval", async () => {
    const LONG = 'This sentence is deliberately long so the block clears the 120 character minimum for sections. '.repeat(3)
    document.body.innerHTML = `<div class="content" id="content">
      <h2 id="h-install">Install</h2><p>${LONG}</p><p>${LONG}</p>
      <h2 id="h-usage">Usage</h2><p>${LONG}</p>
    </div>`
    enterScreenshotMode({
      via: 'block',
      element: document.getElementById('content') as HTMLElement,
      section: { start: document.getElementById('h-install')!, end: document.getElementById('h-usage')! },
    })
    await vi.waitFor(() => expect(captureElement).toHaveBeenCalledTimes(1))
    const [element, options] = captureElement.mock.calls[0] as [HTMLElement, { section?: { start: Element; end: Element } }]
    expect(element.id).toBe('content')
    expect(options.section?.start).toBe(document.getElementById('h-install'))
    expect(options.section?.end).toBe(document.getElementById('h-usage'))
    exitScreenshotMode()
  })

  it('an element target still captures without an interval', async () => {
    document.body.innerHTML = '<main><p id="post">A post the user reads.</p></main>'
    enterScreenshotMode({ via: 'block', element: document.getElementById('post')! })
    await vi.waitFor(() => expect(captureElement).toHaveBeenCalledTimes(1))
    expect((captureElement.mock.calls[0] as [HTMLElement, { section?: unknown }])[1].section).toBeUndefined()
    exitScreenshotMode()
  })
})
