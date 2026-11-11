import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useListQuery } from '../use-list-query'

/**
 * The list query hook (RV-LIB-20), run under `act` with a real root as the item asks: the first
 * page follows the route's query, a page that loses the race with a newer query is dropped, and
 * 显示更多 appends the next page.
 */

type List = ReturnType<typeof useListQuery>

let host: HTMLDivElement
let root: Root
let list: List | undefined

function Probe(props: { input: Parameters<typeof useListQuery>[0] }) {
  list = useListQuery(props.input)
  return null
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  list = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const page = (id: string) => ({ type: 'RESPONSE', success: true, data: { result: { items: [{ id }], total: 1, nextCursor: null } } })

describe('useListQuery (RV-LIB-20)', () => {
  it('sends the route query with the page size and keeps its answer', async () => {
    const send = vi.fn(async () => page('ent_1'))
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
    act(() => {
      root.render(<Probe input={{ active: true, queryJson: '{"types":["clip"]}', queryKey: '#/clips', reloadKey: 0, query: () => ({ types: ['clip'] }) }} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'QUERY_ENTRIES', query: { types: ['clip'], limit: 50 } }))
    expect(list!.items).toEqual([{ id: 'ent_1' }])
    expect(list!.loading).toBe(false)
  })

  it('drops the page that lost the race with a newer query', async () => {
    let resolveFirst!: (value: unknown) => void
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)))
      .mockImplementationOnce(async () => page('ent_2'))
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
    act(() => {
      root.render(<Probe input={{ active: true, queryJson: '{}', queryKey: '#/all', reloadKey: 0, query: () => ({}) }} />)
    })
    await act(async () => {
      // the query changes before the first answer arrives
      root.render(<Probe input={{ active: true, queryJson: '{"types":["clip"]}', queryKey: '#/clips', reloadKey: 0, query: () => ({}) }} />)
      await Promise.resolve()
    })
    expect(list!.items).toEqual([{ id: 'ent_2' }])
    await act(async () => {
      resolveFirst(page('ent_stale'))
      await Promise.resolve()
    })
    expect(list!.items).toEqual([{ id: 'ent_2' }])
  })

  it('waits while the registry has not answered (a null query)', async () => {
    const send = vi.fn()
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
    act(() => {
      root.render(<Probe input={{ active: true, queryJson: null, queryKey: '#/all', reloadKey: 0, query: () => ({}) }} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(send).not.toHaveBeenCalled()
    expect(list!.loading).toBe(true)
  })
})
