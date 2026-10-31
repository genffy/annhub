import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { STORE_URL } from '../website/components/landing/links.ts'
import { SITE_ORIGIN } from '../website/lib/site.ts'

const request = (fetcher, origin, path, headers = {}) => fetcher(new URL(path, origin), { redirect: 'manual', headers, signal: AbortSignal.timeout(20_000) })

/**
 * For a few seconds after `wrangler deploy` returns, Cloudflare is still switching versions: a page and the assets it names can
 * come from different versions, so the page asks for a file the version serving it lacks. Wait until `/__deployment.json`
 * reports `revision` on `reads` requests in a row, `interval` ms apart, and fail if that has not happened within `timeout` ms.
 */
export async function waitForRevision({ origin = SITE_ORIGIN, revision, fetcher = fetch, reads = 5, interval = 3_000, timeout = 120_000, sleep = delay, now = Date.now } = {}) {
  const deadline = now() + timeout
  let streak = 0
  while (true) {
    const reported = await reportedRevision(fetcher, origin)
    streak = reported === revision ? streak + 1 : 0
    if (streak === reads) return
    if (now() + interval > deadline) throw new Error(`The live site did not settle on ${revision} within ${timeout / 1000} s; it last reported ${reported}`)
    await sleep(interval)
  }
}

/** The revision `/__deployment.json` reports, or what went wrong reading it. */
async function reportedRevision(fetcher, origin) {
  try {
    const response = await request(fetcher, origin, '/__deployment.json')
    return response.status === 200 ? String((await response.json()).revision) : `HTTP ${response.status}`
  } catch (error) {
    return String(error)
  }
}

/** Every check runs once, after the live site has settled on `revision` (when one is given and `settle` is not false). */
export async function smokeWebsite({ origin = SITE_ORIGIN, revision, edgeRules = true, fetcher = fetch, settle = {} } = {}) {
  if (revision && settle) await waitForRevision({ origin, revision, fetcher, ...settle })
  const get = (path, headers = {}) => request(fetcher, origin, path, headers)
  const checkRedirect = async (path, target, headers = {}, status) => {
    const response = await get(path, headers)
    if (status) assert.equal(response.status, status, `Unexpected redirect status: ${path}`)
    else assert.ok([301, 302, 307, 308].includes(response.status), `No redirect: ${path}`)
    const location = new URL(response.headers.get('location'), origin)
    assert.equal(location.origin, new URL(origin).origin, `Redirect leaves the site: ${path}`)
    assert.equal(location.pathname + location.search, target, `Wrong redirect: ${path}`)
  }
  const metadata = await get('/__deployment.json')
  assert.equal(metadata.status, 200)
  const deployed = await metadata.json()
  if (revision) assert.equal(deployed.revision, revision, 'The live site is not the commit just deployed')
  for (const locale of ['en', 'zh-CN']) {
    const response = await get(`/${locale}`)
    assert.equal(response.status, 200, `Language page failed: ${locale}`)
    const html = await response.text()
    assert.ok(
      [`<html lang="${locale}"`, 'FAQPage', 'SoftwareApplication'].every(text => html.includes(text)),
      `Incomplete page: ${locale}`,
    )
    assert.ok(html.includes(`href="${STORE_URL}"`), `No install entry pointing at the store listing: ${locale}`)
    assert.equal(response.headers.get('link'), null, 'Language alternates must only appear in HTML')
    for (const extension of ['js', 'css']) {
      const asset = html.match(new RegExp(`(?:src|href)="(/_next/[^"?]+\\.${extension})(?:\\?[^" ]*)?"`))?.[1]
      assert.ok(asset, `No ${extension} asset: ${locale}`)
      assert.equal((await get(asset)).status, 200, `Broken ${extension}: ${locale}`)
    }
    assert.equal((await get(`/${locale}.txt`)).status, 200, `Missing static navigation payload: ${locale}`)
    await checkRedirect(`/${locale}/`, `/${locale}`, {}, 301)
    await checkRedirect(`/${locale}.html`, `/${locale}`, {}, 301)
  }
  for (const path of ['/privacy-policy', '/privacy-policy.html', '/terms-of-service', '/terms-of-service.html', '/robots.txt', '/sitemap.xml']) {
    assert.equal((await get(path)).status, 200, `Missing public route: ${path}`)
  }
  const llms = await get('/llms.txt')
  assert.equal(llms.status, 200, 'Missing public route: /llms.txt')
  assert.match(llms.headers.get('content-type') ?? '', /^text\/plain\b/, 'llms.txt must be served as plain text')
  assert.ok((await llms.text()).startsWith('# AnnHub\n'), 'llms.txt does not open with the product name')
  const missing = await get('/this-page-does-not-exist')
  assert.equal(missing.status, 404, 'Unknown routes must return 404')
  assert.match(await missing.text(), /href="\/en#library"/, 'Unknown routes must show the AnnHub 404 page, with its exits')
  await checkRedirect('/', '/en', { 'accept-language': 'ja,en;q=0.5' }, 302)
  if (edgeRules) {
    await checkRedirect('/?utm_source=deploy', '/zh-CN?utm_source=deploy', { 'accept-language': 'zh-TW,zh;q=0.9' }, 302)
    await checkRedirect('/', '/en', { 'accept-language': 'zh-CN', 'cookie': 'NEXT_LOCALE=en' }, 302)
    await checkRedirect('/', '/zh-CN', { 'accept-language': 'en', 'cookie': 'NEXT_LOCALE=zh-CN' }, 302)
    assert.match((await get('/', { 'accept-language': 'en' })).headers.get('cache-control') ?? '', /no-store/)
  }
  return deployed
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const origin = process.env.WEBSITE_SMOKE_ORIGIN ?? SITE_ORIGIN
  const local = process.argv.includes('--local')
  // A local preview serves one version from the start, so there is no rollout to wait for.
  const result = await smokeWebsite({ origin, revision: process.env.GITHUB_SHA, edgeRules: !local, settle: local ? false : {} })
  console.log(`Website routes and assets verified (${result.revision}).`)
}
