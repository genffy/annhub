/** Language metadata and line boundaries declared by page code renderers. */
export function codeLanguage(pre: Element): string {
  const code = pre.querySelector('code')
  for (const el of [code, pre, pre.parentElement, pre.parentElement?.parentElement]) {
    if (!el) continue
    const explicit = el.getAttribute('data-language') ?? el.getAttribute('data-lang')
    if (explicit && /^[\w+-]+$/.test(explicit)) return explicit
    const language = /(?:^|\s)(?:language|lang|highlight)-([\w+-]+)(?=\s|$)/.exec(el.getAttribute('class') ?? '')?.[1]
    if (language) return /^(none|default|text)$/.test(language) ? '' : language
  }
  return codeHeader(pre)?.textContent?.trim().toLowerCase() ?? ''
}

/** A short language label paired with the code's own copy control. */
export function codeHeader(pre: Element): Element | undefined {
  let node: Element | null = pre
  for (let level = 0; node && level < 4; level++, node = node.parentElement) {
    const header = node.previousElementSibling
    if (!header || !header.querySelector('button,[role="button"]') || header.querySelector('p,pre,table,ul,ol')) continue
    const label = (header.textContent ?? '').trim()
    if (/^[a-z][\w+#.-]{0,23}$/i.test(label) && !/^(code|copy|example|snippet)$/i.test(label)) return header
  }
  return undefined
}

/** Highlighted rows may encode their newlines in layout rather than text. */
export function preText(source: Element): string {
  const text = source.textContent ?? ''
  if (text.includes('\n')) return text
  const children = Array.from(source.children)
  if (children.length >= 2) {
    const lineish = children.filter(child => {
      if (/(^|\s)token-line($|\s)/.test(child.getAttribute('class') ?? '')) return true
      return source.ownerDocument?.defaultView?.getComputedStyle(child)?.display === 'block'
    })
    if (lineish.length === children.length) return children.map(child => child.textContent ?? '').join('\n')
  }
  return text
}
