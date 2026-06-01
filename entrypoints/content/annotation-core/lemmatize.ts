/**
 * Lightweight English lemmatizer for vocabulary lookup.
 *
 * Goal: map an inflected surface form (running, studied, mice) to its base lemma
 * (run, study, mouse) so that frequency-band / CEFR / Eudic-snapshot lookups hit
 * the canonical entry instead of falling into the "not in table" long tail.
 *
 * Scope & non-goals:
 *  - Pure rule + irregular-dictionary approach, no external deps, no POS tagging.
 *  - English inflection is ambiguous when undoing a silent 'e' (making->make vs
 *    reading->read; liked->like vs walked->walk). Rules alone cannot decide. So the
 *    primary API produces an ordered list of *candidate* lemmas and a `pickLemma`
 *    helper resolves the ambiguity against a real dictionary (the frequency / CEFR /
 *    Eudic tables) passed in by the caller.
 *  - For *lookup keys only*. DOM ranges/annotations always use the original token
 *    offsets; the lemma never replaces displayed text.
 *
 * Input is expected to be already lowercased & normalized (see normalizeWord).
 */

// Irregular verbs / nouns whose lemma cannot be derived by suffix rules.
const IRREGULAR: Record<string, string> = {
  // irregular verbs
  was: 'be',
  were: 'be',
  been: 'be',
  is: 'be',
  are: 'be',
  am: 'be',
  had: 'have',
  has: 'have',
  did: 'do',
  does: 'do',
  done: 'do',
  went: 'go',
  gone: 'go',
  made: 'make',
  said: 'say',
  came: 'come',
  took: 'take',
  taken: 'take',
  saw: 'see',
  seen: 'see',
  knew: 'know',
  known: 'know',
  got: 'get',
  gotten: 'get',
  gave: 'give',
  given: 'give',
  found: 'find',
  thought: 'think',
  told: 'tell',
  became: 'become',
  left: 'leave',
  felt: 'feel',
  brought: 'bring',
  began: 'begin',
  begun: 'begin',
  kept: 'keep',
  held: 'hold',
  wrote: 'write',
  written: 'write',
  stood: 'stand',
  heard: 'hear',
  meant: 'mean',
  met: 'meet',
  ran: 'run',
  paid: 'pay',
  sat: 'sit',
  spoke: 'speak',
  spoken: 'speak',
  lain: 'lie',
  led: 'lead',
  grew: 'grow',
  grown: 'grow',
  lost: 'lose',
  fell: 'fall',
  fallen: 'fall',
  sent: 'send',
  built: 'build',
  understood: 'understand',
  drew: 'draw',
  drawn: 'draw',
  broke: 'break',
  broken: 'break',
  spent: 'spend',
  caught: 'catch',
  rose: 'rise',
  risen: 'rise',
  drove: 'drive',
  driven: 'drive',
  bought: 'buy',
  chose: 'choose',
  chosen: 'choose',
  ate: 'eat',
  eaten: 'eat',
  taught: 'teach',
  threw: 'throw',
  thrown: 'throw',
  flew: 'fly',
  flown: 'fly',
  wore: 'wear',
  worn: 'wear',
  // irregular plural nouns
  children: 'child',
  men: 'man',
  women: 'woman',
  feet: 'foot',
  teeth: 'tooth',
  mice: 'mouse',
  geese: 'goose',
  people: 'person',
  lives: 'life',
  knives: 'knife',
  wives: 'wife',
  leaves: 'leaf',
  wolves: 'wolf',
  // irregular comparatives/superlatives
  better: 'good',
  best: 'good',
  worse: 'bad',
  worst: 'bad',
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

function isVowel(ch: string): boolean {
  return VOWELS.has(ch)
}

function endsWithAny(word: string, suffixes: string[]): boolean {
  return suffixes.some(s => word.endsWith(s))
}

/** Push a candidate if non-empty and not already present. */
function add(list: string[], w: string): void {
  if (w && w.length >= 2 && !list.includes(w)) list.push(w)
}

/**
 * Ordered list of plausible base lemmas for an (already lowercased) word.
 * The original word is intentionally NOT included — use `pickLemma` if you want a
 * fallback to the original. Empty array means "no inflection rule applied".
 */
export function lemmaCandidates(word: string): string[] {
  if (!word || word.length < 3 || !/^[a-z'-]+$/.test(word)) return []

  const irregular = IRREGULAR[word]
  if (irregular) return [irregular]

  const out: string[] = []

  // -ied / -ies -> -y (studied -> study, studies -> study)
  if ((word.endsWith('ied') || word.endsWith('ies')) && word.length > 4) {
    add(out, word.slice(0, -3) + 'y')
    return out
  }

  // -ing form (running -> run, making -> make, reading -> read)
  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3)
    // doubled consonant: runn-ing -> run
    const n = stem.length
    if (n >= 2 && stem[n - 1] === stem[n - 2] && !isVowel(stem[n - 1])) {
      add(out, stem.slice(0, -1))
    }
    add(out, stem) // reading -> read
    add(out, stem + 'e') // making -> make
    return out
  }

  // -ed form (walked -> walk, stopped -> stop, liked -> like)
  if (word.endsWith('ed') && word.length > 4) {
    const stem = word.slice(0, -2)
    const n = stem.length
    if (n >= 2 && stem[n - 1] === stem[n - 2] && !isVowel(stem[n - 1])) {
      add(out, stem.slice(0, -1)) // stopped -> stop
    }
    add(out, stem) // walked -> walk
    add(out, stem + 'e') // liked -> like
    return out
  }

  // -es plural / 3rd person (boxes -> box, goes -> go, names -> name)
  if (word.endsWith('es') && word.length > 4) {
    const stem = word.slice(0, -2)
    if (endsWithAny(stem, ['s', 'x', 'z', 'ch', 'sh'])) {
      add(out, stem) // boxes -> box, watches -> watch
    }
    add(out, stem) // goes -> go
    add(out, stem + 'e') // names -> name
    return out
  }

  // plain -s (cats -> cat); skip -ss (glass)
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    add(out, word.slice(0, -1))
    return out
  }

  return out
}

/**
 * Best single-guess lemma (first candidate), falling back to the word itself.
 * Convenience for standalone use; prefer `pickLemma` when a dictionary is available.
 */
export function lemmatize(word: string): string {
  const cands = lemmaCandidates(word)
  return cands.length > 0 ? cands[0] : word
}

/**
 * Resolve the correct lemma by checking candidates against a real dictionary.
 * Returns the first candidate for which `exists` is true; if the original word
 * itself exists, prefers that (it is already canonical); otherwise returns the
 * original word unchanged.
 */
export function pickLemma(word: string, exists: (w: string) => boolean): string {
  if (exists(word)) return word
  for (const cand of lemmaCandidates(word)) {
    if (exists(cand)) return cand
  }
  return word
}
