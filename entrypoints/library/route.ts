/**
 * The library's URL routing — extension.md §2.2: the hash is the ONE source
 * of route state. Reading it is pure; writing happens only on user actions
 * (navigation links push, filter edits replace). A writer never rewrites a
 * route it does not own, so `#/read/<id>` and `#/entry/<id>` survive filter
 * effects (RV-LIB-01).
 */

export type View = 'all' | 'clips' | 'highlights' | 'screenshots' | 'properties' | 'settings'

const VIEWS: View[] = ['all', 'clips', 'highlights', 'screenshots', 'properties', 'settings']

export interface FilterState {
  search: string
  host: string
  tag: string
  prop: string
  op: string
  val: string
  val2: string
  from: string
  to: string
  color: string
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

export const EMPTY_FILTERS: FilterState = { search: '', host: '', tag: '', prop: '', op: '', val: '', val2: '', from: '', to: '', color: '' }

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
    host: params.get('host') ?? '',
    tag: params.get('tag') ?? '',
    prop: params.get('prop') ?? '',
    op: params.get('op') ?? '',
    val: params.get('val') ?? '',
    val2: params.get('val2') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    color: params.get('color') ?? '',
  }
}

/** The hash of a list route with filters (and optionally the open drawer's `e`). */
export function listHash(route: Pick<RouteState, 'view'> & FilterState & { entryId?: string | null }): string {
  const params = new URLSearchParams()
  if (route.search) params.set('q', route.search)
  if (route.host) params.set('host', route.host)
  if (route.tag) params.set('tag', route.tag)
  if (route.prop) params.set('prop', route.prop)
  if (route.op) params.set('op', route.op)
  if (route.val) params.set('val', route.val)
  if (route.val2) params.set('val2', route.val2)
  if (route.from) params.set('from', route.from)
  if (route.to) params.set('to', route.to)
  if (route.color) params.set('color', route.color)
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
