export interface ContentSource {
  sourceUrl: string | null
  container: Element | null
}

/** A site whose feed items have their own permalink (extension.md §10: permalinks on feeds). */
export interface AnnotationPlatformRule {
  name: string
  match(url: URL): boolean
  findSourceFromElement(element: Element, origin: string): ContentSource
  findContainerBySourceUrl(sourceUrl: string, origin: string): Element | null
}
