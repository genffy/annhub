import { describe, expect, it } from 'vitest'
// Next.js is installed in website/ only.
import { NextRequest } from '../../website/node_modules/next/server.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * What search engines and AI crawlers read from the website (docs/v2/seo-geo.md §3, §6). None of it shows on the page,
 * so neither a type check nor a look at the site catches a regression.
 */

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const origin = /export const SITE_ORIGIN = '([^']+)'/.exec(read('website/lib/site.ts'))?.[1]

describe('robots.txt', () => {
  const robots = read('website/public/robots.txt')

  it('opens every page to every crawler', () => {
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Allow: \/$/m)
    expect(robots).not.toMatch(/^Disallow:/im)
  })

  it('allows search, AI answers and AI training in its content signals', () => {
    expect(robots).toMatch(/^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m)
  })

  it('points at the sitemap on the production origin', () => {
    expect(origin).toBe('https://annhub.org')
    expect(robots).toMatch(new RegExp(`^Sitemap: ${origin}/sitemap\\.xml$`, 'm'))
  })
})

describe('language versions', () => {
  const redirect = async (languages?: string) => {
    const { default: proxy } = await import('../../website/proxy')
    const response = proxy(new NextRequest('https://annhub.org/', { headers: languages ? { 'accept-language': languages } : {} }))
    return new URL(response.headers.get('location') ?? '', 'https://annhub.org').pathname
  }

  it('send a browser language that is neither Chinese nor English to the English page', async () => {
    expect(await redirect('de-DE')).toBe('/en')
    expect(await redirect('ja,en;q=0.5')).toBe('/en')
    expect(await redirect()).toBe('/en')
    expect(await redirect('zh-TW,zh;q=0.9')).toBe('/zh-CN')
    expect(read('website/app/[locale]/layout.tsx')).toMatch(/'x-default': '\/en'/)
  })

  it('are declared once, in the HTML: the proxy adds no Link header', async () => {
    const { default: proxy } = await import('../../website/proxy')
    expect(proxy(new NextRequest('https://annhub.org/en')).headers.get('link')).toBeNull()
  })
})
