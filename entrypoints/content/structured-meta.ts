/** Read article metadata already embedded in the page; never fetch linked JSON-LD. */
export function structuredArticleMeta(doc: Document): { author?: string; published?: string; description?: string } {
  const nodes: Record<string, unknown>[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    nodes.push(node)
    if (node['@graph']) visit(node['@graph'])
    if (node.mainEntity && typeof node.mainEntity === 'object') visit(node.mainEntity)
  }
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(script.textContent ?? ''))
    } catch {
      /* Broken metadata must not block capture. */
    }
  }
  const article = nodes.find(node => [node['@type']].flat().some(type => typeof type === 'string' && /(?:Article|BlogPosting|SocialMediaPosting)$/.test(type)))
  if (!article) return {}
  const authors = [article.author].flat().flatMap(author => {
    if (typeof author === 'string') return [author]
    if (author && typeof author === 'object' && 'name' in author && typeof author.name === 'string') return [author.name]
    return []
  })
  return {
    ...(authors.length ? { author: authors.join('; ') } : {}),
    ...(typeof article.datePublished === 'string' ? { published: article.datePublished } : {}),
    ...(typeof article.description === 'string' ? { description: article.description } : {}),
  }
}
