// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareStatic, staticHeaders, staticRedirects } from '../website-static.mjs'
import { checkWebsiteExport } from '../check-website-export.mjs'
import { siteRules } from '../../cloudflare/site-rules.mjs'
import { asksFirst, REGION_COOKIE } from '../../website/lib/consent.ts'

const directories = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'annhub-static-'))
  directories.push(directory)
  mkdirSync(join(directory, '_next'), { recursive: true })
  mkdirSync(join(directory, 'og'), { recursive: true })
  for (const file of [
    'en.txt',
    'zh-CN.txt',
    '404.html',
    'privacy-policy.html',
    'terms-of-service.html',
    'robots.txt',
    'sitemap.xml',
    'og/en.png',
    'og/zh-CN.png',
    '_next/app.js',
    '_next/app.css',
  ]) {
    writeFileSync(join(directory, file), 'test asset')
  }
  // the branded 404 (website.md §20): both languages, each with its exits, not indexed, no consent
  writeFileSync(
    join(directory, '404.html'),
    '<html lang="en"><head><meta name="robots" content="noindex"></head><body>' +
      ['en', 'zh-CN'].map(locale => `<section lang="${locale}"><a href="/${locale}#library">library</a><a href="/${locale}">home</a></section>`).join('') +
      '</body></html>',
  )
  writeFileSync(join(directory, 'llms.txt'), '# AnnHub\n')
  for (const locale of ['en', 'zh-CN']) {
    writeFileSync(
      join(directory, `${locale}.html`),
      `<html lang="${locale}"><h1>AnnHub</h1><script src="/_next/app.js"></script><link href="/_next/app.css"><link rel="canonical" href="https://annhub.org/${locale}">FAQPage SoftwareApplication</html>`,
    )
  }
  prepareStatic({ directory, revision: 'a'.repeat(40), production: true, analytics: true })
  return directory
}

describe('the deployed static artifact', () => {
  it('requires the exact verified production revision', () => {
    const directory = fixture()
    expect(checkWebsiteExport({ directory, revision: 'a'.repeat(40), production: true }).analytics).toBe(true)
    expect(() => checkWebsiteExport({ directory, revision: 'b'.repeat(40) })).toThrow('another commit')
    expect(() => checkWebsiteExport({ directory, production: false })).toThrow('wrong build environment')
  })

  it('rejects incomplete assets and missing navigation data', () => {
    const directory = fixture()
    rmSync(join(directory, '_next/app.js'))
    expect(() => checkWebsiteExport({ directory })).toThrow('Broken static asset')
    rmSync(join(directory, 'en.txt'))
    expect(() => checkWebsiteExport({ directory })).toThrow('Missing static asset: en.txt')
  })

  it('rejects pages without their structured data and an llms.txt that is not one', () => {
    const directory = fixture()
    writeFileSync(join(directory, 'llms.txt'), '<!DOCTYPE html>')
    expect(() => checkWebsiteExport({ directory })).toThrow('llms.txt does not open with the product name')
    writeFileSync(join(directory, 'zh-CN.html'), readFileSync(join(directory, 'zh-CN.html'), 'utf8').replace(' SoftwareApplication', ''))
    expect(() => checkWebsiteExport({ directory })).toThrow('Missing SEO content: zh-CN')
  })

  it('rejects stale aliases and untrusted revision strings', () => {
    const directory = fixture()
    writeFileSync(join(directory, '_redirects'), '/* /en 200')
    expect(() => checkWebsiteExport({ directory })).toThrow('stale redirects')
    expect(() => prepareStatic({ directory, revision: 'bad\nheader' })).toThrow('Invalid deployment revision')
  })

  it('uses explicit page aliases without a catch-all that could hide a 404', () => {
    const redirects = staticRedirects()
    expect(redirects).toContain('/ /en 302\n')
    expect(redirects).toContain('/__annhub/language/zh-CN /zh-CN 302\n')
    expect(redirects).toContain('/en /en.html 200\n')
    expect(redirects).toContain('/privacy-policy /privacy-policy.html 200\n')
    expect(redirects).not.toContain('/*')
  })

  it('defaults analytics to asking when no edge rule provides a country decision', () => {
    expect(staticHeaders({ analytics: true })).toContain(`${REGION_COOKIE}=; Path=/; Max-Age=0`)
    expect(staticHeaders({ analytics: false })).not.toContain(REGION_COOKIE)
    expect(readFileSync(join(fixture(), '_headers'), 'utf8')).toContain('Cache-Control: no-store')
  })
})

describe('Cloudflare response rules', () => {
  it('uses the same consent country contract as the page, including unknown locations', () => {
    const rules = siteRules().http_response_headers_transform
    const rule = rules.find(rule => rule.ref.endsWith('_region'))
    const countryList = rule.expression.match(/country in \{([^}]+)\}/)[1]
    const excluded = new Set([...countryList.matchAll(/"([^"]*)"/g)].map(match => match[1]))
    for (const country of ['DE', 'FR', 'EU', 'AX', 'RE', 'GB', 'CH', 'US', 'CN', 'JP', '', 'XX', 'T1']) {
      expect(excluded.has(country), country).toBe(asksFirst(country))
    }
    expect(rule.action_parameters.headers['set-cookie'].operation).toBe('set')
    expect(rule.action_parameters.headers['set-cookie'].value).toContain(`${REGION_COOKIE}=outside;`)
    expect(siteRules({ analytics: false }).http_response_headers_transform.some(rule => rule.ref.endsWith('_region'))).toBe(false)
  })

  it('sets language cookies after the region rule without replacing them', () => {
    const rules = siteRules().http_response_headers_transform
    const regionIndex = rules.findIndex(rule => rule.ref.endsWith('_region'))
    for (const locale of ['en', 'zh_CN']) {
      const index = rules.findIndex(rule => rule.ref.endsWith(`_language_${locale}`))
      expect(index).toBeGreaterThan(regionIndex)
      expect(rules[index].action_parameters.headers['set-cookie'].operation).toBe('add')
    }
    const root = rules.find(rule => rule.ref.endsWith('_root_cache'))
    expect(root.action_parameters.headers['cache-control'].value).toContain('no-store')
  })

  it('uses the weighted language field only in a supported Transform Rules phase', () => {
    const rules = siteRules()
    expect(JSON.stringify(rules.http_request_dynamic_redirect)).not.toContain('accepted_languages')
    const root = rules.http_request_transform[0]
    expect(root.expression).toContain('http.request.accepted_languages[0]')
    expect(root.expression).toContain('http.request.cookies["NEXT_LOCALE"]')
    expect(root.action_parameters.uri.path.value).toBe('/__annhub/language/zh-CN')
  })
})
