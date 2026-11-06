/** Formula and footnote syntax shared by the clip/download converter (capture.md §3.3). */
export function codeSpan(text: string): string {
  const ticks = '`'.repeat((text.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0) + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${ticks}${pad}${text}${pad}${ticks}`
}

export function scriptText(text: string, kind: 'sup' | 'sub'): string {
  const plain = '0123456789+-=()n'
  const transformed = kind === 'sup' ? '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ' : '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₙ'
  return [...text].every(char => plain.includes(char)) ? [...text].map(char => transformed[plain.indexOf(char)]).join('') : text
}

export function formulaSource(el: Element): { tex: string; display: boolean } | undefined {
  if (!el.matches('math, .katex, .katex-display, .mwe-math-element, mjx-container, .MathJax, script[type^="math/tex"]')) return undefined
  const annotation = el.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"]')
  const math = el.matches('math') ? el : el.querySelector('math')
  const script = el.matches('script') ? el : el.nextElementSibling?.matches('script[type^="math/tex"]') ? el.nextElementSibling : undefined
  const tex = (annotation?.textContent || math?.getAttribute('alttext') || el.getAttribute('data-tex') || script?.textContent || '').trim()
  const display =
    el.matches('.katex-display, .mwe-math-element-display, [display="block"], [display="true"]') ||
    Boolean(el.closest('.katex-display')) ||
    /mode\s*=\s*display/.test(script?.getAttribute('type') ?? '')
  return { tex, display }
}

export function formulaMarkdown(el: Element, download: boolean): string | undefined {
  const source = formulaSource(el)
  if (!source) return undefined
  if (el.matches('script') && el.previousElementSibling?.matches('.MathJax, mjx-container')) return ''
  const { tex, display } = source
  if (!tex) {
    const visible = (el.getAttribute('aria-label') || el.textContent || '').trim()
    return visible ? codeSpan(visible) : ''
  }
  if (download) return display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`
  if (!display) return codeSpan(tex)
  const fence = '`'.repeat(Math.max(3, (tex.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0) + 1))
  return `\n\n${fence}latex\n${tex}\n${fence}\n\n`
}

export interface Footnotes {
  references: Map<Element, number>
  definitions: Element[]
}

export function collectFootnotes(root: Element): Footnotes {
  const references = new Map<Element, number>()
  const definitions: Element[] = []
  for (const link of root.querySelectorAll('a[href]')) {
    if (!link.matches('[role="doc-noteref"], .footnote-ref, sup a') && !/^#(?:fn|cite_note)/.test(link.getAttribute('href') ?? '')) continue
    try {
      const url = new URL(link.getAttribute('href')!, root.ownerDocument.baseURI)
      const page = new URL(root.ownerDocument.baseURI)
      if (url.origin !== page.origin || url.pathname !== page.pathname || url.search !== page.search || !url.hash) continue
      const target = root.ownerDocument.getElementById(decodeURIComponent(url.hash.slice(1)))
      if (!target || target === link || target.contains(link)) continue
      let index = definitions.indexOf(target)
      if (index < 0) {
        index = definitions.length
        definitions.push(target)
      }
      references.set(link, index + 1)
    } catch {
      /* malformed references keep their ordinary link */
    }
  }
  return { references, definitions }
}
