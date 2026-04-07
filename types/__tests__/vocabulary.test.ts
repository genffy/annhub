import { describe, it, expect } from 'vitest'
import { normalizeDomainRule, normalizeDomainRuleList, normalizeWord, parseDomainWhitelistInput } from '../vocabulary'

describe('normalizeWord', () => {
    it('lowercases input', () => {
        expect(normalizeWord('Hello')).toBe('hello')
        expect(normalizeWord('WORLD')).toBe('world')
    })

    it('strips punctuation except apostrophe and hyphen', () => {
        expect(normalizeWord("don't")).toBe("don't")
        expect(normalizeWord('well-known')).toBe('well-known')
        expect(normalizeWord('hello!')).toBe('hello')
        expect(normalizeWord('(test)')).toBe('test')
    })

    it('trims whitespace', () => {
        expect(normalizeWord('  hello  ')).toBe('hello')
    })

    it('handles empty string', () => {
        expect(normalizeWord('')).toBe('')
    })

    it('preserves internal spaces', () => {
        expect(normalizeWord('ice cream')).toBe('ice cream')
    })
})

describe('normalizeDomainRule', () => {
    it('normalizes case and strips protocol/path/port', () => {
        expect(normalizeDomainRule(' HTTPS://News.YCombinator.com:443/item?id=1 ')).toBe('news.ycombinator.com')
    })

    it('preserves wildcard patterns and trims dots', () => {
        expect(normalizeDomainRule('  *.GitHub.com.  ')).toBe('*.github.com')
    })
})

describe('parseDomainWhitelistInput', () => {
    it('supports newline, comma and semicolon separators', () => {
        const rules = parseDomainWhitelistInput('github.com, x.com\n*.example.com;example.*')
        expect(rules).toEqual(['github.com', 'x.com', '*.example.com', 'example.*'])
    })

    it('deduplicates and normalizes entries', () => {
        const rules = parseDomainWhitelistInput('github.com\nGITHUB.COM\nhttps://github.com/path')
        expect(rules).toEqual(['github.com'])
    })
})

describe('normalizeDomainRuleList', () => {
    it('filters empty items and keeps first-seen order', () => {
        const rules = normalizeDomainRuleList(['', 'x.com', 'X.com', '*.github.com', ''])
        expect(rules).toEqual(['x.com', '*.github.com'])
    })
})
