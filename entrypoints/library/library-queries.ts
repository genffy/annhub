/**
 * Pure plumbing for the list queries and their metric: the day range from the filter's dates, the
 * library.queried event, and the typed condition from the filter bar's raw strings (search.md §3,
 * metrics.md §9). Moved verbatim from App.tsx when the file went over its byte budget.
 */
import MessageUtils from '../../utils/message'
import type { PropertyCondition } from '../../learning-core/query'
import type { PropertyDefinition } from '../../learning-core/types'
import { bucketCount } from '../../learning-core/metrics'
import type { RouteState } from './route'

export function localDayRange(from: string, to: string): { createdFrom?: number; createdTo?: number } {
  const bounds: { createdFrom?: number; createdTo?: number } = {}
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) bounds.createdFrom = new Date(`${from}T00:00:00`).getTime()
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) bounds.createdTo = new Date(`${to}T00:00:00`).getTime() + 24 * 60 * 60 * 1000
  return bounds
}

export function recordQueried(filters: RouteState, results: number): void {
  const enabled = [
    filters.view === 'all' && filters.type,
    filters.hosts.length > 0,
    filters.tags.length > 0,
    ...filters.conditions.map(condition => condition.prop && condition.op),
    filters.from || filters.to,
    filters.colors.length > 0,
  ].filter(Boolean).length
  void MessageUtils.sendMessage({
    type: 'RECORD_EVENT',
    name: 'library.queried',
    props: { has_text: Boolean(filters.search), filters: bucketCount(enabled), results: bucketCount(results) },
  })
}

export function buildCondition(def: PropertyDefinition, op: string, val: string, val2: string): PropertyCondition | undefined {
  const typedOp = op as PropertyCondition['op']
  if (def.type === 'number') {
    const value = Number(val)
    if (!Number.isFinite(value)) return undefined
    if (op === 'between') {
      const upper = val2 === '' ? value : Number(val2)
      return Number.isFinite(upper) ? { name: def.name, op: typedOp, value, value2: upper } : undefined
    }
    return { name: def.name, op: typedOp, value }
  }
  if (def.type === 'checkbox') {
    return { name: def.name, op: 'is', value: val === 'yes' }
  }
  if (!val) return undefined
  return op === 'between' ? { name: def.name, op: typedOp, value: val, value2: val2 || val } : { name: def.name, op: typedOp, value: val }
}

export const PAGE_SIZE = 50
export const SEARCH_DEBOUNCE_MS = 250
