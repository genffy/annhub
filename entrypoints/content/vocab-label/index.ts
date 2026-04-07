import { isEnglishPage, shouldAnnotateDomain } from './detect-page'
import { injectVocabStyles, removeVocabStyles } from './styles'
import { annotateVisibleText, cleanupAnnotations } from './annotate'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import type { VocabSnapshot, VocabConfigPublic } from '../../../types/vocabulary'

let isRunning = false
let observer: MutationObserver | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

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

function setupMutationObserver(ctx: Parameters<typeof annotateVisibleText>[0]): void {
    if (observer) observer.disconnect()

    observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
            annotateVisibleText(ctx).catch(err => {
                Logger.error('[VocabLabel] Re-annotation failed:', err)
            })
        }, 1000)
    })

    observer.observe(document.body, {
        childList: true,
        subtree: true,
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
    if (!snapshot) {
        Logger.info('[VocabLabel] No vocab snapshot, using empty snapshot for LLM-only mode')
    }

    isRunning = true
    Logger.info('[VocabLabel] Starting annotation...')

    injectVocabStyles()

    const emptySnapshot: VocabSnapshot = { version: '1.0', updatedAt: 0, entries: {} }
    const ctx = {
        snapshot: snapshot ?? emptySnapshot,
        masteryThreshold: config.masteryThreshold,
        maxAnnotations: config.maxAnnotationsPerPage,
    }

    const count = await annotateVisibleText(ctx)
    Logger.info(`[VocabLabel] Annotated ${count} words`)

    setupMutationObserver(ctx)
}

export function destroyVocabLabel(): void {
    if (observer) {
        observer.disconnect()
        observer = null
    }
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
    cleanupAnnotations()
    removeVocabStyles()
    isRunning = false
}
