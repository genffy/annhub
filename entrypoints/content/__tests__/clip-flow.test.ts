import { afterEach, describe, expect, it, vi } from 'vitest'
import MessageUtils from '../../../utils/message'
import { isClipFailure, openEditBubble, saveSelectionClip, showClipToast, showFailureToast } from '../clip-flow'

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
    const inputs = bubble.querySelectorAll('input')
    inputs[2]!.value = 'my note'
    ;[...bubble.querySelectorAll('button')].find(button => button.textContent === '完成')!.click()
    await vi.waitFor(() => expect(bubble.querySelector('.ann-clip-edit-error')!.textContent).toContain('导出'))
    expect(bubble.isConnected).toBe(true)
    expect(inputs[2]!.value).toBe('my note')
  })

  it('an unexplained refusal reads "Save failed" and still keeps the bubble', async () => {
    vi.spyOn(MessageUtils, 'sendMessage').mockResolvedValue({ type: 'RESPONSE', success: false, error: 'Forbidden: extension page context required' })
    openEditBubble({ entryId: 'ent_1', title: 'T', truncated: false }, document.body)
    const bubble = document.querySelector<HTMLElement>('[data-ann-ui="clip-edit"]')!
    bubble.querySelectorAll('input')[2]!.value = 'my note'
    ;[...bubble.querySelectorAll('button')].find(button => button.textContent === '完成')!.click()
    await vi.waitFor(() => expect(bubble.querySelector('.ann-clip-edit-error')!.textContent).toBe('保存失败'))
    expect(bubble.isConnected).toBe(true)
  })
})
