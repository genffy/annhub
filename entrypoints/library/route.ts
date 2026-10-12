/**
 * The library's URL routing — extension.md §2.2: the hash is the ONE source
 * of route state. Reading it is pure; writing happens only on user actions
 * (navigation links push, filter edits replace). A writer never rewrites a
 * route it does not own, so `#/read/<id>` and `#/entry/<id>` survive filter
 * effects (RV-LIB-01).
 */

import type { EntryType } from '../../learning-core/types'
import type { ViewKey } from '../../utils/entry-icons'

export type View = ViewKey

const VIEWS: View[] = ['all', 'clips', 'highlights', 'screenshots', 'properties', 'settings']

/** One property condition: property, operator, value(s) — search.md §3, several AND together. */
export interface PropertyFilter {
  prop: string
  op: string
  val: string
  val2: string
}

export interface FilterState {
  search: string
  /** The entry type, a filter of the "all" view only (extension.md §2.3): the other views are one type already. */
  type: '' | EntryType
  /** Sources and tags: several of one dimension OR together (search.md §3). */
  hosts: string[]
  tags: string[]
  /** Property conditions: several AND together (search.md §3). */
  conditions: PropertyFilter[]
  from: string
  to: string
  /** Highlight colours, a filter of the highlights view only. */
  colors: string[]
}

export interface RouteState extends FilterState {
  view: View
  /** The reading view's entry, straight from `#/read/<id>`. */
  readId: string | null
  /** The highlight the reading view opens scrolled to, from `#/read/<id>?h=<highlight>`. */
  highlightId: string | null
  /** The drawer's entry, from the `e` query parameter of a list route. */
  entryId: string | null
}

export const EMPTY_FILTERS: FilterState = { search: '', type: '', hosts: [], tags: [], conditions: [], from: '', to: '', colors: [] }

/**
 * The views that list entries or highlights: the ones with the search and filter bar and a total (extension.md
 * §2.3). Properties and settings are pages of their own and run no list query.
 */
export function isListView(view: View): boolean {
  return view !== 'properties' && view !== 'settings'
}

/**
 * Whether a filter is on (extension.md §5). An empty answer then reads as "no results" and offers to clear the
 * filters; with none on, an empty view shows its own entry hint. The colours exist only in the highlights view,
 * and an operator or value without a property filters nothing.
 */
export function hasActiveFilter(route: Pick<RouteState, 'view'> & FilterState): boolean {
  return Boolean(
    route.search ||
    route.hosts.length > 0 ||
    route.tags.length > 0 ||
    route.conditions.some(condition => condition.prop) ||
    route.from ||
    route.to ||
    (route.view === 'all' && route.type) ||
    (route.view === 'highlights' && route.colors.length > 0),
  )
}

/**
 * Conditions travel as index-aligned `prop`/`op`/`val`/`val2` params (the shape a
 * single condition always used), so an old one-condition URL reads unchanged.
 */
function conditionsOf(params: URLSearchParams): PropertyFilter[] {
  const props = params.getAll('prop')
  const ops = params.getAll('op')
  const vals = params.getAll('val')
  const val2s = params.getAll('val2')
  return props.map((prop, index) => ({ prop, op: ops[index] ?? '', val: vals[index] ?? '', val2: val2s[index] ?? '' }))
}

/** `#/view?filters` / `#/read/<id>` / `#/entry/<id>` → route state. */
export function readHash(hash: string = location.hash): RouteState {
  const raw = hash.replace(/^#\/?/, '')
  const [path, queryString] = raw.split('?')
  const params = new URLSearchParams(queryString ?? '')
  const readId = /^read\/([\w-]+)$/.exec(path ?? '')?.[1] ?? null
  const entryId = /^entry\/([\w-]+)$/.exec(path ?? '')?.[1] ?? null
  const view = VIEWS.includes((path ?? '') as View) ? ((path as View) ?? 'all') : 'all'
  return {
    view,
    readId,
    highlightId: readId ? params.get('h') : null,
    entryId: entryId ?? params.get('e'),
    search: params.get('q') ?? '',
    type: params.get('type') === 'clip' || params.get('type') === 'screenshot' ? (params.get('type') as EntryType) : '',
    hosts: params.getAll('host').filter(Boolean),
    tags: params.getAll('tag').filter(Boolean),
    conditions: conditionsOf(params),
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    colors: params.getAll('color').filter(Boolean),
  }
}

/** The hash of a list route with filters (and optionally the open drawer's `e`). */
export function listHash(route: Pick<RouteState, 'view'> & FilterState & { entryId?: string | null }): string {
  const params = new URLSearchParams()
  if (route.search) params.set('q', route.search)
  if (route.type) params.set('type', route.type)
  for (const host of route.hosts) params.append('host', host)
  for (const tag of route.tags) params.append('tag', tag)
  // all four params append for every condition, so their indices stay aligned on the way back
  for (const condition of route.conditions) {
    params.append('prop', condition.prop)
    params.append('op', condition.op)
    params.append('val', condition.val)
    params.append('val2', condition.val2)
  }
  if (route.from) params.set('from', route.from)
  if (route.to) params.set('to', route.to)
  for (const color of route.colors) params.append('color', color)
  if (route.entryId) params.set('e', route.entryId)
  const query = params.toString()
  return `#/${route.view}${query ? `?${query}` : ''}`
}

/** True when the hash names a route this module owns (list/read/entry shapes). */
export function isLibraryHash(hash: string): boolean {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? ''
  return VIEWS.includes(path as View) || /^read\/[\w-]+$/.test(path) || /^entry\/[\w-]+$/.test(path) || path === ''
}

/** The reading view of an entry; with a highlight id it opens scrolled to that highlight. */
export function readHashFor(id: string, highlightId?: string): string {
  return `#/read/${id}${highlightId ? `?h=${encodeURIComponent(highlightId)}` : ''}`
}

export function entryHashFor(id: string): string {
  return `#/entry/${id}`
}
