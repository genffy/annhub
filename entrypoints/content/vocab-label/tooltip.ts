/**
 * Annotation tooltip (Phase 3): hovering a vocab annotation shows the gloss
 * plus a fixed "在 App 中复习" link (extension-prd §3.3.2 导流). The tooltip is
 * host-DOM, pointer-events enabled only on itself, and never blocks the page.
 */

const TOOLTIP_ID = 'ann-vocab-tooltip'
const APP_URL = 'https://annhub.app'
const SHOW_DELAY_MS = 120
const HIDE_DELAY_MS = 260

let hideTimer: ReturnType<typeof setTimeout> | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null

function ensureTooltip(): HTMLDivElement {
  let el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = TOOLTIP_ID
    el.className = 'ann-vocab-tooltip'
    el.addEventListener('mouseenter', () => {
      if (hideTimer) clearTimeout(hideTimer)
    })
    el.addEventListener('mouseleave', () => {
      scheduleHide()
    })
    document.documentElement.appendChild(el)
  }
  return el
}

function scheduleHide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    const el = document.getElementById(TOOLTIP_ID)
    if (el) el.style.display = 'none'
  }, HIDE_DELAY_MS)
}

function showFor(ruby: HTMLElement) {
  const rt = ruby.querySelector('rt')?.textContent?.trim() ?? ''
  const host = ruby.closest('[data-ann-vocab-word]') ?? ruby
  const word =
    (host as HTMLElement).dataset.annVocabWord ||
    Array.from(ruby.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join('')
      .trim()
  const tooltip = ensureTooltip()
  tooltip.innerHTML = ''
  const gloss = document.createElement('div')
  gloss.className = 'ann-vocab-tooltip-word'
  gloss.textContent = word
  tooltip.appendChild(gloss)
  if (rt) {
    const meaning = document.createElement('div')
    meaning.className = 'ann-vocab-tooltip-gloss'
    meaning.textContent = rt
    tooltip.appendChild(meaning)
  }
  const link = document.createElement('a')
  link.className = 'ann-vocab-tooltip-link'
  link.href = APP_URL
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.textContent = '在 App 中复习 →'
  link.setAttribute('data-ann-vocab-tooltip-link', '1')
  tooltip.appendChild(link)

  const rect = ruby.getBoundingClientRect()
  tooltip.style.display = 'block'
  const tipRect = tooltip.getBoundingClientRect()
  // Prefer below the word; flip above when clipping the viewport bottom.
  const below = rect.bottom + 8
  const top = below + tipRect.height > window.innerHeight - 8 ? Math.max(8, rect.top - tipRect.height - 8) : below
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - tipRect.width - 8)
  tooltip.style.top = `${top}px`
  tooltip.style.left = `${left}px`
}

function isVocabRuby(target: EventTarget | null): HTMLElement | null {
  const el = target as HTMLElement | null
  if (!el || !el.closest) return null
  // Ruby wraps carry a gloss; underline wraps are gloss-pending — the tooltip
  // serves both (word + App link; gloss only when present).
  return el.closest<HTMLElement>('ruby.ann-vocab-ruby, .ann-vocab-underline')
}

export function initVocabTooltip(): void {
  document.addEventListener('mouseover', (e: MouseEvent) => {
    const ruby = isVocabRuby(e.target)
    if (!ruby) return
    if (showTimer) clearTimeout(showTimer)
    if (hideTimer) clearTimeout(hideTimer)
    showTimer = setTimeout(() => showFor(ruby), SHOW_DELAY_MS)
  })
  document.addEventListener('mouseout', (e: MouseEvent) => {
    if (!isVocabRuby(e.target)) return
    if (showTimer) clearTimeout(showTimer)
    scheduleHide()
  })
  document.addEventListener(
    'scroll',
    () => {
      const el = document.getElementById(TOOLTIP_ID)
      if (el) el.style.display = 'none'
    },
    { passive: true },
  )
}

export function destroyVocabTooltip(): void {
  if (showTimer) clearTimeout(showTimer)
  if (hideTimer) clearTimeout(hideTimer)
  document.getElementById(TOOLTIP_ID)?.remove()
}
