import { getActiveAnnotationPlatformRule } from '../annotation-core/platform-rules'

export interface VocabPlatformRule {
  name: string
  match: (hostname: string) => boolean
  resolveContentRoot?: () => Element | null
  collectBlocks: (root: Element) => Element[]
}

export function getActivePlatformRule(hostname = window.location.hostname): VocabPlatformRule | null {
  const url = new URL(`https://${hostname}/`)
  const rule = getActiveAnnotationPlatformRule(url)
  if (!rule) return null

  return {
    name: rule.name,
    match: candidateHostname => rule.match(new URL(`https://${candidateHostname}/`)),
    resolveContentRoot: rule.resolveRoot,
    collectBlocks: root => rule.collectContentBlocks(root, 'auto-vocab'),
  }
}
