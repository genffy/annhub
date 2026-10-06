/**
 * Domain factory — docs/v2/fragments.md.
 * New fragments are always assembled here; pages never build their own default
 * values. captureRevision starts at 1 and is bumped on capture-field edits
 * (fragments.md §7).
 */
import { nanoid } from 'nanoid'
import type { DetailOf, FragmentContext, FragmentKind, FragmentRecord, VerifiedResult } from './types'
import { normalizeContent, dedupeTags } from './normalize'
import { assertValid } from './validate'

export const newId = (): string => nanoid(12)

export interface CreateFragmentInput<K extends FragmentKind> {
  kind: K
  content: string
  /** capturedAt defaults to now; visual fragments pass the screenshot's capture time. */
  context: Omit<FragmentContext, 'capturedAt'> & { capturedAt?: number }
  processing: { guess?: string; verified: VerifiedResult; use: string }
  detail: DetailOf<K>
  tags?: string[]
  now?: number
}

export function createFragment<K extends FragmentKind>(input: CreateFragmentInput<K>): FragmentRecord<K> {
  const now = input.now ?? Date.now()
  const { capturedAt, ...restContext } = input.context
  const record: FragmentRecord<K> = {
    schemaVersion: 4,
    id: newId(),
    captureRevision: 1,
    kind: input.kind,
    content: input.content.trim(),
    normalizedContent: normalizeContent(input.content),
    context: { ...restContext, capturedAt: capturedAt ?? now },
    processing: input.processing,
    tags: dedupeTags(input.tags ?? []),
    detail: input.detail,
    createdAt: now,
    updatedAt: now,
  }
  assertValid(record)
  return record
}
