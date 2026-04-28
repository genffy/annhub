import { Readability } from '@mozilla/readability'

const PRIMARY_ROOT_SELECTORS = ['main', 'article', '[role="main"]'] as const
const EXCLUDED_SECTION_SELECTOR = [
  'header',
  'nav',
  'footer',
  'aside',
  '[hidden]',
  '[aria-hidden="true"]',
  '.sr-only',
  '.visually-hidden',
  '[class*="sr-only"]',
  '[aria-label*="comment" i]',
  '[id*="comment" i]',
  '[class*="comment" i]',
  '[id*="sidebar" i]',
  '[class*="sidebar" i]',
].join(',')

export const ANNOTATABLE_BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, blockquote'
const FEED_ARTICLE_SELECTOR = 'article, [role="article"]'

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function textLength(el: Element): number {
  return normalizeText(el.textContent || '').length
}

function isUsableRoot(el: Element | null): el is Element {
  return Boolean(el && textLength(el) >= 120)
}

function findSemanticRoot(): Element | null {
  const candidates = Array.from(document.querySelectorAll(PRIMARY_ROOT_SELECTORS.join(','))).filter(isUsableRoot)
  if (candidates.length === 0) return null

  // Prefer content-like semantic roots over broad layout wrappers.
  let best: Element | null = null
  let bestScore = -1

  for (const candidate of candidates) {
    const tlen = textLength(candidate)
    const blockCount = candidate.querySelectorAll(ANNOTATABLE_BLOCK_SELECTOR).length
    const tag = candidate.tagName
    const classAndId = `${candidate.id} ${candidate.className}`.toLowerCase()

    let score = Math.min(tlen, 12000) + blockCount * 20
    if (tag === 'ARTICLE') score += 5000
    if (tag === 'MAIN') score += 2000
    if (classAndId.includes('readme')) score += 5000
    if (classAndId.includes('markdown')) score += 3500
    if (classAndId.includes('content')) score += 1500

    const interactiveCount = candidate.querySelectorAll('button, [role="button"], input, select, textarea').length
    score -= interactiveCount * 15

    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}

function narrowToPrimaryContent(root: Element): Element {
  const strongSelector = ['article.markdown-body', '#readme', '[data-testid="readme-content"]', '[itemprop="articleBody"]'].join(',')

  const strongCandidates = Array.from(root.querySelectorAll(strongSelector))
    .filter(el => !el.closest(EXCLUDED_SECTION_SELECTOR))
    .filter(el => textLength(el) >= 120)

  if (strongCandidates.length > 0) {
    return strongCandidates.sort((a, b) => textLength(b) - textLength(a))[0]
  }

  const genericCandidates = Array.from(root.querySelectorAll('article, [role="article"], [class*="content" i], [class*="article" i]'))
    .filter(el => !el.closest(EXCLUDED_SECTION_SELECTOR))
    .filter(el => textLength(el) >= 220)

  // On feeds (e.g. many tweet cards), keep the broad root and rely on block viewport filters.
  if (genericCandidates.length === 0 || genericCandidates.length > 3) {
    return root
  }

  return genericCandidates.sort((a, b) => textLength(b) - textLength(a))[0]
}

function findRootByReadability(): Element | null {
  let content = ''
  try {
    const clone = document.cloneNode(true) as Document
    const parsed = new Readability(clone).parse()
    content = normalizeText(parsed?.textContent || '')
  } catch {
    return null
  }

  if (!content) return null

  const snippet = content.slice(0, 220)
  if (!snippet) return null

  const candidates = Array.from(document.querySelectorAll('article, main, section, div'))
    .filter(el => !el.closest(EXCLUDED_SECTION_SELECTOR))
    .filter(el => textLength(el) >= 200)

  let best: Element | null = null
  let bestScore = -1

  for (const candidate of candidates) {
    const candidateText = normalizeText(candidate.textContent || '')
    if (!candidateText) continue

    let score = 0
    if (candidateText.includes(snippet)) {
      score += 1000
    } else {
      const partial = snippet.slice(0, 120)
      if (partial && candidateText.includes(partial)) {
        score += 500
      }
    }

    const overlap = snippet
      .split(' ')
      .filter(Boolean)
      .slice(0, 30)
      .filter(token => candidateText.includes(token)).length

    score += overlap

    // prefer compact containers once relevance is similar
    score -= Math.floor(candidateText.length / 1000)

    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return best
}

export function resolveContentRoot(): Element {
  const semanticRoot = findSemanticRoot()
  if (semanticRoot) {
    return narrowToPrimaryContent(semanticRoot)
  }

  const readabilityRoot = findRootByReadability()
  if (readabilityRoot) {
    return narrowToPrimaryContent(readabilityRoot)
  }

  return document.body
}

export function isExcludedSection(el: Element): boolean {
  return Boolean(el.closest(EXCLUDED_SECTION_SELECTOR))
}

export function collectAnnotatableBlocks(root: Element): Element[] {
  const articles = Array.from(root.querySelectorAll(FEED_ARTICLE_SELECTOR))
    .filter(el => !isExcludedSection(el))
    .filter(el => textLength(el) >= 80)

  if (articles.length >= 2) return articles
  if (articles.length === 1) return articles

  const blocks = Array.from(root.querySelectorAll(ANNOTATABLE_BLOCK_SELECTOR)).filter(el => !isExcludedSection(el))
  if (blocks.length > 0) return blocks
  return [root]
}
