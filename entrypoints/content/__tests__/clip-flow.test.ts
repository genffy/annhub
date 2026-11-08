import { afterEach, describe, expect, it, vi } from 'vitest'
import MessageUtils from '../../../utils/message'
import { blockClipAnchor, isClipFailure, openEditBubble, saveSelectionClip, showClipToast, showFailureToast } from '../clip-flow'
import type { BlockCandidate } from '../blocks'

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.querySelectorAll('[data-ann-ui="clip-toast"], [data-ann-ui="clip-edit"]').forEach(node => node.remove())
  document.body.innerHTML = ''
})

describe('capture undo feedback (RV-CAP-03)', () => {
  it('keeps the toast and retry action when deletion fails', async () => {
    vi.spyOn(MessageUtils, 'sendMessage').mockResolvedValue({ type: 'RESPONSE', success: false, error: 'ENTRY_CONTENT_INVALID' })
    showClipToast({ entryId: 'ent_test', title: 'T', truncated: false }, null)
    const toast = document.querySelector<HTMLElement>('[data-ann-ui="clip-toast"]')!
    toast.querySelector('button')!.click()
    await vi.waitFor(() => expect(toast.textContent).toContain('撤销失败'))
    expect(toast.isConnected).toBe(true)
    expect(toast.querySelector('button')!.disabled).toBe(false)
  })
})

function selectParagraph(text = 'Retries can amplify an outage when the dependency is saturated.'): Range {
  document.body.innerHTML = `<p id="p">${text}</p>`
  const range = document.createRange()
  range.selectNodeContents(document.getElementById('p')!)
  return range
}

describe('a failed save says why (capture.md §7, extension.md §6)', () => {
  it("carries the worker's stable code out of the save", async () => {
    vi.spyOn(MessageUtils, 'sendMessage').mockResolvedValue({ type: 'RESPONSE', success: false, error: 'STORAGE_QUOTA_EXCEEDED' })
    const result = await saveSelectionClip(selectParagraph(), { via: 'menu' })
    expect(isClipFailure(result)).toBe(true)
    expect(result).toEqual({ failed: true, code: 'STORAGE_QUOTA_EXCEEDED' })
  })

  it('names an empty selection instead of failing without a word', async () => {
    const send = vi.spyOn(MessageUtils, 'sendMessage')
    const result = await saveSelectionClip(selectParagraph(' '), { via: 'menu' })
    expect(result).toEqual({ failed: true, code: 'EMPTY_CONTENT' })
    expect(send).not.toHaveBeenCalled()
  })

  it('a saved clip is an outcome, not a failure', async () => {
    vi.spyOn(MessageUtils, 'sendMessage').mockResolvedValue({ type: 'RESPONSE', success: true, data: { entry: { id: 'ent_saved' } } })
    const result = await saveSelectionClip(selectParagraph(), { via: 'menu' })
    expect(isClipFailure(result)).toBe(false)
    expect(result).toMatchObject({ entryId: 'ent_saved' })
  })

  it('the toast gives the reason, tells a full disk to export first, and offers Retry', () => {
    const retry = vi.fn()
    showFailureToast(retry, { failed: true, code: 'STORAGE_QUOTA_EXCEEDED' })
    const toast = document.querySelector<HTMLElement>('[data-ann-ui="clip-toast"]')!
    expect(toast.textContent).toContain('保存失败')
    expect(toast.querySelector('.ann-clip-toast-reason')!.textContent).toContain('导出')
    toast.querySelector('button')!.click()
    expect(retry).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-ann-ui="clip-toast"]')).toBeNull()
  })

  it('a failure without an explanation stays a plain "Save failed", never a raw message', () => {
    showFailureToast(() => undefined, { failed: true, code: 'Could not establish connection. Receiving end does not exist.' })
    const toast = document.querySelector<HTMLElement>('[data-ann-ui="clip-toast"]')!
    expect(toast.textContent).toContain('保存失败')
    expect(toast.textContent).not.toContain('connection')
    expect(toast.querySelector('.ann-clip-toast-reason')).toBeNull()
  })
})

describe('the quick edit bubble keeps typed text and says why a write was refused (RV-CAP-03)', () => {
  it('shows the quota advice, in English when the browser is', async () => {
    vi.spyOn(MessageUtils, 'sendMessage').mockResolvedValue({ type: 'RESPONSE', success: false, error: 'STORAGE_QUOTA_EXCEEDED' })
    openEditBubble({ entryId: 'ent_1', title: 'T', truncated: false }, document.body)
    const bubble = document.querySelector<HTMLElement>('[data-ann-ui="clip-edit"]')!
    const note = bubble.querySelector<HTMLTextAreaElement>('textarea')!
    note.value = 'my note'
    ;[...bubble.querySelectorAll('button')].find(button => button.textContent === '完成')!.click()
    await vi.waitFor(() => expect(bubble.querySelector('.ann-clip-edit-error')!.textContent).toContain('导出'))
    expect(bubble.isConnected).toBe(true)
    expect(note.value).toBe('my note')
  })

  it('an unexplained refusal reads "Save failed" and still keeps the bubble', async () => {
    vi.spyOn(MessageUtils, 'sendMessage').mockResolvedValue({ type: 'RESPONSE', success: false, error: 'Forbidden: extension page context required' })
    openEditBubble({ entryId: 'ent_1', title: 'T', truncated: false }, document.body)
    const bubble = document.querySelector<HTMLElement>('[data-ann-ui="clip-edit"]')!
    const note = bubble.querySelector<HTMLTextAreaElement>('textarea')!
    note.value = 'my note'
    ;[...bubble.querySelectorAll('button')].find(button => button.textContent === '完成')!.click()
    await vi.waitFor(() => expect(bubble.querySelector('.ann-clip-edit-error')!.textContent).toBe('保存失败'))
    expect(bubble.isConnected).toBe(true)
  })
})

describe('the countdown bar is the timer, not a decoration (extension.md §3)', () => {
  it('stops with the toast while the user is on it and runs a fresh round after leaving', () => {
    vi.useFakeTimers()
    const handle = showClipToast({ entryId: 'ent_t', title: 'T', truncated: false }, null)
    const host = document.querySelector<HTMLElement>('[data-ann-ui="clip-toast"]')!
    const bar = host.querySelector<HTMLElement>('.ann-clip-toast')!
    expect(host.querySelector('.ann-clip-toast-tbar i')).not.toBeNull()

    host.dispatchEvent(new MouseEvent('pointerenter'))
    vi.advanceTimersByTime(10_000)
    expect(host.isConnected).toBe(true)
    expect(bar.classList.contains('ann-clip-toast-held')).toBe(true)

    host.dispatchEvent(new MouseEvent('pointerleave'))
    expect(bar.classList.contains('ann-clip-toast-held')).toBe(false)
    vi.advanceTimersByTime(3_100)
    expect(host.isConnected).toBe(true)
    vi.advanceTimersByTime(200)
    expect(host.isConnected).toBe(false)
    handle.dismiss()
    vi.useRealTimers()
  })
})

describe('the tag field commits chips and refuses what the property refuses (extension.md §3)', () => {
  const openBubble = (): HTMLElement => {
    vi.spyOn(MessageUtils, 'sendMessage').mockResolvedValue({ type: 'RESPONSE', success: true, data: {} })
    openEditBubble({ entryId: 'ent_1', title: 'T', truncated: false }, document.body)
    return document.querySelector<HTMLElement>('[data-ann-ui="clip-edit"]')!
  }
  const chipTexts = (bubble: HTMLElement): string[] => [...bubble.querySelectorAll('.ann-clip-edit-chip > span:first-child')].map(chip => chip.textContent ?? '')

  it('Enter and a comma turn the typed text into chips; Backspace on an empty field drops the last one', async () => {
    const bubble = openBubble()
    const input = bubble.querySelectorAll('input')[1] as HTMLInputElement
    input.value = 'retry'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    input.value = 'streams'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '，', bubbles: true, cancelable: true }))
    expect(chipTexts(bubble)).toEqual(['retry', 'streams'])
    expect(input.value).toBe('')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
    expect(chipTexts(bubble)).toEqual(['retry'])

    input.value = 'left uncommitted'
    input.dispatchEvent(new FocusEvent('blur'))
    expect(chipTexts(bubble)).toEqual(['retry', 'left uncommitted'])
    ;[...bubble.querySelectorAll('button')].find(button => button.textContent === '完成')!.click()
    await vi.waitFor(() => expect(bubble.isConnected).toBe(false))
    expect(MessageUtils.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'UPDATE_ENTRY', patch: expect.objectContaining({ properties: { set: { tags: ['retry', 'left uncommitted'] } } }) }),
    )
  })

  it('says which limit was hit and keeps the text for editing instead of chipping it', () => {
    const bubble = openBubble()
    const input = bubble.querySelectorAll('input')[1] as HTMLInputElement
    input.value = 'x'.repeat(33)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(bubble.querySelector('.ann-clip-edit-error')!.textContent).toContain('32')
    expect(chipTexts(bubble)).toEqual([])
    expect(input.value).toBe('x'.repeat(33))
  })

  it('names each chip’s remover for the screen reader', () => {
    const bubble = openBubble()
    const input = bubble.querySelectorAll('input')[1] as HTMLInputElement
    input.value = 'retry'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(bubble.querySelector('.ann-clip-edit-chip button')!.getAttribute('aria-label')).toBe('移除标签：retry')
  })
})

describe('a block clip anchors its toast on what was clipped (RV-CAP-14)', () => {
  const SECTION_LONG = 'This sentence is deliberately long so the block clears the 120 character minimum for sections. '.repeat(3)
  const FLAT = `<div class="content" id="content">
    <h2 id="h-install">Install</h2><p id="p1">${SECTION_LONG}</p><p id="p2">${SECTION_LONG}</p>
    <h2 id="h-usage">Usage</h2><p>${SECTION_LONG}</p>
  </div>`

  function sectionCandidate(): BlockCandidate {
    document.body.innerHTML = FLAT
    return {
      kind: 'section',
      element: document.getElementById('content')!,
      range: { start: document.getElementById('h-install')!, end: document.getElementById('h-usage')! },
    }
  }

  it('a section anchors on its interval: the edit bubble sits beside the run, not beside the taller container', () => {
    const candidate = sectionCandidate()
    const anchor = blockClipAnchor(candidate)
    expect(anchor).toBeInstanceOf(Range)
    // jsdom lays nothing out: the run's union rect, and a container far taller than the window
    ;(anchor as Range).getBoundingClientRect = () => new DOMRect(100, 200, 300, 80)
    candidate.element.getBoundingClientRect = () => new DOMRect(100, 0, 300, 5000)
    showClipToast({ entryId: 'ent_1', title: 'T', truncated: false }, anchor)
    const edit = [...document.querySelectorAll<HTMLButtonElement>('[data-ann-ui="clip-toast"] button')].find(button => button.textContent === '编辑')!
    edit.click()
    const bubble = document.querySelector<HTMLElement>('[data-ann-ui="clip-edit"]')!
    // beside the section's own bottom edge (200 + 80 + 8), never the container's clamped top (8)
    expect(Number.parseFloat(bubble.style.top)).toBe(288)
    expect(Number.parseFloat(bubble.style.left)).toBe(100)
  })

  it('an element-kind block keeps anchoring on the element itself', () => {
    document.body.innerHTML = '<pre id="code">const a = 1</pre>'
    const candidate = { kind: 'code', element: document.getElementById('code')! } as BlockCandidate
    expect(blockClipAnchor(candidate)).toBe(candidate.element)
  })
})
