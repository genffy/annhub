/**
 * Local domain-term detection (Weirdness-inspired, no server, no spaCy).
 *
 * Problem (research doc B1/B9): the difficulty gate unconditionally skips every word
 * absent from the general-corpus frequency table ("long tail"). That silently drops two
 * very different kinds of word:
 *   1. Domain jargon / proper nouns that repeat across the page (kubernetes, Anthropic,
 *      mitochondria in a biology article) — correctly NOT learnable general vocabulary.
 *   2. Genuinely rare general words a learner plausibly doesn't know (perfunctory,
 *      epistemic) — wrongly dropped; this is the core "can't surface real unknowns" bug.
 *
 * Idea: a long-tail word that is *characteristic of this page's domain* tends to repeat
 * within the page (high in-page term frequency) far more than its near-zero general
 * frequency would predict. A one-off rare word is more likely a genuine vocabulary item.
 *
 * Weirdness(w) ≈ inPageRate(w) / generalRate(w). For long-tail words generalRate is
 * effectively the floor (below the table's rank cutoff), so we approximate the signal
 * with the raw in-page count plus light morphology/casing cues. This module is pure and
 * synchronous: callers build page term stats once per pass, then classify each candidate.
 */

export interface DomainTermStats {
  /** Lowercased lemma → number of times it appeared on the page (this pass). */
  counts: Map<string, number>
  /** Total tokens counted, for rate normalization. */
  totalTokens: number
}

export interface DomainTermOptions {
  /**
   * A long-tail word repeating at least this many times on the page is treated as a
   * domain term / topic keyword (skip), not a one-off genuine unknown.
   */
  repeatThreshold?: number
}

const DEFAULT_REPEAT_THRESHOLD = 3

export function createDomainTermStats(): DomainTermStats {
  return { counts: new Map(), totalTokens: 0 }
}

/** Accrue one occurrence of a (lemmatized, lowercased) word into the page stats. */
export function recordPageToken(stats: DomainTermStats, lemma: string): void {
  if (!lemma) return
  stats.counts.set(lemma, (stats.counts.get(lemma) ?? 0) + 1)
  stats.totalTokens += 1
}

/** How many times a lemma occurred on the page this pass. */
export function pageCount(stats: DomainTermStats, lemma: string): number {
  return stats.counts.get(lemma) ?? 0
}

/**
 * Decide whether a long-tail word (absent from the general frequency table) is most
 * likely a domain term / proper noun (→ skip) rather than a genuine learnable unknown.
 *
 * Returns true to FILTER (skip annotating). This is the targeted replacement for the old
 * blanket `band === null → skip`: only long-tail words that look like jargon are skipped;
 * one-off rare general words are now allowed through.
 *
 * @param lemma      lowercased base form (used for page-frequency lookup)
 * @param surface    original surface token (used for casing/acronym cues)
 * @param stats      page term-frequency stats built over the current pass
 */
export function isLikelyDomainTerm(lemma: string, surface: string, stats: DomainTermStats, options: DomainTermOptions = {}): boolean {
  if (!lemma) return true
  const repeatThreshold = options.repeatThreshold ?? DEFAULT_REPEAT_THRESHOLD

  // Acronyms / CamelCase long-tail tokens are overwhelmingly product names / jargon.
  if (/^[A-Z]{2,}$/.test(surface)) return true
  if (/[a-z][A-Z]/.test(surface)) return true

  // A long-tail word that recurs across the page is the page's topic vocabulary
  // (a domain term), not a one-off unfamiliar general word.
  if (pageCount(stats, lemma) >= repeatThreshold) return true

  // Otherwise: a rare word appearing once or twice → treat as a genuine unknown and
  // let it through to annotation. This is the fix for the core long-tail miss.
  return false
}

export const __testing = {
  DEFAULT_REPEAT_THRESHOLD,
}
