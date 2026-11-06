import type { DownloadExtractMessage } from '../../types/messages'

/** Q-29: bundled code, loaded on demand, with no remote extractor or attached browsing context. */
export async function extractDownloadPage(input: DownloadExtractMessage): Promise<string> {
  const { default: Defuddle } = await import('defuddle')
  const doc = document.implementation.createHTMLDocument('')
  doc.documentElement.innerHTML = input.html
  const base = doc.createElement('base')
  base.href = input.url
  doc.head.prepend(base)
  const options = {
    url: input.url,
    useAsync: false,
    fetch: async () => {
      throw new Error('Remote extraction is disabled')
    },
    markdown: false,
    separateMarkdown: false,
    includeReplies: true as const,
    // Visibility and media size were evaluated on the live page, before cloning.
    removeHiddenElements: false,
    removeSmallImages: false,
    removeExactSelectors: false,
    removePartialSelectors: false,
    removeContentPatterns: false,
  }
  // Discover legacy-layout content before shielding its rich elements: the
  // scorer needs their actual text, including content inside layout tables.
  const issue = new URL(input.url).hostname === 'github.com' && Boolean(doc.querySelector('meta[name="expected-hostname"][content="github.com"]'))
  if (!input.hasArticle || issue) {
    const discovered = new Defuddle(doc, { ...options, standardize: false, ...(input.hasArticle ? { removeLowScoring: false } : {}) }).parse()
    doc.body.innerHTML = discovered.content
  }
  const restoreSemantics = preserveSemanticContent(doc)
  const result = new Defuddle(doc, {
    ...options,
    removeLowScoring: false,
    contentSelector: input.hasArticle && !issue ? '[data-ann-extract-root]' : 'body',
  }).parse()
  return restoreSemantics(result.content)
}

/**
 * AnnHub already understands these structures. Defuddle's presentation cleanup
 * can flatten a multi-image figure, discard TeX attributes or rewrite footnote
 * IDs. Keep those semantic islands intact while it identifies and normalizes
 * the surrounding article (capture.md §3.3). Tokens never leave this function.
 */
function preserveSemanticContent(doc: Document): (html: string) => string {
  const originalHtml = doc.body.innerHTML
  const prefix = `annhub${crypto.randomUUID().replace(/-/g, '')}`
  const originals = new Map<string, Element>()
  const selector =
    'figure,table,pre,ol,ul,dl,blockquote,aside[role="note"],.admonition,.callout,h1,h2,h3,h4,h5,h6,math,.katex,.katex-display,.mwe-math-element,.MathJax,mjx-container,sup:has(a[href^="#"])'
  for (const el of doc.body.querySelectorAll(selector)) {
    if (!doc.body.contains(el)) continue // an outer semantic structure already owns it
    const token = `${prefix}${originals.size}`
    const inline = el.matches('math,.katex,.mwe-math-element,.MathJax,mjx-container,sup')
    const placeholder = doc.createElement(inline ? 'code' : 'pre')
    placeholder.textContent = token
    originals.set(token, el)
    el.replaceWith(placeholder)
  }
  return html => {
    const result = document.implementation.createHTMLDocument('')
    result.body.innerHTML = html
    const restored = new Set<string>()
    for (const node of result.body.querySelectorAll('pre,code')) {
      if (!result.body.contains(node)) continue
      const token = node.textContent?.trim() ?? ''
      const original = originals.get(token)
      if (original) {
        node.replaceWith(result.importNode(original, true))
        restored.add(token)
      }
    }
    // A site extractor may discard or rewrap placeholders. Preserve the already
    // selected, filtered body instead of silently losing author-written content.
    if (restored.size !== originals.size || result.body.textContent?.includes(prefix)) return originalHtml
    return result.body.innerHTML
  }
}
