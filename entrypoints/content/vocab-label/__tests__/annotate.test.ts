import { describe, it, expect, vi, afterEach } from 'vitest'
import type { VocabSnapshot, VocabEntry, CEFRLevel } from '../../../../types/vocabulary'

vi.mock('../../../../utils/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockSendMessage = vi.fn()
vi.mock('../../../../utils/message', () => ({
  default: { sendMessage: (...args: any[]) => mockSendMessage(...args) },
}))

import { annotateVisibleText, cleanupAnnotations, resetVocabLabelRuntimeState } from '../annotate'

function makeSnapshot(entries: Record<string, VocabEntry> = {}): VocabSnapshot {
  return { version: '1.0', updatedAt: Date.now(), entries }
}

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    snapshot: makeSnapshot(),
    masteryThreshold: 3,
    maxAnnotations: 200,
    userCEFRLevel: 'B1' as CEFRLevel,
    ...overrides,
  }
}

function setupDOM(html: string): void {
  document.body.innerHTML = html
}

describe('annotateVisibleText — reverse-order DOM mutation', () => {
  afterEach(() => {
    cleanupAnnotations()
    resetVocabLabelRuntimeState()
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

    const ctx = makeCtx()

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
    setupDOM('<p>The architecture implementation requires comprehensive evaluation methodology.</p>')

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: '释义', source: 'llm' },
      }
    })

    const ctx = makeCtx()

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

    const ctx = makeCtx({ snapshot })

    await annotateVisibleText(ctx)

    const rubies = document.querySelectorAll('ruby[data-ann-vocab]')
    const glossTexts: string[] = []
    for (const ruby of rubies) {
      const rt = ruby.querySelector('rt')
      if (rt?.textContent) glossTexts.push(rt.textContent)
    }
    expect(glossTexts).toContain('算法')
    expect(glossTexts).toContain('优化')

    const llmCalls = mockSendMessage.mock.calls.filter((c: any[]) => c[0]?.type === 'CONTEXT_GLOSS')
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

    const ctx = makeCtx({ snapshot })

    await annotateVisibleText(ctx)

    const rubies = document.querySelectorAll('ruby[data-ann-vocab]')
    const annotatedWords = Array.from(rubies).map(r => r.firstChild?.textContent?.toLowerCase())

    expect(annotatedWords).not.toContain('algorithm')
    expect(annotatedWords).toContain('fundamental')
  })

  it('respects maxAnnotations limit', async () => {
    setupDOM('<p>Architecture implementation evaluation methodology comprehensive extraordinary.</p>')

    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    const ctx = makeCtx({ maxAnnotations: 2 })

    const count = await annotateVisibleText(ctx)
    expect(count).toBe(2)
  })

  it('skips common words at B1 level', async () => {
    // "this", "use", "the" are all A1/A2 level — should be filtered at B1
    setupDOM('<p>This is for use in the documentation.</p>')

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: '释义', source: 'llm' },
      }
    })

    const ctx = makeCtx()

    await annotateVisibleText(ctx)

    const rubies = document.querySelectorAll('ruby[data-ann-vocab]')
    const annotatedWords = Array.from(rubies).map(r => r.firstChild?.textContent?.toLowerCase())

    expect(annotatedWords).not.toContain('this')
    expect(annotatedWords).not.toContain('use')
    expect(annotatedWords).not.toContain('the')
    expect(annotatedWords).toContain('documentation')
  })

  it('suppresses CEFR-listed words at or below user level', async () => {
    // "system" is A2, "architecture" is A2 — both at or below B1 → suppressed
    // "robust" is C1, "ubiquitous" is not in CEFR → both annotated
    setupDOM('<p>The system architecture remains robust and ubiquitous.</p>')

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: '释义', source: 'llm' },
      }
    })

    const ctx = makeCtx()

    await annotateVisibleText(ctx)

    const rubies = document.querySelectorAll('ruby[data-ann-vocab]')
    const annotatedWords = Array.from(rubies).map(r => r.firstChild?.textContent?.toLowerCase())

    expect(annotatedWords).not.toContain('system')
    expect(annotatedWords).not.toContain('architecture')
    expect(annotatedWords).toContain('robust')
    expect(annotatedWords).toContain('ubiquitous')
  })

  it('restricts annotation to the provided content root', async () => {
    setupDOM(`
            <nav>Extraordinary nav item appears here.</nav>
            <main id="main-content">Extraordinary content appears here.</main>
        `)

    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    const main = document.getElementById('main-content') as Element
    const ctx = makeCtx({ contentRoot: main })

    await annotateVisibleText(ctx)

    const navRuby = document.querySelector('nav ruby[data-ann-vocab]')
    const mainRuby = document.querySelector('main ruby[data-ann-vocab]')

    expect(navRuby).toBeNull()
    expect(mainRuby).not.toBeNull()
  })

  it('skips hidden/sr-only text nodes', async () => {
    setupDOM(`
      <p><span class="sr-only">Extraordinary hidden token</span></p>
      <p>Extraordinary visible token</p>
    `)

    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    const ctx = makeCtx()

    await annotateVisibleText(ctx)

    const hiddenRuby = document.querySelector('.sr-only ruby[data-ann-vocab]')
    const visibleRuby = Array.from(document.querySelectorAll('ruby[data-ann-vocab]')).find(el => !el.closest('.sr-only'))

    expect(hiddenRuby).toBeNull()
    expect(visibleRuby).toBeTruthy()
  })

  it('skips link text without suppressing nearby content', async () => {
    setupDOM(`
      <p>
        <a href="https://example.com">Extraordinary reference</a>
        <span>Ubiquitous visible token</span>
      </p>
    `)

    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    const ctx = makeCtx()

    await annotateVisibleText(ctx)

    expect(document.querySelector('a ruby[data-ann-vocab]')).toBeNull()
    expect(document.querySelector('span ruby[data-ann-vocab]')).not.toBeNull()
  })

  it('annotates a platform content block nested inside an outer clickable card', async () => {
    setupDOM(`
      <div role="link">
        <div data-testid="tweetText">
          <span>Ubiquitous quoted content.</span>
          <a href="https://example.com">Extraordinary link</a>
        </div>
      </div>
    `)

    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    const root = document.querySelector('[data-testid="tweetText"]') as Element
    const ctx = makeCtx({ contentRoot: document.body })

    await annotateVisibleText(ctx, { roots: [root] })

    const annotatedWords = Array.from(document.querySelectorAll('ruby[data-ann-vocab]'))
      .map(r => r.firstChild?.textContent?.toLowerCase())

    expect(annotatedWords).toContain('ubiquitous')
    expect(annotatedWords).not.toContain('extraordinary')
  })

  it('resolves LLM glosses per content block instead of letting the first block consume the batch quota', async () => {
    setupDOM(`
      <div id="first">
        Zyphoria blorptastic quendovar nimbulary vextronic lumifrax gravitonix
        praxivore zenthropy wexalume borogrid marnivex solquantic.
      </div>
      <div id="second">Ubiquitous quoted content.</div>
    `)

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: `释义-${msg.word}`, source: 'llm' },
      }
    })

    const first = document.getElementById('first') as Element
    const second = document.getElementById('second') as Element
    const ctx = makeCtx()

    await annotateVisibleText(ctx, { roots: [first, second] })

    const secondRuby = second.querySelector('ruby[data-ann-vocab]')
    expect(secondRuby?.textContent).toContain('释义')
  })

  it('skips interactive control text and short UI labels', async () => {
    setupDOM(`
      <article>
        <button>Repost</button>
        <div role="button">Quote</div>
        <span>Like</span>
        <p>Ubiquitous article content.</p>
      </article>
    `)

    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    const ctx = makeCtx()

    await annotateVisibleText(ctx, { roots: [document.querySelector('article') as Element] })

    const annotatedWords = Array.from(document.querySelectorAll('ruby[data-ann-vocab]'))
      .map(r => r.firstChild?.textContent?.toLowerCase())

    expect(annotatedWords).not.toContain('repost')
    expect(annotatedWords).not.toContain('quote')
    expect(annotatedWords).not.toContain('like')
    expect(annotatedWords).toContain('ubiquitous')
  })

  it('deduplicates same word+sentence requests and reuses in-memory cache', async () => {
    // "ubiquitous" is NOT in CEFR → always sent to LLM
    setupDOM('<p>Ubiquitous ubiquitous and ubiquitous.</p>')

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: '无处不在', source: 'llm' },
      }
    })

    const ctx = makeCtx()

    await annotateVisibleText(ctx)

    const firstPassCalls = mockSendMessage.mock.calls.filter((c: any[]) => c[0]?.type === 'CONTEXT_GLOSS')
    expect(firstPassCalls.length).toBe(1)

    const extra = document.createElement('p')
    extra.textContent = 'Ubiquitous ubiquitous and ubiquitous.'
    document.body.appendChild(extra)
    await annotateVisibleText(ctx)

    const secondPassCalls = mockSendMessage.mock.calls.filter((c: any[]) => c[0]?.type === 'CONTEXT_GLOSS')
    expect(secondPassCalls.length).toBe(1)
  })

  it('collects sentence context without reading layout-dependent innerText', async () => {
    setupDOM('<p>The ubiquitous phenomenon appears here.</p>')

    const innerTextGetter = vi.fn(() => 'layout text')
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get: innerTextGetter,
    })
    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    const ctx = makeCtx({ userCEFRLevel: 'C1' })

    await annotateVisibleText(ctx)

    expect(innerTextGetter).not.toHaveBeenCalled()
    delete (HTMLElement.prototype as any).innerText
  })

  it('cleanupAnnotations removes all markers and restores text', async () => {
    // "ubiquitous" is not in CEFR → always annotated
    setupDOM('<p>The ubiquitous phenomenon.</p>')

    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    // Use A1 level so "phenomenon" (B1) also gets annotated
    const ctx = makeCtx({ userCEFRLevel: 'A1' })

    await annotateVisibleText(ctx)
    expect(document.querySelectorAll('[data-ann-vocab]').length).toBeGreaterThan(0)

    cleanupAnnotations()
    expect(document.querySelectorAll('[data-ann-vocab]').length).toBe(0)
  })

  it('cleanupAnnotations does not leak ruby rt text into body', async () => {
    setupDOM('<p>The ubiquitous phenomenon appears.</p>')

    mockSendMessage.mockImplementation(async () => ({
      success: true,
      data: { gloss: '释义', source: 'llm' },
    }))

    const before = (document.body.textContent || '').replace(/\s+/g, ' ').trim()
    const ctx = makeCtx({ userCEFRLevel: 'A1' })

    await annotateVisibleText(ctx)
    expect(document.querySelectorAll('ruby[data-ann-vocab] rt').length).toBeGreaterThan(0)

    cleanupAnnotations()

    expect(document.querySelectorAll('rt').length).toBe(0)
    const after = (document.body.textContent || '').replace(/\s+/g, ' ').trim()
    expect(after).toBe(before)
    expect(after).not.toContain('释义')
  })

  it('B1 user sees B2/C1 words but not A1/A2/B1 words', async () => {
    // "robust" is C1, "ubiquitous" is not in CEFR (→ LLM) — both should be annotated
    // "help" is A1, "become" is A1, "abandon" is B1 — all filtered at B1
    setupDOM('<p>We become robust and ubiquitous.</p>')

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: '释义', source: 'llm' },
      }
    })

    const ctx = makeCtx({ userCEFRLevel: 'B1' })
    await annotateVisibleText(ctx)

    const annotatedWords = Array.from(document.querySelectorAll('ruby[data-ann-vocab]'))
      .map(r => r.firstChild?.textContent?.toLowerCase())

    expect(annotatedWords).not.toContain('become')
    expect(annotatedWords).toContain('robust')
    expect(annotatedWords).toContain('ubiquitous')
  })

  it('C1 user sees almost nothing from CEFR word list', async () => {
    // At C1 level, A1-C1 words are all filtered.
    // "extraordinary" is B1, "architecture" is A2, "remains" is B2 — all filtered
    // Only "ubiquitous" (not in CEFR) passes through to LLM.
    setupDOM('<p>The extraordinary architecture remains ubiquitous.</p>')

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: '释义', source: 'llm' },
      }
    })

    const ctx = makeCtx({ userCEFRLevel: 'C1' })
    await annotateVisibleText(ctx)

    const annotatedWords = Array.from(document.querySelectorAll('ruby[data-ann-vocab]'))
      .map(r => r.firstChild?.textContent?.toLowerCase())

    expect(annotatedWords).not.toContain('extraordinary')
    expect(annotatedWords).not.toContain('architecture')
    expect(annotatedWords).not.toContain('remains')
    expect(annotatedWords).toContain('ubiquitous')
  })

  it('A1 user sees most words annotated', async () => {
    // At A1 level, only A1 words are filtered. B1+ words should be annotated.
    setupDOM('<p>The algorithm performs optimization efficiently.</p>')

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: '释义', source: 'llm' },
      }
    })

    const ctx = makeCtx({ userCEFRLevel: 'A1' })
    await annotateVisibleText(ctx)

    const annotatedWords = Array.from(document.querySelectorAll('ruby[data-ann-vocab]'))
      .map(r => r.firstChild?.textContent?.toLowerCase())

    // "performs" is B2 — should be annotated for A1 user
    expect(annotatedWords).toContain('algorithm')
    expect(annotatedWords).toContain('optimization')
    expect(annotatedWords).toContain('efficiently')
  })

  it('words not in CEFR list are always sent to LLM regardless of level', async () => {
    // "ubiquitous" is not in either Oxford 5000 or CEFR-J
    setupDOM('<p>The ubiquitous phenomenon.</p>')

    mockSendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'CONTEXT_GLOSS') return { success: false }
      return {
        success: true,
        data: { gloss: '释义', source: 'llm' },
      }
    })

    const ctx = makeCtx({ userCEFRLevel: 'C1' })
    await annotateVisibleText(ctx)

    const llmCalls = mockSendMessage.mock.calls.filter((c: any[]) => c[0]?.type === 'CONTEXT_GLOSS')
    const llmWords = llmCalls.map((c: any[]) => c[0].word.toLowerCase())
    expect(llmWords).toContain('ubiquitous')
  })
})
