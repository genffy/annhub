import { beforeEach, expect, it, vi } from 'vitest'
import { planLibraryDownload, planPageDownload } from '../library-plan'
import { batchFolderName, DOWNLOAD_LIMITS } from '../../../../core/download'
import { makeClip, makeScreenshot, TEST_REGISTRY } from '../../../../core/__tests__/helpers'
import type { EntryRecord } from '../../../../core/types'

const records = new Map<string, EntryRecord>()
vi.mock('../../../store-instance', () => ({
  initializedEntryStore: async () => ({
    listPropertyDefinitions: async () => TEST_REGISTRY,
    getEntry: async (id: string) => records.get(id),
  }),
}))

beforeEach(() => records.clear())

it('encodes browser-renamed media consistently for clips and stored screenshots', async () => {
  const entries = [makeClip({ content: '![](https://example.com/image.png)', context: undefined }), makeScreenshot()]
  for (const entry of entries) records.set(entry.id, entry)
  const plan = await planLibraryDownload({ entryIds: entries.map(entry => entry.id), form: 'folder', withMedia: true, lang: 'en', at: 0 })
  expect(plan.media).toHaveLength(2)
  const fileName = '媒体 (2) #100%.png'
  const result = plan.compose(
    plan.media.map(item => ({ ref: `${item.dir}|${item.url ?? `asset:${item.assetId}`}`, status: 'saved' as const, fileName })),
    false,
  )
  const markdowns = result.files.filter(file => !file.path.endsWith('/README.md') && file.path !== 'README.md')
  expect(markdowns).toHaveLength(2)
  for (const file of markdowns) {
    const destination = /!\[[^\]]*\]\(([^\s()]+)\)/.exec(file.text)?.[1]
    expect(destination).toBeDefined()
    expect(decodeURIComponent(destination!)).toBe(`assets/${fileName}`)
    expect(destination).not.toContain('#')
  }
})

it('keeps an article titled README separate from its missing-media report', () => {
  const plan = planPageDownload({
    title: 'README',
    sourceUrl: 'https://example.com',
    markdown: 'Article ![](https://example.com/img.png)',
    media: [{ url: 'https://example.com/img.png', kind: 'image' }],
    form: 'folder',
    withMedia: true,
    lang: 'en',
    at: 0,
    meta: {},
  })
  const { files } = plan.compose([], false)
  expect(files.map(file => file.path)).toEqual(['README (2).md', 'README.md'])
  expect(files[0]!.text).toContain('Article')
  expect(files[1]!.text).toContain('https://example.com/img.png')
})

it('reserves files for stored screenshots and missing-media reports and separates repeated batches', async () => {
  const content = Array.from({ length: 300 }, (_, index) => `![image](https://example.com/${index}.png)`).join('\n')
  const entries = [makeClip({ content, context: undefined }), makeClip({ content, context: undefined }), makeScreenshot(), makeScreenshot()]
  for (const entry of entries) records.set(entry.id, entry)
  const plan = await planLibraryDownload({ entryIds: entries.map(entry => entry.id), form: 'folder', withMedia: true, lang: 'en', at: 0 })
  expect(plan.basePath).toBe(`AnnHub/${batchFolderName(0)}`)
  expect(plan.media.filter(item => item.assetId)).toHaveLength(2)
  const outcomes = plan.media.map(item => ({ ref: `${item.dir}|${item.url ?? `asset:${item.assetId}`}`, status: 'saved' as const, fileName: `media-${item.slot}.png` }))
  const { files, missing } = plan.compose(outcomes, false)
  expect(files.length + outcomes.length).toBeLessThanOrEqual(DOWNLOAD_LIMITS.maxFiles)
  expect(files.some(file => file.path.endsWith('/README.md'))).toBe(true)
  expect(new Set(files.map(file => file.path.toLowerCase())).size).toBe(files.length)
  expect(missing.length).toBeGreaterThan(0)
  for (const item of missing) expect(files.some(file => file.path.endsWith('README.md') && file.text.includes(item.url))).toBe(true)
})

it('reports a missing stored screenshot in README and renders a readable placeholder', async () => {
  const entry = makeScreenshot()
  records.set(entry.id, entry)
  const plan = await planLibraryDownload({ entryIds: [entry.id], form: 'folder', withMedia: false, lang: 'en', at: 0 })
  const result = plan.compose([], false)
  expect(result.missing).toEqual([{ url: `annhub-asset://${entry.assetId}`, reason: 'unreachable' }])
  expect(result.files.find(file => file.path === 'README.md')!.text).toContain(entry.assetId)
  const markdown = result.files.find(file => file.path !== 'README.md')!.text
  expect(markdown).toContain('Image missing')
  expect(markdown).not.toContain('![p99 latency curve]')
})
