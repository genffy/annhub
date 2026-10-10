import { QuotaError } from '../../learning-core/store'
import { EntryValidationError, type EntryErrorCode } from '../../learning-core/types'

export function storageErrorCode(error: unknown): EntryErrorCode {
  if (error instanceof EntryValidationError) return error.code
  if (error instanceof QuotaError || (error instanceof DOMException && error.name === 'QuotaExceededError')) return 'STORAGE_QUOTA_EXCEEDED'
  return 'OPERATION_FAILED'
}
