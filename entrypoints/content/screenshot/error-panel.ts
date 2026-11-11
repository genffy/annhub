import { uiText } from '../ui-text'
import { ROOT_ATTR } from './session-roots'

/**
 * The capture's failure card (RV-CAP-18, split out of the session): stop icon, title, reason
 * and a way out over the dimmed page (screenshot.md §5). Owns the panel element.
 */
export class ErrorPanel {
  private el: HTMLElement | null = null

  constructor(
    private readonly doc: Document,
    private readonly host: HTMLElement,
    private readonly close: () => void,
  ) {}

  show(message: string): HTMLElement {
    this.el?.remove()
    const panel = this.doc.createElement('div')
    panel.className = 'ann-shot-error-panel'
    panel.setAttribute(ROOT_ATTR, 'screenshot-error')
    panel.style.pointerEvents = 'auto'
    // the theme card of the draft's “页面不允许截图” board: stop icon, title, reason, way out
    panel.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>'
    const title = this.doc.createElement('div')
    title.className = 'ann-shot-error-title'
    title.textContent = uiText('shot.failed')
    const text = this.doc.createElement('div')
    text.className = 'ann-shot-error'
    text.textContent = message
    const closeButton = this.doc.createElement('button')
    closeButton.textContent = uiText('common.close')
    closeButton.onclick = () => this.close()
    panel.append(title, text, closeButton)
    this.host.appendChild(panel)
    this.el = panel
    return panel
  }

  remove(): void {
    this.el?.remove()
    this.el = null
  }
}

/**
 * “Screenshot saved”, spoken once: the session's own DOM goes away with the
 * save, so the live region lives on the document and removes itself (保存成功
 * 读屏没有任何播报).
 */
export function announceSaved(doc: Document): void {
  const el = doc.createElement('div')
  el.setAttribute(ROOT_ATTR, 'screenshot-saved-notice')
  el.setAttribute('role', 'status')
  el.textContent = uiText('shot.saved')
  Object.assign(el.style, { position: 'fixed', left: '-9999px', top: '0' })
  doc.documentElement.appendChild(el)
  window.setTimeout(() => el.remove(), 4000)
}
