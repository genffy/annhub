/**
 * The clip flow — one click saves, a ~3s toast offers undo and edit
 * (docs/v2/capture.md §3, §6.1, §7; extension.md §3). Failures keep the
 * selection and everything already typed; nothing shows success that was
 * not persisted.
 */
import { normalizeHost } from '../../learning-core/normalize'
import { normalizeTags, TAG_LENGTH_MAX, TAGS_MAX } from '../../learning-core/properties'
import { CONTEXT_MAX_CHARS } from '../../learning-core/validate'
import { newEntryId } from '../../learning-core/assets'
import MessageUtils from '../../utils/message'
import { entryErrorText, failureReason, uiText } from '../../utils/ui-text'
import { elementToMarkdown, escapeText, selectionToMarkdown } from './markdown'
import { extractContext, extractPageMeta, resolvePermalink } from './page-meta'
import type { BlockCandidate, BlockKind } from './blocks'

const ROOT_ATTR = 'data-ann-ui'
const TOAST_MS = 3200

export interface ClipOrigin {
  via: 'menu' | 'block' | 'shortcut'
  blockKind?: BlockKind
  levelChanged?: boolean
}

export interface ClipOutcome {
  entryId: string
  title: string
  truncated: boolean
  origin?: ClipOrigin
}

/** A save that did not go through. `code` is the worker's stable answer when there was one: the toast says why. */
export interface ClipFailure {
  failed: true
  code?: string
}

export type ClipResult = ClipOutcome | ClipFailure

export function isClipFailure(result: ClipResult): result is ClipFailure {
  return 'failed' in result
}

/** Nothing in what was pointed at converts to text: a failure the user can read, not a silent no-op. */
const EMPTY: ClipFailure = { failed: true, code: 'EMPTY_CONTENT' }

/** Saves a selection as a clip; a failure carries its reason (the caller shows it, with Retry). */
export async function saveSelectionClip(range: Range, origin: ClipOrigin, id = newEntryId()): Promise<ClipResult> {
  const startedAt = Date.now()
  const { markdown, truncated } = selectionToMarkdown(range)
  if (!markdown.trim()) return EMPTY
  const selected = range.toString()
  const context = selected.length <= CONTEXT_MAX_CHARS ? extractContext(range) : undefined
  return saveClip({
    id,
    content: markdown,
    context,
    permalink: resolvePermalink(range.commonAncestorContainer, location.href),
    origin: { ...origin, truncated, startedAt },
  })
}

/** Older Chromium can expose shadow text but not its composed Range (D-25). */
export async function savePlainTextSelection(text: string, origin: ClipOrigin, id = newEntryId()): Promise<ClipResult> {
  const startedAt = Date.now()
  const content = escapeText(text).trim()
  if (!content) return EMPTY
  return saveClip({ id, content, permalink: resolvePermalink(document.body, location.href), origin: { ...origin, startedAt } })
}

/** Saves a block as a clip: its own permalink, no context (capture.md §6.2). */
export async function saveBlockClip(candidate: BlockCandidate, origin: ClipOrigin, id = newEntryId()): Promise<ClipResult> {
  const startedAt = Date.now()
  const { element, kind, range } = candidate
  // a heading-bounded section converts (and anchors) its sibling run only
  const slice = range && range.start.parentElement === element ? { from: range.start, to: range.end } : undefined
  const { markdown, truncated } = elementToMarkdown(element, slice)
  if (!markdown.trim()) return EMPTY
  return saveClip({
    id,
    content: markdown,
    permalink: resolvePermalink(range?.start ?? element, location.href, kind),
    origin: { ...origin, blockKind: kind, truncated, startedAt },
  })
}

async function saveClip(input: {
  id: string
  content: string
  context?: string
  permalink: string
  origin: ClipOrigin & { truncated?: boolean; startedAt?: number }
}): Promise<ClipResult> {
  const meta = extractPageMeta(document, normalizeHost(location.href))
  const response = await MessageUtils.sendMessage<{ entry: { id: string } }>({
    type: 'SAVE_CLIP',
    draft: {
      id: input.id,
      content: input.content,
      context: input.context,
      sourceUrl: input.permalink,
      properties: {
        title: meta.title,
        ...(meta.author ? { author: meta.author } : {}),
        ...(meta.published ? { published: meta.published } : {}),
        ...(meta.description ? { description: meta.description } : {}),
      },
      ...input.origin,
    },
  })
  if (!response.success || !response.data?.entry) return { failed: true, code: response.error }
  return { entryId: response.data.entry.id, title: meta.title, truncated: Boolean(input.origin.truncated), origin: input.origin }
}

// ── Toast: 已剪藏 · 撤销 · 编辑 ──────────────────────────────────────────

export interface ToastHandle {
  dismiss(): void
}

export function showClipToast(outcome: ClipOutcome, editAnchor: Range | HTMLElement | null): ToastHandle {
  dismissToast()
  const doc = document
  const host = doc.createElement('div')
  host.setAttribute(ROOT_ATTR, 'clip-toast')

  const label = doc.createElement('span')
  label.textContent = uiText('toast.clipped')
  const undo = doc.createElement('button')
  undo.textContent = uiText('toast.undo')
  const edit = doc.createElement('button')
  edit.textContent = uiText('toast.edit')

  const bar = doc.createElement('div')
  bar.className = 'ann-clip-toast'
  if (outcome.truncated) {
    const warn = doc.createElement('div')
    warn.className = 'ann-clip-toast-warn'
    warn.textContent = uiText('toast.truncated')
    bar.appendChild(warn)
  }
  const row = doc.createElement('div')
  row.className = 'ann-clip-toast-row'
  row.append(label, undo, edit)
  bar.appendChild(row)
  host.appendChild(bar)
  doc.documentElement.appendChild(host)

  const timer = window.setTimeout(dismiss, TOAST_MS)
  const clear = () => window.clearTimeout(timer)

  undo.addEventListener('click', async () => {
    clear()
    undo.disabled = true
    const response = await MessageUtils.sendMessage({
      type: 'DELETE_ENTRY',
      id: outcome.entryId,
      ...(outcome.origin ? { attribution: { ...outcome.origin, truncated: outcome.truncated } } : {}),
    })
    if (response.success) {
      dismiss()
      showUndone()
    } else {
      label.textContent = uiText('toast.undoFailed')
      bar.classList.add('ann-clip-toast-error')
      undo.disabled = false
    }
  })
  edit.addEventListener('click', () => {
    clear()
    openEditBubble(outcome, editAnchor)
    dismiss()
  })

  function dismiss(): void {
    clear()
    host.remove()
  }
  currentToastDismiss = dismiss
  return { dismiss }
}

let currentToastDismiss: (() => void) | null = null

function dismissToast(): void {
  currentToastDismiss?.()
  currentToastDismiss = null
}

function showUndone(): void {
  const host = document.createElement('div')
  host.setAttribute(ROOT_ATTR, 'clip-toast')
  const bar = document.createElement('div')
  bar.className = 'ann-clip-toast ann-clip-toast-undone'
  bar.textContent = uiText('toast.undone')
  host.appendChild(bar)
  document.documentElement.appendChild(host)
  window.setTimeout(() => host.remove(), TOAST_MS)
}

/** Save failed: the reason (when there is one worth telling) and Retry stay until dismissed; nothing claims success. */
export function showFailureToast(retry: () => void, failure?: ClipFailure): void {
  dismissToast()
  const host = document.createElement('div')
  host.setAttribute(ROOT_ATTR, 'clip-toast')
  const bar = document.createElement('div')
  bar.className = 'ann-clip-toast ann-clip-toast-error'
  const label = document.createElement('span')
  label.textContent = uiText('toast.saveFailed')
  const reason = failureReason(failure?.code)
  if (reason) {
    const why = document.createElement('div')
    why.className = 'ann-clip-toast-reason'
    why.textContent = reason
    bar.appendChild(why)
  }
  const button = document.createElement('button')
  button.textContent = uiText('toast.retry')
  button.addEventListener('click', () => {
    host.remove()
    retry()
  })
  const row = document.createElement('div')
  row.className = 'ann-clip-toast-row'
  row.append(label, button)
  bar.appendChild(row)
  host.appendChild(bar)
  document.documentElement.appendChild(host)
}

// ── Quick edit bubble: title, tags, note (extension.md §3) ───────────────

export function openEditBubble(outcome: ClipOutcome, anchor: Range | HTMLElement | null): void {
  const existing = document.querySelector(`[${ROOT_ATTR}="clip-edit"]`)
  existing?.remove()

  const doc = document
  const host = doc.createElement('div')
  host.setAttribute(ROOT_ATTR, 'clip-edit')
  const panel = doc.createElement('div')
  panel.className = 'ann-clip-edit'

  const title = labeledInput(doc, 'edit.title', outcome.title)
  title.input.maxLength = 1000
  const tags = labeledInput(doc, 'edit.tags', '')
  tags.input.placeholder = 'tag1, tag2'
  const note = labeledInput(doc, 'edit.note', '')
  note.input.maxLength = 2000
  const errorLine = doc.createElement('div')
  errorLine.className = 'ann-clip-edit-error'
  errorLine.setAttribute('aria-live', 'polite')
  const actions = doc.createElement('div')
  actions.className = 'ann-clip-edit-actions'
  const more = doc.createElement('button')
  more.textContent = uiText('edit.more')
  more.addEventListener('click', () => {
    void MessageUtils.sendMessage({ type: 'OPEN_EXTENSION_PAGE', page: 'library', params: { entryId: outcome.entryId } })
    host.remove()
  })
  const done = doc.createElement('button')
  done.className = 'ann-clip-edit-done'
  done.textContent = uiText('edit.done')
  done.addEventListener('click', () => {
    void persist()
  })
  actions.append(more, done)
  panel.append(title.wrap, tags.wrap, note.wrap, errorLine, actions)
  host.appendChild(panel)
  doc.documentElement.appendChild(host)
  positionNear(host, anchor)
  title.input.focus()

  const close = (event: Event): void => {
    if (event.target instanceof Node && host.contains(event.target)) return
    void persist()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      void persist()
    }
    if (event.key === 'Enter' && event.target === title.input) void persist()
  }
  doc.addEventListener('pointerdown', close, true)
  doc.addEventListener('keydown', onKey, true)

  const detach = (): void => {
    doc.removeEventListener('pointerdown', close, true)
    doc.removeEventListener('keydown', onKey, true)
  }

  let persisting = false
  async function persist(): Promise<void> {
    if (persisting) return
    persisting = true
    errorLine.textContent = ''
    const titleValue = title.input.value.trim()
    const rawTags = tags.input.value
      .split(/[,，]/)
      .map(tag => tag.trim())
      .filter(Boolean)
    if (rawTags.some(tag => tag.length > TAG_LENGTH_MAX)) {
      errorLine.textContent = uiText('edit.error.tagTooLong', { limit: TAG_LENGTH_MAX })
      persisting = false
      return
    }
    if (rawTags.length > TAGS_MAX) {
      errorLine.textContent = uiText('edit.error.tooManyTags', { limit: TAGS_MAX })
      persisting = false
      return
    }
    const tagList = normalizeTags(rawTags)
    const noteValue = note.input.value.trim()

    // only the fields the user actually changed travel; everything the
    // capture wrote (author, published, …) is out of reach of this edit
    const set: Record<string, string | string[]> = {}
    if (titleValue && titleValue !== outcome.title) set.title = titleValue
    if (tagList.length > 0) set.tags = tagList
    if (Object.keys(set).length === 0 && !noteValue) {
      detach()
      host.remove()
      return
    }

    const response = await MessageUtils.sendMessage({
      type: 'UPDATE_ENTRY',
      id: outcome.entryId,
      patch: {
        ...(Object.keys(set).length > 0 ? { properties: { set } } : {}),
        ...(noteValue ? { note: noteValue } : {}),
      },
    })
    if (!response.success) {
      // the bubble and the typed text survive; the user can adjust and retry
      persisting = false
      errorLine.textContent = entryErrorText(response.error)
      return
    }
    detach()
    host.remove()
  }
}

function labeledInput(doc: Document, key: 'edit.title' | 'edit.tags' | 'edit.note', value: string) {
  const wrap = doc.createElement('label')
  wrap.className = 'ann-clip-edit-field'
  const label = doc.createElement('span')
  label.textContent = uiText(key)
  const input = doc.createElement('input')
  input.type = 'text'
  input.value = value
  wrap.append(label, input)
  return { wrap, input }
}

function positionNear(host: HTMLElement, anchor: Range | HTMLElement | null): void {
  const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor?.getBoundingClientRect()
  const view = document.defaultView!
  const box = host.getBoundingClientRect()
  const x = rect ? Math.min(Math.max(8, rect.left), Math.max(8, view.innerWidth - box.width - 8)) : Math.max(8, (view.innerWidth - box.width) / 2)
  const below = rect ? rect.bottom + 8 : view.innerHeight / 2
  const y = below + box.height <= view.innerHeight - 8 ? below : Math.max(8, (rect?.top ?? view.innerHeight / 2) - box.height - 8)
  host.style.left = `${x}px`
  host.style.top = `${y}px`
}
