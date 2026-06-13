/**
 * Vocab word-selection pipeline — end-to-end tests
 *
 * Exercises the real runtime path the unit tests cannot: the content script
 * (entrypoints/content/vocab-label/annotate.ts) talking to the background
 * VocabularyService over chrome.runtime messaging, with state landing in
 * chrome.storage.local. Asserts the layers documented in
 *   - docs/vocab-word-selection-research.md (L1 / S2 / S3 / S1 recall)
 *   - docs/vocab-server-memory-model-design.md (T1-B memory-event queue)
 *
 * Word choices are verified against the frequency band data (see e2e/vocab.html)
 * so each gate is deterministically observable. Markers live in the host DOM as
 * `[data-ann-vocab]` elements carrying `data-ann-vocab-word` = normalized lemma.
 */
import { test, expect } from './fixtures'
import { navigateToVocabPage, setVocabConfigViaServiceWorker, getStorageViaServiceWorker, setStorageViaServiceWorker, getAnnotatedWords, waitForVocabAnnotations } from './helpers'

// band null, single occurrence, not written-HF -> genuine unknown (S2) -> annotated
const RARE_UNKNOWNS = ['perfunctory', 'obfuscate', 'soporific', 'defenestrate', 'perspicacious', 'epistemic']
// band 1, at/below the B1 threshold -> too easy (L1) -> NOT annotated
const EASY_WORDS = ['people', 'water', 'school', 'family', 'important', 'different']
// high subtitle band but written/academic high-frequency (S3) -> NOT annotated
const WRITTEN_HF = ['furthermore', 'methodology', 'paradigm', 'whereas']
// band null but repeated >= 3x on the page -> domain jargon (S2) -> NOT annotated
const DOMAIN_TERM = 'mitochondria'

const BASE_CONFIG = {
  enabled: true,
  adaptiveLearningEnabled: true,
  annotationAggressiveness: 'balanced',
  cefrLevel: 'B1',
  maxAnnotationsPerPage: 200,
  domainWhitelist: { enabled: false, domains: [] },
  llmWordSelectionEnabled: false,
  memorySyncEnabled: false,
  memorySyncEndpoint: '',
}

test.describe('Vocab word-selection pipeline (S1–S3, T1-B)', () => {
  test('selects genuine unknowns; skips easy / written-HF / domain words', async ({ context, page }) => {
    await setVocabConfigViaServiceWorker(context, BASE_CONFIG)
    await navigateToVocabPage(page)
    await waitForVocabAnnotations(page, RARE_UNKNOWNS.length)
    await page.waitForTimeout(600) // let any remaining wraps in the pass settle

    const annotated = new Set(await getAnnotatedWords(page))

    // S2: genuine long-tail unknowns (band null, one-off) are surfaced — the core fix for
    // the old "band === null -> blanket skip" miss.
    for (const w of RARE_UNKNOWNS) {
      expect(annotated.has(w), `expected genuine unknown "${w}" to be annotated`).toBe(true)
    }

    // L1: common band-1 vocabulary at/below the user's CEFR threshold stays unmarked.
    for (const w of EASY_WORDS) {
      expect(annotated.has(w), `expected easy word "${w}" NOT annotated`).toBe(false)
    }

    // S3: written/academic high-frequency words are "known" despite their inflated spoken-corpus
    // band (furthermore=4, methodology=6, paradigm=6, whereas=4 > B1 threshold 3).
    for (const w of WRITTEN_HF) {
      expect(annotated.has(w), `expected written-HF word "${w}" NOT annotated`).toBe(false)
    }

    // S2: a long-tail term recurring across the page is the page's topic vocabulary, not an unknown.
    expect(annotated.has(DOMAIN_TERM), `expected repeated domain term "${DOMAIN_TERM}" NOT annotated`).toBe(false)
  })

  test('S1: passive exposure accrues word memory and suppresses re-annotation on reload', async ({ context, page }) => {
    await setVocabConfigViaServiceWorker(context, BASE_CONFIG)
    await navigateToVocabPage(page)
    await waitForVocabAnnotations(page, RARE_UNKNOWNS.length)

    // Exposures are reported fire-and-forget after the pass; wait until the background's
    // word-memory store (vocabWordMemory) has accrued a `seen` for each unknown.
    await expect
      .poll(
        async () => {
          const { vocabWordMemory } = await getStorageViaServiceWorker(context, ['vocabWordMemory'])
          const store = vocabWordMemory || {}
          return RARE_UNKNOWNS.filter(w => (store[w]?.seenCount ?? 0) >= 1).length
        },
        { timeout: 8000 },
      )
      .toBe(RARE_UNKNOWNS.length)

    // The `seen` event must actually run through applyEvent (stability grows past the
    // initial 1-day half-life via the spacing-effect factor), not just write a placeholder.
    const { vocabWordMemory } = await getStorageViaServiceWorker(context, ['vocabWordMemory'])
    for (const w of RARE_UNKNOWNS) {
      expect(vocabWordMemory[w].seenCount, `"${w}" seenCount`).toBeGreaterThanOrEqual(1)
      expect(vocabWordMemory[w].stability, `"${w}" stability grew`).toBeGreaterThan(1)
    }

    // Reload: getLearningProfile() now folds recall-derived stars. A word seen moments ago
    // has recall ~1.0 -> recallToStar = 5 >= skip threshold (balanced = 3), so it is no
    // longer a candidate — the static frequency gate alone would still surface it.
    await navigateToVocabPage(page)
    await page.waitForTimeout(2500)

    const annotated = new Set(await getAnnotatedWords(page))
    for (const w of RARE_UNKNOWNS) {
      expect(annotated.has(w), `expected previously-seen "${w}" NOT re-annotated after recall`).toBe(false)
    }
  })

  test('S1: seeded recall suppresses "known" words while unseen unknowns still surface', async ({ context, page }) => {
    // Same page, same config, same single pass — the ONLY difference is that half the
    // unknowns already have a strong, recent memory. This isolates the recall read-path
    // gate (and proves the annotator did run + chose selectively, not skip-everything).
    const now = Date.now()
    const KNOWN = ['perfunctory', 'obfuscate', 'soporific']
    const UNSEEN = ['defenestrate', 'perspicacious', 'epistemic']
    const seededMemory: Record<string, unknown> = {}
    for (const w of KNOWN) seededMemory[w] = { seenCount: 8, lastSeenAt: now, stability: 300 } // recall ~1 -> star 5

    await setVocabConfigViaServiceWorker(context, BASE_CONFIG)
    await setStorageViaServiceWorker(context, { vocabWordMemory: seededMemory })
    await navigateToVocabPage(page)
    await waitForVocabAnnotations(page, UNSEEN.length)
    await page.waitForTimeout(600)

    const annotated = new Set(await getAnnotatedWords(page))
    for (const w of KNOWN) {
      expect(annotated.has(w), `expected seeded-known "${w}" suppressed by recall`).toBe(false)
    }
    for (const w of UNSEEN) {
      expect(annotated.has(w), `expected un-seeded unknown "${w}" still annotated`).toBe(true)
    }
  })

  test('T1-B: opt-in memory sync queues anonymized `seen` events (no endpoint -> local queue only)', async ({ context, page }) => {
    await setVocabConfigViaServiceWorker(context, { ...BASE_CONFIG, memorySyncEnabled: true })
    await navigateToVocabPage(page)
    await waitForVocabAnnotations(page, RARE_UNKNOWNS.length)

    // The queue fills fire-and-forget alongside the word-memory write.
    await expect
      .poll(
        async () => {
          const { vocabMemoryEventQueue } = await getStorageViaServiceWorker(context, ['vocabMemoryEventQueue'])
          return Array.isArray(vocabMemoryEventQueue) ? vocabMemoryEventQueue.length : 0
        },
        { timeout: 8000 },
      )
      .toBeGreaterThanOrEqual(RARE_UNKNOWNS.length)

    const { vocabMemoryEventQueue, vocabSyncIdentity } = await getStorageViaServiceWorker(context, ['vocabMemoryEventQueue', 'vocabSyncIdentity'])
    const events = vocabMemoryEventQueue as Array<Record<string, unknown>>

    const lemmas = new Set(events.map(e => e.lemma))
    for (const w of RARE_UNKNOWNS) {
      expect(lemmas.has(w), `expected a queued memory event for "${w}"`).toBe(true)
    }

    // Privacy contract (design §4): events carry only lemma + type + time + counts + anon
    // deviceId — never the sentence, URL, or any page content.
    for (const ev of events) {
      expect(ev.type).toBe('seen')
      expect(typeof ev.eventId).toBe('string')
      expect(String(ev.deviceId)).toMatch(/^anon-/)
      expect(ev).not.toHaveProperty('sentence')
      expect(ev).not.toHaveProperty('url')
      expect(ev).not.toHaveProperty('text')
    }
    expect(String(vocabSyncIdentity?.deviceId)).toMatch(/^anon-/)
  })

  test('disabled config performs no annotation', async ({ context, page }) => {
    await setVocabConfigViaServiceWorker(context, { ...BASE_CONFIG, enabled: false })
    await navigateToVocabPage(page)
    await page.waitForTimeout(2500)

    const annotated = await getAnnotatedWords(page)
    expect(annotated).toHaveLength(0)
  })
})
