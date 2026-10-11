import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrameRecord } from '../../../../types/messages'

/** A chrome event that records its listeners and can be fired by hand. */
function fakeEvent() {
  const listeners = new Set<(...args: any[]) => void>()
  return {
    addListener: (listener: (...args: any[]) => void) => void listeners.add(listener),
    removeListener: (listener: (...args: any[]) => void) => void listeners.delete(listener),
    fire: (...args: unknown[]) => listeners.forEach(listener => listener(...args)),
    get count() {
      return listeners.size
    },
  }
}

const PRICING = 'https://shop.example/pricing'
const BOX: FrameRecord = { kind: 'box', pageX: 120, pageY: 64, width: 300, height: 200 }
const ELEMENT: FrameRecord = { kind: 'element', selector: 'main > section:nth-of-type(2)', margin: 24, pageX: 176, pageY: 96, width: 448, height: 308 }

let memory: Map<string, unknown>
let tabs: { onUpdated: ReturnType<typeof fakeEvent>; onRemoved: ReturnType<typeof fakeEvent>; onReplaced: ReturnType<typeof fakeEvent> }
let frames: typeof import('../frame-memory')

/** Lets the listeners' storage calls finish. */
const settled = () => new Promise(resolve => setTimeout(resolve, 0))
const listening = () => [tabs.onUpdated.count, tabs.onRemoved.count, tabs.onReplaced.count]

beforeEach(async () => {
  memory = new Map()
  tabs = { onUpdated: fakeEvent(), onRemoved: fakeEvent(), onReplaced: fakeEvent() }
  const session = {
    get: async (key: string | null) => (key === null ? Object.fromEntries(memory) : memory.has(key) ? { [key]: memory.get(key) } : {}),
    set: async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) memory.set(key, structuredClone(value))
    },
    remove: async (key: string) => void memory.delete(key),
  }
  vi.stubGlobal('chrome', { storage: { session }, tabs })
  // the module keeps whether it listens: every test starts from a fresh worker
  vi.resetModules()
  frames = await import('../frame-memory')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the last frame belongs to one tab and one page (screenshot.md §1.4)', () => {
  it('keeps one frame per tab and gives it back on the page it was taken on, whatever the query or fragment', async () => {
    await frames.rememberFrame(1, `${PRICING}?period=monthly`, BOX)
    expect(await frames.readFrame(1, `${PRICING}?period=yearly#plans`)).toEqual(BOX)
    expect(await frames.readFrame(2, PRICING), 'another tab on the same page').toBeNull()

    await frames.rememberFrame(1, PRICING, ELEMENT)
    expect(await frames.readFrame(1, PRICING), 'the newer frame replaces the older one').toEqual(ELEMENT)
    expect(await frames.readFrame(1, 'https://shop.example/checkout'), 'another page').toBeNull()
    expect(await frames.readFrame(1, PRICING), 'asked from another page, the frame was forgotten').toBeNull()
  })

  it('keeps nothing for a page without an address', async () => {
    await frames.rememberFrame(1, undefined, BOX)
    expect(memory.size).toBe(0)
  })

  it('a reload, another query or another fragment keep the frame; another page, or one out of reach, forget it', async () => {
    await frames.rememberFrame(1, PRICING, BOX)
    tabs.onUpdated.fire(1, { status: 'loading' }, { url: PRICING })
    tabs.onUpdated.fire(1, { status: 'complete' }, { url: PRICING })
    tabs.onUpdated.fire(1, { url: `${PRICING}?period=yearly#plans` }, { url: `${PRICING}?period=yearly#plans` })
    tabs.onUpdated.fire(1, { title: 'Pricing (3)' }, { url: PRICING })
    await settled()
    expect(await frames.readFrame(1, PRICING)).toEqual(BOX)

    tabs.onUpdated.fire(2, { url: 'https://shop.example/' }, { url: 'https://shop.example/' })
    await settled()
    expect(await frames.readFrame(1, PRICING), 'another tab moving on does not matter').toEqual(BOX)

    tabs.onUpdated.fire(1, { url: 'https://shop.example/' }, { url: 'https://shop.example/' })
    await settled()
    expect(memory.size, 'the tab went to another page').toBe(0)
    tabs.onUpdated.fire(1, { url: PRICING }, { url: PRICING })
    await settled()
    expect(await frames.readFrame(1, PRICING), 'coming back finds nothing').toBeNull()

    // the extension may not read a browser page's address: the tab is somewhere else
    await frames.rememberFrame(1, PRICING, BOX)
    tabs.onUpdated.fire(1, { status: 'complete' }, {})
    await settled()
    expect(memory.size).toBe(0)
  })

  it('closing the tab, or swapping it for a prerendered page, forgets its frame', async () => {
    await frames.rememberFrame(1, PRICING, BOX)
    await frames.rememberFrame(3, PRICING, BOX)
    tabs.onRemoved.fire(1, { windowId: 1, isWindowClosing: false })
    tabs.onReplaced.fire(4, 3)
    await settled()
    expect(memory.size).toBe(0)
  })
})

describe('tab events wake the worker only while a tab has a frame', () => {
  it('listens from the top of the worker script, and stops once it finds no frame', async () => {
    frames.listenForFrames()
    expect(listening(), 'added at once, for an event that woke the worker').toEqual([1, 1, 1])
    await settled()
    expect(listening()).toEqual([0, 0, 0])

    await frames.rememberFrame(1, PRICING, BOX)
    await frames.rememberFrame(2, PRICING, BOX)
    expect(listening()).toEqual([1, 1, 1])
    tabs.onRemoved.fire(1, {})
    await settled()
    expect(listening(), 'tab 2 still has its frame').toEqual([1, 1, 1])
    tabs.onUpdated.fire(2, { url: 'https://shop.example/' }, { url: 'https://shop.example/' })
    await settled()
    expect(listening()).toEqual([0, 0, 0])
  })

  it('keeps listening when a worker restarts with frames left', async () => {
    memory.set('annhub.frame:5', { page: PRICING, record: BOX })
    frames.listenForFrames()
    await settled()
    expect(listening()).toEqual([1, 1, 1])
  })

  it('a frame kept while the check runs keeps the listeners on', async () => {
    frames.listenForFrames()
    await frames.rememberFrame(1, PRICING, BOX)
    await settled()
    expect(listening()).toEqual([1, 1, 1])
  })
})

describe('what a content script may hand over', () => {
  it('takes the frames the session builds, field by field', () => {
    expect(frames.frameRecordFrom({ ...BOX, path: '/pricing', note: 'x' })).toEqual(BOX)
    expect(frames.frameRecordFrom(ELEMENT)).toEqual(ELEMENT)
  })

  it.each([
    ['no record', undefined],
    ['an unknown kind', { ...BOX, kind: 'page' }],
    ['a size of zero', { ...BOX, width: 0 }],
    ['a position that is not a number', { ...BOX, pageX: Number.NaN }],
    ['an element without a selector', { ...ELEMENT, selector: '' }],
    ['a selector longer than the session writes', { ...ELEMENT, selector: 'div > '.repeat(400) }],
    ['a negative margin', { ...ELEMENT, margin: -8 }],
  ])('refuses %s', (_name, value) => {
    expect(frames.frameRecordFrom(value)).toBeNull()
  })

  it('names a page by scheme, host and path', () => {
    expect(frames.pageOf('https://shop.example:8443/pricing?period=yearly#plans')).toBe('https://shop.example:8443/pricing')
    expect(frames.pageOf('file:///Users/me/report.html')).toBe('file:///Users/me/report.html')
    expect(frames.pageOf(undefined)).toBeNull()
    expect(frames.pageOf('not a url')).toBeNull()
  })
})
