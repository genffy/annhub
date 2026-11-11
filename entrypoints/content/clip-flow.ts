/**
 * The clip flow — one click saves, a ~3s toast offers undo and edit
 * (docs/product/capture.md §3, §6.1, §7; extension.md §3). Failures keep the
 * selection and everything already typed; nothing shows success that was
 * not persisted.
 */
import { normalizeHost } from '../../core/normalize'
import { normalizeTags, TAG_LENGTH_MAX, TAGS_MAX } from '../../core/properties'
import { CONTEXT_MAX_CHARS } from '../../core/validate'
import { newEntryId } from '../../core/assets'
import MessageUtils from '../../utils/message'
import { entryErrorText, failureReason, uiText } from './ui-text'
import { elementToMarkdown, escapeText, selectionToMarkdown } from './markdown'
import { extractContext, extractPageMeta, resolvePermalink } from './page-meta'
import { overlayIcon } from './icons'
import { candidateDomRange } from './blocks'
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
    ...(context !== undefined ? { context } : {}),
    permalink: resolvePermalink(range.commonAncestorContainer, location.href),
    origin: { ...origin, truncated, startedAt },
  })
}

/** Older Chromium can expose shadow text but not its composed Range (capture.md §3). */
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
  const { markdown, truncated, platform } = elementToMarkdown(element, slice)
  if (!markdown.trim()) return EMPTY
  return saveClip({
    id,
    content: markdown,
    permalink: platform?.sourceUrl ?? resolvePermalink(range?.start ?? element, location.href, kind),
    ...(platform?.meta ? { meta: platform.meta } : {}),
    origin: { ...origin, blockKind: kind, truncated, startedAt },
  })
}

async function saveClip(input: {
  id: string
  content: string
  context?: string
  permalink: string
  meta?: { title: string; author?: string[]; published?: string }
  origin: ClipOrigin & { truncated?: boolean; startedAt?: number }
}): Promise<ClipResult> {
  const meta = { ...extractPageMeta(document, normalizeHost(location.href)), ...input.meta }
  const response = await MessageUtils.sendMessage({
    type: 'SAVE_CLIP',
    draft: {
      id: input.id,
      content: input.content,
      ...(input.context !== undefined ? { context: input.context } : {}),
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
  // no code when the worker answered none: the field stays absent, the toast falls back to its generic line
  if (!response.success || !response.data?.entry) return { failed: true, ...(response.error !== undefined ? { code: response.error } : {}) }
  return { entryId: response.data.entry.id, title: meta.title, truncated: Boolean(input.origin.truncated), origin: input.origin }
}

// ── Toast: 已剪藏 · 撤销 · 编辑 ──────────────────────────────────────────

/**
 * What a block clip's toast anchors on: a section on its interval — the bubble
 * then sits beside what was clipped, not beside a container taller than the
 * window — and an element-kind block on the element itself (RV-CAP-14).
 */
export function blockClipAnchor(candidate: BlockCandidate): Range | HTMLElement {
  return candidateDomRange(candidate) ?? candidate.element
}

export interface ToastHandle {
  dismiss(): void
}

export function showClipToast(outcome: ClipOutcome, editAnchor: Range | HTMLElement | null): ToastHandle {
  dismissToast()
  const doc = document
  const host = doc.createElement('div')
  host.setAttribute(ROOT_ATTR, 'clip-toast')
  // spoken as well as seen
  host.setAttribute('role', 'status')
  host.setAttribute('aria-live', 'polite')

  const bar = doc.createElement('div')
  bar.className = 'ann-clip-toast'
  const row = doc.createElement('div')
  row.className = 'ann-clip-toast-row'
  const mark = doc.createElement('span')
  mark.className = 'ann-clip-toast-icon'
  mark.appendChild(overlayIcon(doc, 'bookmark'))
  const label = doc.createElement('span')
  label.textContent = uiText('toast.clipped')
  const sep = doc.createElement('span')
  sep.className = 'ann-clip-toast-sepd'
  const undo = doc.createElement('button')
  undo.textContent = uiText('toast.undo')
  const edit = doc.createElement('button')
  edit.textContent = uiText('toast.edit')
  row.append(mark, label, sep, undo, edit)
  bar.appendChild(row)
  if (outcome.truncated) {
    const warn = doc.createElement('div')
    warn.className = 'ann-clip-toast-warn'
    warn.textContent = uiText('toast.truncated')
    bar.appendChild(warn)
  }
  const barFill = doc.createElement('i')
  const tbar = doc.createElement('div')
  tbar.className = 'ann-clip-toast-tbar'
  tbar.setAttribute('aria-hidden', 'true')
  tbar.appendChild(barFill)
  bar.appendChild(tbar)
  host.appendChild(bar)
  doc.documentElement.appendChild(host)

  // the ~3 s countdown pauses while the user is on the toast — reading the
  // warning or aiming at Undo — and resumes on leaving it.
  // The thin bar is the same countdown, not a decoration: it stops with the
  // timer and, on leaving, restarts a whole round like the timer does.
  const restartBar = (): void => {
    barFill.style.animation = 'none'
    void barFill.offsetWidth
    barFill.style.animation = ''
  }
  let timer = window.setTimeout(dismiss, TOAST_MS)
  const clear = () => window.clearTimeout(timer)
  const pause = () => {
    clear()
    bar.classList.add('ann-clip-toast-held')
  }
  const resume = () => {
    clear()
    bar.classList.remove('ann-clip-toast-held')
    restartBar()
    timer = window.setTimeout(dismiss, TOAST_MS)
  }
  host.addEventListener('pointerenter', pause)
  host.addEventListener('pointerleave', resume)
  host.addEventListener('focusin', pause)
  host.addEventListener('focusout', resume)

  const undoCapture = async (): Promise<void> => {
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
      undo.disabled = false
    }
  }
  undo.addEventListener('click', () => void undoCapture())
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
  host.setAttribute('role', 'status')
  host.setAttribute('aria-live', 'polite')
  const bar = document.createElement('div')
  bar.className = 'ann-clip-toast ann-clip-toast-undone'
  const mark = document.createElement('span')
  mark.className = 'ann-clip-toast-icon'
  mark.appendChild(overlayIcon(document, 'undo'))
  const label = document.createElement('span')
  label.textContent = uiText('toast.undone')
  bar.append(mark, label)
  host.appendChild(bar)
  document.documentElement.appendChild(host)
  window.setTimeout(() => host.remove(), TOAST_MS)
}

/** Save failed: the reason (when there is one worth telling) and Retry stay until dismissed; nothing claims success. */
export function showFailureToast(retry: () => void, failure?: ClipFailure): void {
  dismissToast()
  const doc = document
  const host = doc.createElement('div')
  host.setAttribute(ROOT_ATTR, 'clip-toast')
  host.setAttribute('role', 'alert')
  const bar = doc.createElement('div')
  bar.className = 'ann-clip-toast'
  const row = doc.createElement('div')
  row.className = 'ann-clip-toast-row'
  const mark = doc.createElement('span')
  mark.className = 'ann-clip-toast-icon ann-clip-toast-icon-danger'
  mark.appendChild(overlayIcon(doc, 'alert'))
  const label = doc.createElement('span')
  label.textContent = uiText('toast.saveFailed')
  const button = doc.createElement('button')
  button.textContent = uiText('toast.retry')
  button.addEventListener('click', () => {
    host.remove()
    retry()
  })
  row.append(mark, label, button)
  bar.appendChild(row)
  const reason = failureReason(failure?.code)
  if (reason) {
    const why = doc.createElement('div')
    why.className = 'ann-clip-toast-reason'
    why.textContent = reason
    bar.appendChild(why)
  }
  host.appendChild(bar)
  doc.documentElement.appendChild(host)
}

// ── Quick edit bubble: title, tags, note (extension.md §3) ───────────────
// The header says when it saves, and that is the truth: persist() runs on
// blur (a pointerdown outside), Esc, Enter in the title and Done.

export function openEditBubble(outcome: ClipOutcome, anchor: Range | HTMLElement | null): void {
  const existing = document.querySelector(`[${ROOT_ATTR}="clip-edit"]`)
  existing?.remove()

  const doc = document
  const host = doc.createElement('div')
  host.setAttribute(ROOT_ATTR, 'clip-edit')
  const panel = doc.createElement('div')
  panel.className = 'ann-clip-edit'

  const head = doc.createElement('div')
  head.className = 'ann-clip-edit-head'
  const headTitle = doc.createElement('span')
  headTitle.textContent = uiText('toast.clipped')
  const headHint = doc.createElement('span')
  headHint.className = 'ann-clip-edit-hint'
  headHint.textContent = uiText('edit.savesOnBlur')
  head.append(overlayIcon(doc, 'bookmark'), headTitle, headHint)

  const title = labeledInput(doc, 'edit.title', outcome.title)
  title.input.maxLength = 1000

  const errorLine = doc.createElement('div')
  errorLine.className = 'ann-clip-edit-error'
  errorLine.setAttribute('aria-live', 'polite')

  // tags live as chips beside the typing field: Enter or a comma commits what
  // is typed (a paste splits the same way), Backspace on an empty field drops
  // the last chip, blur commits the rest — the limits are the property's own
  const chips: string[] = []
  const tags = doc.createElement('div')
  tags.className = 'ann-clip-edit-tags'
  const tagsInput = doc.createElement('input')
  tagsInput.type = 'text'
  tagsInput.setAttribute('aria-label', uiText('edit.tags'))
  tagsInput.placeholder = uiText('edit.tagsPlaceholder')
  tags.appendChild(tagsInput)
  const tagsField = fieldWrap(doc, 'edit.tags', tags)

  const renderChips = (): void => {
    for (const chip of [...tags.querySelectorAll('.ann-clip-edit-chip')]) chip.remove()
    chips.forEach((tag, index) => {
      const chip = doc.createElement('span')
      chip.className = 'ann-clip-edit-chip'
      const text = doc.createElement('span')
      text.textContent = tag
      const remove = doc.createElement('button')
      remove.type = 'button'
      remove.setAttribute('aria-label', uiText('edit.removeTag', { tag }))
      remove.appendChild(overlayIcon(doc, 'x'))
      remove.addEventListener('click', () => {
        chips.splice(index, 1)
        renderChips()
      })
      chip.append(text, remove)
      tags.insertBefore(chip, tagsInput)
    })
  }

  /** Turns the typed text into chips; a limit violation leaves the text to edit and says which. */
  const commitTyped = (): boolean => {
    const parts = tagsInput.value
      .split(/[,，]/)
      .map(tag => tag.trim())
      .filter(Boolean)
    if (parts.length === 0) return true
    const all = [...chips, ...parts]
    if (all.some(tag => tag.length > TAG_LENGTH_MAX)) {
      errorLine.textContent = uiText('edit.error.tagTooLong', { limit: TAG_LENGTH_MAX })
      return false
    }
    if (all.length > TAGS_MAX) {
      errorLine.textContent = uiText('edit.error.tooManyTags', { limit: TAGS_MAX })
      return false
    }
    chips.splice(0, chips.length, ...all)
    tagsInput.value = ''
    renderChips()
    return true
  }

  tagsInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault()
      event.stopPropagation()
      commitTyped()
      return
    }
    if (event.key === 'Backspace' && tagsInput.value === '' && chips.length > 0) {
      chips.splice(chips.length - 1, 1)
      renderChips()
    }
  })
  tagsInput.addEventListener('blur', () => {
    if (host.isConnected) commitTyped()
  })

  const note = doc.createElement('textarea')
  note.className = 'ann-clip-edit-note'
  note.maxLength = 2000
  const noteField = fieldWrap(doc, 'edit.note', note)

  const actions = doc.createElement('div')
  actions.className = 'ann-clip-edit-actions'
  const more = doc.createElement('button')
  more.type = 'button'
  more.className = 'ann-clip-edit-more'
  more.append(doc.createTextNode(uiText('edit.more')), overlayIcon(doc, 'arrow-up-right'))
  more.addEventListener('click', () => {
    void MessageUtils.sendMessage({ type: 'OPEN_EXTENSION_PAGE', page: 'library', params: { entryId: outcome.entryId } })
    host.remove()
  })
  const done = doc.createElement('button')
  done.className = 'ann-clip-edit-done'
  done.type = 'button'
  done.textContent = uiText('edit.done')
  done.addEventListener('click', () => {
    void persist()
  })
  actions.append(more, done)
  panel.append(head, title.wrap, tagsField.wrap, noteField.wrap, errorLine, actions)
  host.appendChild(panel)
  doc.documentElement.appendChild(host)
  positionNear(host, anchor)
  title.input.focus()
  // the caret lands at the start and the box shows the title's beginning, not a tail scrolled out of view
  title.input.setSelectionRange(0, 0)
  title.input.scrollLeft = 0

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
    // chips plus whatever is still typed: a paste never split by a keypress lands here whole
    const rawTags = [
      ...chips,
      ...tagsInput.value
        .split(/[,，]/)
        .map(tag => tag.trim())
        .filter(Boolean),
    ]
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
    const noteValue = note.value.trim()

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

function fieldWrap(doc: Document, key: 'edit.title' | 'edit.tags' | 'edit.note', control: HTMLElement) {
  const wrap = doc.createElement('div')
  wrap.className = 'ann-clip-edit-field'
  const label = doc.createElement('span')
  label.textContent = uiText(key)
  wrap.append(label, control)
  return { wrap, control }
}

function labeledInput(doc: Document, key: 'edit.title', value: string) {
  const input = doc.createElement('input')
  input.type = 'text'
  input.value = value
  const field = fieldWrap(doc, key, input)
  return { wrap: field.wrap, input }
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
