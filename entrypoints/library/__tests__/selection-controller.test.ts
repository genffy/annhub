import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useSelectionController, type SelectionController } from '../selection-controller'

const beforeEnter = vi.hoisted(() => vi.fn())
vi.mock('../download-client', () => ({ useLibraryDownload: () => ({ state: { phase: 'idle' }, dismiss: () => undefined }) }))
let controller: SelectionController
let root: Root
let host: HTMLDivElement
const items: never[] = []
function Harness({ queryKey }: { queryKey: string }) {
  controller = useSelectionController({ listQueryKey: queryKey, items, total: 0, queryFor: () => ({}), beforeEnter, escapeBlocked: false })
  return null
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  beforeEnter.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(createElement(Harness, { queryKey: 'all' })))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

it.each(['navigate', 'exit'] as const)('ignores a late drawer-save reply after %s', async action => {
  let finish!: (value: boolean) => void
  beforeEnter.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  act(() => controller.toggleSelection())
  await act(async () => {
    if (action === 'navigate') root.render(createElement(Harness, { queryKey: 'screenshots' }))
    else controller.exitSelection()
  })
  await act(async () => finish(true))
  expect(controller.selecting).toBe(false)
})

it('runs one drawer save for repeated selection clicks and enters only after that save succeeds', async () => {
  let finish!: (value: boolean) => void
  beforeEnter.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  act(() => {
    controller.toggleSelection()
    controller.toggleSelection()
  })
  expect(beforeEnter).toHaveBeenCalledTimes(1)
  expect(controller.selecting).toBe(false)
  await act(async () => finish(true))
  expect(controller.selecting).toBe(true)
})

it('keeps selection closed after a failed save and accepts a later retry', async () => {
  beforeEnter.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  await act(async () => controller.toggleSelection())
  expect(controller.selecting).toBe(false)
  await act(async () => controller.toggleSelection())
  expect(controller.selecting).toBe(true)
})
