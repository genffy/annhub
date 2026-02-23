import { describe, it, expect } from 'vitest'
import { LogseqFormatter } from '../logseq-formatter'
import type { HighlightRecord } from '../../../../types/highlight'
import type { ClipRecord } from '../../../../types/clip'
import type { LogseqConfig } from '../../../../types/logseq'

function makeHighlight(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
    return {
        id: 'hl_test123',
        url: 'https://example.com/article',
        domain: 'example.com',
        selector: 'p',
        originalText: 'This is a highlighted text with some content.',
        textHash: 'abc123',
        color: '#ffeb3b',
        timestamp: 1704067200000, // 2024-01-01 00:00:00 UTC
        lastModified: 1704067200000,
        position: { x: 0, y: 0, width: 100, height: 20 },
        context: { before: 'before', after: 'after' },
        status: 'active',
        metadata: {
            pageTitle: 'Test Article',
            pageUrl: 'https://example.com/article',
            sourceUrl: 'https://example.com/article',
        },
        ...overrides,
    }
}

function makeClip(overrides: Partial<ClipRecord> = {}): ClipRecord {
    return {
        id: 'clip_test456',
        source_url: 'https://github.com/user/repo',
        source_title: 'GitHub Repository',
        capture_time: '2024-01-15T10:30:00Z',
        mode_used: 'Mode A',
        content: 'Important code snippet from documentation.',
        context_before: 'Some context before',
        context_after: 'Some context after',
        ...overrides,
    }
}

function makeConfig(overrides: Partial<LogseqConfig> = {}): Pick<LogseqConfig, 'customTags' | 'autoTagDomain'> {
    return {
        customTags: '',
        autoTagDomain: true,
        ...overrides,
    }
}

describe('LogseqFormatter', () => {
    describe('formatHighlight', () => {
        it('should format a basic highlight with page link and source URL', () => {
            const highlight = makeHighlight()
            const config = makeConfig()
            const result = LogseqFormatter.formatHighlight(highlight, config)

            expect(result.journalPage).toBe('2024-01-01')
            expect(result.content).toContain('#annhub')
            expect(result.content).toContain('[[Test Article]]')
            expect(result.content).toContain('[🔗](https://example.com/article)')
            // Should NOT contain domain tag when autoTagDomain is true (config has it)
            expect(result.content).toContain('#example_com')
            // Only annhubId property
            expect(result.properties['annhubId']).toBe('hl_test123')
            expect(result.properties['sourceUrl']).toBeUndefined()
            expect(result.properties['color']).toBeUndefined()
            expect(result.children).toHaveLength(1)
            expect(result.children?.[0]).toContain('> This is a highlighted text with some content.')
        })

        it('should include custom tags when provided', () => {
            const highlight = makeHighlight()
            const config = makeConfig({ customTags: '#reading, #research', autoTagDomain: false })
            const result = LogseqFormatter.formatHighlight(highlight, config)

            expect(result.content).toContain('#annhub')
            expect(result.content).toContain('#reading')
            expect(result.content).toContain('#research')
        })

        it('should auto-tag domain when enabled', () => {
            const highlight = makeHighlight({ domain: 'example.com' })
            const config = makeConfig({ customTags: '', autoTagDomain: true })
            const result = LogseqFormatter.formatHighlight(highlight, config)

            expect(result.content).toContain('#example_com')
        })

        it('should include user note as child content when present', () => {
            const highlight = makeHighlight({ user_note: 'This is important!' })
            const config = makeConfig()
            const result = LogseqFormatter.formatHighlight(highlight, config)

            expect(result.children).toHaveLength(2)
            expect(result.children?.[0]).toContain('>')
            expect(result.children?.[1]).toBe('💭 This is important!')
        })

        it('should handle special characters in page title', () => {
            const highlight = makeHighlight({
                metadata: {
                    pageTitle: 'Article [with] {special} chars',
                    pageUrl: 'https://example.com/article',
                },
            })
            const config = makeConfig()
            const result = LogseqFormatter.formatHighlight(highlight, config)

            expect(result.content).toContain('[[Article with {special} chars]]')
        })

        it('should truncate long page titles', () => {
            const longTitle = 'A'.repeat(150)
            const highlight = makeHighlight({
                metadata: {
                    pageTitle: longTitle,
                    pageUrl: 'https://example.com/article',
                },
            })
            const config = makeConfig()
            const result = LogseqFormatter.formatHighlight(highlight, config)

            // Should be truncated to 100 characters
            const pageTitleInContent = result.content.match(/\[\[(.*?)\]\]/)?.[1]
            expect(pageTitleInContent?.length).toBeLessThanOrEqual(100)
        })

        it('should use domain as fallback when pageTitle is missing', () => {
            const highlight = makeHighlight({
                metadata: {
                    pageUrl: 'https://example.com/article',
                } as any,
            })
            const config = makeConfig()
            const result = LogseqFormatter.formatHighlight(highlight, config)

            expect(result.content).toContain('[[example.com]]')
        })

        it('should use sourceUrl in the link', () => {
            const highlight = makeHighlight({
                metadata: {
                    pageTitle: 'Test',
                    pageUrl: 'https://example.com/list',
                    sourceUrl: 'https://example.com/detail/123',
                },
            })
            const config = makeConfig()
            const result = LogseqFormatter.formatHighlight(highlight, config)

            expect(result.content).toContain('[🔗](https://example.com/detail/123)')
        })

        it('should format date correctly from timestamp', () => {
            const highlight = makeHighlight({ timestamp: 1704067200000 }) // 2024-01-01
            const config = makeConfig()
            const result = LogseqFormatter.formatHighlight(highlight, config)

            expect(result.journalPage).toBe('2024-01-01')
        })

        it('should format date correctly from ISO string', () => {
            const clip = makeClip({ capture_time: '2024-06-15T12:00:00Z' })
            const config = makeConfig()
            const result = LogseqFormatter.formatClip(clip, config)

            expect(result.journalPage).toBe('2024-06-15')
        })
    })

    describe('formatClip', () => {
        it('should format a basic clip with page link and source URL', () => {
            const clip = makeClip()
            const config = makeConfig()
            const result = LogseqFormatter.formatClip(clip, config)

            expect(result.journalPage).toBe('2024-01-15')
            expect(result.content).toContain('#annhub')
            expect(result.content).toContain('[[GitHub Repository]]')
            expect(result.content).toContain('[🔗](https://github.com/user/repo)')
            // Only annhubId property
            expect(result.properties['annhubId']).toBe('clip_test456')
            expect(result.properties['sourceUrl']).toBeUndefined()
            expect(result.properties['mode']).toBeUndefined()
            expect(result.children).toHaveLength(1)
            expect(result.children?.[0]).toContain('> Important code snippet from documentation.')
            // Mode indicator no longer in quote
            expect(result.children?.[0]).not.toContain('(Mode A)')
        })

        it('should include user note as child content when present', () => {
            const clip = makeClip({ user_note: 'Remember this for later' })
            const config = makeConfig()
            const result = LogseqFormatter.formatClip(clip, config)

            expect(result.children).toHaveLength(2)
            expect(result.children?.[0]).toContain('>')
            expect(result.children?.[1]).toBe('💭 Remember this for later')
        })

        it('should handle clips without source title', () => {
            const clip = makeClip({ source_title: '', source_url: 'https://example.com/page' })
            const config = makeConfig()
            const result = LogseqFormatter.formatClip(clip, config)

            expect(result.content).toContain('#annhub')
            expect(result.content).toContain('[🔗](https://example.com/page)')
            // Should not have empty page link
            expect(result.content).not.toContain('[[]]')
        })

        it('should prefer source_detail_url over source_url', () => {
            const clip = makeClip({
                source_url: 'https://example.com/list',
                source_detail_url: 'https://example.com/detail/123',
            })
            const config = makeConfig()
            const result = LogseqFormatter.formatClip(clip, config)

            expect(result.content).toContain('[🔗](https://example.com/detail/123)')
        })
    })

    describe('getJournalPageName', () => {
        it('should return correct journal page name from timestamp', () => {
            const result = LogseqFormatter.getJournalPageName(1704067200000)
            expect(result).toBe('2024-01-01')
        })

        it('should return correct journal page name from ISO string', () => {
            const result = LogseqFormatter.getJournalPageName('2024-12-25T10:30:00Z')
            expect(result).toBe('2024-12-25')
        })

        it('should pad month and day with zeros', () => {
            const feb1 = new Date('2024-02-01T00:00:00Z').getTime()
            const result = LogseqFormatter.getJournalPageName(feb1)
            expect(result).toBe('2024-02-01')
        })
    })
})
