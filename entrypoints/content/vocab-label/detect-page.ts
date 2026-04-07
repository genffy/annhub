import { normalizeDomainRule, normalizeDomainRuleList } from '../../../types/vocabulary'

export function isEnglishPage(): boolean {
    const lang = document.documentElement.lang?.toLowerCase() || ''
    if (lang.startsWith('en')) return true

    // Heuristic: sample text content for Latin character ratio
    const sample = document.body?.innerText?.slice(0, 2000) || ''
    if (sample.length < 50) return false

    const latinChars = sample.replace(/[\s\d\W]/g, '').length
    const totalChars = sample.replace(/\s/g, '').length
    if (totalChars === 0) return false

    return latinChars / totalChars > 0.7
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesDomainRule(hostname: string, rule: string): boolean {
    if (!rule) return false

    if (rule.includes('*')) {
        const pattern = `^${escapeRegExp(rule).replace(/\\\*/g, '.*')}$`
        return new RegExp(pattern).test(hostname)
    }

    return hostname === rule || hostname.endsWith('.' + rule)
}

export function shouldAnnotateDomain(hostname: string, whitelist?: { enabled: boolean; domains: string[] }): boolean {
    if (!whitelist?.enabled) return true

    const normalizedHostname = normalizeDomainRule(hostname)
    if (!normalizedHostname) return false

    const normalizedRules = normalizeDomainRuleList(whitelist.domains)
    if (normalizedRules.length === 0) return false

    return normalizedRules.some(rule => matchesDomainRule(normalizedHostname, rule))
}
