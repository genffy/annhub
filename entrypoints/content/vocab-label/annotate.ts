import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import { type VocabSnapshot, type VocabEntry, type GlossResult, normalizeWord } from '../../../types/vocabulary'
import { shouldFilterByLevel, type CEFRLevel } from './frequency-filter'
import { ANNOTATABLE_BLOCK_SELECTOR, isExcludedSection } from './content-scope'
import { isWithinViewportWindowByRect } from './viewport'

const MARKER_ATTR = 'data-ann-vocab'
const HIDDEN_SELECTOR = '[hidden], [aria-hidden="true"], .sr-only, .visually-hidden, [class*="sr-only"]'
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'NOSCRIPT'])

const WORD_RE = /\b[a-zA-Z]{2,}\b/g
const GLOSS_L1_CACHE_MAX = 600
const GLOSS_REQUEST_TIMEOUT_MS = 1800
const MAX_GLOSS_REQUESTS_PER_BATCH = 12
const VIEWPORT_CLEANUP_MIN_INTERVAL_MS = 1200
const VIEWPORT_CLEANUP_MARKER_LIMIT = 80

interface AnnotationContext {
  snapshot: VocabSnapshot
  masteryThreshold: number
  maxAnnotations: number
  contentRoot?: Element
  userCEFRLevel: CEFRLevel
}

interface AnnotateOptions {
  roots?: Iterable<Element>
  pruneOutsideViewportWindow?: boolean
  viewportExpansionRatio?: number
}

interface PendingItem {
  textNode: Text
  startOffset: number
  endOffset: number
  word: string
  wordNorm: string
  entry?: VocabEntry
  sentence: string
  gloss?: string | null
}

const glossMemoryCache = new Map<string, string>()
let lastViewportCleanupAt = 0
let annotationVisibilityObserver: IntersectionObserver | null = null
let annotationBlockMarkers = new Map<Element, Set<Element>>()
let annotationMarkerBlocks = new WeakMap<Element, Element>()

function getL1Gloss(cacheKey: string): string | null {
  const hit = glossMemoryCache.get(cacheKey)
  if (!hit) return null
  // LRU touch
  glossMemoryCache.delete(cacheKey)
  glossMemoryCache.set(cacheKey, hit)
  return hit
}

function setL1Gloss(cacheKey: string, gloss: string): void {
  if (!gloss) return
  if (glossMemoryCache.has(cacheKey)) {
    glossMemoryCache.delete(cacheKey)
  }
  glossMemoryCache.set(cacheKey, gloss)

  if (glossMemoryCache.size <= GLOSS_L1_CACHE_MAX) return

  const oldestKey = glossMemoryCache.keys().next().value
  if (oldestKey) {
    glossMemoryCache.delete(oldestKey)
  }
}

function hashSentence(sentence: string): string {
  let hash = 0
  const str = sentence.toLowerCase().trim()
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return hash.toString(36)
}

function shouldSkip(node: Node, contentRoot?: Element, restrictToFeedArticles = false): boolean {
  if (!node.parentElement) return true

  const el = node.parentElement

  if (contentRoot && !contentRoot.contains(el)) return true
  if (restrictToFeedArticles && !el.closest('article, [role="article"]')) return true
  if (isExcludedSection(el)) return true
  if (el.closest(HIDDEN_SELECTOR)) return true

  if (el.closest(`[${MARKER_ATTR}]`)) return true
  if (el.isContentEditable) return true
  if (SKIP_TAGS.has(el.tagName)) return true

  // Skip our own shadow host
  if (el.closest('ann-selection')) return true

  return false
}

function getSentenceContext(textNode: Text): string {
  const text = textNode.textContent || ''
  const parent = textNode.parentElement

  if (parent) {
    const parentText = parent.textContent || ''
    if (parentText.length <= 300) return parentText
  }

  return text
}

async function resolveGloss(word: string, sentence: string): Promise<GlossResult | null> {
  try {
    const res = await MessageUtils.sendMessage({
      type: 'CONTEXT_GLOSS',
      word,
      sentence,
    })
    if (res.success && res.data) return res.data as GlossResult
  } catch (e) {
    Logger.error('[VocabLabel] Gloss resolve failed:', e)
  }
  return null
}

async function resolveGlossWithTimeout(word: string, sentence: string, timeoutMs = GLOSS_REQUEST_TIMEOUT_MS): Promise<GlossResult | null> {
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    const timeoutPromise = new Promise<null>(resolve => {
      timer = setTimeout(() => resolve(null), timeoutMs)
    })

    const result = await Promise.race([resolveGloss(word, sentence), timeoutPromise])
    return result
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function wrapWordWithRuby(range: Range, gloss: string): void {
  const ruby = document.createElement('ruby')
  ruby.setAttribute(MARKER_ATTR, '1')
  ruby.className = 'ann-vocab-ruby'

  try {
    range.surroundContents(ruby)
  } catch {
    return
  }

  const rt = document.createElement('rt')
  rt.textContent = gloss
  ruby.appendChild(rt)
  observeAnnotationElement(ruby)
}

function wrapWordWithUnderline(range: Range): void {
  const span = document.createElement('span')
  span.setAttribute(MARKER_ATTR, '1')
  span.className = 'ann-vocab-underline'

  try {
    range.surroundContents(span)
  } catch {
    return
  }

  observeAnnotationElement(span)
}

function unwrapAnnotationElement(el: Element): void {
  const block = annotationMarkerBlocks.get(el)
  if (block) {
    const markers = annotationBlockMarkers.get(block)
    markers?.delete(el)
    if (markers?.size === 0) {
      annotationVisibilityObserver?.unobserve(block)
      annotationBlockMarkers.delete(block)
    }
  }

  const parent = el.parentNode
  if (!parent) return

  if (el.tagName === 'RUBY') {
    // Restore only the base text when removing annotation markers.
    // Do not reinsert <rt>/<rp> nodes into document flow.
    const baseText = Array.from(el.childNodes)
      .filter(node => !(node instanceof HTMLElement && (node.tagName === 'RT' || node.tagName === 'RP')))
      .map(node => node.textContent ?? '')
      .join('')
    parent.insertBefore(document.createTextNode(baseText), el)
    parent.removeChild(el)
    return
  }

  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el)
  }
  parent.removeChild(el)
}

function supportsIntersectionObserver(): boolean {
  return typeof window.IntersectionObserver === 'function'
}

function getAnnotationVisibilityObserver(): IntersectionObserver | null {
  if (!supportsIntersectionObserver()) return null
  if (annotationVisibilityObserver) return annotationVisibilityObserver

  annotationVisibilityObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const block = entry.target
        if (entry.isIntersecting || !block.isConnected) continue

        const markers = Array.from(annotationBlockMarkers.get(block) ?? [])
        for (const marker of markers) {
          if (marker.isConnected) {
            unwrapAnnotationElement(marker)
          }
        }
      }
    },
    {
      root: null,
      rootMargin: '50% 0px 50% 0px',
      threshold: 0,
    },
  )

  return annotationVisibilityObserver
}

function observeAnnotationElement(el: Element): void {
  const observer = getAnnotationVisibilityObserver()
  if (!observer) return

  const block = el.closest(ANNOTATABLE_BLOCK_SELECTOR) ?? el.parentElement
  if (!block) return

  const markers = annotationBlockMarkers.get(block) ?? new Set<Element>()
  markers.add(el)
  annotationBlockMarkers.set(block, markers)
  annotationMarkerBlocks.set(el, block)
  observer.observe(block)
}

function cleanupAnnotationsOutsideViewportWindow(expansionRatio: number): void {
  if (supportsIntersectionObserver()) return

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (lastViewportCleanupAt > 0 && now - lastViewportCleanupAt < VIEWPORT_CLEANUP_MIN_INTERVAL_MS) {
    return
  }
  lastViewportCleanupAt = now

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  if (viewportHeight <= 0) return

  const markers = Array.from(document.querySelectorAll(`[${MARKER_ATTR}]`))
  let inspectedCount = 0

  for (const marker of markers) {
    if (inspectedCount >= VIEWPORT_CLEANUP_MARKER_LIMIT) break
    inspectedCount++

    const rect = marker.getBoundingClientRect()
    if (!isWithinViewportWindowByRect(rect, viewportHeight, expansionRatio)) {
      unwrapAnnotationElement(marker)
    }
  }
}

function collectMatches(textNode: Text, ctx: AnnotationContext, pending: PendingItem[], budget: number): void {
  const text = textNode.textContent
  if (!text) return

  WORD_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = WORD_RE.exec(text)) !== null) {
    if (pending.length >= budget) return

    const word = match[0]
    const wordNorm = normalizeWord(word)

    if (!wordNorm || wordNorm.length < 3) continue

    const entry = ctx.snapshot.entries[wordNorm]
    if (entry && entry.proficiency >= ctx.masteryThreshold) continue

    if (!entry && shouldFilterByLevel(wordNorm, ctx.userCEFRLevel)) continue

    pending.push({
      textNode,
      startOffset: match.index,
      endOffset: match.index + word.length,
      word,
      wordNorm,
      entry,
      sentence: getSentenceContext(textNode),
    })
  }
}

function collectTextNodes(roots: Element[], contentRoot?: Element, restrictToFeedArticles = false): Text[] {
  const visited = new Set<Text>()
  const nodes: Text[] = []

  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node: Node) {
        if (shouldSkip(node, contentRoot, restrictToFeedArticles)) return NodeFilter.FILTER_REJECT
        const tn = node as Text
        if (!tn.textContent?.trim()) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })

    let current = walker.nextNode()
    while (current) {
      const textNode = current as Text
      if (!visited.has(textNode)) {
        visited.add(textNode)
        nodes.push(textNode)
      }
      current = walker.nextNode()
    }
  }

  return nodes
}

async function resolvePendingGlosses(pending: PendingItem[]): Promise<void> {
  const groupedByCacheKey = new Map<string, PendingItem[]>()
  const groupedMeta = new Map<string, { word: string; sentence: string }>()
  for (const item of pending) {
    if (item.entry?.exp) {
      item.gloss = extractShortGloss(item.entry.exp)
      continue
    }

    if (item.entry) {
      // Snapshot entry exists but has no exp. Keep underline fallback.
      item.gloss = null
      continue
    }

    const cacheKey = `${item.wordNorm}:${hashSentence(item.sentence)}`
    const cached = getL1Gloss(cacheKey)
    if (cached !== null) {
      item.gloss = cached
      continue
    }

    const sameKeyItems = groupedByCacheKey.get(cacheKey) ?? []
    sameKeyItems.push(item)
    groupedByCacheKey.set(cacheKey, sameKeyItems)
    if (!groupedMeta.has(cacheKey)) {
      groupedMeta.set(cacheKey, { word: item.word, sentence: item.sentence })
    }
  }

  if (groupedByCacheKey.size === 0) return

  const resolvedGlossMap = new Map<string, string | null>()
  const inflight: Promise<void>[] = []
  let requestCount = 0

  for (const [cacheKey, meta] of groupedMeta) {
    if (requestCount >= MAX_GLOSS_REQUESTS_PER_BATCH) {
      resolvedGlossMap.set(cacheKey, null)
      continue
    }
    requestCount++

    const task = (async () => {
      // TODO(privacy): tighten policy for sending sentence context to LLM.
      const result = await resolveGlossWithTimeout(meta.word, meta.sentence)
      const gloss = result?.gloss?.trim() || null
      if (gloss) setL1Gloss(cacheKey, gloss)
      resolvedGlossMap.set(cacheKey, gloss)
    })()
    inflight.push(task)
  }

  await Promise.all(inflight)

  for (const [cacheKey, items] of groupedByCacheKey) {
    const resolved = resolvedGlossMap.get(cacheKey) ?? null
    for (const item of items) {
      item.gloss = resolved
    }
  }
}

export async function annotateVisibleText(ctx: AnnotationContext, options?: AnnotateOptions): Promise<number> {
  if (options?.pruneOutsideViewportWindow) {
    cleanupAnnotationsOutsideViewportWindow(options.viewportExpansionRatio ?? 0.5)
  }

  const existingCount = document.querySelectorAll(`[${MARKER_ATTR}]`).length
  const budget = Math.max(0, ctx.maxAnnotations - existingCount)
  if (budget <= 0) return 0

  const roots = options?.roots ? Array.from(options.roots).filter((el): el is Element => Boolean(el?.isConnected)) : [ctx.contentRoot ?? document.body]

  if (roots.length === 0) return 0

  const restrictToFeedArticles = Boolean(
    ctx.contentRoot && ctx.contentRoot.querySelectorAll('article, [role="article"]').length >= 2,
  )
  const textNodes = collectTextNodes(roots, ctx.contentRoot, restrictToFeedArticles)
  if (textNodes.length === 0) return 0

  const pending: PendingItem[] = []

  for (const textNode of textNodes) {
    if (pending.length >= budget) break
    collectMatches(textNode, ctx, pending, budget)
  }

  if (pending.length === 0) return 0

  await resolvePendingGlosses(pending)

  let appliedCount = 0

  // Reverse apply to protect offsets in same text node.
  for (let i = pending.length - 1; i >= 0; i--) {
    const item = pending[i]
    try {
      const range = document.createRange()
      range.setStart(item.textNode, item.startOffset)
      range.setEnd(item.textNode, item.endOffset)

      if (item.gloss) {
        wrapWordWithRuby(range, item.gloss)
      } else {
        wrapWordWithUnderline(range)
      }
      appliedCount++
    } catch {
      // Node may be modified externally between collect/apply phases.
    }
  }

  return appliedCount
}

function extractShortGloss(exp: string): string {
  const first = exp.split(/<br\s*\/?\s*>/i)[0] || ''
  const clean = first.replace(/<[^>]+>/g, '').trim()
  return clean.length > 20 ? clean.slice(0, 18) + '…' : clean
}

export function cleanupAnnotations(): void {
  const annotated = document.querySelectorAll(`[${MARKER_ATTR}]`)
  annotated.forEach(el => {
    unwrapAnnotationElement(el)
  })
}

export function resetVocabLabelRuntimeState(): void {
  glossMemoryCache.clear()
  lastViewportCleanupAt = 0
  annotationVisibilityObserver?.disconnect()
  annotationVisibilityObserver = null
  annotationBlockMarkers.clear()
  annotationMarkerBlocks = new WeakMap<Element, Element>()
}
