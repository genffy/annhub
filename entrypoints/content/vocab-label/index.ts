import { isEnglishPage, shouldAnnotateDomain } from './detect-page'
import { injectVocabStyles, removeVocabStyles } from './styles'
import { annotateVisibleText, cleanupAnnotations, resetVocabLabelRuntimeState, getSkipStarThreshold } from './annotate'
import { collectAnnotatableBlocks, resolveContentRoot, ANNOTATABLE_BLOCK_SELECTOR, isExcludedSection } from './content-scope'
import { getActivePlatformRule, type VocabPlatformRule } from './platform-rules'
import { isElementWithinViewportWindow } from './viewport'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import type { VocabSnapshot, VocabConfigPublic } from '../../../types/vocabulary'

let isRunning = false
let domObserver: MutationObserver | null = null
let visibilityObserver: IntersectionObserver | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let idleHandle: ReturnType<typeof setTimeout> | number | null = null
let isFlushing = false
let activeContentRoot: Element | null = null
let activePlatformRule: VocabPlatformRule | null = null
let rootRecheckTimers: ReturnType<typeof setTimeout>[] = []
let allowRootFallbackToContentRoot = true
let viewportReconcileTimer: ReturnType<typeof setTimeout> | null = null
let feedbackMenuEl: HTMLDivElement | null = null
let currentFeedbackTarget: HTMLElement | null = null

let annotateCtx: Parameters<typeof annotateVisibleText>[0] | null = null
let observedBlocks = new WeakSet<Element>()
const pendingBlocks = new Set<Element>()
const handleViewportChange = (): void => {
  scheduleViewportReconcile()
}

async function getVocabConfig(): Promise<VocabConfigPublic | null> {
  try {
    const res = await MessageUtils.sendMessage({ type: 'GET_VOCAB_CONFIG' })
    if (res.success && res.data) return res.data as VocabConfigPublic
  } catch (e) {
    Logger.error('[VocabLabel] Failed to get config:', e)
  }
  return null
}

async function getSnapshot(): Promise<VocabSnapshot | null> {
  try {
    const res = await MessageUtils.sendMessage({ type: 'GET_VOCAB_SNAPSHOT' })
    if (res.success && res.data) return res.data as VocabSnapshot
  } catch (e) {
    Logger.error('[VocabLabel] Failed to get snapshot:', e)
  }
  return null
}

async function getLearningProfile(words?: string[]): Promise<{ stars: Record<string, number> } | null> {
  try {
    const res = await MessageUtils.sendMessage({
      type: 'GET_VOCAB_LEARNING_PROFILE',
      words,
    })
    if (res.success && res.data) {
      return res.data as { stars: Record<string, number> }
    }
  } catch (e) {
    Logger.warn('[VocabLabel] Failed to get learning profile:', e)
  }
  return null
}

function ensureFeedbackMenu(): HTMLDivElement {
  if (feedbackMenuEl && feedbackMenuEl.isConnected) {
    return feedbackMenuEl
  }
  const menu = document.createElement('div')
  menu.className = 'ann-vocab-feedback-menu'
  menu.innerHTML = `
    <button type="button" data-ann-action="known">Known</button>
    <button type="button" data-ann-action="unknown">Unknown</button>
    <button type="button" data-ann-action="suppress">Skip</button>
    <button type="button" data-ann-action="addToVocab">Add</button>
  `
  document.documentElement.appendChild(menu)
  feedbackMenuEl = menu
  return menu
}

function hideFeedbackMenu(): void {
  feedbackMenuEl?.classList.remove('is-open')
  currentFeedbackTarget = null
}

function showFeedbackMenu(target: HTMLElement, clientX: number, clientY: number): void {
  const menu = ensureFeedbackMenu()
  currentFeedbackTarget = target
  menu.style.left = `${clientX}px`
  menu.style.top = `${clientY}px`
  menu.classList.add('is-open')
}

async function onFeedbackAction(action: string): Promise<void> {
  const target = currentFeedbackTarget
  if (!target) return
  const word = target.dataset.annVocabWord?.trim()
  if (!word) return
  const sentence = target.dataset.annVocabSentence?.trim()
  try {
    const res = await MessageUtils.sendMessage({
      type: 'RECORD_VOCAB_LEARNING_EVENT',
      event: {
        word,
        sentence: sentence || undefined,
        eventType: action,
      },
    })
    if (!res.success || !res.data) {
      Logger.warn('[VocabLabel] Learning event failed', res.error)
      return
    }
    const { star: newStar } = res.data as { queued: number; star: number; word: string }
    if (action === 'known' || action === 'suppress') {
      if (annotateCtx) {
        // For "known": ensure the overlay is at least the skip threshold so MutationObserver
        // does not immediately re-annotate the word within the current session.
        const overlayStar = action === 'suppress' ? 5 : Math.max(newStar, getSkipStarThreshold(annotateCtx))
        annotateCtx.pendingStarOverlay = {
          ...(annotateCtx.pendingStarOverlay ?? {}),
          [word]: overlayStar,
        }
      }
      const sameWord = document.querySelectorAll<HTMLElement>(`[data-ann-vocab][data-ann-vocab-word="${word}"]`)
      sameWord.forEach(el => {
        cleanupAnnotationsForElement(el)
      })
    }
  } catch (error) {
    Logger.warn('[VocabLabel] Failed to record learning event', error)
  } finally {
    hideFeedbackMenu()
  }
}

function cleanupAnnotationsForElement(el: Element): void {
  if (!el.parentNode) return
  if (el.tagName === 'RUBY') {
    const baseText = Array.from(el.childNodes)
      .filter(node => !(node instanceof HTMLElement && (node.tagName === 'RT' || node.tagName === 'RP')))
      .map(node => node.textContent ?? '')
      .join('')
    el.parentNode.insertBefore(document.createTextNode(baseText), el)
    el.remove()
    return
  }

  while (el.firstChild) {
    el.parentNode.insertBefore(el.firstChild, el)
  }
  el.remove()
}

function setupFeedbackMenuListeners(): void {
  const onContextMenu = (event: MouseEvent) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-ann-vocab]')
    if (!target) {
      hideFeedbackMenu()
      return
    }
    event.preventDefault()
    showFeedbackMenu(target, event.clientX, event.clientY)
  }
  const onClick = (event: MouseEvent) => {
    const actionEl = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-ann-action]')
    if (actionEl) {
      event.preventDefault()
      void onFeedbackAction(actionEl.dataset.annAction || '')
      return
    }
    if (!feedbackMenuEl?.contains(event.target as Node)) {
      hideFeedbackMenu()
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hideFeedbackMenu()
  }

  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKeyDown)

  ;(setupFeedbackMenuListeners as any)._cleanup = () => {
    document.removeEventListener('contextmenu', onContextMenu)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKeyDown)
  }
}

function cancelScheduledFlush(): void {
  if (idleHandle === null) return

  if ('cancelIdleCallback' in window && typeof (window as any).cancelIdleCallback === 'function') {
    ;(window as any).cancelIdleCallback(idleHandle as number)
  } else {
    clearTimeout(idleHandle)
  }

  idleHandle = null
}

async function flushPendingBlocks(): Promise<void> {
  if (!annotateCtx || isFlushing) return
  if (pendingBlocks.size === 0) return

  isFlushing = true
  try {
    while (pendingBlocks.size > 0) {
      const batch = Array.from(pendingBlocks).slice(0, 40)
      for (const block of batch) {
        pendingBlocks.delete(block)
      }

      await annotateVisibleText(annotateCtx, {
        roots: batch,
        pruneOutsideViewportWindow: true,
        viewportExpansionRatio: 0.5,
      })
    }
  } finally {
    isFlushing = false
    if (pendingBlocks.size > 0) {
      scheduleFlush()
    }
  }
}

function scheduleFlush(): void {
  if (idleHandle !== null) return

  if ('requestIdleCallback' in window && typeof (window as any).requestIdleCallback === 'function') {
    idleHandle = (window as any).requestIdleCallback(
      () => {
        idleHandle = null
        void flushPendingBlocks()
      },
      { timeout: 1200 },
    )
    return
  }

  idleHandle = setTimeout(() => {
    idleHandle = null
    void flushPendingBlocks()
  }, 80)
}

function enqueueBlocks(blocks: Iterable<Element>): void {
  for (const block of blocks) {
    if (!block.isConnected) continue
    if (!activeContentRoot?.contains(block)) continue
    pendingBlocks.add(block)
  }

  if (pendingBlocks.size > 0) {
    scheduleFlush()
  }
}

function resolveActiveContentRoot(): Element {
  return activePlatformRule?.resolveContentRoot?.() ?? resolveContentRoot()
}

function collectActiveAnnotatableBlocks(root: Element): Element[] {
  if (activePlatformRule) {
    return activePlatformRule.collectBlocks(root).filter(block => !isExcludedSection(block))
  }

  return collectAnnotatableBlocks(root)
}

function observeBlock(block: Element): void {
  if (!visibilityObserver) return
  if (observedBlocks.has(block)) return

  observedBlocks.add(block)
  visibilityObserver.observe(block)
}

function reconcileVisibleBlocks(): void {
  if (!activeContentRoot) return
  const visibleBlocks = collectActiveAnnotatableBlocks(activeContentRoot).filter(block => isElementWithinViewportWindow(block, 0.5))
  for (const block of visibleBlocks) {
    observeBlock(block)
  }
  enqueueBlocks(visibleBlocks)
}

function scheduleViewportReconcile(delayMs = 180): void {
  if (viewportReconcileTimer) {
    clearTimeout(viewportReconcileTimer)
  }

  viewportReconcileTimer = setTimeout(() => {
    viewportReconcileTimer = null
    reconcileVisibleBlocks()
  }, delayMs)
}

function setupViewportListeners(): void {
  window.addEventListener('scroll', handleViewportChange, { passive: true })
  window.addEventListener('resize', handleViewportChange)
}

function removeViewportListeners(): void {
  window.removeEventListener('scroll', handleViewportChange)
  window.removeEventListener('resize', handleViewportChange)
  if (viewportReconcileTimer) {
    clearTimeout(viewportReconcileTimer)
    viewportReconcileTimer = null
  }
}

function collectBlocksFromNode(node: Node): Element[] {
  if (!activeContentRoot) return []

  if (activePlatformRule) {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node instanceof Element ? node : null
    if (!element || !activeContentRoot.contains(element)) return []
    return activePlatformRule.collectBlocks(element)
      .filter(block => activeContentRoot?.contains(block))
      .filter(block => !isExcludedSection(block))
  }

  const collected = new Set<Element>()

  const addIfBlock = (el: Element | null): void => {
    if (!el) return
    if (!activeContentRoot?.contains(el)) return
    if (isExcludedSection(el)) return
    if (el.matches(ANNOTATABLE_BLOCK_SELECTOR)) {
      collected.add(el)
      return
    }

    const nearest = el.closest(ANNOTATABLE_BLOCK_SELECTOR)
    if (nearest && activeContentRoot.contains(nearest)) {
      collected.add(nearest)
      return
    }

    const nearestArticle = el.closest('article, [role="article"]')
    if (nearestArticle && activeContentRoot.contains(nearestArticle) && !isExcludedSection(nearestArticle)) {
      collected.add(nearestArticle)
    }
  }

  if (node.nodeType === Node.TEXT_NODE) {
    addIfBlock(node.parentElement)
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element
    addIfBlock(element)

    element.querySelectorAll(ANNOTATABLE_BLOCK_SELECTOR).forEach(el => {
      if (activeContentRoot?.contains(el) && !isExcludedSection(el)) {
        collected.add(el)
      }
    })
  }

  if (collected.size === 0) {
    const fallbackElement = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
    if (allowRootFallbackToContentRoot && fallbackElement && activeContentRoot.contains(fallbackElement) && !isExcludedSection(fallbackElement)) {
      collected.add(activeContentRoot)
    }
  }

  return Array.from(collected)
}

function setupVisibilityObserver(root: Element): void {
  if (visibilityObserver) visibilityObserver.disconnect()

  observedBlocks = new WeakSet<Element>()

  visibilityObserver = new IntersectionObserver(
    entries => {
      const entering: Element[] = []
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        if (entry.target instanceof Element) {
          entering.push(entry.target)
        }
      }
      enqueueBlocks(entering)
    },
    {
      root: null,
      rootMargin: '50% 0px 50% 0px',
      threshold: 0,
    },
  )

  const blocks = collectActiveAnnotatableBlocks(root)
  allowRootFallbackToContentRoot = !activePlatformRule && blocks.length === 1 && blocks[0] === root

  for (const block of blocks) {
    observeBlock(block)
  }

  reconcileVisibleBlocks()
}

function refreshContentRootIfNeeded(force = false): void {
  if (!activeContentRoot) return
  if (!force && activeContentRoot !== document.body && activeContentRoot.isConnected) return

  const nextRoot = resolveActiveContentRoot()
  if (!nextRoot || nextRoot === activeContentRoot) return

  activeContentRoot = nextRoot
  if (annotateCtx) {
    annotateCtx.contentRoot = nextRoot
  }

  // Drop stale annotations when switching from a broad/fallback root.
  cleanupAnnotations()
  pendingBlocks.clear()
  setupVisibilityObserver(nextRoot)
  scheduleViewportReconcile(0)

  Logger.info(`[VocabLabel] Content root switched to <${nextRoot.tagName.toLowerCase()}>`)
}

function scheduleContentRootRechecks(): void {
  rootRecheckTimers.forEach(timer => clearTimeout(timer))
  rootRecheckTimers = []

  for (const delayMs of [1200, 3000]) {
    const timer = setTimeout(() => {
      refreshContentRootIfNeeded(true)
    }, delayMs)
    rootRecheckTimers.push(timer)
  }
}

function setupMutationObserver(root: Element): void {
  if (domObserver) domObserver.disconnect()

  domObserver = new MutationObserver(mutations => {
    if (debounceTimer) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      refreshContentRootIfNeeded()

      const candidates = new Set<Element>()

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            collectBlocksFromNode(node).forEach(block => {
              candidates.add(block)
            })
          })
        }

        if (mutation.type === 'characterData') {
          collectBlocksFromNode(mutation.target).forEach(block => {
            candidates.add(block)
          })
        }
      }

      const visibleCandidates: Element[] = []
      for (const block of candidates) {
        observeBlock(block)
        if (isElementWithinViewportWindow(block, 0.5)) {
          visibleCandidates.push(block)
        }
      }

      enqueueBlocks(visibleCandidates)
    }, 250)
  })

  domObserver.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

export async function initVocabLabel(): Promise<void> {
  if (isRunning) return

  const config = await getVocabConfig()
  if (!config?.enabled) {
    Logger.info('[VocabLabel] Disabled by config')
    return
  }

  if (!shouldAnnotateDomain(window.location.hostname, config.domainWhitelist)) {
    Logger.info('[VocabLabel] Domain not in whitelist')
    return
  }

  if (!isEnglishPage()) {
    Logger.info('[VocabLabel] Not an English page, skipping')
    return
  }

  const snapshot = await getSnapshot()
  const learningProfile = await getLearningProfile()
  if (!snapshot) {
    Logger.info('[VocabLabel] No vocab snapshot, using empty snapshot for LLM-only mode')
  }

  isRunning = true
  injectVocabStyles()
  activePlatformRule = getActivePlatformRule()

  const emptySnapshot: VocabSnapshot = { version: '1.0', updatedAt: 0, entries: {} }
  const normalizedMaxAnnotations = Number.isFinite(config.maxAnnotationsPerPage) && config.maxAnnotationsPerPage > 0 ? config.maxAnnotationsPerPage : 200

  activeContentRoot = resolveActiveContentRoot()
  annotateCtx = {
    snapshot: snapshot ?? emptySnapshot,
    masteryThreshold: config.masteryThreshold,
    maxAnnotations: normalizedMaxAnnotations,
    contentRoot: activeContentRoot,
    userCEFRLevel: config.cefrLevel ?? 'B1',
    adaptiveLearningEnabled: config.adaptiveLearningEnabled !== false,
    annotationAggressiveness: config.annotationAggressiveness ?? 'balanced',
    pendingStarOverlay: learningProfile?.stars ?? {},
  }

  Logger.info('[VocabLabel] Starting annotation with strict content root...')

  const initialBlocks = collectActiveAnnotatableBlocks(activeContentRoot).filter(block => isElementWithinViewportWindow(block, 0.5))

  const initialCount = await annotateVisibleText(annotateCtx, {
    roots: initialBlocks,
    pruneOutsideViewportWindow: true,
    viewportExpansionRatio: 0.5,
  })
  Logger.info(`[VocabLabel] Initial annotation count: ${initialCount}`)

  setupVisibilityObserver(activeContentRoot)
  setupMutationObserver(activeContentRoot)
  setupViewportListeners()
  setupFeedbackMenuListeners()
  scheduleViewportReconcile(0)
  scheduleContentRootRechecks()
}

export function destroyVocabLabel(): void {
  if (domObserver) {
    domObserver.disconnect()
    domObserver = null
  }

  if (visibilityObserver) {
    visibilityObserver.disconnect()
    visibilityObserver = null
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  rootRecheckTimers.forEach(timer => clearTimeout(timer))
  rootRecheckTimers = []

  removeViewportListeners()
  cancelScheduledFlush()
  pendingBlocks.clear()
  activeContentRoot = null
  activePlatformRule = null
  annotateCtx = null
  allowRootFallbackToContentRoot = true
  ;(setupFeedbackMenuListeners as any)._cleanup?.()
  feedbackMenuEl?.remove()
  feedbackMenuEl = null
  currentFeedbackTarget = null

  cleanupAnnotations()
  resetVocabLabelRuntimeState()
  removeVocabStyles()

  isRunning = false
}
