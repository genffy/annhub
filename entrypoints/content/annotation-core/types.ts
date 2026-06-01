export type AnnotationIntent = 'manual-highlight' | 'auto-vocab'

export interface ContentSource {
  sourceUrl: string | null
  container: Element | null
}

export interface AnnotationPlatformRule {
  name: string
  match(url: URL): boolean
  resolveRoot(): Element | null
  collectContentBlocks(root: Element, intent: AnnotationIntent): Element[]
  findSourceFromElement(element: Element, origin: string): ContentSource
  findContainerBySourceUrl(sourceUrl: string, origin: string): Element | null
}
