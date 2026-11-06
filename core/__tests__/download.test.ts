import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  ASSET_MARKER_BASE,
  batchFolderName,
  batchReadme,
  clipMediaUrls,
  composePageMarkdown,
  dedupeName,
  DOWNLOAD_LIMITS,
  estimateFileCount,
  mediaKindOfMime,
  mediaReadme,
  mediaSlotName,
  planEntryDownload,
  sanitizeTitle,
} from '../download'
import { makeClip, makeScreenshot, TEST_REGISTRY } from './helpers'

describe('sanitizeTitle (download.md §4.4)', () => {
  it('strips the characters a file name cannot carry and collapses whitespace', () => {
    expect(sanitizeTitle('What? A "great" <post> | /all/ \\of\\ :it:*', 'host.example')).toBe('What A great post all of it')
    expect(sanitizeTitle('a   \t\n b', 'host.example')).toBe('a b')
  })
  it('drops leading and trailing dots and spaces', () => {
    expect(sanitizeTitle('  . Hidden file. ', 'host.example')).toBe('Hidden file')
  })
  // eslint-disable-next-line no-control-regex
  it('drops control characters', () => {
    expect(sanitizeTitle(`bad\u0007\u001fname`, 'host.example')).toBe('badname')
  })
  it('dodges the Windows reserved names', () => {
    expect(sanitizeTitle('CON', 'host.example')).toBe('_CON')
    expect(sanitizeTitle('aux.tar', 'host.example')).toBe('_aux.tar')
    expect(sanitizeTitle('NUL', 'host.example')).toBe('_NUL')
    expect(sanitizeTitle('COM1.txt', 'host.example')).toBe('_COM1.txt')
    expect(sanitizeTitle('null', 'host.example')).toBe('null')
  })
  it('caps the length at the length cap (download.md §4.4)', () => {
    expect([...sanitizeTitle('字'.repeat(120), 'host.example')].length).toBe(DOWNLOAD_LIMITS.nameMaxChars)
  })
  it('falls back to the source host when nothing is left', () => {
    expect(sanitizeTitle('???', 'Blog.EXAMPLE.com')).toBe('blog.example.com')
    expect(sanitizeTitle('', '')).toBe('download')
    expect(sanitizeTitle('', 'x'.repeat(120))).toHaveLength(80)
  })
})

describe('dedupeName (download.md §4.1)', () => {
  it('numbers the second folder of the same title', () => {
    expect(dedupeName('Post', new Set())).toBe('Post')
    expect(dedupeName('Post', new Set(['Post']))).toBe('Post (2)')
    expect(dedupeName('Post', new Set(['Post', 'Post (2)']))).toBe('Post (3)')
    expect(dedupeName('POST', new Set(['Post']))).toBe('POST (2)')
  })
  it('keeps the numbered name within the length cap', () => {
    const long = 'x'.repeat(DOWNLOAD_LIMITS.nameMaxChars)
    const deduped = dedupeName(long, new Set([long]))
    expect([...deduped].length).toBe(DOWNLOAD_LIMITS.nameMaxChars)
    expect(deduped.startsWith('x')).toBe(true)
  })
})

describe('media naming (download.md §4.2, §5.2)', () => {
  it('names a medium by slot and response type, never by the page', () => {
    expect(mediaSlotName('image', 1, 'image/jpeg')).toBe('img-001.jpg')
    expect(mediaSlotName('image', 12, 'image/png; charset=binary')).toBe('img-012.png')
    expect(mediaSlotName('video', 3, 'video/mp4')).toBe('video-003.mp4')
    expect(mediaSlotName('audio', 2, 'audio/mpeg')).toBe('audio-002.mp3')
  })
  it("derives an unknown type's extension from its subtype, or gives up cleanly", () => {
    expect(mediaSlotName('image', 1, 'image/x-future')).toBe('img-001.bin')
    expect(mediaSlotName('video', 1, 'video/xmatroska')).toBe('video-001.xmatroska')
  })
  it('sorts a response type into image, video, audio or none', () => {
    expect(mediaKindOfMime('image/webp')).toBe('image')
    expect(mediaKindOfMime('VIDEO/MP4; codecs="avc1"')).toBe('video')
    expect(mediaKindOfMime('audio/ogg')).toBe('audio')
    expect(mediaKindOfMime('text/html')).toBeNull()
    expect(mediaKindOfMime('image/svg+xml')).toBe('image')
  })
})

describe('composePageMarkdown (download.md §4.3)', () => {
  it('encodes the actual browser filename as one relative URL segment', () => {
    const name = '示例 (1) #50% [draft].png'
    const result = composePageMarkdown(
      { title: 'T', sourceUrl: 'https://example.com' },
      '![](https://example.com/image.png)',
      [{ url: 'https://example.com/image.png', status: 'saved', fileName: name }],
      0,
    )
    const destination = /!\[\]\(([^\s()]+)\)/.exec(result)?.[1]
    expect(destination).toBeDefined()
    expect(new URL(destination!, 'file:///downloads/AnnHub/T/T.md').hash).toBe('')
    expect(decodeURIComponent(destination!)).toBe(`assets/${name}`)
  })
  it('includes site, language and a cover address without creating a media asset', () => {
    const result = composePageMarkdown(
      { title: 'Page', sourceUrl: 'https://example.com', site: "Author's site", language: 'zh-CN', image: 'https://example.com/cover.png' },
      'Body',
      [],
      0,
    )
    const front = parse(/---\n([\s\S]*?)\n---/.exec(result)![1]!)
    expect(front).toMatchObject({ site: "Author's site", language: 'zh-CN', image: 'https://example.com/cover.png' })
    expect(result).not.toContain('assets/')
  })
  const meta = { title: 'Post: "the answer"', sourceUrl: 'https://blog.example.com/posts?utm_source=x', author: ['A. Writer'], published: '2026-01-20' }
  it('writes the Obsidian-aligned frontmatter and drops absent fields', async () => {
    const full = composePageMarkdown(meta, 'Body', [], Date.parse('2026-11-04T10:00:00Z'))
    const front = /---\n([\s\S]*?)\n---/.exec(full)![1]!
    expect(parse(front)).toEqual({ title: 'Post: "the answer"', source: meta.sourceUrl, author: ['A. Writer'], published: '2026-01-20', created: '2026-11-04' })
    const bare = composePageMarkdown({ title: 'T', sourceUrl: 'https://e.example/x' }, 'Body', [], 0)
    expect(bare).not.toContain('published')
    expect(bare).not.toContain('author')
  })
  it('never rewrites a longer address that starts with a shorter one', () => {
    const markdown = '![a](https://cdn.example.com/p.png) ![b](https://cdn.example.com/p.png?w=800)'
    const out = composePageMarkdown(
      { title: 'T', sourceUrl: 'https://e.example/x' },
      markdown,
      [
        { url: 'https://cdn.example.com/p.png', status: 'saved' as const, fileName: 'img-001.png' },
        { url: 'https://cdn.example.com/p.png?w=800', status: 'saved' as const, fileName: 'img-002.png' },
      ],
      0,
    )
    expect(out).toContain('![a](assets/img-001.png)')
    expect(out).toContain('![b](assets/img-002.png)')
  })

  it('swaps fetched media for their assets links and keeps the rest by address', () => {
    // the converter writes URL-encoded destinations: spaces as %20, parens as %28/%29
    const markdown = 'Text ![alt](https://cdn.example.com/a%20b%281%29.jpg) and ![x](https://cdn.example.com/miss.jpg) plus ![plain](https://cdn.example.com/plain.jpg)'
    const outcomes = [
      { url: 'https://cdn.example.com/a b(1).jpg', status: 'saved' as const, fileName: 'img-001.jpg' },
      { url: 'https://cdn.example.com/plain.jpg', status: 'saved' as const, fileName: 'img-002.jpg' },
      { url: 'https://cdn.example.com/miss.jpg', status: 'missing' as const, reason: 'unreachable' as const },
    ]
    const out = composePageMarkdown({ title: 'T', sourceUrl: 'https://e.example/x' }, markdown, outcomes, 0)
    expect(out).toContain('![alt](assets/img-001.jpg)')
    expect(out).toContain('![plain](assets/img-002.jpg)')
    expect(out).toContain('![x](https://cdn.example.com/miss.jpg)')
    expect(out).not.toContain('a%20b%281%29.jpg')
  })
})

describe('mediaReadme (download.md §4.2, §5.4)', () => {
  it('is absent when everything saved', () => {
    expect(mediaReadme('zh', [])).toBeNull()
    expect(mediaReadme('zh', [{ url: 'u', status: 'saved', fileName: 'img-001.jpg' }])).toBeNull()
  })
  it('lists each unsaved medium with its reason', () => {
    const readme = mediaReadme(
      'en',
      [
        { url: 'https://cdn.example.com/x.jpg', status: 'missing', reason: 'too-large' },
        { url: 'https://cdn.example.com/y.mp4', status: 'missing', reason: 'wrong-type' },
      ],
      { offline: false },
    )!
    expect(readme).toContain('## Media not saved')
    expect(readme).toContain('https://cdn.example.com/x.jpg — over the size cap')
    expect(readme).toContain('https://cdn.example.com/y.mp4 — not the declared kind')
  })
  it('explains an offline download even with no item list', () => {
    expect(mediaReadme('zh', [], { offline: true })).toContain('离线')
  })
})

describe('library entry plans (download.md §3.4)', () => {
  it('composes a clip with export-identical frontmatter and sections, and collects its image media', () => {
    const clip = makeClip({ content: 'Words ![pic](https://cdn.example.com/p.png) more ![pic](https://cdn.example.com/p.png) and <https://not-media.example.com/x.png>' })
    const plan = planEntryDownload(clip, TEST_REGISTRY, 'zh', new Set())
    expect(plan.folder).toBe('Retries and backpressure')
    expect(plan.markdown).toContain('annhub_id')
    expect(plan.markdown).toContain('## 语境')
    expect(plan.media).toEqual([{ url: 'https://cdn.example.com/p.png', kind: 'image' }])
  })
  it("marks a screenshot's saved bytes, not a network address", () => {
    const shot = makeScreenshot()
    const plan = planEntryDownload(shot, TEST_REGISTRY, 'en', new Set())
    expect(plan.media).toEqual([])
    expect(plan.assetId).toBe(shot.assetId)
    expect(plan.markdown).toContain(`${ASSET_MARKER_BASE}${shot.assetId}`)
    expect(plan.markdown).toContain('## Image')
  })
  it('numbers same-titled entries apart', () => {
    const a = planEntryDownload(makeClip(), TEST_REGISTRY, 'zh', new Set())
    const b = planEntryDownload(makeClip(), TEST_REGISTRY, 'zh', new Set([a.folder]))
    expect(b.folder).toBe(`${a.folder} (2)`)
  })
})

describe('the multi-download root (download.md §4.2)', () => {
  it('names the root by the local date', () => {
    expect(batchFolderName(Date.parse('2026-11-04T23:30:00+08:00'))).toBe('AnnHub-download-2026-11-04')
  })
  it('manifests the entries and the failures', () => {
    const readme = batchReadme('zh', ['A', 'B (2)'], ['Gone'])
    expect(readme).toContain('- 2 条目')
    expect(readme).toContain('- A')
    expect(readme).toContain('- B (2)')
    expect(readme).toContain('## 未能下载的条目')
    expect(readme).toContain('- Gone')
  })
})

describe('clipMediaUrls', () => {
  it('takes only image syntax, deduplicated', () => {
    const urls = clipMediaUrls(
      '![a](https://x.example/1.jpg) [l](https://x.example/2.jpg) ![b](https://x.example/1.jpg) ![](http://y.example/3.png) ![c](data:image/png;base64,xx)',
    )
    expect(urls).toEqual([
      { url: 'https://x.example/1.jpg', kind: 'image' },
      { url: 'http://y.example/3.png', kind: 'image' },
    ])
  })
  it('feeds the file estimate with the README', () => {
    expect(estimateFileCount(3, 0)).toBe(3)
    expect(estimateFileCount(3, 5)).toBe(9)
  })
})
