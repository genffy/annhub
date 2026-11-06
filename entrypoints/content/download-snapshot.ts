/** A detached snapshot preserves live visibility and selected media before Q-29's extraction. */
import { expandedPanels, isPageChrome } from './markdown'
import { codeLanguage, preText } from './markdown-code'
import { formulaSource } from './markdown-special'
import { resolveAudioSource, resolveImageCandidates, resolveVideoPoster, resolveVideoSource } from './media-source'

export function downloadSnapshot(root: Element, hasArticle: boolean, tagsOnly = false): string {
  const source = root.ownerDocument
  const win = source.defaultView ?? window
  const expanded = expandedPanels(source)
  const inert = document.implementation.createHTMLDocument(source.title)
  // This non-content marker lets the bundled extractor recognize GitHub's
  // issue layout without retaining scripts or embedded application state.
  const expectedHost = source.querySelector('meta[name="expected-hostname"]')
  if (expectedHost) inert.head.append(inert.importNode(expectedHost, true))
  const originals: Element[] = []
  const copies: Element[] = []
  const cloneTree = (node: Node): Node => {
    const copy = inert.importNode(node, false)
    if (node instanceof Element) {
      originals.push(node)
      copies.push(copy as Element)
    }
    const children = node instanceof Element && node.shadowRoot && !node.childNodes.length ? node.shadowRoot.childNodes : node.childNodes
    for (const child of children) copy.appendChild(cloneTree(child))
    return copy
  }
  const clone = cloneTree(root) as Element
  inert.body.append(clone)
  if (hasArticle) clone.setAttribute('data-ann-extract-root', '')
  originals.forEach((el, index) => {
    const copy = copies[index]!
    if (!inert.body.contains(copy)) return
    const style = win.getComputedStyle(el)
    const media = el.matches('video, audio, iframe')
    const hidden = !expanded.has(el) && (el.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
    // Script TeX is data consumed by the converter; executable page scripts never survive.
    const unsafe = el.matches('script:not([type^="math/tex"]), style, link, base, object, embed, meta')
    const chrome = isPageChrome(media ? (el.parentElement ?? el) : el, true, expanded, tagsOnly)
    // A checkbox's checked state is content in a task list, not an editable form.
    const task = el.matches('input[type="checkbox"]') && el.closest('li') && !el.closest('form')
    if (hidden || unsafe || (chrome && !task)) {
      copy.remove()
      return
    }
    for (const attr of [...copy.attributes]) {
      if (/^on/i.test(attr.name) || ['style', 'hidden', 'aria-hidden', 'srcdoc', 'autoplay'].includes(attr.name)) copy.removeAttribute(attr.name)
    }
    if (el.matches('details')) copy.setAttribute('open', '')
    // A visible formula may carry its TeX in a transparent accessibility twin.
    // Preserve the visible formula's source before hidden descendants are removed.
    const formula = formulaSource(el)
    if (formula?.tex) {
      copy.setAttribute('data-tex', formula.tex)
      if (formula.display) copy.setAttribute('display', 'block')
    }
    if (el.matches('pre')) {
      const code = inert.createElement('code')
      const language = codeLanguage(el)
      if (language) code.className = `language-${language}`
      code.textContent = preText(el.querySelector('code') ?? el)
      copy.replaceChildren(code)
    }
    if (el.matches('.MathJax,mjx-container') && el.nextElementSibling?.matches('script[type^="math/tex"]')) {
      copy.setAttribute('data-tex', el.nextElementSibling.textContent ?? '')
      if (/mode\s*=\s*display/.test(el.nextElementSibling.getAttribute('type') ?? '')) copy.setAttribute('display', 'block')
    }
    if (task) copy.toggleAttribute('checked', (el as HTMLInputElement).checked)
    if (el.matches('img')) {
      const primary = resolveImageCandidates(el, source.baseURI)[0]
      for (const attr of [...copy.attributes]) if (attr.name === 'srcset' || attr.name.startsWith('data-')) copy.removeAttribute(attr.name)
      if (primary) copy.setAttribute('src', primary)
      const img = el as HTMLImageElement
      if (img.naturalWidth) copy.setAttribute('width', String(img.naturalWidth))
      if (img.naturalHeight) copy.setAttribute('height', String(img.naturalHeight))
    }
    if (el.matches('source') && el.closest('picture')) copy.remove()
    if (el.matches('video, audio')) {
      const src = el.matches('video') ? resolveVideoSource(el, source.baseURI) : resolveAudioSource(el, source.baseURI)
      if (src) copy.setAttribute('src', src)
      const poster = resolveVideoPoster(el, source.baseURI)
      if (poster) copy.setAttribute('poster', poster)
    }
    for (const attr of ['href', 'src', 'poster']) {
      const raw = copy.getAttribute(attr)
      if (!raw || raw.startsWith('#')) continue
      try {
        const url = new URL(raw, source.baseURI)
        if (/^https?:$/.test(url.protocol)) copy.setAttribute(attr, url.href)
        else copy.removeAttribute(attr)
      } catch {
        copy.removeAttribute(attr)
      }
    }
  })
  if (!tagsOnly && !inert.body.textContent?.trim() && !inert.body.querySelector('img,video,audio,iframe')) return downloadSnapshot(root, hasArticle, true)
  return inert.documentElement.outerHTML
}

/** This document has no browsing context: scripts, frames and image URLs cannot run or load. */
export function extractedDownloadBody(html: string, baseUrl: string): Element {
  const doc = document.implementation.createHTMLDocument('')
  doc.body.innerHTML = html
  const base = doc.createElement('base')
  base.href = baseUrl
  doc.head.append(base)
  return doc.body
}
