import type { ProductUi } from '@/components/product/types'

export type Locale = 'zh-CN' | 'en'

/** Section ids the header links to; each section component owns the matching `id`. */
export type SectionId = 'ways' | 'story' | 'library' | 'local' | 'faq' | 'progress'

export type EntryKind = 'clip' | 'screenshot' | 'highlight'

export interface StoryStep {
  id: 'select' | 'block' | 'shot' | 'read' | 'find' | 'export'
  when: string
  title: string
  body: string
  /** What the picture shows, for screen readers and for the caption under it. */
  caption: string
}

export type DifferenceVisual = 'entry' | 'obsidian' | 'properties' | 'offline'

/**
 * Every word of the landing page. Content follows docs/v2/website.md; product terms follow docs/v2/README.md §4
 * (Entry, Library, Clip, Highlight, Screenshot, Property). Text may use `code` between backticks.
 */
export interface LandingCopy {
  locale: Locale
  meta: { title: string; description: string; ogTitle: string; ogDescription: string }
  header: {
    nav: { id: SectionId; label: string }[]
    language: { label: string; href: string; aria: string }
    cta: string
    home: string
    skip: string
    navLabel: string
  }
  hero: {
    chip: string
    lead: string
    body: string
    local: string
    audience: string
    cta: string
    secondary: string
    facts: string[]
    captions: { page: string; reader: string; library: string }
    sketch: string
  }
  problem: { title: string; items: { title: string; body: string; evidence: string[] }[] }
  ways: {
    title: string
    kinds: { id: EntryKind; name: string; body: string; caption: string }[]
    unified: { lead: string }
  }
  story: {
    title: string
    intro: string
    steps: StoryStep[]
    stepOf: string
    prev: string
    next: string
    outro: string
  }
  tour: {
    title: string
    intro: string
    hint: string
    pins: { title: string; body: string }[]
    sketch: string
  }
  diff: {
    title: string
    items: { visual: DifferenceVisual; title: string; body: string }[]
    offline: { label: string; steps: string[] }
    flow: { library: string; zip: string; tool: string }
  }
  trust: {
    eyebrow: string
    title: string
    body: string
    items: { title: string; body: string }[]
    exception: { title: string; body: string }
    link: string
    diagram: { browser: string; entries: string; settings: string; server: string; none: string; fetch: string; page: string }
  }
  faq: { title: string; lead: string; items: { q: string; a: string; note?: string }[] }
  progress: {
    title: string
    lead: string
    legend: string
    status: { done: string; todo: string }
    stages: { id: string; name: string; body: string; done: boolean }[]
    download: string
    cta: string
    secondary: string
  }
  footer: { line: string; roadmap: string; github: string; privacy: string; terms: string; copyright: string; navLabel: string }
  ui: ProductUi
}
