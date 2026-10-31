import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * One colour, four handwritten copies (D-78): the design draft (docs/design/css/tokens.css, oklch), the extension
 * pages (styles/tokens.css, hex), the in-page overlays (entrypoints/content/content.css, --annov-*) and the website
 * (website/app/[locale]/globals.css, oklch). Each file's header says it matches the others; nothing checked that,
 * and the type chips drifted grey precisely because of it. The tables below are the check: every row names the
 * tokens that must hold the same colour, so editing one copy without the others turns this test red.
 *
 * The extension's type hues are hex conversions of the design's oklch() values. The conversion is not computed here
 * (that would pull a colour engine into the unit tests); the pairs live in the table, the oklch spelling beside its
 * hex. When an oklch() value changes, recompute the hex (any browser-grade converter; the review's colour-hex.mjs
 * is one) and update the row. The soft/text variants of a type are per-surface mixes and intentionally differ
 * between the extension and the website; only the icon/stroke hue is shared. Likewise intentionally not compared:
 * the neutral ramps (the design's dark surface is its own, the overlay's light text is its own) and every
 * syntax-specific value (shadows, focus rings).
 */

const read = (path: string): string => readFileSync(resolve(__dirname, '../../', path), 'utf8')

/** Where each file's dark values live. */
const DARK_BLOCK = /@media \(prefers-color-scheme: dark\)|\[data-theme='dark'\]|\.theme-dark/

/** `--name: value;` declarations of a CSS file; `light` reads up to the dark block, `dark` from it on. */
function declarations(css: string, block: 'light' | 'dark'): Map<string, string> {
  const cut = css.search(DARK_BLOCK)
  const source = block === 'light' ? css.slice(0, cut < 0 ? undefined : cut) : css.slice(cut)
  const found = new Map<string, string>()
  for (const match of source.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) found.set(match[1]!, match[2]!.trim())
  return found
}

const extension = { light: declarations(read('styles/tokens.css'), 'light'), dark: declarations(read('styles/tokens.css'), 'dark') }
const overlay = { light: declarations(read('entrypoints/content/content.css'), 'light'), dark: declarations(read('entrypoints/content/content.css'), 'dark') }
const design = { light: declarations(read('docs/design/css/tokens.css'), 'light'), dark: declarations(read('docs/design/css/tokens.css'), 'dark') }
const website = { light: declarations(read('website/app/[locale]/globals.css'), 'light'), dark: declarations(read('website/app/[locale]/globals.css'), 'dark') }

/** The type hues every copy shares: the design and the website write oklch, the extension writes its hex. */
const TYPE_HUES: Record<'clip' | 'highlight' | 'screenshot', { oklch: [string, string]; hex: [string, string] }> = {
  clip: { oklch: ['oklch(0.55 0.17 258)', 'oklch(0.76 0.12 258)'], hex: ['#276ed2', '#80b3fd'] },
  highlight: { oklch: ['oklch(0.66 0.15 78)', 'oklch(0.82 0.13 85)'], hex: ['#c38400', '#ebbd57'] },
  screenshot: { oklch: ['oklch(0.56 0.12 178)', 'oklch(0.78 0.11 178)'], hex: ['#008a74', '#5cceb7'] },
}

/** The accent, one purple in every copy. */
const ACCENT: [string, string] = ['#673ab8', '#7a55d1']

describe('one colour, four copies: the token parity table (D-78)', () => {
  it('the accent is one purple everywhere', () => {
    for (const [scheme, index] of [
      ['light', 0],
      ['dark', 1],
    ] as const) {
      expect(extension[scheme].get('ann-accent'), `styles/tokens.css --ann-accent (${scheme})`).toBe(ACCENT[index])
      expect(overlay[scheme].get('annov-accent'), `content.css --annov-accent (${scheme})`).toBe(ACCENT[index])
      expect(design[scheme].get('brand'), `docs/design --brand (${scheme})`).toBe(ACCENT[index])
      expect(website[scheme].get('brand'), `website --brand (${scheme})`).toBe(ACCENT[index])
    }
  })

  it('the overlay surfaces are the extension pages’ surfaces', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(overlay[scheme].get('annov-surface'), `content.css --annov-surface (${scheme})`).toBe(extension[scheme].get('ann-surface'))
    }
  })

  it('the design, the extension and the website hold the same type hues', () => {
    for (const [kind, row] of Object.entries(TYPE_HUES) as [keyof typeof TYPE_HUES, (typeof TYPE_HUES)['clip']][]) {
      for (const [scheme, index] of [
        ['light', 0],
        ['dark', 1],
      ] as const) {
        expect(design[scheme].get(`t-${kind}`), `docs/design --t-${kind} (${scheme})`).toBe(row.oklch[index])
        expect(website[scheme].get(`t-${kind}`), `website --t-${kind} (${scheme})`).toBe(row.oklch[index])
        expect(extension[scheme].get(`ann-type-${kind}`), `styles/tokens.css --ann-type-${kind} (${scheme})`).toBe(row.hex[index])
      }
    }
  })
})
