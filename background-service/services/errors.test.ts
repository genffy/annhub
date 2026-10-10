import { describe, expect, it } from 'vitest'
import { QuotaError } from '../../learning-core/store'
import { EntryValidationError } from '../../learning-core/types'
import { storageErrorCode } from './errors'

describe('stable storage failure codes (RV-BG-08)', () => {
  it('maps validation, estimated quota and browser quota errors', () => {
    expect(storageErrorCode(new EntryValidationError('ENTRY_ASSET_TOO_LARGE'))).toBe('ENTRY_ASSET_TOO_LARGE')
    expect(storageErrorCode(new QuotaError({ usage: 9, quota: 10, incomingBytes: 2 }))).toBe('STORAGE_QUOTA_EXCEEDED')
    expect(storageErrorCode(new DOMException('disk full', 'QuotaExceededError'))).toBe('STORAGE_QUOTA_EXCEEDED')
    expect(storageErrorCode(new Error('private exception text'))).toBe('OPERATION_FAILED')
  })
})
