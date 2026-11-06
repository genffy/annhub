import { expect, it } from 'vitest'
import { extractPageMeta } from '../page-meta'

it('prefers embedded article data to page meta and ignores unrelated structured entities', () => {
  const doc = new DOMParser().parseFromString(
    '<title>Page title</title><meta name="author" content="Meta author"><meta name="description" content="Meta description">',
    'text/html',
  )
  const script = doc.createElement('script')
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify({
    '@graph': [
      { '@type': 'Organization', 'author': 'Unrelated' },
      { '@type': ['Article'], 'author': [{ name: 'Alice' }, 'Bob'], 'datePublished': '2026-10-12T08:00:00Z', 'description': 'Structured description' },
    ],
  })
  doc.head.append(script)
  expect(extractPageMeta(doc, 'example.com')).toEqual({ title: 'Page title', author: ['Alice', 'Bob'], published: '2026-10-12', description: 'Structured description' })
})

it('malformed JSON and irrelevant objects leave the meta fallback usable', () => {
  const doc = new DOMParser().parseFromString(
    '<meta name="author" content="Meta author"><script type="application/ld+json">{broken</script><script type="application/ld+json">{"@type":"Organization","author":"Wrong"}</script>',
    'text/html',
  )
  expect(extractPageMeta(doc, 'example.com').author).toEqual(['Meta author'])
})
