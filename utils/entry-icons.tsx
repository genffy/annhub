/**
 * The icons that stand for entry types, library views and property types (visual.md §3, extension.md §2.2):
 * one mapping for every extension page, so a clip is a bookmark and a screenshot is a scan wherever either
 * shows up — the library's nav and rows, the drawer, the popup's rail.
 */
import { Bookmark, Calendar, CalendarClock, Hash, Highlighter, Library, List, Scan, Settings, SquareCheck, Tags, Text, type LucideIcon } from 'lucide-react'
import type { EntryType, PropertyType } from '../learning-core/types'
import { uiText } from './ui-text'

/** The library's views, in the nav's own words: the shape of `View` in the library's route. */
export type ViewKey = 'all' | 'clips' | 'highlights' | 'screenshots' | 'properties' | 'settings'

/** A highlight is a mark inside a clip, not a type of its own, but its nav item and view still get an icon of their own. */
export const VIEW_ICONS: Record<ViewKey, LucideIcon> = {
  all: Library,
  clips: Bookmark,
  highlights: Highlighter,
  screenshots: Scan,
  properties: Tags,
  settings: Settings,
}

export const ENTRY_TYPE_ICONS: Record<EntryType, LucideIcon> = { clip: Bookmark, screenshot: Scan }

export const PROPERTY_TYPE_ICONS: Record<PropertyType, LucideIcon> = {
  text: Text,
  list: List,
  number: Hash,
  checkbox: SquareCheck,
  date: Calendar,
  datetime: CalendarClock,
}

/** The type as its icon and its name together: the icon never stands alone and the colour never carries the meaning (visual.md §3). */
export function TypeChip({ type, className }: { type: EntryType; className?: string }) {
  const Icon = ENTRY_TYPE_ICONS[type]
  return (
    <span className={`type-chip type-${type}${className ? ` ${className}` : ''}`} data-type={type}>
      <Icon size={12} aria-hidden />
      {uiText(type === 'clip' ? 'library.clips' : 'library.screenshots')}
    </span>
  )
}
