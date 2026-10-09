/**
 * The clip flow — one click saves, a ~3s toast offers undo and edit
 * (docs/v2/capture.md §3, §6.1, §7; extension.md §3). Failures keep the
 * selection and everything already typed; nothing shows success that was
 * not persisted.
 */
import { normalizeHost } from '../../learning-core/normalize'
import { normalizeTags } from '../../learning-core/properties'
import { CONTEXT_MAX_CHARS } from '../../learning-core/validate'
import MessageUtils from '../../utils/message'
import { uiText } from '../../utils/ui-text'
import { elementToMarkdown, selectionToMarkdown } from './markdown'
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
}

/** Saves a selection as a clip; returns undefined on failure (caller shows retry). */
export async function saveSelectionClip(range: Range, origin: ClipOrigin): Promise<ClipOutcome | undefined> {
  const { markdown, truncated } = selectionToMarkdown(range)
  if (!markdown.trim()) return undefined
  const selected = range.toString()
  const context = selected.length <= CONTEXT_MAX_CHARS ? extractContext(range) : undefined
  return saveClip({
    content: markdown,
    context,
    permalink: resolvePermalink(range.commonAncestorContainer, location.href),
    origin: { ...origin, truncated },
  })
}

/** Saves a block as a clip: its own permalink, no context (capture.md §6.2). */
export async function saveBlockClip(candidate: BlockCandidate, origin: ClipOrigin): Promise<ClipOutcome | undefined> {
  const { element, kind, range } = candidate
  // a heading-bounded section converts (and anchors) its sibling run only
  const slice = range && range.start.parentElement === element ? { from: range.start, to: range.end } : undefined
  const { markdown, truncated } = elementToMarkdown(element, slice)
  if (!markdown.trim()) return undefined
  return saveClip({
    content: markdown,
    permalink: resolvePermalink(range?.start ?? element, location.href, kind),
    origin: { ...origin, blockKind: kind, truncated },
  })
}

async function saveClip(input: { content: string; context?: string; permalink: string; origin: ClipOrigin & { truncated?: boolean } }): Promise<ClipOutcome | undefined> {
  const meta = extractPageMeta(document, normalizeHost(location.href))
  const started = performance.now()
  const response = await MessageUtils.sendMessage<{ entry: { id: string } }>({
    type: 'SAVE_CLIP',
    draft: {
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
      durationMs: performance.now() - started,
    },
  })
  if (!response.success || !response.data?.entry) return undefined
  return { entryId: response.data.entry.id, title: meta.title, truncated: Boolean(input.origin.truncated) }
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
    const response = await MessageUtils.sendMessage({ type: 'DELETE_ENTRY', id: outcome.entryId })
    dismiss()
    if (response.success) showUndone()
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

/** Save failed: the reason and Retry stay until dismissed; nothing claims success. */
export function showFailureToast(retry: () => void): void {
  dismissToast()
  const host = document.createElement('div')
  host.setAttribute(ROOT_ATTR, 'clip-toast')
  const bar = document.createElement('div')
  bar.className = 'ann-clip-toast ann-clip-toast-error'
  const label = document.createElement('span')
  label.textContent = uiText('toast.saveFailed')
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
    void MessageUtils.sendMessage({ type: 'OPEN_EXTENSION_PAGE', page: 'library', params: { view: outcome.entryId } })
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
    const tagList = normalizeTags(
      tags.input.value
        .split(/[,，]/)
        .map(tag => tag.trim())
        .filter(Boolean),
    )
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
      errorLine.textContent = response.error ?? uiText('toast.saveFailed')
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
