import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCounts } from '../use-counts'

/**
 * The nav's numbers hook (RV-LIB-20), run under `act` with a real root as the item asks: one
 * facets read fills counts, highlight total and candidates together, and the entries-changed
 * broadcast reloads them.
 */

type Counts = ReturnType<typeof useCounts>

let host: HTMLDivElement
let root: Root
let counts: Counts | undefined

function Probe() {
  counts = useCounts()
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
  counts = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const facets = (all: number) => ({
  counts: { all, clips: all - 1, screenshots: 1, highlights: 2 },
  hosts: ['example.com'],
  tags: ['retry'],
})

describe('useCounts (RV-LIB-20)', () => {
  it('fills counts, highlight total and candidates from one facets read, then reloads on the broadcast', async () => {
    const send = vi.fn(async () => ({ success: true, data: { facets: facets(5) } }))
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage: ((event: { data: unknown }) => void) | null = null
        close(): void {}
      },
    )
    act(() => {
      root.render(<Probe />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'QUERY_FACETS' }))
    expect(counts!.counts).toEqual({ all: 5, clips: 4, screenshots: 1 })
    expect(counts!.highlightTotal).toBe(2)
    expect(counts!.hosts).toEqual(['example.com'])
    expect(counts!.tags).toEqual(['retry'])
    expect(counts!.countsReady).toBe(true)
    expect(counts!.reloadKey).toBe(0)

    send.mockResolvedValue({ success: true, data: { facets: facets(6) } })
    await act(async () => {
      counts!.reload()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(counts!.counts.all).toBe(6)
    expect(counts!.reloadKey).toBe(1)
  })
})
