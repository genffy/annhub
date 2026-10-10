import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * Things about the website that only show up in a browser, and that came back more than once. A type check and the
 * page's own tests cannot see them; each of these was found by clicking through the site.
 */

const root = resolve(__dirname, '../..')
const site = join(root, 'website')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function walk(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path, extensions)
    return extensions.some(extension => name.endsWith(extension)) ? [path] : []
  })
}

describe('links inside the site', () => {
  // A production origin written into a link sends a visitor on localhost, a deploy preview or a branch to the live site,
  // which may still serve an older page: the terms of service looked "not updated" because the privacy page linked to
  // it by absolute URL. Links are paths. What crawlers read is the only place an origin belongs: the canonical links,
  // the one constant behind metadataBase and the sitemap, and the Sitemap line of robots.txt.
  const sources = ['app', 'components', 'i18n', 'lib', 'public'].flatMap(dir => walk(join(site, dir), ['.css', '.html', '.json', '.ts', '.tsx', '.txt']))

  it('never hard-codes the production origin, except where crawlers read it', () => {
    const offenders = sources.flatMap(file =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /annhub\.org/i.test(line) && !/rel="canonical"|^export const SITE_ORIGIN = |^Sitemap: /.test(line)
            ? [`${relative(root, file)}:${index + 1}  ${line.trim().slice(0, 120)}`]
            : [],
        ),
    )
    expect(offenders).toEqual([])
  })

  it('links the two legal pages to each other and to the home page by path', () => {
    const privacy = read('website/public/privacy-policy.html')
    const terms = read('website/public/terms-of-service.html')
    for (const page of [privacy, terms]) expect(page).toContain('<a href="/">Home</a>')
    expect(privacy).toContain('<a href="/terms-of-service.html">')
    expect(terms).toContain('<a href="/privacy-policy.html">')
  })

  it('keeps canonical addresses absolute', () => {
    expect(read('website/public/privacy-policy.html')).toContain('<link rel="canonical" href="https://annhub.org/privacy-policy.html">')
    expect(read('website/public/terms-of-service.html')).toContain('<link rel="canonical" href="https://annhub.org/terms-of-service.html">')
    expect(read('website/lib/site.ts')).toContain("export const SITE_ORIGIN = 'https://annhub.org'")
    expect(read('website/app/[locale]/layout.tsx')).toContain('metadataBase: new URL(SITE_ORIGIN)')
  })
})

describe('scrolling', () => {
  it('tells Next.js about the smooth scroll, so changing the language does not animate a scroll up the page', () => {
    // With the attribute Next turns smooth scrolling off while it swaps pages and leaves it on for in-page anchors.
    // Without it the new page opens wherever the old one was scrolled and then glides to the top for about a second.
    const smooth = /scroll-behavior:\s*smooth/.test(read('website/app/[locale]/globals.css'))
    expect(read('website/app/[locale]/layout.tsx').includes('data-scroll-behavior="smooth"')).toBe(smooth)
  })
})

describe('hover and focus states in the product replicas', () => {
  // The replicas come from a design file whose rows show a hovered state as a fixed class (`.hov`). A real :hover that
  // reveals something with `display` makes a new column appear, the text re-wraps and the row, with every row below it,
  // changes height under the pointer. A hover or focus rule may repaint an element; it may not change its box.
  const PAINT_ONLY = new Set([
    'background',
    'background-color',
    'border-color',
    'box-shadow',
    'color',
    'cursor',
    'opacity',
    'outline',
    'outline-color',
    'outline-offset',
    'text-decoration',
    'transform',
    'visibility',
  ])

  it('only change how an element is painted, never its box', () => {
    const offenders: string[] = []
    for (const file of walk(join(site, 'components'), ['.css'])) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const [, selector = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/:(hover|focus|focus-visible|focus-within|active)\b/.test(selector)) continue
        for (const declaration of body.split(';')) {
          const property = declaration.split(':')[0]!.trim()
          if (property && !PAINT_ONLY.has(property)) offenders.push(`${relative(root, file)}: ${selector.trim().replace(/\s+/g, ' ')} { ${property} }`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
