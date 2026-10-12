/**
 * The edge cache and the consent cookie for the two language pages (docs/v2/seo-geo.md §3.7).
 *
 * Why a Worker: Cloudflare does not cache HTML, and a Cache Rule alone would strip or bake the per-visitor consent
 * cookie. The Worker stores the page in the edge cache without any Set-Cookie, and adds or removes the region cookie
 * per request — the same rule the Next proxy applies at the origin (website/lib/consent.ts), which
 * utils/__tests__/website-consent.test.ts keeps in sync with this file.
 *
 * Deploy and verify: cloudflare/README.md. Free-plan Workers allow 100k requests a day.
 */

const EDGE_TTL_SECONDS = 3600

/** Single source: website/lib/consent.ts (ASKED_COUNTRIES). The consent test fails if the two lists drift apart. */
const ASKED_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
  'AX',
  'GF',
  'GP',
  'MQ',
  'YT',
  'RE',
  'MF',
  'EU',
])

const REGION_COOKIE = 'annhub-region'
const REGION_OUTSIDE = 'outside'

export default {
  async fetch(request, env, ctx) {
    // Data requests for the same URL (RSC payloads, router prefetches) must not receive a cached HTML page.
    if (request.headers.get('rsc') || request.headers.get('x-nextjs-data') || request.headers.get('next-router-prefetch')) {
      return fetch(request)
    }

    const url = new URL(request.url)
    // The query string does not change the page; sharing one edge copy per path keeps shares with utm params a hit.
    const cache = caches.default
    const key = new Request(`${url.origin}${url.pathname}`, { method: 'GET' })

    let response = await cache.match(key)
    let edge = 'hit'
    if (!response) {
      edge = 'miss'
      response = await fetchOrigin(request, url)
      // A copy stored for everyone must not carry anything per-visitor; the region cookie is added per request below.
      const stored = new Response(response.body, response)
      stored.headers.delete('set-cookie')
      // Browsers keep revalidating as the origin asks (max-age=0); only the edge copy lives for the TTL.
      stored.headers.set('cache-control', `public, max-age=0, must-revalidate, s-maxage=${EDGE_TTL_SECONDS}`)
      ctx.waitUntil(cache.put(key, stored))
    }

    response = withRegionCookie(request, new Response(response.body, response))
    response.headers.set('x-annhub-edge', edge)

    if (request.method === 'HEAD') return new Response(null, { status: response.status, headers: response.headers })
    // A revalidation that matches the stored ETag gets the same treatment as the origin would give it: 304.
    const validator = request.headers.get('if-none-match')
    if (validator && validator === response.headers.get('etag')) return new Response(null, { status: 304, headers: response.headers })
    return response
  },
}

/** Fetch the page from Netlify once per POP and TTL: only headers the static page can vary on, always gzip. */
async function fetchOrigin(request, url) {
  const headers = new Headers()
  for (const name of ['accept', 'accept-language']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('accept-encoding', 'gzip')
  const origin = await fetch(url.toString(), { headers, redirect: 'manual' })
  return new Response(origin.body, origin)
}

/** Mirrors regionCookie() of website/lib/consent.ts: set once outside the asked countries, clear inside them. */
function withRegionCookie(request, response) {
  const country = String(request.cf?.country ?? request.headers.get('cf-ipcountry') ?? '')
    .trim()
    .toUpperCase()
  const asks = !/^[A-Z]{2}$/.test(country) || country === 'XX' || ASKED_COUNTRIES.has(country)
  const carries = request.headers
    .get('cookie')
    ?.split(';')
    .some(pair => pair.trim() === `${REGION_COOKIE}=${REGION_OUTSIDE}`)

  if (asks) {
    if (carries) response.headers.append('set-cookie', `${REGION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`)
  } else if (!carries) {
    response.headers.append('set-cookie', `${REGION_COOKIE}=${REGION_OUTSIDE}; Path=/; SameSite=Lax; Secure`)
  }
  return response
}
