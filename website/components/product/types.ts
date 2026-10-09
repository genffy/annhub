// Shapes of the product replicas. They mirror docs/v2/entry.md (types, highlights, properties) closely enough that the
// scenes read like the real library, but only the fields the marketing page draws are present.

export type EntryType = 'clip' | 'screenshot'
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'
export type PropertyType = 'text' | 'list' | 'number' | 'checkbox' | 'date' | 'datetime'
export type PropertyValue = string | string[] | number | boolean
export type ThumbKind = 'chart' | 'diagram' | 'table' | 'bars'

/** A highlight is a range in the clip's Markdown source (entry.md §4). */
export interface Highlight {
  id: string
  start: number
  end: number
  quote: string
  color: HighlightColor
  note?: string
}

export interface Entry {
  id: string
  type: EntryType
  title: string
  /** Markdown for a clip, empty for a screenshot. */
  content: string
  host: string
  path: string
  /** Already localised, e.g. 周一 / Mon. */
  when: string
  tags: string[]
  note?: string
  props: Record<string, PropertyValue>
  highlights: Highlight[]
  image?: ThumbKind
}

/** One row of the property registry (entry.md §5). */
export interface PropertyDef {
  name: string
  type: PropertyType
  builtin: boolean
  /** title and tags are attached to both types and cannot be unchecked. */
  fixed?: boolean
  defaultValue?: string
  used: number
  presets: EntryType[]
}

/**
 * Every string a product window draws. The Chinese and English values follow utils/ui-text.ts of the extension so the
 * replicas say what the real build says; the rest follows docs/design/v2. Strings with a count use `{n}`.
 */
export interface ProductUi {
  types: { clip: string; screenshot: string; highlight: string }
  menu: { clip: string; screenshot: string; clipHint: string; screenshotHint: string }
  toast: { clipped: string; undo: string; edit: string; undone: string }
  edit: { title: string; tags: string; note: string; more: string; done: string; addTag: string; autosave: string }
  block: { clip: string; shot: string; parent: string; more: string; clipped: string }
  shot: {
    hint: string
    anonymousOn: string
    rect: string
    ellipse: string
    arrow: string
    pen: string
    mosaic: string
    text: string
    undo: string
    copy: string
    download: string
    cancel: string
    confirm: string
    annotation: string
    figure: string
  }
  nav: {
    library: string
    manage: string
    all: string
    clips: string
    highlights: string
    screenshots: string
    properties: string
    settings: string
    export: string
    storage: string
    shortcut: string
    collapse: string
  }
  list: {
    search: string
    count: string
    countOne: string
    highlightCount: string
    highlightCountOne: string
    type: string
    source: string
    tags: string
    time: string
    property: string
    clear: string
    open: string
  }
  reader: {
    back: string
    source: string
    read: string
    highlights: string
    properties: string
    system: string
    empty: string
    original: string
    locked: string
    lockedOne: string
    note: string
    context: string
    addProperty: string
    imageUnsaved: string
    openOriginal: string
    savedLocal: string
    close: string
    delete: string
  }
  props: {
    types: Record<PropertyType, string>
    name: string
    type: string
    defaultValue: string
    usage: string
    presets: string
    fixed: string
    builtin: string
    empty: string
    checked: string
    unchecked: string
  }
  colors: Record<HighlightColor, string>
  export: {
    title: string
    ready: string
    includes: string
    includesBody: string
    excludes: string
    excludesBody: string
    cancel: string
    action: string
    progress: string
    writing: string
    done: string
    doneBody: string
    note: string
    ok: string
  }
  file: { folder: string }
}
