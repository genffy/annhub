import { describe, expect, it } from 'vitest'
import { shouldAnnotateDomain } from '../detect-page'

describe('shouldAnnotateDomain', () => {
    it('returns true when whitelist is disabled', () => {
        expect(shouldAnnotateDomain('example.com', { enabled: false, domains: ['x.com'] })).toBe(true)
    })

    it('matches exact domains and subdomains for plain entries', () => {
        const whitelist = { enabled: true, domains: ['github.com'] }
        expect(shouldAnnotateDomain('github.com', whitelist)).toBe(true)
        expect(shouldAnnotateDomain('docs.github.com', whitelist)).toBe(true)
        expect(shouldAnnotateDomain('gitlab.com', whitelist)).toBe(false)
    })

    it('supports wildcard prefix patterns like *.example.com', () => {
        const whitelist = { enabled: true, domains: ['*.example.com'] }
        expect(shouldAnnotateDomain('foo.example.com', whitelist)).toBe(true)
        expect(shouldAnnotateDomain('bar.foo.example.com', whitelist)).toBe(true)
        expect(shouldAnnotateDomain('example.com', whitelist)).toBe(false)
    })

    it('supports wildcard suffix patterns like example.*', () => {
        const whitelist = { enabled: true, domains: ['example.*'] }
        expect(shouldAnnotateDomain('example.com', whitelist)).toBe(true)
        expect(shouldAnnotateDomain('example.co.uk', whitelist)).toBe(true)
        expect(shouldAnnotateDomain('api.example.com', whitelist)).toBe(false)
    })

    it('normalizes protocol/path in configured domains', () => {
        const whitelist = { enabled: true, domains: ['https://news.ycombinator.com/item?id=1'] }
        expect(shouldAnnotateDomain('news.ycombinator.com', whitelist)).toBe(true)
    })
})
