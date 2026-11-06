import { describe, expect, it } from 'vitest'
import { indexedSearchDocument, queryEntries, type EntryQuery } from '../query'
import { makeClip, TEST_REGISTRY } from './helpers'

describe('derived search documents (RV-BG-04)', () => {
  it('keeps search scores, filters and order identical to full records', () => {
    const entries = [
      makeClip({ id: 'ent_a', content: 'jitter backoff '.repeat(300), createdAt: 100, properties: { title: 'Retry guide', tags: ['ops'] } }),
      makeClip({ id: 'ent_b', content: 'other material', createdAt: 200, properties: { title: 'Jitter notes', tags: ['ops'] } }),
      makeClip({ id: 'ent_c', content: 'jitter body', createdAt: 300, properties: { title: 'Other', tags: ['docs'] } }),
    ]
    const docs = entries.map(entry => indexedSearchDocument(entry, TEST_REGISTRY))
    const fields = new Map(docs.map(doc => [doc.id, doc.fields]))
    const queries: EntryQuery[] = [
      { search: 'jitter', limit: 2 },
      { search: 'jitter', tags: ['ops'], limit: 2 },
      { search: 'retry', limit: 2 },
      { hosts: ['engineering.example.com'], limit: 2 },
    ]
    for (const query of queries) {
      const full = queryEntries(entries, TEST_REGISTRY, query)
      const derived = queryEntries(
        docs.map(doc => doc.summary),
        TEST_REGISTRY,
        query,
        fields,
      )
      expect(derived.items.map(item => item.id)).toEqual(full.items.map(item => item.id))
      expect(derived.total).toBe(full.total)
      expect(derived.nextCursor).toBe(full.nextCursor)
    }
    expect(docs[0]!.summary.content).toBe('')
  })
})
