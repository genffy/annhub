import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// Next.js is installed in website/ only.
import { NextRequest } from '../../website/node_modules/next/server.js'
import { analyticsState, asksFirst, asksFromCookies, GRANT_DAYS, readChoice, REGION_COOKIE, REGION_OUTSIDE, regionCookie, storedChoice } from '../../website/lib/consent'
import { PRIVACY_WEBSITE_URL } from '../../website/components/landing/links'

/** When the website may load its analytics script, and how the proxy tells the page (docs/v2/permissions.md §8). */

describe('asksFirst', () => {
  it.each(['DE', 'FR', 'IE', 'GR', 'CY', 'MT', 'NO', 'IS', 'LI', 'GB', 'CH', 'RE', 'GF', 'AX', 'EU', 'de'])('asks a visitor Cloudflare places in %s', country => {
    expect(asksFirst(country)).toBe(true)
  })

  it.each([undefined, null, '', 'XX', 'T1', 'Germany'])('asks when the country is unknown (%s)', country => {
    expect(asksFirst(country)).toBe(true)
  })

  it.each(['CN', 'US', 'JP', 'BR', 'IN', 'AU', 'CA', 'TR'])('counts a visitor in %s without asking', country => {
    expect(asksFirst(country)).toBe(false)
  })
})

describe('the region cookie', () => {
  it('is set outside the asked countries, once', () => {
    expect(regionCookie('CN', undefined)).toBe('set')
    expect(regionCookie('CN', 'something else')).toBe('set')
    expect(regionCookie('CN', REGION_OUTSIDE)).toBe('keep')
  })

  it('is never set in an asked or unknown country, and is cleared when the visitor arrives there', () => {
    expect(regionCookie('DE', undefined)).toBe('keep')
    expect(regionCookie(null, undefined)).toBe('keep')
    expect(regionCookie('DE', REGION_OUTSIDE)).toBe('delete')
    expect(regionCookie('XX', REGION_OUTSIDE)).toBe('delete')
  })

  it('is the only thing that lets the page count without asking', () => {
    expect(asksFromCookies('')).toBe(true)
    expect(asksFromCookies(`${REGION_COOKIE}=${REGION_OUTSIDE}`)).toBe(false)
    expect(asksFromCookies(`NEXT_LOCALE=en; ${REGION_COOKIE}=${REGION_OUTSIDE}`)).toBe(false)
    expect(asksFromCookies(`${REGION_COOKIE}=other`)).toBe(true)
    expect(asksFromCookies(`x${REGION_COOKIE}=${REGION_OUTSIDE}`)).toBe(true)
  })
})

describe('the proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function proxyWith(token: string) {
    vi.stubEnv('NEXT_PUBLIC_CF_BEACON_TOKEN', token)
    vi.resetModules()
    const { default: proxy } = await import('../../website/proxy')
    return (headers: Record<string, string>) => proxy(new NextRequest('https://annhub.org/en', { headers })).headers.get('set-cookie') ?? ''
  }

  it("marks a visitor outside the asked countries from Cloudflare's header, and clears the mark in them", async () => {
    const run = await proxyWith('test-token')
    expect(run({ 'cf-ipcountry': 'CN' })).toMatch(new RegExp(`${REGION_COOKIE}=${REGION_OUTSIDE}; Path=/;.*SameSite=lax`, 'i'))
    expect(run({ 'cf-ipcountry': 'CN' })).toMatch(/Secure/)
    expect(run({ 'cf-ipcountry': 'DE' })).not.toContain(REGION_COOKIE)
    expect(run({})).not.toContain(REGION_COOKIE)
    expect(run({ 'cf-ipcountry': 'DE', 'cookie': `${REGION_COOKIE}=${REGION_OUTSIDE}` })).toMatch(new RegExp(`${REGION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970`))
  })

  it('sets no cookie at all while the site has no analytics token', async () => {
    const run = await proxyWith('')
    expect(run({ 'cf-ipcountry': 'CN' })).not.toContain(REGION_COOKIE)
  })
})

describe('the card', () => {
  it("links to the privacy policy's section on this website in each language", () => {
    const policy = readFileSync(resolve(__dirname, '../../website/public/privacy-policy.html'), 'utf8')
    for (const url of Object.values(PRIVACY_WEBSITE_URL)) expect(policy).toContain(`id="${url.split('#')[1]}"`)
  })
})

describe('readChoice', () => {
  it('reads nothing from an empty or broken value', () => {
    expect(readChoice(null, '2026-10-11')).toBeNull()
    expect(readChoice('', '2026-10-11')).toBeNull()
    expect(readChoice('granted', '2026-10-11')).toBeNull()
    expect(readChoice('{"choice":"maybe","date":"2026-10-11"}', '2026-10-11')).toBeNull()
    expect(readChoice('null', '2026-10-11')).toBeNull()
  })

  it('keeps a refusal until the visitor changes it', () => {
    expect(readChoice(storedChoice('denied', '2020-01-01'), '2026-10-11')).toBe('denied')
  })

  it(`asks again ${GRANT_DAYS} days after an "Allow"`, () => {
    expect(readChoice(storedChoice('granted', '2026-10-11'), '2026-10-11')).toBe('granted')
    expect(readChoice(storedChoice('granted', '2025-10-12'), '2026-10-11')).toBe('granted')
    expect(readChoice(storedChoice('granted', '2025-10-11'), '2026-10-11')).toBeNull()
  })

  it('does not trust an "Allow" with a missing, malformed or future date', () => {
    expect(readChoice('{"choice":"granted"}', '2026-10-11')).toBeNull()
    expect(readChoice('{"choice":"granted","date":"11/10/2026"}', '2026-10-11')).toBeNull()
    expect(readChoice(storedChoice('granted', '2026-12-01'), '2026-10-11')).toBeNull()
  })

  it('stores the choice and the day only', () => {
    expect(JSON.parse(storedChoice('granted', '2026-10-11'))).toEqual({ choice: 'granted', date: '2026-10-11' })
  })
})

describe('analyticsState', () => {
  it("follows the visitor's own choice first, even against Global Privacy Control", () => {
    expect(analyticsState({ choice: 'granted', asks: true, gpc: true })).toBe('load')
    expect(analyticsState({ choice: 'denied', asks: false, gpc: false })).toBe('off')
  })

  it('without a choice: Global Privacy Control turns analytics off, an asked zone gets the card, anyone else is counted', () => {
    expect(analyticsState({ choice: null, asks: false, gpc: true })).toBe('off')
    expect(analyticsState({ choice: null, asks: true, gpc: true })).toBe('off')
    expect(analyticsState({ choice: null, asks: true, gpc: false })).toBe('ask')
    expect(analyticsState({ choice: null, asks: false, gpc: false })).toBe('load')
  })
})
