import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SITE_ORIGIN } from '../website/lib/site.ts'
import { staticHeaders, staticRedirects, websiteOutput } from './website-static.mjs'

/** Validate the actual publish artifact, both after building and after downloading it for deployment. */
export function checkWebsiteExport({ directory = websiteOutput, revision, production } = {}) {
  const read = path => readFileSync(resolve(directory, path), 'utf8')
  for (const file of [
    'en.html',
    'zh-CN.html',
    'en.txt',
    'zh-CN.txt',
    '404.html',
    'privacy-policy.html',
    'terms-of-service.html',
    'robots.txt',
    'sitemap.xml',
    'llms.txt',
    'og/en.png',
    'og/zh-CN.png',
  ]) {
    assert.ok(existsSync(resolve(directory, file)) && statSync(resolve(directory, file)).size > 0, `Missing static asset: ${file}`)
  }
  for (const locale of ['en', 'zh-CN']) {
    const html = read(`${locale}.html`)
    assert.ok(html.includes(`<html lang="${locale}"`), `Wrong document language: ${locale}`)
    assert.match(html, /<h1\b/, `No prerendered heading: ${locale}`)
    assert.ok(
      ['FAQPage', 'SoftwareApplication', `${SITE_ORIGIN}/${locale}`].every(text => html.includes(text)),
      `Missing SEO content: ${locale}`,
    )
    const assets = [...html.matchAll(/(?:src|href)="(\/_next\/[^"?]+)(?:\?[^" ]*)?"/g)].map(match => match[1])
    assert.ok(assets.some(path => path.endsWith('.js')) && assets.some(path => path.endsWith('.css')), `No local scripts/styles: ${locale}`)
    for (const asset of assets) assert.ok(existsSync(resolve(directory, `.${asset}`)), `Broken static asset: ${asset}`)
  }
  // the branded 404 page: not indexed, no analytics consent, and in each language an exit to the library and one to the home page
  const notFound = read('404.html')
  assert.match(notFound, /<meta name="robots" content="noindex/, 'The 404 page must not be indexed')
  assert.ok(!notFound.includes('consent'), 'The 404 page must not carry the analytics consent')
  for (const locale of ['en', 'zh-CN']) {
    assert.ok(notFound.includes(`lang="${locale}"`), `The 404 page has no ${locale} section`)
    for (const href of [`/${locale}#library`, `/${locale}`]) assert.ok(notFound.includes(`href="${href}"`), `The 404 page does not link to ${href}`)
  }
  assert.ok(read('llms.txt').startsWith('# AnnHub\n'), 'llms.txt does not open with the product name')
  assert.equal(read('_redirects'), staticRedirects(), 'The artifact has stale redirects')
  const deployed = JSON.parse(read('__deployment.json'))
  assert.equal(read('_headers'), staticHeaders({ analytics: deployed.analytics }), 'The artifact has stale response headers')
  if (revision !== undefined) assert.equal(deployed.revision, revision, 'The artifact is from another commit')
  if (production !== undefined) assert.equal(deployed.production, production, 'The artifact has the wrong build environment')
  return deployed
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkWebsiteExport({ revision: process.env.GITHUB_SHA, production: process.env.GITHUB_SHA ? true : undefined })
  console.log(`Static website verified (${result.revision}).`)
}
