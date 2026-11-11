import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyticsState, asksFirst, asksFromCookies, GRANT_DAYS, readChoice, REGION_COOKIE, REGION_OUTSIDE, storedChoice } from '../../website/lib/consent'
import { PRIVACY_WEBSITE_URL } from '../../website/components/landing/links'

/** When the website may load its analytics script (docs/product/permissions.md §8). */

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
  it('is the only thing that lets the page count without asking', () => {
    expect(asksFromCookies('')).toBe(true)
    expect(asksFromCookies(`${REGION_COOKIE}=${REGION_OUTSIDE}`)).toBe(false)
    expect(asksFromCookies(`NEXT_LOCALE=en; ${REGION_COOKIE}=${REGION_OUTSIDE}`)).toBe(false)
    expect(asksFromCookies(`${REGION_COOKIE}=other`)).toBe(true)
    expect(asksFromCookies(`x${REGION_COOKIE}=${REGION_OUTSIDE}`)).toBe(true)
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
