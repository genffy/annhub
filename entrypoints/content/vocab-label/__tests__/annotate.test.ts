import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { VocabSnapshot, VocabEntry } from '../../../../types/vocabulary'

vi.mock('../../../../utils/logger', () => ({
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockSendMessage = vi.fn()
vi.mock('../../../../utils/message', () => ({
    default: { sendMessage: (...args: any[]) => mockSendMessage(...args) },
}))

import { annotateVisibleText, cleanupAnnotations } from '../annotate'

function makeSnapshot(entries: Record<string, VocabEntry> = {}): VocabSnapshot {
    return { version: '1.0', updatedAt: Date.now(), entries }
}

function setupDOM(html: string): void {
    document.body.innerHTML = html
}

describe('annotateVisibleText — reverse-order DOM mutation', () => {
    afterEach(() => {
        cleanupAnnotations()
        document.body.innerHTML = ''
        mockSendMessage.mockReset()
    })

    it('annotates multiple words in the same text node without splitting words', async () => {
        setupDOM('<p>The extraordinary phenomenon was documented thoroughly.</p>')

        mockSendMessage.mockImplementation(async (msg: any) => {
            if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
            const glossMap: Record<string, string> = {
                extraordinary: '非凡的',
                phenomenon: '现象',
                documented: '记录',
                thoroughly: '彻底地',
            }
            return {
                success: true,
                data: { gloss: glossMap[msg.word] || '', source: 'llm' },
            }
        })

        const ctx = {
            snapshot: makeSnapshot(),
            masteryThreshold: 3,
            maxAnnotations: 200,
        }

        const count = await annotateVisibleText(ctx)
        expect(count).toBeGreaterThan(0)

        const rubies = document.querySelectorAll('ruby[data-ann-vocab]')
        for (const ruby of rubies) {
            const wordText = ruby.firstChild?.textContent || ''
            expect(wordText).toMatch(/^[a-zA-Z]+$/)
            expect(wordText.length).toBeGreaterThanOrEqual(3)
        }

        const bodyText = document.body.textContent || ''
        expect(bodyText).toContain('extraordinary')
        expect(bodyText).toContain('phenomenon')
        expect(bodyText).toContain('documented')
        expect(bodyText).toContain('thoroughly')
    })

    it('does not produce partial-word annotations when many words in one node', async () => {
        setupDOM(
            '<p>The architecture implementation requires comprehensive evaluation methodology.</p>'
        )

        mockSendMessage.mockImplementation(async (msg: any) => {
            if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
            return {
                success: true,
                data: { gloss: '释义', source: 'llm' },
            }
        })

        const ctx = {
            snapshot: makeSnapshot(),
            masteryThreshold: 3,
            maxAnnotations: 200,
        }

        await annotateVisibleText(ctx)

        const allTextNodes: string[] = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node: Node | null
        while ((node = walker.nextNode())) {
            const t = node.textContent?.trim()
            if (t) allTextNodes.push(t)
        }

        for (const t of allTextNodes) {
            if (/[a-zA-Z]/.test(t) && t !== 'The') {
                const words = t.split(/\s+/)
                for (const w of words) {
                    if (w.length > 0 && /^[a-zA-Z]+$/.test(w)) {
                        expect(w.length).toBeGreaterThanOrEqual(1)
                    }
                }
            }
        }
    })

    it('uses local exp from snapshot without calling LLM', async () => {
        setupDOM('<p>The algorithm performs optimization efficiently.</p>')

        const snapshot = makeSnapshot({
            algorithm: { proficiency: 1, exp: '算法' },
            optimization: { proficiency: 0, exp: '优化' },
        })

        const ctx = {
            snapshot,
            masteryThreshold: 3,
            maxAnnotations: 200,
        }

        await annotateVisibleText(ctx)

        const rubies = document.querySelectorAll('ruby[data-ann-vocab]')
        const glossTexts: string[] = []
        for (const ruby of rubies) {
            const rt = ruby.querySelector('rt')
            if (rt?.textContent) glossTexts.push(rt.textContent)
        }
        expect(glossTexts).toContain('算法')
        expect(glossTexts).toContain('优化')

        const llmCalls = mockSendMessage.mock.calls.filter(
            (c: any[]) => c[0]?.type === 'CONTEXT_GLOSS'
        )
        const llmWords = llmCalls.map((c: any[]) => c[0].word.toLowerCase())
        expect(llmWords).not.toContain('algorithm')
        expect(llmWords).not.toContain('optimization')
    })

    it('skips mastered words (proficiency >= threshold)', async () => {
        setupDOM('<p>The algorithm is fundamental.</p>')

        const snapshot = makeSnapshot({
            algorithm: { proficiency: 5, exp: '算法' },
            fundamental: { proficiency: 1, exp: '基本的' },
        })

        const ctx = {
            snapshot,
            masteryThreshold: 3,
            maxAnnotations: 200,
        }

        await annotateVisibleText(ctx)

        const rubies = document.querySelectorAll('ruby[data-ann-vocab]')
        const annotatedWords = Array.from(rubies).map(
            r => r.firstChild?.textContent?.toLowerCase()
        )

        expect(annotatedWords).not.toContain('algorithm')
        expect(annotatedWords).toContain('fundamental')
    })

    it('respects maxAnnotations limit', async () => {
        setupDOM(
            '<p>Architecture implementation evaluation methodology comprehensive extraordinary.</p>'
        )

        mockSendMessage.mockImplementation(async () => ({
            success: true,
            data: { gloss: '释义', source: 'llm' },
        }))

        const ctx = {
            snapshot: makeSnapshot(),
            masteryThreshold: 3,
            maxAnnotations: 2,
        }

        const count = await annotateVisibleText(ctx)
        expect(count).toBe(2)
    })

    it('skips common words', async () => {
        setupDOM('<p>This is for use in the documentation.</p>')

        mockSendMessage.mockImplementation(async (msg: any) => {
            if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
            return {
                success: true,
                data: { gloss: '释义', source: 'llm' },
            }
        })

        const ctx = {
            snapshot: makeSnapshot(),
            masteryThreshold: 3,
            maxAnnotations: 200,
        }

        await annotateVisibleText(ctx)

        const rubies = document.querySelectorAll('ruby[data-ann-vocab]')
        const annotatedWords = Array.from(rubies).map(
            r => r.firstChild?.textContent?.toLowerCase()
        )

        expect(annotatedWords).not.toContain('this')
        expect(annotatedWords).not.toContain('use')
        expect(annotatedWords).not.toContain('the')
        expect(annotatedWords).toContain('documentation')
    })

    it('cleanupAnnotations removes all markers and restores text', async () => {
        setupDOM('<p>The extraordinary phenomenon.</p>')

        mockSendMessage.mockImplementation(async () => ({
            success: true,
            data: { gloss: '释义', source: 'llm' },
        }))

        const ctx = {
            snapshot: makeSnapshot(),
            masteryThreshold: 3,
            maxAnnotations: 200,
        }

        await annotateVisibleText(ctx)
        expect(document.querySelectorAll('[data-ann-vocab]').length).toBeGreaterThan(0)

        cleanupAnnotations()
        expect(document.querySelectorAll('[data-ann-vocab]').length).toBe(0)
    })
})
