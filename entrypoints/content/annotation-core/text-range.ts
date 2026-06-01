import { isAnnotatableTextNode } from './dom-policy'
import type { AnnotationIntent } from './types'

export interface TextContext {
  before?: string
  after?: string
}

export interface CollectTextNodesOptions {
  intent?: AnnotationIntent
}

export interface FindTextRangeOptions {
  intent?: AnnotationIntent
}

interface TextMatch {
  start: number
  end: number
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
    .trim()
}

function normalizeTextWithMap(text: string): { normalized: string; indexMap: number[] } {
  const normalizedChars: string[] = []
  const indexMap: number[] = []
  let pendingSpaceIndex: number | null = null

  for (let index = 0; index < text.length; index++) {
    const char = text[index]

    if (/\s/.test(char)) {
      if (normalizedChars.length > 0) {
        pendingSpaceIndex = pendingSpaceIndex ?? index
      }
      continue
    }

    if (!/[\w\u4e00-\u9fa5]/.test(char)) {
      continue
    }

    if (pendingSpaceIndex !== null && normalizedChars.length > 0) {
      normalizedChars.push(' ')
      indexMap.push(pendingSpaceIndex)
    }
    pendingSpaceIndex = null

    normalizedChars.push(char.toLowerCase())
    indexMap.push(index)
  }

  return {
    normalized: normalizedChars.join(''),
    indexMap,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function collectTextNodes(element: Element, options: CollectTextNodesOptions = {}): Text[] {
  const intent = options.intent
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    intent
      ? {
          acceptNode: node => (isAnnotatableTextNode(node, intent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
        }
      : null,
  )

  const textNodes: Text[] = []
  let node: Text | null
  while ((node = walker.nextNode() as Text)) {
    textNodes.push(node)
  }

  return textNodes
}

export function findBestTextMatch(fullText: string, targetText: string, context: TextContext = {}): number {
  return findBestTextMatchRange(fullText, targetText, context)?.start ?? -1
}

function findBestTextMatchRange(fullText: string, targetText: string, context: TextContext = {}): TextMatch | null {
  let index = fullText.indexOf(targetText)
  if (index !== -1) {
    return { start: index, end: index + targetText.length }
  }

  const normalizedTarget = normalizeText(targetText)
  const { normalized: normalizedFull, indexMap } = normalizeTextWithMap(fullText)

  index = normalizedFull.indexOf(normalizedTarget)
  if (index !== -1) {
    const start = indexMap[index]
    const normalizedEnd = index + normalizedTarget.length - 1
    const end = indexMap[normalizedEnd]
    if (typeof start === 'number' && typeof end === 'number') {
      return { start, end: end + 1 }
    }
  }

  if (context.before || context.after) {
    const before = escapeRegExp(context.before ?? '')
    const target = escapeRegExp(targetText)
    const after = escapeRegExp(context.after ?? '')
    const contextPattern = `${before}.*?${target}.*?${after}`
    const regex = new RegExp(contextPattern, 'i')
    const match = fullText.match(regex)
    if (match) {
      const start = fullText.indexOf(match[0]) + (context.before?.length ?? 0)
      return { start, end: start + targetText.length }
    }
  }

  return null
}

export function createRangeFromTextIndex(textNodes: Text[], startIndex: number, length: number): Range | null {
  let currentIndex = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0

  for (const node of textNodes) {
    const nodeLength = node.textContent?.length || 0
    if (currentIndex + nodeLength > startIndex) {
      startNode = node
      startOffset = startIndex - currentIndex
      break
    }
    currentIndex += nodeLength
  }

  if (!startNode) return null

  const endIndex = startIndex + length
  currentIndex = 0
  for (const node of textNodes) {
    const nodeLength = node.textContent?.length || 0
    if (currentIndex + nodeLength >= endIndex) {
      endNode = node
      endOffset = endIndex - currentIndex
      break
    }
    currentIndex += nodeLength
  }

  if (!endNode) return null

  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)

  return range
}

export function findTextRangeInElement(element: Element, targetText: string, context: TextContext = {}, options: FindTextRangeOptions = {}): Range | null {
  const textNodes = collectTextNodes(element, { intent: options.intent })
  const fullText = textNodes.map(node => node.textContent || '').join('')
  const match = findBestTextMatchRange(fullText, targetText, context)
  if (!match) return null

  return createRangeFromTextIndex(textNodes, match.start, match.end - match.start)
}
