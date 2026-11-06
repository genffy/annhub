import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useSelectionMode, type SelectionMode } from '../selection-mode'
import { makeClip } from '../../../core/__tests__/helpers'

const send = vi.hoisted(() => vi.fn())
vi.mock('../../../utils/message', () => ({ default: { sendMessage: send } }))
const entries = [makeClip(), makeClip()]
const queryFor = () => ({})
let selection: SelectionMode
let root: Root
let host: HTMLDivElement
function Harness({ queryKey }: { queryKey: string }) {
  selection = useSelectionMode(queryKey, entries, queryFor)
  return null
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  send.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(createElement(Harness, { queryKey: 'all' })))
  act(() => selection.enter())
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

it.each(['toggle', 'clear', 'exit', 'navigate'] as const)('ignores a late select-all response after %s', async action => {
  let finish!: (value: unknown) => void
  send.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  const pending = selection.selectAll()
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  await act(async () => {
    if (action === 'toggle') selection.toggle(entries[0]!, false)
    else if (action === 'navigate') root.render(createElement(Harness, { queryKey: 'clips' }))
    else selection[action]()
  })
  await act(async () => {
    finish({ success: true, data: { result: { items: entries } } })
    await pending
  })
  expect(selection.selectedIds).toEqual(action === 'toggle' ? [entries[0]!.id] : [])
  if (action === 'exit' || action === 'navigate') expect(selection.selecting).toBe(false)
})

it('applies a select-all response when no later selection action occurred', async () => {
  send.mockResolvedValue({ success: true, data: { result: { items: entries } } })
  await act(async () => {
    await selection.selectAll()
  })
  expect(selection.selectedIds).toEqual(entries.map(entry => entry.id))
})
