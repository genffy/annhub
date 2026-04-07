import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import type { VocabSnapshot, VocabEntry, GlossResult } from '../../../types/vocabulary'

const MARKER_ATTR = 'data-ann-vocab'
const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE',
    'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'NOSCRIPT',
])

// Match whole English words (at least 2 chars)
const WORD_RE = /\b[a-zA-Z]{2,}\b/g

interface AnnotationContext {
    snapshot: VocabSnapshot
    masteryThreshold: number
    maxAnnotations: number
}

let annotationCount = 0

function shouldSkip(node: Node): boolean {
    if (!node.parentElement) return true
    const el = node.parentElement
    if (el.closest(`[${MARKER_ATTR}]`)) return true
    if (el.isContentEditable) return true
    if (SKIP_TAGS.has(el.tagName)) return true

    // Skip our own shadow host
    if (el.closest('ann-selection')) return true

    return false
}

function normalizeWord(word: string): string {
    return word.toLowerCase().replace(/[^\w\s'-]/g, '').trim()
}

function getSentenceContext(textNode: Text): string {
    const text = textNode.textContent || ''
    // Try to get parent's text as sentence context
    const parent = textNode.parentElement
    if (parent) {
        const parentText = parent.innerText || parent.textContent || ''
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

function wrapWordWithRuby(range: Range, gloss: string): void {
    const ruby = document.createElement('ruby')
    ruby.setAttribute(MARKER_ATTR, '1')
    ruby.className = 'ann-vocab-ruby'

    try {
        range.surroundContents(ruby)
    } catch {
        // surroundContents fails on cross-element ranges
        return
    }

    const rt = document.createElement('rt')
    rt.textContent = gloss
    ruby.appendChild(rt)
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
}

interface PendingItem {
    textNode: Text
    startOffset: number
    endOffset: number
    word: string
    entry?: VocabEntry
    sentence: string
    gloss?: string | null
}

function collectMatches(
    textNode: Text,
    ctx: AnnotationContext,
    pending: PendingItem[],
): void {
    const text = textNode.textContent
    if (!text) return

    WORD_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = WORD_RE.exec(text)) !== null) {
        if (annotationCount + pending.length >= ctx.maxAnnotations) return

        const word = match[0]
        const wordNorm = normalizeWord(word)
        if (!wordNorm || wordNorm.length < 3) continue
        if (COMMON_WORDS.has(wordNorm)) continue

        const entry = ctx.snapshot.entries[wordNorm]
        if (entry && entry.proficiency >= ctx.masteryThreshold) continue

        pending.push({
            textNode,
            startOffset: match.index,
            endOffset: match.index + word.length,
            word,
            entry,
            sentence: getSentenceContext(textNode),
        })
    }
}

export async function annotateVisibleText(ctx: AnnotationContext): Promise<number> {
    annotationCount = 0

    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node: Node) {
                if (shouldSkip(node)) return NodeFilter.FILTER_REJECT
                const tn = node as Text
                if (!tn.textContent?.trim()) return NodeFilter.FILTER_REJECT
                return NodeFilter.FILTER_ACCEPT
            },
        }
    )

    // Collect text nodes first to avoid DOM mutation during walk
    const textNodes: Text[] = []
    let current = walker.nextNode()
    while (current) {
        textNodes.push(current as Text)
        current = walker.nextNode()
    }

    const pending: PendingItem[] = []

    for (const textNode of textNodes) {
        if (annotationCount + pending.length >= ctx.maxAnnotations) break
        collectMatches(textNode, ctx, pending)
    }

    // Phase 1: resolve glosses (respects page-order maxAnnotations limit)
    for (const item of pending) {
        if (item.entry?.exp) {
            item.gloss = extractShortGloss(item.entry.exp)
        } else if (!item.entry) {
            // TODO(privacy): introduce a stricter policy to avoid sending every
            // unmatched sentence to LLM by default (domain/content sensitivity).
            const result = await resolveGloss(item.word, item.sentence)
            item.gloss = result?.gloss ?? null
        }
    }

    // Phase 2: apply DOM changes in reverse order so that surroundContents
    // mutations don't invalidate pending offsets within the same text node.
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
            annotationCount++
        } catch {
            // Range creation can fail if node has been modified externally
        }
    }

    return annotationCount
}

function extractShortGloss(exp: string): string {
    // exp may contain <br> separated definitions — take the first one
    const first = exp.split(/<br\s*\/?\s*>/i)[0] || ''
    // Strip HTML tags
    const clean = first.replace(/<[^>]+>/g, '').trim()
    // Truncate if too long
    return clean.length > 20 ? clean.slice(0, 18) + '…' : clean
}

export function cleanupAnnotations(): void {
    const annotated = document.querySelectorAll(`[${MARKER_ATTR}]`)
    annotated.forEach(el => {
        const parent = el.parentNode
        if (!parent) return
        while (el.firstChild) {
            parent.insertBefore(el.firstChild, el)
        }
        parent.removeChild(el)
    })
    annotationCount = 0
}

// Top ~200 common English words that should never be annotated
const COMMON_WORDS = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
    'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
    'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
    'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
    'give', 'day', 'most', 'us', 'are', 'is', 'was', 'were', 'been', 'has',
    'had', 'did', 'does', 'am', 'may', 'must', 'shall', 'should', 'might',
    'very', 'much', 'more', 'here', 'where', 'why', 'too', 'own', 'still',
    'each', 'right', 'such', 'same', 'last', 'long', 'great', 'little', 'old',
    'big', 'high', 'few', 'next', 'own', 'through', 'before', 'while', 'those',
    'being', 'between', 'both', 'under', 'never', 'same', 'another', 'need',
    'house', 'left', 'once', 'place', 'home', 'read', 'hand', 'part', 'down',
    'find', 'again', 'off', 'many', 'let', 'said', 'keep', 'end', 'far',
    'set', 'run', 'away', 'put', 'every', 'head', 'still', 'tell', 'point',
    'help', 'ask', 'small', 'man', 'turn', 'show', 'went', 'got', 'made',
])
